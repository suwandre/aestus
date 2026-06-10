//! Canonical timestamp utilities for event normalization (P08-T001).
//!
//! Every event carries two clocks:
//! - `ingested_at`: when Aestus received/processed the message (server clock).
//! - `provider_ts`:  when the exchange stamped the event (exchange clock, if present).
//!
//! Keeping them separate enables downstream latency measurement, stale-feed
//! detection, and clock-skew auditing without guessing which timestamp is which.
//! All timestamps are RFC-3339 strings with UTC offset.

use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

/// Current UTC wall-clock time formatted as RFC-3339.
///
/// Used for `received_at` / `ingested_at` fields: this is Aestus's ingestion
/// timestamp, not the provider's event timestamp.
pub fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

/// Convert a millisecond Unix epoch (`ms`) to an RFC-3339 string.
///
/// Exchange WebSocket streams typically supply event times as millisecond
/// epochs (e.g. Binance `T`, `E` fields). Returns the raw integer as a string
/// if the value is out of the `time` crate's representable range.
pub fn ms_to_rfc3339(ms: i64) -> String {
    OffsetDateTime::from_unix_timestamp_nanos((ms as i128) * 1_000_000)
        .ok()
        .and_then(|dt| dt.format(&Rfc3339).ok())
        .unwrap_or_else(|| format!("{ms}"))
}

/// Parse an RFC-3339 timestamp string to milliseconds since Unix epoch.
/// Returns None if the string cannot be parsed.
pub fn rfc3339_to_ms(s: &str) -> Option<i64> {
    OffsetDateTime::parse(s, &Rfc3339)
        .ok()
        .map(|dt| dt.unix_timestamp() * 1_000 + i64::from(dt.millisecond()))
}

/// Provider-stamped and ingestion timestamps for one event, always kept separate.
///
/// Construct with [`TimestampSet::new`]; use [`event_ts`] to get the best
/// available timestamp for the normalized event's `timestamp` field.
///
/// [`event_ts`]: TimestampSet::event_ts
#[derive(Debug, Clone)]
pub struct TimestampSet {
    /// Exchange-assigned event time, RFC-3339. `None` when the provider does
    /// not stamp individual messages (e.g. some REST responses).
    pub provider_ts: Option<String>,
    /// Wall-clock time when Aestus received/processed this message, RFC-3339.
    pub ingested_at: String,
}

impl TimestampSet {
    /// Build from an optional provider millisecond epoch.
    ///
    /// `provider_ms` = `None` means the provider did not supply a timestamp;
    /// `event_ts()` will fall back to `ingested_at`.
    #[must_use]
    pub fn new(provider_ms: Option<i64>) -> Self {
        Self {
            provider_ts: provider_ms.map(ms_to_rfc3339),
            ingested_at: now_rfc3339(),
        }
    }

    /// Best available event timestamp: `provider_ts` if present, else `ingested_at`.
    ///
    /// Use this for the `timestamp` field in normalized events.
    #[must_use]
    pub fn event_ts(&self) -> &str {
        self.provider_ts.as_deref().unwrap_or(&self.ingested_at)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ms_to_rfc3339_known_epoch() {
        // 2024-01-01T00:00:00Z = 1704067200000 ms
        let s = ms_to_rfc3339(1_704_067_200_000);
        assert!(s.starts_with("2024-01-01"), "got: {s}");
        assert!(s.contains("00:00:00"), "got: {s}");
    }

    #[test]
    fn ms_to_rfc3339_very_negative_falls_back() {
        let s = ms_to_rfc3339(-9_999_999_999_999_999);
        assert!(!s.is_empty());
    }

    #[test]
    fn now_rfc3339_looks_like_rfc3339() {
        let s = now_rfc3339();
        assert!(s.contains('T'), "expected T separator: {s}");
        assert!(s.contains('Z') || s.contains('+'), "expected timezone: {s}");
    }

    #[test]
    fn timestamp_set_preserves_both_timestamps() {
        let ts = TimestampSet::new(Some(1_704_067_200_000));
        // Provider timestamp is set and non-empty
        let p = ts.provider_ts.as_ref().expect("provider_ts must be Some");
        assert!(p.starts_with("2024-01-01"), "provider_ts: {p}");
        // Ingested_at is also set independently
        assert!(!ts.ingested_at.is_empty());
        assert!(ts.ingested_at.contains('T'));
    }

    #[test]
    fn timestamp_set_no_provider_falls_back_to_ingested() {
        let ts = TimestampSet::new(None);
        assert!(ts.provider_ts.is_none());
        assert!(!ts.ingested_at.is_empty());
        // event_ts falls back to ingested_at when provider_ts is absent
        assert_eq!(ts.event_ts(), ts.ingested_at.as_str());
    }

    #[test]
    fn rfc3339_to_ms_known_epoch() {
        let ms = rfc3339_to_ms("2024-01-01T00:00:00Z");
        assert_eq!(ms, Some(1_704_067_200_000));
    }

    #[test]
    fn rfc3339_to_ms_with_millis() {
        let ms = rfc3339_to_ms("2024-01-01T00:00:00.100Z");
        assert_eq!(ms, Some(1_704_067_200_100));
    }

    #[test]
    fn rfc3339_to_ms_invalid_returns_none() {
        assert_eq!(rfc3339_to_ms("not-a-date"), None);
    }

    #[test]
    fn event_ts_prefers_provider_ts() {
        let ts = TimestampSet::new(Some(1_704_067_200_000));
        assert_eq!(ts.event_ts(), ts.provider_ts.as_deref().unwrap());
    }
}
