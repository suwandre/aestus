//! Economic calendar provider abstraction (P07-T002).
//!
//! Defines [`CalendarProvider`] so new free/low-cost calendar sources can be
//! plugged in without touching the ingestion loop. [`CalendarItem`] mirrors
//! `MacroEvent` from `packages/contracts/src/macro.ts` and the `macro_events`
//! Postgres table (P04-T004).

pub mod fixture;

use crate::confidence::Confidence;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// A normalised economic-calendar event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CalendarItem {
    pub event_id: String,
    pub region: String,
    pub currency: String,
    pub title: String,
    pub scheduled_at: String,
    /// `"low"`, `"medium"`, or `"high"`.
    pub importance: String,
    pub consensus: Option<f64>,
    pub previous: Option<f64>,
    pub actual: Option<f64>,
    /// Calendar source identifier, e.g. `te`, `forexfactory`.
    pub source: String,
    /// Source data confidence (P08-T006): official releases are High; aggregator
    /// re-publishes default to Medium.
    #[serde(default)]
    pub source_confidence: Confidence,
}

/// Pluggable interface for economic-calendar data sources.
///
/// Implement this trait for each new provider (TradingEconomics, ForexFactory,
/// etc.); the ingestion loop calls them uniformly. Default-body helpers for
/// `is_duplicate` and `update_actuals` reduce boilerplate.
#[async_trait]
pub trait CalendarProvider: Send + Sync {
    /// Human name of this provider, e.g. `tradingeconomics` or `fixture`.
    fn name(&self) -> &str;

    /// Fetch the current upcoming-events list.
    async fn fetch(&self) -> anyhow::Result<Vec<CalendarItem>>;

    /// Map a raw provider JSON value to a [`CalendarItem`].
    /// Returns `None` for malformed or out-of-scope records.
    fn normalize(&self, raw: &serde_json::Value) -> Option<CalendarItem>;

    /// Whether `item` is already present in `existing` (same `event_id` and
    /// `source`). Default implementation checks both fields.
    fn is_duplicate(&self, item: &CalendarItem, existing: &[CalendarItem]) -> bool {
        existing
            .iter()
            .any(|e| e.event_id == item.event_id && e.source == item.source)
    }

    /// Update `item.actual` with a new print value.
    fn update_actuals(&self, item: &mut CalendarItem, actual: f64) {
        item.actual = Some(actual);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct DummyProvider;

    #[async_trait]
    impl CalendarProvider for DummyProvider {
        fn name(&self) -> &str {
            "dummy"
        }
        async fn fetch(&self) -> anyhow::Result<Vec<CalendarItem>> {
            Ok(vec![])
        }
        fn normalize(&self, _raw: &serde_json::Value) -> Option<CalendarItem> {
            None
        }
    }

    fn sample() -> CalendarItem {
        CalendarItem {
            event_id: "us-cpi-2026-06".into(),
            region: "US".into(),
            currency: "USD".into(),
            title: "CPI (YoY)".into(),
            scheduled_at: "2026-06-10T12:30:00.000Z".into(),
            importance: "high".into(),
            consensus: Some(3.1),
            previous: Some(3.4),
            actual: None,
            source: "te".into(),
            source_confidence: Confidence::High,
        }
    }

    #[test]
    fn is_duplicate_detects_same_event_id_and_source() {
        let p = DummyProvider;
        let items = vec![sample()];
        assert!(p.is_duplicate(&items[0], &items));
        let other = CalendarItem {
            event_id: "other".into(),
            ..items[0].clone()
        };
        assert!(!p.is_duplicate(&other, &items));
    }

    #[test]
    fn update_actuals_sets_field() {
        let p = DummyProvider;
        let mut item = sample();
        assert!(item.actual.is_none());
        p.update_actuals(&mut item, 3.2);
        assert_eq!(item.actual, Some(3.2));
    }

    #[test]
    fn different_source_is_not_duplicate() {
        let p = DummyProvider;
        let base = sample();
        let mut other = base.clone();
        other.source = "forexfactory".into();
        assert!(!p.is_duplicate(&other, &[base]));
    }
}
