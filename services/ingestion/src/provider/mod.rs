//! Exchange adapter trait (P06-T002).
//!
//! Every exchange adapter implements [`Provider`] so the ingestion service can
//! drive multiple venues uniformly. The trait exposes the individual lifecycle
//! steps (connect / subscribe / parse_raw / normalize / reconnect / health)
//! plus a [`Provider::run`] orchestrating loop that adapters must implement.

pub mod binance;
pub mod bybit;
pub mod hyperliquid;
pub mod okx;

use async_trait::async_trait;
use event_model::market::{NormalizedMarketEvent, RawMarketEvent};
use std::time::Instant;
use thiserror::Error;
use tokio::sync::{mpsc, watch};

/// Structured errors from provider operations.
#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("connect failed: {0}")]
    Connect(String),
    #[error("subscribe failed: {0}")]
    Subscribe(String),
    #[error("parse error: {0}")]
    Parse(String),
    #[error("reconnect failed: {0}")]
    Reconnect(String),
    #[error("i/o error: {0}")]
    Io(String),
}

/// Snapshot of a provider's current operational health.
#[derive(Debug, Clone)]
pub struct ProviderHealth {
    pub connected: bool,
    pub last_message_at: Option<Instant>,
    pub reconnect_count: u64,
    pub error_count: u64,
    pub messages_processed: u64,
}

/// A parsed message bundle: the raw event envelope plus all normalized variants
/// derived from it, and the original wire bytes (for dedup / DLQ replay).
#[derive(Debug)]
pub struct AdapterEvent {
    pub raw: RawMarketEvent,
    /// Original wire bytes that produced `raw.raw_payload_hash`.
    pub raw_bytes: Vec<u8>,
    pub normalized: Vec<NormalizedMarketEvent>,
}

/// The interface every exchange adapter must satisfy.
///
/// The six lifecycle methods (`connect`, `subscribe`, `parse_raw`, `normalize`,
/// `reconnect`, `health`) describe the adapter's steps. The `run` method wires
/// them into a self-contained event loop that sends [`AdapterEvent`]s to `tx`
/// until `shutdown` fires.
#[async_trait]
pub trait Provider: Send {
    /// Short human name for logging / metrics, e.g. `"binance"`.
    fn name(&self) -> &str;

    /// Venue id matching `Venue.venue_id`, e.g. `"binance"`.
    fn venue(&self) -> &str;

    /// Establish the transport connection (WebSocket connect, REST handshake, …).
    async fn connect(&mut self) -> Result<(), ProviderError>;

    /// Subscribe to the given symbols in venue-native format (e.g. `BTCUSDT`).
    async fn subscribe(&mut self, symbols: &[String]) -> Result<(), ProviderError>;

    /// Parse raw wire bytes into a [`RawMarketEvent`]. `seq` is a monotonic
    /// counter maintained by the caller for per-source ordering.
    fn parse_raw(&self, raw_bytes: &[u8], seq: u64) -> Result<RawMarketEvent, ProviderError>;

    /// Normalize a raw event into zero or more [`NormalizedMarketEvent`]s.
    fn normalize(
        &self,
        raw: &RawMarketEvent,
        raw_bytes: &[u8],
    ) -> Result<Vec<NormalizedMarketEvent>, ProviderError>;

    /// Reconnect after a transport failure. External backoff is applied by the
    /// caller before invoking this.
    async fn reconnect(&mut self) -> Result<(), ProviderError>;

    /// Current health snapshot.
    fn health(&self) -> ProviderHealth;

    /// Drive the event loop: connect, subscribe, then pump messages into `tx`
    /// until `shutdown` is set to `true`. Implementations own their reconnect
    /// strategy and call the other trait methods internally.
    async fn run(
        &mut self,
        symbols: Vec<String>,
        tx: mpsc::Sender<AdapterEvent>,
        shutdown: watch::Receiver<bool>,
    ) -> Result<(), ProviderError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use event_model::envelope::SCHEMA_VERSION;

    struct NoopProvider;

    #[async_trait]
    impl Provider for NoopProvider {
        fn name(&self) -> &str {
            "noop"
        }
        fn venue(&self) -> &str {
            "noop"
        }
        async fn connect(&mut self) -> Result<(), ProviderError> {
            Ok(())
        }
        async fn subscribe(&mut self, _: &[String]) -> Result<(), ProviderError> {
            Ok(())
        }
        fn parse_raw(&self, _: &[u8], seq: u64) -> Result<RawMarketEvent, ProviderError> {
            Ok(RawMarketEvent {
                schema_version: SCHEMA_VERSION,
                source: "noop:test".into(),
                venue: "noop".into(),
                received_at: "2026-06-08T00:00:00Z".into(),
                provider_timestamp: None,
                sequence: seq,
                event_type: "test".into(),
                raw_payload_hash: "sha256:00".into(),
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
                connected: true,
                last_message_at: None,
                reconnect_count: 0,
                error_count: 0,
                messages_processed: 0,
            }
        }
        async fn run(
            &mut self,
            _: Vec<String>,
            _: mpsc::Sender<AdapterEvent>,
            _: watch::Receiver<bool>,
        ) -> Result<(), ProviderError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn provider_trait_is_usable() {
        let mut p: Box<dyn Provider> = Box::new(NoopProvider);
        assert_eq!(p.name(), "noop");
        p.connect().await.unwrap();
        p.subscribe(&["BTCUSDT".into()]).await.unwrap();
        let raw = p.parse_raw(b"test", 1).unwrap();
        assert_eq!(raw.sequence, 1);
        let events = p.normalize(&raw, b"test").unwrap();
        assert!(events.is_empty());
        assert!(p.health().connected);
    }
}
