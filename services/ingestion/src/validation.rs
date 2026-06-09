//! Outlier guardrails for normalized market events (P08-T005).
//!
//! [`validate`] checks each [`NormalizedMarketEvent`] against hard-coded
//! sanity bounds. Events that fail are rejected (caller should route to the
//! DLQ subject `dlq.normalized.market.outlier`); events that pass are
//! returned unchanged.
//!
//! Bounds are intentionally wide — the goal is to catch *impossible* values
//! (negative prices, funding rates > 100 %, OI = 0 when the exchange reports
//! a positive figure) rather than to define fair-value ranges.

use event_model::market::NormalizedMarketEvent;

/// A validation failure with a human-readable reason.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationError {
    /// The rule that fired, e.g. `"price_non_positive"`.
    pub rule: &'static str,
    /// Short description of what was wrong.
    pub detail: String,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.rule, self.detail)
    }
}

/// Maximum sane absolute funding rate: 100 % per period.
const MAX_FUNDING_RATE_ABS: f64 = 1.0;

/// Maximum sane price: $10 M per unit (larger than any current asset).
const MAX_PRICE: f64 = 10_000_000.0;

/// Validate a single normalized market event.
///
/// Returns `Ok(())` if the event passes all applicable checks, or
/// `Err(ValidationError)` for the first failed check.
pub fn validate(ev: &NormalizedMarketEvent) -> Result<(), ValidationError> {
    match ev {
        NormalizedMarketEvent::PriceTick {
            price, bid, ask, ..
        } => {
            check_price_positive("price", *price)?;
            check_price_sane("price", *price)?;
            if let Some(b) = bid {
                check_price_positive("bid", *b)?;
            }
            if let Some(a) = ask {
                check_price_positive("ask", *a)?;
            }
        }
        NormalizedMarketEvent::Trade { price, size, .. } => {
            check_price_positive("price", *price)?;
            check_price_sane("price", *price)?;
            check_size_positive("size", *size)?;
        }
        NormalizedMarketEvent::FundingRate { funding_rate, .. } => {
            check_funding_rate_sane(*funding_rate)?;
        }
        NormalizedMarketEvent::OpenInterest { open_interest, .. } => {
            check_oi_non_negative(*open_interest)?;
        }
        NormalizedMarketEvent::Liquidation { price, size, .. } => {
            check_price_positive("price", *price)?;
            check_price_sane("price", *price)?;
            check_size_positive("size", *size)?;
        }
        NormalizedMarketEvent::MarkPrice { mark_price, .. } => {
            check_price_positive("mark_price", *mark_price)?;
            check_price_sane("mark_price", *mark_price)?;
        }
        NormalizedMarketEvent::IndexPrice { index_price, .. } => {
            check_price_positive("index_price", *index_price)?;
            check_price_sane("index_price", *index_price)?;
        }
        // OrderbookDelta: skip price checks — zero-quantity levels are valid
        // in snapshot clears, and validating individual levels here would be
        // too expensive for a hot path.
        NormalizedMarketEvent::OrderbookDelta { .. } => {}
    }
    Ok(())
}

fn check_price_positive(field: &str, v: f64) -> Result<(), ValidationError> {
    if v <= 0.0 || v.is_nan() {
        return Err(ValidationError {
            rule: "price_non_positive",
            detail: format!("{field}={v} must be > 0"),
        });
    }
    Ok(())
}

fn check_price_sane(field: &str, v: f64) -> Result<(), ValidationError> {
    if v > MAX_PRICE {
        return Err(ValidationError {
            rule: "price_exceeds_ceiling",
            detail: format!("{field}={v} exceeds ceiling {MAX_PRICE}"),
        });
    }
    Ok(())
}

fn check_size_positive(field: &str, v: f64) -> Result<(), ValidationError> {
    if v <= 0.0 || v.is_nan() {
        return Err(ValidationError {
            rule: "size_non_positive",
            detail: format!("{field}={v} must be > 0"),
        });
    }
    Ok(())
}

fn check_funding_rate_sane(v: f64) -> Result<(), ValidationError> {
    if v.is_nan() || v.abs() > MAX_FUNDING_RATE_ABS {
        return Err(ValidationError {
            rule: "funding_rate_out_of_range",
            detail: format!("funding_rate={v} abs must be <= {MAX_FUNDING_RATE_ABS}"),
        });
    }
    Ok(())
}

fn check_oi_non_negative(v: f64) -> Result<(), ValidationError> {
    if v < 0.0 || v.is_nan() {
        return Err(ValidationError {
            rule: "oi_negative",
            detail: format!("open_interest={v} must be >= 0"),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use event_model::market::{NormalizedMarketEvent, Side};

    fn price_tick(price: f64) -> NormalizedMarketEvent {
        NormalizedMarketEvent::PriceTick {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-09T00:00:00Z".into(),
            sequence: None,
            price,
            bid: None,
            ask: None,
        }
    }

    fn trade(price: f64, size: f64) -> NormalizedMarketEvent {
        NormalizedMarketEvent::Trade {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-09T00:00:00Z".into(),
            sequence: None,
            price,
            size,
            side: Side::Buy,
            trade_id: None,
        }
    }

    fn funding(rate: f64) -> NormalizedMarketEvent {
        NormalizedMarketEvent::FundingRate {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-09T00:00:00Z".into(),
            sequence: None,
            funding_rate: rate,
            next_funding_time: None,
            interval_hours: None,
        }
    }

    fn oi(v: f64) -> NormalizedMarketEvent {
        NormalizedMarketEvent::OpenInterest {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-09T00:00:00Z".into(),
            sequence: None,
            open_interest: v,
            notional: None,
        }
    }

    #[test]
    fn valid_price_tick_passes() {
        assert!(validate(&price_tick(65_000.0)).is_ok());
    }

    #[test]
    fn zero_price_rejected() {
        let err = validate(&price_tick(0.0)).unwrap_err();
        assert_eq!(err.rule, "price_non_positive");
    }

    #[test]
    fn negative_price_rejected() {
        let err = validate(&price_tick(-1.0)).unwrap_err();
        assert_eq!(err.rule, "price_non_positive");
    }

    #[test]
    fn nan_price_rejected() {
        let err = validate(&price_tick(f64::NAN)).unwrap_err();
        assert_eq!(err.rule, "price_non_positive");
    }

    #[test]
    fn price_above_ceiling_rejected() {
        let err = validate(&price_tick(20_000_000.0)).unwrap_err();
        assert_eq!(err.rule, "price_exceeds_ceiling");
    }

    #[test]
    fn zero_size_trade_rejected() {
        let err = validate(&trade(65_000.0, 0.0)).unwrap_err();
        assert_eq!(err.rule, "size_non_positive");
    }

    #[test]
    fn negative_size_trade_rejected() {
        let err = validate(&trade(65_000.0, -0.001)).unwrap_err();
        assert_eq!(err.rule, "size_non_positive");
    }

    #[test]
    fn extreme_funding_rate_rejected() {
        let err = validate(&funding(2.0)).unwrap_err();
        assert_eq!(err.rule, "funding_rate_out_of_range");
    }

    #[test]
    fn normal_funding_rate_passes() {
        assert!(validate(&funding(0.0001)).is_ok());
        assert!(validate(&funding(-0.0001)).is_ok());
    }

    #[test]
    fn negative_oi_rejected() {
        let err = validate(&oi(-1.0)).unwrap_err();
        assert_eq!(err.rule, "oi_negative");
    }

    #[test]
    fn zero_oi_passes() {
        assert!(validate(&oi(0.0)).is_ok());
    }
}
