//! ClickHouse HTTP sink for normalized market events (P06-T014).
//!
//! Posts newline-delimited JSON rows to ClickHouse via its HTTP interface.
//! When no ClickHouse URL is configured the sink is a no-op (fixture-first).

use anyhow::{Context, Result};
use event_model::market::NormalizedMarketEvent;
use reqwest::Client;
use std::time::Duration;

const TABLE: &str = "normalized_market_events";

/// Sink that writes rows to ClickHouse using its HTTP API.
pub struct ClickHouseSink {
    client: Client,
    base_url: Option<String>,
    buffer: Vec<String>,
    max_batch: usize,
}

impl ClickHouseSink {
    /// Create a new sink. `url` = None disables writing (fixture/dev mode).
    pub fn new(url: Option<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("build reqwest client"),
            base_url: url,
            buffer: Vec::with_capacity(256),
            max_batch: 256,
        }
    }

    /// Stage an event for the next flush. Flushes automatically when the
    /// buffer reaches `max_batch`.
    pub async fn push(&mut self, event: &NormalizedMarketEvent) -> Result<()> {
        let row = serde_json::to_string(event)
            .context("serialize NormalizedMarketEvent for ClickHouse")?;
        self.buffer.push(row);
        if self.buffer.len() >= self.max_batch {
            self.flush().await?;
        }
        Ok(())
    }

    /// Write all buffered rows to ClickHouse as a single HTTP INSERT.
    pub async fn flush(&mut self) -> Result<()> {
        if self.buffer.is_empty() {
            return Ok(());
        }
        let Some(ref url) = self.base_url else {
            // No ClickHouse URL configured; drop the buffer silently.
            self.buffer.clear();
            return Ok(());
        };

        let body = self.buffer.join("\n");
        self.buffer.clear();

        let query = format!("INSERT INTO {TABLE} FORMAT JSONEachRow");
        self.client
            .post(url)
            .query(&[("query", query.as_str())])
            .body(body)
            .send()
            .await
            .context("ClickHouse HTTP INSERT")?
            .error_for_status()
            .context("ClickHouse returned error status")?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use event_model::market::{NormalizedMarketEvent, Side};

    fn make_trade() -> NormalizedMarketEvent {
        NormalizedMarketEvent::Trade {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-08T12:00:00Z".into(),
            sequence: Some(1),
            price: 68250.0,
            size: 0.001,
            side: Side::Buy,
            trade_id: Some("1".into()),
        }
    }

    #[tokio::test]
    async fn push_no_url_does_not_error() {
        let mut sink = ClickHouseSink::new(None);
        sink.push(&make_trade()).await.unwrap();
        sink.flush().await.unwrap();
    }

    #[tokio::test]
    async fn flush_empty_is_noop() {
        let mut sink = ClickHouseSink::new(None);
        sink.flush().await.unwrap();
    }

    #[tokio::test]
    async fn push_serializes_row() {
        let mut sink = ClickHouseSink::new(None);
        sink.push(&make_trade()).await.unwrap();
        assert_eq!(sink.buffer.len(), 1);
        assert!(sink.buffer[0].contains("crypto:btc-usdt"));
    }
}
