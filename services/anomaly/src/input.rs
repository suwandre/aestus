//! Input payloads the anomaly engine consumes (P10-T001).
//!
//! Deserialize-only mirrors of upstream contracts: [`FeatureSnapshot`] from the
//! features service (`feature.snapshot.>`) and the contextual events the feeds
//! service publishes (`context.packet.>`): [`MacroEvent`], [`NewsItem`],
//! [`OnChainEvent`]. We keep local mirrors rather than depend on the producer
//! binaries; the TS contracts in `packages/contracts` remain the source of truth.

use serde::Deserialize;
use std::collections::HashMap;

// ── Feature snapshot (features service) ───────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct CorrelationEntry {
    pub asset: String,
    pub correlation: f64,
    pub window: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BasisEntry {
    pub reference: String,
    pub basis_bps: f64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Regime {
    #[serde(default)]
    pub trend: Option<String>,
    #[serde(default)]
    pub volatility: Option<String>,
    #[serde(default)]
    pub risk: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LiquidationCluster {
    pub price_low: f64,
    pub price_high: f64,
    pub total_size: f64,
    pub side: String,
}

/// Feature snapshot consumed from `feature.snapshot.<asset>`. Mirrors the
/// publishing struct in `services/features/src/snapshot.rs`.
#[derive(Debug, Clone, Deserialize)]
pub struct FeatureSnapshot {
    pub schema_version: u32,
    pub canonical_asset_id: String,
    pub timestamp: String,
    #[serde(default)]
    pub returns: HashMap<String, f64>,
    #[serde(default)]
    pub volatility: HashMap<String, f64>,
    #[serde(default)]
    pub z_scores: HashMap<String, f64>,
    #[serde(default)]
    pub funding_z: Option<f64>,
    #[serde(default)]
    pub oi_delta: Option<f64>,
    #[serde(default)]
    pub volume_z: Option<f64>,
    #[serde(default)]
    pub correlation_set: Vec<CorrelationEntry>,
    #[serde(default)]
    pub basis: Vec<BasisEntry>,
    #[serde(default)]
    pub regime: Regime,
    #[serde(default)]
    pub liq_clusters: Vec<LiquidationCluster>,
    #[serde(default)]
    pub oi_state: Option<String>,
    #[serde(default)]
    pub funding_spread: Option<f64>,
    #[serde(default)]
    pub breadth_up_pct: Option<f64>,
    #[serde(default)]
    pub breadth_down_pct: Option<f64>,
}

// ── Contextual events (feeds service) ─────────────────────────────────────────

/// Scheduled macro-calendar event. Mirrors `MacroEvent` in the TS contract.
#[derive(Debug, Clone, Deserialize)]
pub struct MacroEvent {
    pub event_id: String,
    pub region: String,
    pub currency: String,
    pub title: String,
    pub scheduled_at: String,
    pub importance: String,
    #[serde(default)]
    pub consensus: Option<f64>,
    #[serde(default)]
    pub previous: Option<f64>,
    #[serde(default)]
    pub actual: Option<f64>,
    pub source: String,
}

/// News / narrative item. Mirrors `NewsItem` in the TS contract.
#[derive(Debug, Clone, Deserialize)]
pub struct NewsItem {
    pub id: String,
    pub title: String,
    pub source: String,
    #[serde(default)]
    pub published_at: String,
    #[serde(default)]
    pub entities: Vec<String>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub relevance_score: f64,
    #[serde(default)]
    pub sentiment: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// On-chain event. Mirrors the `OnChainEvent` discriminated union in the TS
/// contract; we keep a flat struct with `event_type` + optional fields since the
/// detector only needs a subset.
#[derive(Debug, Clone, Deserialize)]
pub struct OnChainEvent {
    pub chain: String,
    pub asset: String,
    pub timestamp: String,
    pub source: String,
    pub event_type: String,
    #[serde(default)]
    pub direction: Option<String>,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub amount_usd: Option<f64>,
    #[serde(default)]
    pub exchange: Option<String>,
    #[serde(default)]
    pub from_label: Option<String>,
    #[serde(default)]
    pub to_label: Option<String>,
    #[serde(default)]
    pub classification: Option<String>,
    #[serde(default)]
    pub tx_hash: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_snapshot_parses_fixture() {
        let raw = std::fs::read_to_string("../../fixtures/features/snapshots.json")
            .expect("read snapshots fixture");
        let snaps: Vec<FeatureSnapshot> = serde_json::from_str(&raw).expect("parse snapshots");
        assert!(!snaps.is_empty());
        let btc = &snaps[0];
        assert_eq!(btc.canonical_asset_id, "crypto:btc-usdt");
        assert_eq!(btc.funding_z, Some(2.6));
    }

    #[test]
    fn macro_event_parses_fixture() {
        let raw = std::fs::read_to_string("../../fixtures/macro/events.json")
            .expect("read macro fixture");
        let events: Vec<MacroEvent> = serde_json::from_str(&raw).expect("parse macro");
        assert!(events.iter().any(|e| e.event_id == "us-cpi-2026-06"));
    }

    #[test]
    fn onchain_event_parses_fixture() {
        let raw = std::fs::read_to_string("../../fixtures/onchain/events.json")
            .expect("read onchain fixture");
        let events: Vec<OnChainEvent> = serde_json::from_str(&raw).expect("parse onchain");
        assert!(events.iter().any(|e| e.event_type == "whale_transfer"));
    }

    #[test]
    fn news_item_parses_fixture() {
        let raw =
            std::fs::read_to_string("../../fixtures/news/items.json").expect("read news fixture");
        let items: Vec<NewsItem> = serde_json::from_str(&raw).expect("parse news");
        assert!(!items.is_empty());
    }
}
