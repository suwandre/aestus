//! In-memory engine state (P10-T001).
//!
//! Accumulates the latest [`FeatureSnapshot`] per asset plus recent contextual
//! events. Detectors (P10-T003+) read from this snapshot of the world each
//! evaluation tick. Single-user, single-process — a plain mutex-guarded map.

use std::collections::HashMap;

use crate::input::{FeatureSnapshot, MacroEvent, NewsItem, OnChainEvent};

/// Bounded retention for contextual events so the engine does not grow without
/// bound in long-running fixture/live mode.
const MAX_NEWS: usize = 500;
const MAX_ONCHAIN: usize = 500;
const MAX_MACRO: usize = 500;

/// Cap on retained correlation history points per pair (rolling baseline).
const MAX_CORR_HISTORY: usize = 60;

#[derive(Debug, Default)]
pub struct EngineState {
    /// Latest feature snapshot per canonical asset id.
    pub snapshots: HashMap<String, FeatureSnapshot>,
    /// Recent macro events keyed by `event_id` (dedup on ingest).
    pub macro_events: HashMap<String, MacroEvent>,
    /// Recent news items keyed by `id`.
    pub news_items: HashMap<String, NewsItem>,
    /// Recent on-chain events (append-only ring, newest last).
    pub onchain_events: Vec<OnChainEvent>,
    /// Rolling correlation history per pair, keyed `<primary>|<other>|<window>`,
    /// newest last. Provides the baseline the correlation-break detector
    /// compares the latest reading against (P10-T008).
    pub correlation_history: HashMap<String, Vec<f64>>,
}

/// Key for a correlation pair's history.
#[must_use]
pub fn correlation_key(primary: &str, other: &str, window: &str) -> String {
    format!("{primary}|{other}|{window}")
}

impl EngineState {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn ingest_snapshot(&mut self, snap: FeatureSnapshot) {
        // Append each correlation reading to its rolling history (newest last).
        for entry in &snap.correlation_set {
            let key = correlation_key(&snap.canonical_asset_id, &entry.asset, &entry.window);
            let hist = self.correlation_history.entry(key).or_default();
            hist.push(entry.correlation);
            if hist.len() > MAX_CORR_HISTORY {
                let overflow = hist.len() - MAX_CORR_HISTORY;
                hist.drain(0..overflow);
            }
        }
        self.snapshots.insert(snap.canonical_asset_id.clone(), snap);
    }

    pub fn ingest_macro(&mut self, ev: MacroEvent) {
        if self.macro_events.len() >= MAX_MACRO && !self.macro_events.contains_key(&ev.event_id) {
            // Drop an arbitrary oldest-ish entry to stay bounded.
            if let Some(k) = self.macro_events.keys().next().cloned() {
                self.macro_events.remove(&k);
            }
        }
        self.macro_events.insert(ev.event_id.clone(), ev);
    }

    pub fn ingest_news(&mut self, item: NewsItem) {
        if self.news_items.len() >= MAX_NEWS && !self.news_items.contains_key(&item.id) {
            if let Some(k) = self.news_items.keys().next().cloned() {
                self.news_items.remove(&k);
            }
        }
        self.news_items.insert(item.id.clone(), item);
    }

    pub fn ingest_onchain(&mut self, ev: OnChainEvent) {
        self.onchain_events.push(ev);
        if self.onchain_events.len() > MAX_ONCHAIN {
            let overflow = self.onchain_events.len() - MAX_ONCHAIN;
            self.onchain_events.drain(0..overflow);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(asset: &str) -> FeatureSnapshot {
        serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": asset,
            "timestamp": "2026-06-07T12:00:00Z",
            "regime": {}
        }))
        .expect("build snapshot")
    }

    #[test]
    fn snapshot_ingest_keeps_latest_per_asset() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap("crypto:btc-usdt"));
        st.ingest_snapshot(snap("crypto:btc-usdt"));
        st.ingest_snapshot(snap("crypto:eth-usdt"));
        assert_eq!(st.snapshots.len(), 2);
    }

    #[test]
    fn onchain_ring_is_bounded() {
        let mut st = EngineState::new();
        for i in 0..(MAX_ONCHAIN + 10) {
            let ev: OnChainEvent = serde_json::from_value(serde_json::json!({
                "chain": "bitcoin",
                "asset": "crypto:btc-usdt",
                "timestamp": "2026-06-07T00:00:00Z",
                "source": "test",
                "event_type": "whale_transfer",
                "amount": i as f64 + 1.0
            }))
            .expect("build onchain");
            st.ingest_onchain(ev);
        }
        assert_eq!(st.onchain_events.len(), MAX_ONCHAIN);
    }
}
