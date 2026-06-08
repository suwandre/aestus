//! Redis hot-state writer for latest market events (P06-T015).
//!
//! Stores the most recent PriceTick, MarkPrice, and FundingRate per instrument
//! in Redis with a configurable TTL. No Redis URL = no-op (fixture-first).

use anyhow::{Context, Result};
use event_model::market::NormalizedMarketEvent;
use std::sync::{Arc, Mutex};

/// Thin Redis wrapper.  `None` = fixture/dev mode (no-op writes).
pub struct RedisStore {
    conn: Option<Arc<Mutex<redis::Connection>>>,
    ttl_secs: u64,
}

impl RedisStore {
    /// Connect to Redis. If `url` is None or the connection fails, the store
    /// operates in no-op mode (never errors callers, just skips writes).
    pub fn connect(url: Option<&str>, ttl_secs: u64) -> Self {
        let conn = url.and_then(|u| {
            redis::Client::open(u)
                .ok()
                .and_then(|c| c.get_connection().ok())
                .map(|c| Arc::new(Mutex::new(c)))
        });
        Self { conn, ttl_secs }
    }

    /// Write the hot-state key for a supported event type.
    /// Key format: `mktstate:{venue}:{canonical_asset_id}:{event_type}`
    pub fn write(&self, event: &NormalizedMarketEvent) -> Result<()> {
        let key = self.key(event);
        let Some(ref key) = key else { return Ok(()) };
        let value =
            serde_json::to_string(event).context("serialize NormalizedMarketEvent for Redis")?;

        let Some(ref conn_arc) = self.conn else {
            return Ok(());
        };
        let mut conn = conn_arc.lock().expect("redis lock poisoned");
        redis::pipe()
            .set_ex(key, &value, self.ttl_secs)
            .query::<()>(&mut *conn)
            .context("Redis SET EX")?;
        Ok(())
    }

    fn key(&self, event: &NormalizedMarketEvent) -> Option<String> {
        let (venue, canonical, type_tag) = match event {
            NormalizedMarketEvent::PriceTick {
                venue,
                canonical_asset_id,
                ..
            } => (venue, canonical_asset_id, "price_tick"),
            NormalizedMarketEvent::MarkPrice {
                venue,
                canonical_asset_id,
                ..
            } => (venue, canonical_asset_id, "mark_price"),
            NormalizedMarketEvent::FundingRate {
                venue,
                canonical_asset_id,
                ..
            } => (venue, canonical_asset_id, "funding_rate"),
            // Trades, liquidations, OI, index are append-only streams — no hot key.
            _ => return None,
        };
        Some(format!("mktstate:{venue}:{canonical}:{type_tag}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use event_model::market::NormalizedMarketEvent;

    fn price_tick() -> NormalizedMarketEvent {
        NormalizedMarketEvent::PriceTick {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-08T12:00:00Z".into(),
            sequence: Some(1),
            price: 68250.0,
            bid: Some(68249.0),
            ask: Some(68251.0),
        }
    }

    #[test]
    fn write_no_redis_does_not_error() {
        let store = RedisStore::connect(None, 60);
        store.write(&price_tick()).unwrap();
    }

    #[test]
    fn key_format_price_tick() {
        let store = RedisStore::connect(None, 60);
        let k = store.key(&price_tick());
        assert_eq!(
            k.as_deref(),
            Some("mktstate:binance:crypto:btc-usdt:price_tick")
        );
    }

    #[test]
    fn key_none_for_trade() {
        use event_model::market::Side;
        let store = RedisStore::connect(None, 60);
        let trade = NormalizedMarketEvent::Trade {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-08T12:00:00Z".into(),
            sequence: Some(1),
            price: 68250.0,
            size: 0.001,
            side: Side::Buy,
            trade_id: None,
        };
        assert!(store.key(&trade).is_none());
    }
}
