//! Hyperliquid adapter placeholder (P06-T009).
//!
//! Parses Hyperliquid WebSocket fixture messages to the shared contract schema.

use crate::hash::sha256_hex;
use crate::provider::{AdapterEvent, Provider, ProviderError, ProviderHealth};
use crate::symbol_map::SymbolMap;
use async_trait::async_trait;
use event_model::envelope::SCHEMA_VERSION;
use event_model::market::{NormalizedMarketEvent, RawMarketEvent, Side};
use serde_json::Value;
use std::time::Duration;
use tokio::sync::{mpsc, watch};

const VENUE: &str = "hyperliquid";

pub struct HyperliquidAdapter {
    symbol_map: SymbolMap,
    fixture_path: String,
}

impl HyperliquidAdapter {
    pub fn new(symbol_map: SymbolMap) -> Self {
        Self {
            symbol_map,
            fixture_path: concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../fixtures/market/hyperliquid_raw.json"
            )
            .into(),
        }
    }

    fn canonical_id(&self, coin: &str) -> String {
        self.symbol_map.canonical_id(VENUE, coin)
    }

    /// Parse a Hyperliquid `trades` channel message.
    pub fn parse_trades(
        &self,
        msg: &Value,
        seq: u64,
        received_at: &str,
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError> {
        let trades = msg["data"]
            .as_array()
            .ok_or_else(|| ProviderError::Parse("hl: missing data".into()))?;
        trades
            .iter()
            .map(|t| {
                let coin = t["coin"].as_str().unwrap_or("");
                let canonical = self.canonical_id(coin);

                let price = t["px"]
                    .as_str()
                    .unwrap_or("0")
                    .parse::<f64>()
                    .map_err(|e| ProviderError::Parse(format!("hl px: {e}")))?;
                let size = t["sz"]
                    .as_str()
                    .unwrap_or("0")
                    .parse::<f64>()
                    .map_err(|e| ProviderError::Parse(format!("hl sz: {e}")))?;
                // Hyperliquid: "B" = buy (aggressor), "A" = sell (aggressor)
                let side = if t["side"].as_str().unwrap_or("B") == "B" {
                    Side::Buy
                } else {
                    Side::Sell
                };
                let trade_id = t["tid"].as_i64().map(|id| id.to_string());
                let ts_ms = t["time"].as_i64().unwrap_or(0);
                let timestamp = if ts_ms > 0 {
                    crate::provider::binance::parser::ms_to_rfc3339(ts_ms)
                } else {
                    received_at.into()
                };

                Ok(NormalizedMarketEvent::Trade {
                    schema_version: SCHEMA_VERSION,
                    venue: VENUE.into(),
                    instrument_id: coin.into(),
                    canonical_asset_id: canonical,
                    timestamp,
                    sequence: Some(seq),
                    price,
                    size,
                    side,
                    trade_id,
                })
            })
            .collect()
    }

    /// Parse a Hyperliquid `allMids` channel → PriceTick per coin.
    pub fn parse_all_mids(
        &self,
        msg: &Value,
        seq: u64,
        received_at: &str,
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError> {
        let mids = match msg["data"]["mids"].as_object() {
            Some(m) => m,
            None => return Ok(vec![]),
        };
        mids.iter()
            .filter_map(|(coin, price_val)| {
                let price = price_val.as_str()?.parse::<f64>().ok()?;
                let canonical = self.canonical_id(coin);
                Some(Ok(NormalizedMarketEvent::PriceTick {
                    schema_version: SCHEMA_VERSION,
                    venue: VENUE.into(),
                    instrument_id: coin.clone(),
                    canonical_asset_id: canonical,
                    timestamp: received_at.into(),
                    sequence: Some(seq),
                    price,
                    bid: None,
                    ask: None,
                }))
            })
            .collect()
    }
}

#[async_trait]
impl Provider for HyperliquidAdapter {
    fn name(&self) -> &str {
        "hyperliquid"
    }
    fn venue(&self) -> &str {
        VENUE
    }
    async fn connect(&mut self) -> Result<(), ProviderError> {
        Ok(())
    }
    async fn subscribe(&mut self, _: &[String]) -> Result<(), ProviderError> {
        Ok(())
    }
    fn parse_raw(&self, raw_bytes: &[u8], seq: u64) -> Result<RawMarketEvent, ProviderError> {
        use time::format_description::well_known::Rfc3339;
        use time::OffsetDateTime;
        let now = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
        Ok(RawMarketEvent {
            schema_version: SCHEMA_VERSION,
            source: "hyperliquid:fixture".into(),
            venue: VENUE.into(),
            received_at: now,
            provider_timestamp: None,
            sequence: seq,
            event_type: "fixture".into(),
            raw_payload_hash: sha256_hex(raw_bytes),
        })
    }
    fn normalize(
        &self,
        _: &RawMarketEvent,
        _: &[u8],
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError> {
        Ok(vec![])
    }
    async fn reconnect(&mut self) -> Result<(), ProviderError> {
        Ok(())
    }
    fn health(&self) -> ProviderHealth {
        ProviderHealth {
            connected: false,
            last_message_at: None,
            reconnect_count: 0,
            error_count: 0,
            messages_processed: 0,
        }
    }
    async fn run(
        &mut self,
        _symbols: Vec<String>,
        tx: mpsc::Sender<AdapterEvent>,
        shutdown: watch::Receiver<bool>,
    ) -> Result<(), ProviderError> {
        if *shutdown.borrow() {
            return Ok(());
        }
        let content = std::fs::read_to_string(&self.fixture_path)
            .map_err(|e| ProviderError::Io(e.to_string()))?;
        let messages: Vec<Value> =
            serde_json::from_str(&content).map_err(|e| ProviderError::Parse(e.to_string()))?;

        let received_at = {
            use time::format_description::well_known::Rfc3339;
            use time::OffsetDateTime;
            OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
        };

        for (seq, msg) in messages.iter().enumerate() {
            if *shutdown.borrow() {
                break;
            }
            let channel = msg["channel"].as_str().unwrap_or("");
            let events = if channel == "trades" {
                self.parse_trades(msg, seq as u64, &received_at)?
            } else if channel == "allMids" {
                self.parse_all_mids(msg, seq as u64, &received_at)?
            } else {
                continue;
            };
            if events.is_empty() {
                continue;
            }
            let raw_bytes = serde_json::to_vec(msg).unwrap_or_default();
            let raw = self.parse_raw(&raw_bytes, seq as u64)?;
            tx.send(AdapterEvent {
                raw_bytes,
                raw,
                normalized: events,
            })
            .await
            .ok();
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_adapter() -> HyperliquidAdapter {
        HyperliquidAdapter::new(SymbolMap::load("nonexistent.toml"))
    }

    #[test]
    fn parse_trade_buy() {
        let a = make_adapter();
        let msg = serde_json::json!({
            "channel": "trades",
            "data": [{"coin": "BTC", "side": "B", "px": "68250.5", "sz": "0.001", "time": 1717862400000i64, "tid": 123}]
        });
        let evs = a.parse_trades(&msg, 0, "2026-06-08T12:00:00Z").unwrap();
        assert_eq!(evs.len(), 1);
        match &evs[0] {
            NormalizedMarketEvent::Trade {
                side,
                canonical_asset_id,
                venue,
                ..
            } => {
                assert_eq!(*side, Side::Buy);
                assert_eq!(canonical_asset_id, "crypto:btc-usdt");
                assert_eq!(venue, VENUE);
            }
            _ => panic!("expected Trade"),
        }
    }

    #[test]
    fn parse_all_mids() {
        let a = make_adapter();
        let msg = serde_json::json!({
            "channel": "allMids",
            "data": {"mids": {"BTC": "68250.5", "ETH": "3512.75"}}
        });
        let evs = a.parse_all_mids(&msg, 0, "2026-06-08T12:00:00Z").unwrap();
        assert_eq!(evs.len(), 2);
        for ev in &evs {
            assert_eq!(ev.event_type_str(), "price_tick");
            assert_eq!(ev.venue(), VENUE);
        }
    }

    #[tokio::test]
    async fn run_replay_fixture_emits_events() {
        let mut adapter = make_adapter();
        let (tx, mut rx) = mpsc::channel(20);
        let (_, shutdown) = watch::channel(false);
        adapter.run(vec!["BTC".into()], tx, shutdown).await.unwrap();
        let mut count = 0;
        while rx.try_recv().is_ok() {
            count += 1;
        }
        assert!(count >= 1, "expected ≥1 events from fixture, got {count}");
    }
}
