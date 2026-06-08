//! OKX adapter placeholder (P06-T010).
//!
//! Parses OKX WebSocket fixture messages (trades, funding-rate, mark-price)
//! to the shared contract schema.

use crate::hash::sha256_hex;
use crate::provider::{AdapterEvent, Provider, ProviderError, ProviderHealth};
use crate::symbol_map::SymbolMap;
use async_trait::async_trait;
use event_model::envelope::SCHEMA_VERSION;
use event_model::market::{NormalizedMarketEvent, RawMarketEvent, Side};
use serde_json::Value;
use std::time::Duration;
use tokio::sync::{mpsc, watch};

const VENUE: &str = "okx";

pub struct OkxAdapter {
    symbol_map: SymbolMap,
    fixture_path: String,
}

impl OkxAdapter {
    pub fn new(symbol_map: SymbolMap) -> Self {
        Self {
            symbol_map,
            fixture_path: concat!(env!("CARGO_MANIFEST_DIR"), "/../../fixtures/market/okx_raw.json").into(),
        }
    }

    fn canonical_id(&self, inst_id: &str) -> String {
        self.symbol_map.canonical_id(VENUE, inst_id)
    }

    /// Parse OKX `trades` channel message.
    pub fn parse_trades(
        &self,
        msg: &Value,
        seq: u64,
        received_at: &str,
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError> {
        let inst_id = msg["arg"]["instId"].as_str().unwrap_or("");
        let canonical = self.canonical_id(inst_id);
        let data = msg["data"]
            .as_array()
            .ok_or_else(|| ProviderError::Parse("okx trades: missing data".into()))?;

        data.iter()
            .map(|t| {
                let price = t["px"]
                    .as_str()
                    .unwrap_or("0")
                    .parse::<f64>()
                    .map_err(|e| ProviderError::Parse(format!("okx px: {e}")))?;
                let size = t["sz"]
                    .as_str()
                    .unwrap_or("0")
                    .parse::<f64>()
                    .map_err(|e| ProviderError::Parse(format!("okx sz: {e}")))?;
                let side = if t["side"].as_str().unwrap_or("buy").to_lowercase() == "sell" {
                    Side::Sell
                } else {
                    Side::Buy
                };
                let trade_id = t["tradeId"].as_str().map(String::from);
                let ts_ms = t["ts"]
                    .as_str()
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or(0);
                let timestamp = if ts_ms > 0 {
                    crate::provider::binance::parser::ms_to_rfc3339(ts_ms)
                } else {
                    received_at.into()
                };

                Ok(NormalizedMarketEvent::Trade {
                    schema_version: SCHEMA_VERSION,
                    venue: VENUE.into(),
                    instrument_id: inst_id.into(),
                    canonical_asset_id: canonical.clone(),
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

    /// Parse OKX `funding-rate` channel → FundingRate.
    pub fn parse_funding_rate(
        &self,
        msg: &Value,
        seq: u64,
        received_at: &str,
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError> {
        let inst_id = msg["arg"]["instId"].as_str().unwrap_or("");
        let canonical = self.canonical_id(inst_id);
        let data = msg["data"]
            .as_array()
            .ok_or_else(|| ProviderError::Parse("okx funding: missing data".into()))?;

        data.iter()
            .filter_map(|d| {
                let rate = d["fundingRate"].as_str()?.parse::<f64>().ok()?;
                let next_funding_time = d["fundingTime"]
                    .as_str()
                    .and_then(|s| s.parse::<i64>().ok())
                    .map(crate::provider::binance::parser::ms_to_rfc3339);
                Some(Ok(NormalizedMarketEvent::FundingRate {
                    schema_version: SCHEMA_VERSION,
                    venue: VENUE.into(),
                    instrument_id: inst_id.into(),
                    canonical_asset_id: canonical.clone(),
                    timestamp: received_at.into(),
                    sequence: Some(seq),
                    funding_rate: rate,
                    next_funding_time,
                    interval_hours: Some(8.0),
                }))
            })
            .collect()
    }

    /// Parse OKX `mark-price` channel → MarkPrice.
    pub fn parse_mark_price(
        &self,
        msg: &Value,
        seq: u64,
        received_at: &str,
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError> {
        let inst_id = msg["arg"]["instId"].as_str().unwrap_or("");
        let canonical = self.canonical_id(inst_id);
        let data = msg["data"]
            .as_array()
            .ok_or_else(|| ProviderError::Parse("okx mark-price: missing data".into()))?;

        data.iter()
            .filter_map(|d| {
                let mark_price = d["markPx"].as_str()?.parse::<f64>().ok()?;
                let ts_ms = d["ts"].as_str().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
                let timestamp = if ts_ms > 0 {
                    crate::provider::binance::parser::ms_to_rfc3339(ts_ms)
                } else {
                    received_at.into()
                };
                Some(Ok(NormalizedMarketEvent::MarkPrice {
                    schema_version: SCHEMA_VERSION,
                    venue: VENUE.into(),
                    instrument_id: inst_id.into(),
                    canonical_asset_id: canonical.clone(),
                    timestamp,
                    sequence: Some(seq),
                    mark_price,
                }))
            })
            .collect()
    }
}

#[async_trait]
impl Provider for OkxAdapter {
    fn name(&self) -> &str {
        "okx"
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
        use time::OffsetDateTime;
        use time::format_description::well_known::Rfc3339;
        let now = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
        Ok(RawMarketEvent {
            schema_version: SCHEMA_VERSION,
            source: "okx:fixture".into(),
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
        let messages: Vec<Value> = serde_json::from_str(&content)
            .map_err(|e| ProviderError::Parse(e.to_string()))?;

        let received_at = {
            use time::OffsetDateTime;
            use time::format_description::well_known::Rfc3339;
            OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
        };

        for (seq, msg) in messages.iter().enumerate() {
            if *shutdown.borrow() {
                break;
            }
            let channel = msg["arg"]["channel"].as_str().unwrap_or("");
            let events: Vec<NormalizedMarketEvent> = match channel {
                "trades" => self.parse_trades(msg, seq as u64, &received_at)?,
                "funding-rate" => self.parse_funding_rate(msg, seq as u64, &received_at)?,
                "mark-price" => self.parse_mark_price(msg, seq as u64, &received_at)?,
                _ => continue,
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

    fn make_adapter() -> OkxAdapter {
        OkxAdapter::new(SymbolMap::load("nonexistent.toml"))
    }

    #[test]
    fn parse_trade_buy() {
        let a = make_adapter();
        let msg = serde_json::json!({
            "arg": {"channel": "trades", "instId": "BTC-USDT-SWAP"},
            "data": [{"instId": "BTC-USDT-SWAP", "tradeId": "1", "px": "68250.1", "sz": "0.001", "side": "buy", "ts": "1717862400000"}]
        });
        let evs = a.parse_trades(&msg, 0, "2026-06-08T12:00:00Z").unwrap();
        assert_eq!(evs.len(), 1);
        match &evs[0] {
            NormalizedMarketEvent::Trade { side, canonical_asset_id, venue, .. } => {
                assert_eq!(*side, Side::Buy);
                assert_eq!(canonical_asset_id, "crypto:btc-usdt");
                assert_eq!(venue, VENUE);
            }
            _ => panic!("expected Trade"),
        }
    }

    #[test]
    fn parse_funding_rate() {
        let a = make_adapter();
        let msg = serde_json::json!({
            "arg": {"channel": "funding-rate", "instId": "BTC-USDT-SWAP"},
            "data": [{"instId": "BTC-USDT-SWAP", "instType": "SWAP", "fundingRate": "0.0001", "fundingTime": "1717876800000"}]
        });
        let evs = a.parse_funding_rate(&msg, 0, "2026-06-08T12:00:00Z").unwrap();
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].event_type_str(), "funding_rate");
    }

    #[test]
    fn parse_mark_price() {
        let a = make_adapter();
        let msg = serde_json::json!({
            "arg": {"channel": "mark-price", "instId": "BTC-USDT-SWAP"},
            "data": [{"instType": "SWAP", "instId": "BTC-USDT-SWAP", "markPx": "68251.20", "ts": "1717862400000"}]
        });
        let evs = a.parse_mark_price(&msg, 0, "2026-06-08T12:00:00Z").unwrap();
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].event_type_str(), "mark_price");
    }

    #[tokio::test]
    async fn run_replay_fixture_emits_events() {
        let mut adapter = make_adapter();
        let (tx, mut rx) = mpsc::channel(20);
        let (_, shutdown) = watch::channel(false);
        adapter.run(vec!["BTC-USDT-SWAP".into()], tx, shutdown).await.unwrap();
        let mut count = 0;
        while rx.try_recv().is_ok() {
            count += 1;
        }
        assert!(count >= 3, "expected ≥3 events from fixture, got {count}");
    }
}
