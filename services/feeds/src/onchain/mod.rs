//! On-chain data provider abstraction (P07-T008).
//!
//! Defines [`OnChainProvider`] and [`OnChainItem`] covering all on-chain event
//! variants (exchange flow, whale transfer, stablecoin mint/burn, token unlock,
//! DEX activity). Each item carries `source` and `confidence` metadata so
//! briefings can flag when context depends on weak or derived data.

pub mod fixture;

use async_trait::async_trait;

/// Re-export the shared confidence type (P08-T006).
pub use crate::confidence::Confidence;

/// A normalised on-chain event. Maps to `on_chain_events` (P04-T005).
///
/// `event_type` discriminates the variant; `attributes` carries
/// variant-specific fields (matching the JSONB column in the DB schema).
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OnChainItem {
    /// Stable key: provider-assigned tx hash, or a deterministic composite.
    pub id: String,
    /// Discriminating field: `exchange_flow`, `whale_transfer`,
    /// `stablecoin_mint_burn`, `token_unlock`, `dex_activity`.
    pub event_type: String,
    /// Chain, e.g. `bitcoin`, `ethereum`.
    pub chain: String,
    /// Canonical asset id or bare chain-native symbol.
    pub asset: String,
    /// Primary magnitude in asset units (or USD volume for DEX activity).
    pub value: f64,
    pub value_usd: Option<f64>,
    /// Involved labeled addresses / wallets / exchanges.
    pub addresses: Vec<String>,
    /// Variant-specific fields (direction, dex, tx_hash, etc.) as JSON.
    pub attributes: serde_json::Value,
    /// Data provider, e.g. `glassnode`, `nansen`, `arkham`, `fixture`.
    pub source: String,
    pub confidence: Confidence,
    pub occurred_at: String,
}

/// Pluggable interface for on-chain data sources.
///
/// Implement this trait for each new provider; the ingestion loop calls them
/// uniformly. `confidence()` lets the loop tag data quality without
/// per-item inspection.
#[async_trait]
pub trait OnChainProvider: Send + Sync {
    /// Human name, e.g. `glassnode`, `nansen`, `fixture`.
    fn name(&self) -> &str;

    /// Confidence level this provider typically delivers.
    fn confidence(&self) -> Confidence;

    /// Fetch the latest on-chain event batch.
    async fn fetch(&self) -> anyhow::Result<Vec<OnChainItem>>;

    /// Map a raw provider JSON value to an [`OnChainItem`].
    fn normalize(&self, raw: &serde_json::Value) -> Option<OnChainItem>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confidence_serialises_lowercase() {
        assert_eq!(
            serde_json::to_string(&Confidence::High).unwrap(),
            "\"high\""
        );
        assert_eq!(
            serde_json::to_string(&Confidence::Medium).unwrap(),
            "\"medium\""
        );
        assert_eq!(serde_json::to_string(&Confidence::Low).unwrap(), "\"low\"");
    }

    #[test]
    fn on_chain_item_has_source_and_confidence() {
        let item = OnChainItem {
            id: "test-001".into(),
            event_type: "whale_transfer".into(),
            chain: "bitcoin".into(),
            asset: "crypto:btc-usdt".into(),
            value: 950.0,
            value_usd: Some(64_837_500.0),
            addresses: vec!["binance_hot_wallet".into()],
            attributes: serde_json::json!({"classification": "accumulation"}),
            source: "arkham".into(),
            confidence: Confidence::Medium,
            occurred_at: "2026-06-07T09:30:00.000Z".into(),
        };
        assert_eq!(item.source, "arkham");
        assert_eq!(item.confidence, Confidence::Medium);
        assert!(!item.addresses.is_empty());
    }

    #[test]
    fn all_event_types_can_be_constructed() {
        let types = [
            "exchange_flow",
            "whale_transfer",
            "stablecoin_mint_burn",
            "token_unlock",
            "dex_activity",
        ];
        for t in types {
            let item = OnChainItem {
                id: t.into(),
                event_type: t.into(),
                chain: "ethereum".into(),
                asset: "crypto:eth-usdt".into(),
                value: 1.0,
                value_usd: None,
                addresses: vec![],
                attributes: serde_json::json!({}),
                source: "test".into(),
                confidence: Confidence::Low,
                occurred_at: "2026-06-07T00:00:00.000Z".into(),
            };
            assert_eq!(item.event_type, t);
        }
    }
}
