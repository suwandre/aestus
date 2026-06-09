//! Decimal-safe price representation and formatting (P08-T002).
//!
//! ## Precision policy
//!
//! The event model stores prices as `f64` for transport efficiency — this is
//! acceptable for streaming pipelines. However, any code that **displays** or
//! **compares** price levels MUST use this module to avoid floating-point
//! accumulation errors (e.g. `0.1_f64 + 0.2_f64 ≠ 0.3` but `Decimal` gets
//! it right). The golden rule:
//!
//! - Parse from string (exchange wire format) with [`parse_price_str`].
//! - Format for display with [`format_price`].
//! - Never perform `f64` arithmetic on displayed prices/levels.
//!
//! Level-engine and briefing code that assigns entry, invalidation, or target
//! values must route through these utilities before presenting numbers to the
//! user.

use rust_decimal::Decimal;
use std::str::FromStr;
use thiserror::Error;

/// Errors from decimal price parsing.
#[derive(Debug, Error, PartialEq)]
pub enum PriceError {
    #[error("cannot parse price from empty string")]
    Empty,
    #[error("invalid price string '{0}': {1}")]
    Parse(String, String),
}

/// Parse a price string (e.g. from exchange wire format) into a [`Decimal`].
///
/// Handles both plain integers and fractional values. Leading/trailing
/// whitespace is trimmed.
///
/// # Examples
///
/// ```
/// use market_math::prices::parse_price_str;
/// let p = parse_price_str("29876.23").unwrap();
/// assert_eq!(p.to_string(), "29876.23");
/// ```
pub fn parse_price_str(s: &str) -> Result<Decimal, PriceError> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Err(PriceError::Empty);
    }
    Decimal::from_str(trimmed).map_err(|e| PriceError::Parse(trimmed.to_string(), e.to_string()))
}

/// Format a [`Decimal`] price for display, normalising trailing zeros.
///
/// Rounds to `max_scale` decimal places if necessary (bankers' rounding).
/// Removes trailing zeros from the fractional part.
///
/// # Examples
///
/// ```
/// use rust_decimal::Decimal;
/// use market_math::prices::format_price;
/// use std::str::FromStr;
/// let d = Decimal::from_str("29876.23000").unwrap();
/// assert_eq!(format_price(d, 8), "29876.23");
/// ```
pub fn format_price(d: Decimal, max_scale: u32) -> String {
    let rounded = d.round_dp(max_scale);
    // normalize_finish removes trailing zeros from the fractional part
    let normalized = rounded.normalize();
    // Edge case: if all fractional digits were zero, normalize() may strip the
    // decimal point entirely, e.g. "29876.00" → "29876". That is fine.
    normalized.to_string()
}

/// Convert an `f64` price to [`Decimal`] via string representation, preserving
/// the precision of the original floating-point value.
///
/// This is the safe bridge between the `f64`-typed event model and the
/// display layer. Always use this rather than `Decimal::try_from(f64)` which
/// can introduce rounding artefacts.
///
/// # Examples
///
/// ```
/// use market_math::prices::f64_to_decimal;
/// let d = f64_to_decimal(29876.23).unwrap();
/// assert_eq!(d.to_string(), "29876.23");
/// ```
pub fn f64_to_decimal(v: f64) -> Result<Decimal, PriceError> {
    // Format with enough decimal places to capture exchange-level precision
    // (most crypto prices have at most 8 decimal places).
    let s = format!("{v:.8}");
    parse_price_str(&s).map(|d| d.normalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;
    use std::str::FromStr;

    #[test]
    fn parse_preserves_string_precision() {
        let d = parse_price_str("29876.23").unwrap();
        assert_eq!(d.to_string(), "29876.23");
    }

    #[test]
    fn parse_integer_price() {
        let d = parse_price_str("50000").unwrap();
        assert_eq!(d.to_string(), "50000");
    }

    #[test]
    fn parse_empty_returns_error() {
        assert_eq!(parse_price_str(""), Err(PriceError::Empty));
        assert_eq!(parse_price_str("   "), Err(PriceError::Empty));
    }

    #[test]
    fn parse_invalid_returns_error() {
        assert!(matches!(parse_price_str("abc"), Err(PriceError::Parse(_, _))));
    }

    #[test]
    fn no_floating_point_accumulation() {
        // Classic f64 precision trap: 0.1 + 0.2 ≠ 0.3 in floating point
        let a = parse_price_str("0.1").unwrap();
        let b = parse_price_str("0.2").unwrap();
        let sum = a + b;
        assert_eq!(sum, Decimal::from_str("0.3").unwrap(), "decimal sum must be exact");
    }

    #[test]
    fn format_price_removes_trailing_zeros() {
        let d = Decimal::from_str("29876.23000").unwrap();
        assert_eq!(format_price(d, 8), "29876.23");
    }

    #[test]
    fn format_price_rounds_to_max_scale() {
        let d = Decimal::from_str("1.123456789").unwrap();
        let s = format_price(d, 4);
        // After rounding to 4 places: 1.1235 (bankers' rounding)
        let reparsed = parse_price_str(&s).unwrap();
        // Verify it fits within 4 decimal places
        assert!(reparsed.scale() <= 4);
    }

    #[test]
    fn f64_to_decimal_round_trip() {
        let d = f64_to_decimal(68250.5).unwrap();
        assert_eq!(d.to_string(), "68250.5");
    }

    #[test]
    fn f64_to_decimal_small_price() {
        let d = f64_to_decimal(0.00015).unwrap();
        // Should not be 0.00015000000000000001 or similar
        assert_eq!(d.to_string(), "0.00015");
    }
}
