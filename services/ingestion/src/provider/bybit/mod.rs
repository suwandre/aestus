//! Bybit V5 adapter placeholder (P06-T008).
//!
//! Parses Bybit V5 WebSocket fixture messages to the shared contract schema.
//! Live WebSocket connection is not implemented; the fixture parser validates
//! that Bybit's wire format normalizes correctly.

use crate::hash::sha256_hex;
use crate::provider::{AdapterEvent, Provider, ProviderError, ProviderHealth};
use crate::symbol_map::SymbolMap;
use async_trait::async_trait;
use event_model::envelope::SCHEMA_VERSION;
use event_model::market::{NormalizedMarketEvent, RawMarketEvent, Side};
use serde_json::Value;
use std::time::Duration;
use tokio::sync::{mpsc, watch};

const VENUE: &str = "bybit";

pub struct BybitAdapter {
    symbol_map: SymbolMap,
    fixture_path: String,
}

impl BybitAdapter {
    pub fn new(symbol_map: SymbolMap) -> Self {
        Self {
            symbol_map,
            fixture_path: concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/bybit_raw.json")
                .into(),
        }
    }

    fn canonical_id(&self, symbol: &str) -> String {
        self.symbol_map.canonical_id(VENUE, symbol)
    }

    /// Parse a Bybit `publicTrade` snapshot message.
    pub fn parse_public_trade(
        &self,
        msg: &Value,
        seq: u64,
        received_at: &str,
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError> {
        let trades = msg["data"]
            .as_array()
            .ok_or_else(|| ProviderError::Parse("bybit: missing data array".into()))?;

        trades
            .iter()
            .map(|t| {
                let instrument_id = msg["topic"]
                    .as_str()
                    .and_then(|s| s.split('.').nth(1))
                    .unwrap_or("")
                    .to_string();
                let canonical = self.canonical_id(&instrument_id);

                let price = t["p"]
                    .as_str()
                    .unwrap_or("0")
                    .parse::<f64>()
                    .map_err(|e| ProviderError::Parse(format!("bybit price: {e}")))?;
                let size = t["v"]
                    .as_str()
                    .unwrap_or("0")
                    .parse::<f64>()
                    .map_err(|e| ProviderError::Parse(format!("bybit size: {e}")))?;
                let side_str = t["S"].as_str().unwrap_or("Buy");
                let side = if side_str.to_lowercase() == "sell" {
                    Side::Sell
                } else {
                    Side::Buy
                };
                let trade_id = t["i"].as_str().map(String::from);
                let ts_ms = t["T"].as_i64().unwrap_or(0);
                let timestamp = if ts_ms > 0 {
                    crate::provider::binance::parser::ms_to_rfc3339(ts_ms)
                } else {
                    received_at.into()
                };

                Ok(NormalizedMarketEvent::Trade {
                    schema_version: SCHEMA_VERSION,
                    venue: VENUE.into(),
                    instrument_id,
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

    /// Parse a Bybit `tickers` snapshot → PriceTick + MarkPrice + FundingRate.
    pub fn parse_ticker(
        &self,
        msg: &Value,
        seq: u64,
        received_at: &str,
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError> {
        let d = &msg["data"];
        let symbol = d["symbol"].as_str().unwrap_or("");
        let canonical = self.canonical_id(symbol);

        let mut events = vec![];

        // PriceTick from bid/ask
        if let (Ok(bid), Ok(ask)) = (
            d["bid1Price"]
                .as_str()
                .unwrap_or("0")
                .parse::<f64>()
                .map_err(|e| ProviderError::Parse(format!("bybit bid: {e}"))),
            d["ask1Price"]
                .as_str()
                .unwrap_or("0")
                .parse::<f64>()
                .map_err(|e| ProviderError::Parse(format!("bybit ask: {e}"))),
        ) {
            events.push(NormalizedMarketEvent::PriceTick {
                schema_version: SCHEMA_VERSION,
                venue: VENUE.into(),
                instrument_id: symbol.into(),
                canonical_asset_id: canonical.clone(),
                timestamp: received_at.into(),
                sequence: Some(seq),
                price: (bid + ask) / 2.0,
                bid: Some(bid),
                ask: Some(ask),
            });
        }

        // MarkPrice
        if let Some(mark_str) = d["markPrice"].as_str() {
            if let Ok(mark) = mark_str.parse::<f64>() {
                events.push(NormalizedMarketEvent::MarkPrice {
                    schema_version: SCHEMA_VERSION,
                    venue: VENUE.into(),
                    instrument_id: symbol.into(),
                    canonical_asset_id: canonical.clone(),
                    timestamp: received_at.into(),
                    sequence: Some(seq),
                    mark_price: mark,
                });
            }
        }

        // FundingRate
        if let Some(rate_str) = d["fundingRate"].as_str() {
            if let Ok(rate) = rate_str.parse::<f64>() {
                let next_time = d["nextFundingTime"]
                    .as_str()
                    .and_then(|s| s.parse::<i64>().ok())
                    .map(crate::provider::binance::parser::ms_to_rfc3339);
                events.push(NormalizedMarketEvent::FundingRate {
                    schema_version: SCHEMA_VERSION,
                    venue: VENUE.into(),
                    instrument_id: symbol.into(),
                    canonical_asset_id: canonical.clone(),
                    timestamp: received_at.into(),
                    sequence: Some(seq),
                    funding_rate: rate,
                    next_funding_time: next_time,
                    interval_hours: Some(8.0),
                });
            }
        }

        Ok(events)
    }
}

#[async_trait]
impl Provider for BybitAdapter {
    fn name(&self) -> &str {
        "bybit"
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
            source: "bybit:fixture".into(),
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
            let topic = msg["topic"].as_str().unwrap_or("");
            let events = if topic.starts_with("publicTrade") {
                self.parse_public_trade(msg, seq as u64, &received_at)?
            } else if topic.starts_with("tickers") {
                self.parse_ticker(msg, seq as u64, &received_at)?
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
        // Give receiver a moment, then yield
        tokio::time::sleep(Duration::from_millis(10)).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_adapter() -> BybitAdapter {
        BybitAdapter::new(SymbolMap::load("nonexistent.toml"))
    }

    #[test]
    fn parse_public_trade_buy() {
        let a = make_adapter();
        let msg = serde_json::json!({
            "topic": "publicTrade.BTCUSDT",
            "type": "snapshot",
            "ts": 1717862400000i64,
            "data": [{"i": "abc", "T": 1717862400000i64, "p": "68250.50", "v": "0.001", "S": "Buy"}]
        });
        let evs = a
            .parse_public_trade(&msg, 0, "2026-06-08T12:00:00Z")
            .unwrap();
        assert_eq!(evs.len(), 1);
        match &evs[0] {
            NormalizedMarketEvent::Trade {
                price,
                side,
                canonical_asset_id,
                ..
            } => {
                assert!((price - 68250.50).abs() < 1e-6);
                assert_eq!(*side, Side::Buy);
                assert_eq!(canonical_asset_id, "crypto:btc-usdt");
            }
            _ => panic!("expected Trade"),
        }
    }

    #[test]
    fn parse_ticker_emits_price_mark_funding() {
        let a = make_adapter();
        let msg = serde_json::json!({
            "topic": "tickers.BTCUSDT",
            "type": "snapshot",
            "ts": 1717862400000i64,
            "data": {
                "symbol": "BTCUSDT",
                "bid1Price": "68250.00",
                "ask1Price": "68251.00",
                "markPrice": "68251.20",
                "fundingRate": "0.0001",
                "nextFundingTime": "1717876800000"
            }
        });
        let evs = a.parse_ticker(&msg, 0, "2026-06-08T12:00:00Z").unwrap();
        let types: Vec<_> = evs.iter().map(|e| e.event_type_str()).collect();
        assert!(types.contains(&"price_tick"));
        assert!(types.contains(&"mark_price"));
        assert!(types.contains(&"funding_rate"));
    }

    #[tokio::test]
    async fn run_replay_fixture_emits_events() {
        let mut adapter = make_adapter();
        let (tx, mut rx) = mpsc::channel(20);
        let (_, shutdown) = watch::channel(false);
        adapter
            .run(vec!["BTCUSDT".into()], tx, shutdown)
            .await
            .unwrap();
        let mut count = 0;
        while rx.try_recv().is_ok() {
            count += 1;
        }
        assert!(count >= 2, "expected ≥2 events from fixture, got {count}");
    }
}
