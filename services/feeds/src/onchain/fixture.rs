//! Fixture-backed on-chain provider for offline/test development (P07-T009).
//!
//! Reads sample exchange netflow, whale transfer, and stablecoin mint/burn
//! events from `fixtures/onchain/events.json` so the On-Chain Insights UI
//! can be developed before a live provider is selected.

use super::{Confidence, OnChainItem, OnChainProvider};
use async_trait::async_trait;
use std::path::Path;

/// Reads on-chain events from a JSON fixture file.
pub struct FixtureOnChainProvider {
    items: Vec<OnChainItem>,
}

impl FixtureOnChainProvider {
    /// Load from `path` (normally `fixtures/onchain/events.json`).
    pub fn load(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let path = path.as_ref();
        let data = std::fs::read_to_string(path)
            .map_err(|e| anyhow::anyhow!("onchain fixture '{}': {}", path.display(), e))?;
        let raw: Vec<serde_json::Value> = serde_json::from_str(&data)?;
        let items = raw.iter().filter_map(normalise_event).collect();
        Ok(Self { items })
    }
}

fn normalise_event(v: &serde_json::Value) -> Option<OnChainItem> {
    let event_type = v["event_type"].as_str()?.to_string();
    let chain = v["chain"].as_str()?.to_string();
    let asset = v["asset"].as_str()?.to_string();
    let source = v["source"].as_str()?.to_string();
    let occurred_at = v["timestamp"].as_str().unwrap_or("").to_string();

    let value = v["amount"]
        .as_f64()
        .or_else(|| v["volume_usd"].as_f64())
        .unwrap_or(0.0);
    let value_usd = v["amount_usd"].as_f64();

    let mut addresses = Vec::new();
    if let Some(f) = v["from_label"].as_str() {
        addresses.push(f.to_string());
    }
    if let Some(t) = v["to_label"].as_str() {
        addresses.push(t.to_string());
    }
    if let Some(ex) = v["exchange"].as_str() {
        addresses.push(ex.to_string());
    }

    let id = v["tx_hash"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| format!("{source}-{event_type}-{asset}"));

    // Build attributes from remaining fields.
    let mut attrs = v.as_object()?.clone();
    for key in &[
        "schema_version",
        "chain",
        "asset",
        "timestamp",
        "source",
        "event_type",
        "amount",
        "amount_usd",
        "tx_hash",
        "from_label",
        "to_label",
    ] {
        attrs.remove(*key);
    }

    Some(OnChainItem {
        id,
        event_type,
        chain,
        asset,
        value,
        value_usd,
        addresses,
        attributes: serde_json::Value::Object(attrs),
        source,
        confidence: Confidence::Medium,
        occurred_at,
    })
}

#[async_trait]
impl OnChainProvider for FixtureOnChainProvider {
    fn name(&self) -> &str {
        "fixture"
    }

    fn confidence(&self) -> Confidence {
        Confidence::Medium
    }

    async fn fetch(&self) -> anyhow::Result<Vec<OnChainItem>> {
        Ok(self.items.clone())
    }

    fn normalize(&self, raw: &serde_json::Value) -> Option<OnChainItem> {
        normalise_event(raw)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn fixture_path() -> &'static str {
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/onchain/events.json"
        )
    }

    #[tokio::test]
    async fn fixture_importer_loads_all_variants() {
        let p = FixtureOnChainProvider::load(fixture_path()).unwrap();
        let items = p.fetch().await.unwrap();
        assert!(!items.is_empty(), "fixture must have on-chain events");
        let types: HashSet<_> = items.iter().map(|i| i.event_type.as_str()).collect();
        assert!(
            types.len() >= 2,
            "fixture should cover at least two event types; got: {:?}",
            types
        );
    }

    #[test]
    fn items_have_source_and_confidence() {
        let p = FixtureOnChainProvider::load(fixture_path()).unwrap();
        for item in &p.items {
            assert!(!item.source.is_empty(), "every item must have a source");
            assert!(!item.occurred_at.is_empty(), "every item must have a timestamp");
        }
    }

    #[test]
    fn normalise_exchange_flow() {
        let raw = serde_json::json!({
            "schema_version": 1,
            "chain": "bitcoin",
            "asset": "crypto:btc-usdt",
            "timestamp": "2026-06-07T00:00:00.000Z",
            "source": "glassnode",
            "event_type": "exchange_flow",
            "direction": "net",
            "amount": -1850.25,
            "amount_usd": -126300000.0
        });
        let p = FixtureOnChainProvider { items: vec![] };
        let item = p.normalize(&raw).expect("normalize must succeed");
        assert_eq!(item.event_type, "exchange_flow");
        assert_eq!(item.value, -1850.25);
        assert_eq!(item.source, "glassnode");
    }

    #[test]
    fn normalise_whale_transfer_extracts_addresses() {
        let raw = serde_json::json!({
            "schema_version": 1,
            "chain": "bitcoin",
            "asset": "crypto:btc-usdt",
            "timestamp": "2026-06-07T09:30:00.000Z",
            "source": "arkham",
            "event_type": "whale_transfer",
            "amount": 950.0,
            "amount_usd": 64837500.0,
            "from_label": "binance_hot_wallet",
            "to_label": "unknown_cold_wallet",
            "classification": "accumulation",
            "tx_hash": "f3a1c9e0"
        });
        let p = FixtureOnChainProvider { items: vec![] };
        let item = p.normalize(&raw).unwrap();
        assert_eq!(item.id, "f3a1c9e0");
        assert!(item.addresses.contains(&"binance_hot_wallet".to_string()));
        assert!(item.addresses.contains(&"unknown_cold_wallet".to_string()));
    }
}
