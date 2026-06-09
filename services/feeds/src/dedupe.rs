//! In-memory contextual deduplication (P07-T010).
//!
//! Tracks already-seen news, macro, and on-chain items across repeated poll
//! cycles so Postgres and NATS never receive duplicate records within a single
//! service run. For cross-restart dedup the Postgres upserts in
//! [`crate::persist::PostgresSink`] use ON CONFLICT DO NOTHING / DO UPDATE.
//!
//! Deduplication keys:
//! - News      — `url_hash` (normalised URL SHA-256)
//! - Calendar  — `event_id:source` composite
//! - On-chain  — `id` (tx_hash or deterministic composite)

use std::collections::HashSet;

use crate::calendar::CalendarItem;
use crate::news::NewsItem;
use crate::onchain::OnChainItem;

/// In-memory set of already-processed contextual item keys.
#[derive(Default)]
pub struct DedupeSet {
    seen_news: HashSet<String>,
    seen_calendar: HashSet<String>,
    seen_onchain: HashSet<String>,
}

impl DedupeSet {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `true` if the news item was already seen (keyed by `url_hash`).
    /// Inserts into the seen-set when new.
    pub fn seen_news(&mut self, item: &NewsItem) -> bool {
        !self.seen_news.insert(item.url_hash.clone())
    }

    /// Returns `true` if the calendar event was already seen
    /// (keyed by `event_id:source` composite).
    pub fn seen_calendar(&mut self, item: &CalendarItem) -> bool {
        let key = format!("{}:{}", item.event_id, item.source);
        !self.seen_calendar.insert(key)
    }

    /// Returns `true` if the on-chain item was already seen (keyed by `id`).
    pub fn seen_onchain(&mut self, item: &OnChainItem) -> bool {
        !self.seen_onchain.insert(item.id.clone())
    }

    /// Current counts `(news, calendar, onchain)` of seen items.
    pub fn sizes(&self) -> (usize, usize, usize) {
        (
            self.seen_news.len(),
            self.seen_calendar.len(),
            self.seen_onchain.len(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::news::url_hash;
    use crate::onchain::Confidence;

    fn make_news(url: &str) -> NewsItem {
        NewsItem {
            id: url_hash(url),
            url: url.into(),
            url_hash: url_hash(url),
            title: "Test".into(),
            summary: "Test".into(),
            source: "test".into(),
            source_type: "rss".into(),
            published_at: "2026-06-07T10:00:00.000Z".into(),
            entities: vec![],
            relevance_score: 0.0,
            sentiment: "neutral".into(),
            tags: vec![],
        }
    }

    fn make_calendar(event_id: &str) -> CalendarItem {
        CalendarItem {
            event_id: event_id.into(),
            region: "US".into(),
            currency: "USD".into(),
            title: "Test".into(),
            scheduled_at: "2026-06-10T12:30:00.000Z".into(),
            importance: "high".into(),
            consensus: None,
            previous: None,
            actual: None,
            source: "te".into(),
        }
    }

    fn make_onchain(id: &str) -> OnChainItem {
        OnChainItem {
            id: id.into(),
            event_type: "exchange_flow".into(),
            chain: "bitcoin".into(),
            asset: "crypto:btc-usdt".into(),
            value: 100.0,
            value_usd: None,
            addresses: vec![],
            attributes: serde_json::json!({}),
            source: "glassnode".into(),
            confidence: Confidence::High,
            occurred_at: "2026-06-07T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn dedupe_ignores_same_url_hash() {
        let mut ds = DedupeSet::new();
        let item = make_news("https://example.com/article");
        assert!(!ds.seen_news(&item), "first occurrence must be new");
        assert!(ds.seen_news(&item), "second occurrence must be duplicate");
    }

    #[test]
    fn different_urls_are_not_duplicates() {
        let mut ds = DedupeSet::new();
        let a = make_news("https://example.com/a");
        let b = make_news("https://example.com/b");
        assert!(!ds.seen_news(&a));
        assert!(!ds.seen_news(&b), "different URL must not be duplicate");
    }

    #[test]
    fn dedupe_ignores_same_calendar_id() {
        let mut ds = DedupeSet::new();
        let item = make_calendar("us-cpi-2026-06");
        assert!(!ds.seen_calendar(&item));
        assert!(ds.seen_calendar(&item));
    }

    #[test]
    fn same_event_id_different_source_not_duplicate() {
        let mut ds = DedupeSet::new();
        let mut a = make_calendar("us-cpi-2026-06");
        let mut b = make_calendar("us-cpi-2026-06");
        b.source = "forexfactory".into();
        // First source
        assert!(!ds.seen_calendar(&a));
        // Same id but different source is a different record
        assert!(!ds.seen_calendar(&b));
        // Repeating the first source now is a dupe
        assert!(ds.seen_calendar(&mut a));
    }

    #[test]
    fn dedupe_ignores_same_onchain_id() {
        let mut ds = DedupeSet::new();
        let item = make_onchain("tx-abc123");
        assert!(!ds.seen_onchain(&item));
        assert!(ds.seen_onchain(&item));
    }

    #[test]
    fn sizes_returns_counts() {
        let mut ds = DedupeSet::new();
        assert_eq!(ds.sizes(), (0, 0, 0));
        ds.seen_news(&make_news("https://a.com"));
        ds.seen_calendar(&make_calendar("evt-1"));
        ds.seen_onchain(&make_onchain("tx-1"));
        assert_eq!(ds.sizes(), (1, 1, 1));
    }
}
