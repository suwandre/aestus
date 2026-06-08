//! Binance futures WebSocket + REST message parsers (P06-T003/T004/T005/T006).
//!
//! Parses Binance combined-stream wrapper messages into [`RawMarketEvent`] +
//! [`NormalizedMarketEvent`] pairs. All price/size fields arrive as strings from
//! Binance and are parsed to f64 during normalization.

use crate::hash::sha256_hex;
use event_model::envelope::SCHEMA_VERSION;
use event_model::market::{NormalizedMarketEvent, RawMarketEvent, Side};
use serde::Deserialize;
use serde_json::Value;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use super::ProviderError;

// ── helpers ─────────────────────────────────────────────────────────────────

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

pub fn ms_to_rfc3339(ms: i64) -> String {
    OffsetDateTime::from_unix_timestamp_nanos((ms as i128) * 1_000_000)
        .ok()
        .and_then(|dt| dt.format(&Rfc3339).ok())
        .unwrap_or_else(|| format!("{ms}"))
}

fn parse_f64(v: &Value, field: &str) -> Result<f64, ProviderError> {
    match v {
        Value::String(s) => s
            .parse::<f64>()
            .map_err(|e| ProviderError::Parse(format!("{field}: {e}"))),
        Value::Number(n) => n
            .as_f64()
            .ok_or_else(|| ProviderError::Parse(format!("{field}: not f64"))),
        _ => Err(ProviderError::Parse(format!("{field}: unexpected type"))),
    }
}

fn parse_f64_opt(v: Option<&Value>, field: &str) -> Result<Option<f64>, ProviderError> {
    match v {
        None | Some(Value::Null) => Ok(None),
        Some(v) => parse_f64(v, field).map(Some),
    }
}

// ── combined stream wrapper ──────────────────────────────────────────────────

/// Top-level wrapper for Binance combined stream messages.
#[derive(Deserialize)]
pub struct CombinedMessage {
    pub stream: String,
    pub data: Value,
}

/// Result of parsing one wire message.
pub struct ParseResult {
    pub raw_event_type: String,
    pub provider_timestamp_ms: Option<i64>,
    pub normalized: Vec<NormalizedMarketEvent>,
}

// ── aggTrade (T003) ──────────────────────────────────────────────────────────

/// Parse an `aggTrade` data object.
pub fn parse_agg_trade(
    data: &Value,
    venue: &str,
    instrument_id: &str,
    canonical_asset_id: &str,
    seq: u64,
) -> Result<ParseResult, ProviderError> {
    let price = parse_f64(&data["p"], "aggTrade.p")?;
    let size = parse_f64(&data["q"], "aggTrade.q")?;
    let trade_time_ms = data["T"].as_i64().unwrap_or(0);
    let is_buyer_maker = data["m"].as_bool().unwrap_or(false);
    let side = if is_buyer_maker { Side::Sell } else { Side::Buy };
    let trade_id = data["a"].as_i64().map(|id| id.to_string());

    let timestamp = ms_to_rfc3339(trade_time_ms);
    let event_time_ms = data["E"].as_i64();

    Ok(ParseResult {
        raw_event_type: "aggTrade".into(),
        provider_timestamp_ms: event_time_ms,
        normalized: vec![NormalizedMarketEvent::Trade {
            schema_version: SCHEMA_VERSION,
            venue: venue.into(),
            instrument_id: instrument_id.into(),
            canonical_asset_id: canonical_asset_id.into(),
            timestamp,
            sequence: Some(seq),
            price,
            size,
            side,
            trade_id,
        }],
    })
}

// ── bookTicker (T003) ────────────────────────────────────────────────────────

/// Parse a `bookTicker` data object → PriceTick.
pub fn parse_book_ticker(
    data: &Value,
    venue: &str,
    instrument_id: &str,
    canonical_asset_id: &str,
    seq: u64,
    received_at: &str,
) -> Result<ParseResult, ProviderError> {
    let bid = parse_f64(&data["b"], "bookTicker.b")?;
    let ask = parse_f64(&data["a"], "bookTicker.a")?;
    let price = (bid + ask) / 2.0;

    Ok(ParseResult {
        raw_event_type: "bookTicker".into(),
        provider_timestamp_ms: None,
        normalized: vec![NormalizedMarketEvent::PriceTick {
            schema_version: SCHEMA_VERSION,
            venue: venue.into(),
            instrument_id: instrument_id.into(),
            canonical_asset_id: canonical_asset_id.into(),
            timestamp: received_at.into(),
            sequence: Some(seq),
            price,
            bid: Some(bid),
            ask: Some(ask),
        }],
    })
}

// ── markPriceUpdate (T004) ───────────────────────────────────────────────────

/// Parse a `markPriceUpdate` data object → MarkPrice + IndexPrice + FundingRate.
pub fn parse_mark_price(
    data: &Value,
    venue: &str,
    instrument_id: &str,
    canonical_asset_id: &str,
    seq: u64,
) -> Result<ParseResult, ProviderError> {
    let mark_price = parse_f64(&data["p"], "markPrice.p")?;
    let event_time_ms = data["E"].as_i64().unwrap_or(0);
    let timestamp = ms_to_rfc3339(event_time_ms);

    let mut events = vec![NormalizedMarketEvent::MarkPrice {
        schema_version: SCHEMA_VERSION,
        venue: venue.into(),
        instrument_id: instrument_id.into(),
        canonical_asset_id: canonical_asset_id.into(),
        timestamp: timestamp.clone(),
        sequence: Some(seq),
        mark_price,
    }];

    // Index price
    if let Ok(idx) = parse_f64(&data["i"], "markPrice.i") {
        events.push(NormalizedMarketEvent::IndexPrice {
            schema_version: SCHEMA_VERSION,
            venue: venue.into(),
            instrument_id: instrument_id.into(),
            canonical_asset_id: canonical_asset_id.into(),
            timestamp: timestamp.clone(),
            sequence: Some(seq),
            index_price: idx,
        });
    }

    // Funding rate (field "r" in Binance perp mark price stream)
    if let Ok(rate) = parse_f64(&data["r"], "markPrice.r") {
        let next_time = data["T"]
            .as_i64()
            .map(ms_to_rfc3339);
        events.push(NormalizedMarketEvent::FundingRate {
            schema_version: SCHEMA_VERSION,
            venue: venue.into(),
            instrument_id: instrument_id.into(),
            canonical_asset_id: canonical_asset_id.into(),
            timestamp: timestamp.clone(),
            sequence: Some(seq),
            funding_rate: rate,
            next_funding_time: next_time,
            interval_hours: Some(8.0), // Binance perp funding interval is 8h
        });
    }

    Ok(ParseResult {
        raw_event_type: "markPriceUpdate".into(),
        provider_timestamp_ms: Some(event_time_ms),
        normalized: events,
    })
}

// ── openInterest REST (T005) ─────────────────────────────────────────────────

/// Parse the REST `/fapi/v1/openInterest` response.
pub fn parse_oi_response(
    body: &Value,
    venue: &str,
    instrument_id: &str,
    canonical_asset_id: &str,
) -> Result<NormalizedMarketEvent, ProviderError> {
    let oi = parse_f64(&body["openInterest"], "openInterest")?;
    let ts_ms = body["time"].as_i64().unwrap_or(0);
    let timestamp = if ts_ms > 0 {
        ms_to_rfc3339(ts_ms)
    } else {
        now_rfc3339()
    };

    Ok(NormalizedMarketEvent::OpenInterest {
        schema_version: SCHEMA_VERSION,
        venue: venue.into(),
        instrument_id: instrument_id.into(),
        canonical_asset_id: canonical_asset_id.into(),
        timestamp,
        sequence: None,
        open_interest: oi,
        notional: None,
    })
}

// ── forceOrder / liquidation (T006) ─────────────────────────────────────────

/// Parse a `forceOrder` data object → Liquidation.
pub fn parse_force_order(
    data: &Value,
    venue: &str,
    canonical_id_for: impl Fn(&str) -> String,
    seq: u64,
) -> Result<ParseResult, ProviderError> {
    let order = &data["o"];
    let symbol = order["s"]
        .as_str()
        .ok_or_else(|| ProviderError::Parse("forceOrder: missing s".into()))?;
    let side_str = order["S"]
        .as_str()
        .unwrap_or("BUY")
        .to_uppercase();
    let side = if side_str == "SELL" { Side::Sell } else { Side::Buy };

    let price = parse_f64(&order["ap"], "forceOrder.ap")
        .or_else(|_| parse_f64(&order["p"], "forceOrder.p"))?;
    let size = parse_f64(&order["q"], "forceOrder.q")?;
    let notional = price * size;

    let ts_ms = order["T"].as_i64().unwrap_or(0);
    let event_time_ms = data["E"].as_i64();
    let timestamp = if ts_ms > 0 {
        ms_to_rfc3339(ts_ms)
    } else {
        event_time_ms.map(ms_to_rfc3339).unwrap_or_else(now_rfc3339)
    };

    let canonical_asset_id = canonical_id_for(symbol);

    Ok(ParseResult {
        raw_event_type: "forceOrder".into(),
        provider_timestamp_ms: event_time_ms,
        normalized: vec![NormalizedMarketEvent::Liquidation {
            schema_version: SCHEMA_VERSION,
            venue: venue.into(),
            instrument_id: symbol.into(),
            canonical_asset_id,
            timestamp,
            sequence: Some(seq),
            side,
            price,
            size,
            notional: Some(notional),
        }],
    })
}

// ── top-level dispatch ───────────────────────────────────────────────────────

/// Build a [`RawMarketEvent`] from parsed metadata + original bytes.
pub fn make_raw(
    result: &ParseResult,
    raw_bytes: &[u8],
    venue: &str,
    source: &str,
    seq: u64,
) -> RawMarketEvent {
    let received_at = now_rfc3339();
    let provider_timestamp = result.provider_timestamp_ms.map(ms_to_rfc3339);
    RawMarketEvent {
        schema_version: SCHEMA_VERSION,
        source: source.into(),
        venue: venue.into(),
        received_at,
        provider_timestamp,
        sequence: seq,
        event_type: result.raw_event_type.clone(),
        raw_payload_hash: sha256_hex(raw_bytes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_agg_trade_buyer_taker() {
        // m=false → buyer is taker → side=Buy
        let data = serde_json::json!({
            "e": "aggTrade", "E": 1620000000000i64,
            "s": "BTCUSDT", "a": 9999,
            "p": "50000.50", "q": "0.001",
            "T": 1620000000000i64, "m": false
        });
        let r = parse_agg_trade(&data, "binance", "BTCUSDT", "crypto:btc-usdt", 1).unwrap();
        assert_eq!(r.raw_event_type, "aggTrade");
        match &r.normalized[0] {
            NormalizedMarketEvent::Trade { price, size, side, trade_id, .. } => {
                assert!((price - 50000.50).abs() < 1e-9);
                assert!((size - 0.001).abs() < 1e-9);
                assert_eq!(*side, Side::Buy);
                assert_eq!(trade_id.as_deref(), Some("9999"));
            }
            other => panic!("expected Trade, got {other:?}"),
        }
    }

    #[test]
    fn parse_agg_trade_seller_taker() {
        // m=true → buyer is market maker → seller is taker → side=Sell
        let data = serde_json::json!({
            "e": "aggTrade", "E": 1620000000000i64,
            "s": "BTCUSDT", "a": 1, "p": "49000", "q": "0.5",
            "T": 1620000000000i64, "m": true
        });
        let r = parse_agg_trade(&data, "binance", "BTCUSDT", "crypto:btc-usdt", 2).unwrap();
        match &r.normalized[0] {
            NormalizedMarketEvent::Trade { side, .. } => assert_eq!(*side, Side::Sell),
            _ => panic!("expected Trade"),
        }
    }

    #[test]
    fn parse_book_ticker_midprice() {
        let data = serde_json::json!({
            "u": 400900217, "s": "BTCUSDT",
            "b": "50000.00", "B": "1.0",
            "a": "50002.00", "A": "0.5"
        });
        let r = parse_book_ticker(&data, "binance", "BTCUSDT", "crypto:btc-usdt", 3, "2026-06-08T12:00:00Z").unwrap();
        match &r.normalized[0] {
            NormalizedMarketEvent::PriceTick { price, bid, ask, .. } => {
                assert!((price - 50001.0).abs() < 1e-9);
                assert_eq!(*bid, Some(50000.0));
                assert_eq!(*ask, Some(50002.0));
            }
            _ => panic!("expected PriceTick"),
        }
    }

    #[test]
    fn parse_mark_price_emits_three_events() {
        let data = serde_json::json!({
            "e": "markPriceUpdate", "E": 1562305380000i64,
            "s": "BTCUSDT",
            "p": "11794.15000000",
            "i": "11784.62659091",
            "r": "0.00038167",
            "T": 1562306400000i64
        });
        let r = parse_mark_price(&data, "binance", "BTCUSDT", "crypto:btc-usdt", 4).unwrap();
        assert_eq!(r.normalized.len(), 3);
        assert_eq!(r.raw_event_type, "markPriceUpdate");
        let types: Vec<_> = r.normalized.iter().map(|e| e.event_type_str()).collect();
        assert!(types.contains(&"mark_price"));
        assert!(types.contains(&"index_price"));
        assert!(types.contains(&"funding_rate"));
    }

    #[test]
    fn parse_mark_price_without_index_gives_two_events() {
        let data = serde_json::json!({
            "e": "markPriceUpdate", "E": 1562305380000i64,
            "s": "BTCUSDT", "p": "11794.15000000",
            "r": "0.00038167", "T": 1562306400000i64
            // no "i" field
        });
        let r = parse_mark_price(&data, "binance", "BTCUSDT", "crypto:btc-usdt", 5).unwrap();
        // Should have mark_price + funding_rate only
        let types: Vec<_> = r.normalized.iter().map(|e| e.event_type_str()).collect();
        assert!(types.contains(&"mark_price"));
        assert!(types.contains(&"funding_rate"));
        assert!(!types.contains(&"index_price"));
    }

    #[test]
    fn parse_oi_rest_response() {
        let body = serde_json::json!({
            "openInterest": "10155.3414",
            "symbol": "BTCUSDT",
            "time": 1589437756989i64
        });
        let ev = parse_oi_response(&body, "binance", "BTCUSDT", "crypto:btc-usdt").unwrap();
        match ev {
            NormalizedMarketEvent::OpenInterest { open_interest, .. } => {
                assert!((open_interest - 10155.3414).abs() < 1e-4);
            }
            _ => panic!("expected OpenInterest"),
        }
    }

    #[test]
    fn parse_force_order_liquidation() {
        let data = serde_json::json!({
            "e": "forceOrder", "E": 1568014498953i64,
            "o": {
                "s": "BTCUSDT", "S": "SELL",
                "o": "LIMIT", "f": "IOC",
                "q": "0.014", "p": "9910",
                "ap": "9910", "X": "FILLED",
                "l": "0.014", "z": "0.014",
                "T": 1568014498953i64
            }
        });
        let r = parse_force_order(&data, "binance", |_| "crypto:btc-usdt".into(), 6).unwrap();
        assert_eq!(r.raw_event_type, "forceOrder");
        match &r.normalized[0] {
            NormalizedMarketEvent::Liquidation { side, price, size, notional, .. } => {
                assert_eq!(*side, Side::Sell);
                assert!((price - 9910.0).abs() < 1e-6);
                assert!((size - 0.014).abs() < 1e-6);
                let n = notional.unwrap();
                assert!((n - 9910.0 * 0.014).abs() < 1e-3);
            }
            _ => panic!("expected Liquidation"),
        }
    }

    #[test]
    fn make_raw_has_sha256_hash() {
        let result = ParseResult {
            raw_event_type: "aggTrade".into(),
            provider_timestamp_ms: Some(1620000000000),
            normalized: vec![],
        };
        let bytes = b"{\"e\":\"aggTrade\"}";
        let raw = make_raw(&result, bytes, "binance", "binance:ws:perp", 7);
        assert!(raw.raw_payload_hash.starts_with("sha256:"));
        assert_eq!(raw.raw_payload_hash, crate::hash::sha256_hex(bytes));
    }
}
