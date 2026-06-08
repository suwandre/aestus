//! Market event types (P06-T002). Rust mirrors of:
//! - `packages/contracts/src/raw-event.ts`  → [`RawMarketEvent`]
//! - `packages/contracts/src/normalized-event.ts` → [`NormalizedMarketEvent`]

use serde::{Deserialize, Serialize};

/// Aggressor / liquidation side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Buy,
    Sell,
}

/// Source-traceable envelope for every raw message as ingested, before normalization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawMarketEvent {
    pub schema_version: u32,
    /// Logical feed id, e.g. `binance:ws:perp@btcusdt`.
    pub source: String,
    /// FK to `Venue.venue_id`.
    pub venue: String,
    /// When Aestus received the message (RFC-3339, server clock).
    pub received_at: String,
    /// Provider-stamped time when present (RFC-3339).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_timestamp: Option<String>,
    /// Monotonic per-source ordering token.
    pub sequence: u64,
    /// Raw event type from the exchange, e.g. `aggTrade`.
    pub event_type: String,
    /// SHA-256 of the original wire bytes, formatted `sha256:<hex>`.
    pub raw_payload_hash: String,
}

/// Discriminated union of all normalized market event variants.
/// Mirrors the TypeScript `NormalizedMarketEvent` discriminated union.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type")]
pub enum NormalizedMarketEvent {
    #[serde(rename = "price_tick")]
    PriceTick {
        schema_version: u32,
        venue: String,
        instrument_id: String,
        canonical_asset_id: String,
        timestamp: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sequence: Option<u64>,
        price: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        bid: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        ask: Option<f64>,
    },
    #[serde(rename = "trade")]
    Trade {
        schema_version: u32,
        venue: String,
        instrument_id: String,
        canonical_asset_id: String,
        timestamp: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sequence: Option<u64>,
        price: f64,
        size: f64,
        side: Side,
        #[serde(skip_serializing_if = "Option::is_none")]
        trade_id: Option<String>,
    },
    #[serde(rename = "orderbook_delta")]
    OrderbookDelta {
        schema_version: u32,
        venue: String,
        instrument_id: String,
        canonical_asset_id: String,
        timestamp: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sequence: Option<u64>,
        bids: Vec<[f64; 2]>,
        asks: Vec<[f64; 2]>,
        #[serde(default)]
        is_snapshot: bool,
    },
    #[serde(rename = "funding_rate")]
    FundingRate {
        schema_version: u32,
        venue: String,
        instrument_id: String,
        canonical_asset_id: String,
        timestamp: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sequence: Option<u64>,
        funding_rate: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        next_funding_time: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        interval_hours: Option<f64>,
    },
    #[serde(rename = "open_interest")]
    OpenInterest {
        schema_version: u32,
        venue: String,
        instrument_id: String,
        canonical_asset_id: String,
        timestamp: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sequence: Option<u64>,
        open_interest: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        notional: Option<f64>,
    },
    #[serde(rename = "liquidation")]
    Liquidation {
        schema_version: u32,
        venue: String,
        instrument_id: String,
        canonical_asset_id: String,
        timestamp: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sequence: Option<u64>,
        side: Side,
        price: f64,
        size: f64,
        /// Notional value (price × size).
        #[serde(skip_serializing_if = "Option::is_none")]
        notional: Option<f64>,
    },
    #[serde(rename = "mark_price")]
    MarkPrice {
        schema_version: u32,
        venue: String,
        instrument_id: String,
        canonical_asset_id: String,
        timestamp: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sequence: Option<u64>,
        mark_price: f64,
    },
    #[serde(rename = "index_price")]
    IndexPrice {
        schema_version: u32,
        venue: String,
        instrument_id: String,
        canonical_asset_id: String,
        timestamp: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sequence: Option<u64>,
        index_price: f64,
    },
}

impl NormalizedMarketEvent {
    pub fn event_type_str(&self) -> &'static str {
        match self {
            Self::PriceTick { .. } => "price_tick",
            Self::Trade { .. } => "trade",
            Self::OrderbookDelta { .. } => "orderbook_delta",
            Self::FundingRate { .. } => "funding_rate",
            Self::OpenInterest { .. } => "open_interest",
            Self::Liquidation { .. } => "liquidation",
            Self::MarkPrice { .. } => "mark_price",
            Self::IndexPrice { .. } => "index_price",
        }
    }

    pub fn venue(&self) -> &str {
        match self {
            Self::PriceTick { venue, .. }
            | Self::Trade { venue, .. }
            | Self::OrderbookDelta { venue, .. }
            | Self::FundingRate { venue, .. }
            | Self::OpenInterest { venue, .. }
            | Self::Liquidation { venue, .. }
            | Self::MarkPrice { venue, .. }
            | Self::IndexPrice { venue, .. } => venue,
        }
    }

    pub fn instrument_id(&self) -> &str {
        match self {
            Self::PriceTick { instrument_id, .. }
            | Self::Trade { instrument_id, .. }
            | Self::OrderbookDelta { instrument_id, .. }
            | Self::FundingRate { instrument_id, .. }
            | Self::OpenInterest { instrument_id, .. }
            | Self::Liquidation { instrument_id, .. }
            | Self::MarkPrice { instrument_id, .. }
            | Self::IndexPrice { instrument_id, .. } => instrument_id,
        }
    }

    pub fn canonical_asset_id(&self) -> &str {
        match self {
            Self::PriceTick { canonical_asset_id, .. }
            | Self::Trade { canonical_asset_id, .. }
            | Self::OrderbookDelta { canonical_asset_id, .. }
            | Self::FundingRate { canonical_asset_id, .. }
            | Self::OpenInterest { canonical_asset_id, .. }
            | Self::Liquidation { canonical_asset_id, .. }
            | Self::MarkPrice { canonical_asset_id, .. }
            | Self::IndexPrice { canonical_asset_id, .. } => canonical_asset_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn side_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Side::Buy).unwrap(), "\"buy\"");
        assert_eq!(serde_json::to_string(&Side::Sell).unwrap(), "\"sell\"");
    }

    #[test]
    fn normalized_event_tag_is_correct() {
        let ev = NormalizedMarketEvent::Trade {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-08T12:00:00Z".into(),
            sequence: Some(123),
            price: 50000.0,
            size: 0.001,
            side: Side::Buy,
            trade_id: None,
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("\"event_type\":\"trade\""));
        assert!(!json.contains("trade_id")); // skipped when None
        let back: NormalizedMarketEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back.event_type_str(), "trade");
    }

    #[test]
    fn raw_market_event_roundtrips() {
        let raw = RawMarketEvent {
            schema_version: 1,
            source: "binance:ws:perp".into(),
            venue: "binance".into(),
            received_at: "2026-06-08T12:00:00Z".into(),
            provider_timestamp: None,
            sequence: 42,
            event_type: "aggTrade".into(),
            raw_payload_hash: "sha256:abcd".into(),
        };
        let json = serde_json::to_string(&raw).unwrap();
        assert!(!json.contains("provider_timestamp")); // skipped when None
        let back: RawMarketEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back.sequence, 42);
    }
}
