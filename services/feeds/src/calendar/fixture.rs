//! Fixture-backed calendar provider for offline/test development (P07-T003).
//!
//! Reads sample CPI/FOMC/NFP/PPI/jobless-claims events from
//! `fixtures/macro/events.json` so the Upcoming Events UI can be developed
//! without a live calendar API.

use super::{CalendarItem, CalendarProvider};
use async_trait::async_trait;
use std::path::Path;

/// Reads macro events from a JSON fixture file.
pub struct FixtureCalendarProvider {
    items: Vec<CalendarItem>,
}

impl FixtureCalendarProvider {
    /// Load from `path` (normally `fixtures/macro/events.json`).
    ///
    /// # Errors
    /// Returns an error when the file cannot be read or parsed.
    pub fn load(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let path = path.as_ref();
        let data = std::fs::read_to_string(path)
            .map_err(|e| anyhow::anyhow!("calendar fixture '{}': {}", path.display(), e))?;
        let items: Vec<CalendarItem> = serde_json::from_str(&data)?;
        Ok(Self { items })
    }
}

#[async_trait]
impl CalendarProvider for FixtureCalendarProvider {
    fn name(&self) -> &str {
        "fixture"
    }

    async fn fetch(&self) -> anyhow::Result<Vec<CalendarItem>> {
        Ok(self.items.clone())
    }

    fn normalize(&self, raw: &serde_json::Value) -> Option<CalendarItem> {
        serde_json::from_value(raw.clone()).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_path() -> &'static str {
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../fixtures/macro/events.json")
    }

    #[test]
    fn loads_fixture_events() {
        let p = FixtureCalendarProvider::load(fixture_path()).expect("load fixture");
        assert!(!p.items.is_empty(), "fixture must contain events");
    }

    #[tokio::test]
    async fn fetch_returns_all_items() {
        let p = FixtureCalendarProvider::load(fixture_path()).unwrap();
        let items = p.fetch().await.unwrap();
        assert!(!items.is_empty());
        let high: Vec<_> = items.iter().filter(|e| e.importance == "high").collect();
        assert!(!high.is_empty(), "at least one high-importance event");
    }

    #[test]
    fn normalize_round_trips() {
        let p = FixtureCalendarProvider::load(fixture_path()).unwrap();
        let raw = serde_json::json!({
            "event_id": "test-001",
            "region": "US",
            "currency": "USD",
            "title": "Test Event",
            "scheduled_at": "2026-06-15T12:00:00.000Z",
            "importance": "medium",
            "consensus": null,
            "previous": null,
            "actual": null,
            "source": "test"
        });
        let item = p.normalize(&raw).expect("normalize should succeed");
        assert_eq!(item.event_id, "test-001");
        assert_eq!(item.region, "US");
    }

    #[test]
    fn fixture_contains_cpi_and_fomc() {
        let p = FixtureCalendarProvider::load(fixture_path()).unwrap();
        let ids: Vec<_> = p.items.iter().map(|i| i.event_id.as_str()).collect();
        assert!(
            ids.iter().any(|id| id.contains("cpi")),
            "fixture must have CPI event"
        );
        assert!(
            ids.iter().any(|id| id.contains("fomc")),
            "fixture must have FOMC event"
        );
    }
}
