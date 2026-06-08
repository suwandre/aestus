//! Binance futures WebSocket adapter (P06-T003 – T007).
//!
//! Connects to the Binance combined-stream endpoint and handles:
//! - aggTrade → Trade events (T003)
//! - bookTicker → PriceTick events (T003)
//! - markPriceUpdate → MarkPrice + FundingRate + IndexPrice (T004)
//! - OI REST polling → OpenInterest (T005)
//! - !forceOrder@arr → Liquidation (T006)
//! - Exponential-backoff reconnect + stale-stream detection (T007)

pub mod parser;
pub mod reconnect;

use crate::provider::{AdapterEvent, Provider, ProviderError, ProviderHealth};
use crate::symbol_map::SymbolMap;
use async_trait::async_trait;
use event_model::market::NormalizedMarketEvent;
use futures::{SinkExt, StreamExt};
use reconnect::BackoffState;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite;

const VENUE: &str = "binance";
const SOURCE_PREFIX: &str = "binance:ws:perp";
const OI_BASE_URL: &str = "https://fapi.binance.com/fapi/v1/openInterest";
const WS_BASE_URL: &str = "wss://fstream.binance.com/stream?streams=";

#[derive(Debug, Default)]
struct HealthInner {
    connected: bool,
    last_message_at: Option<Instant>,
    reconnect_count: u64,
    error_count: u64,
    messages_processed: u64,
}

/// Binance futures adapter. Fixture-first: runs entirely without a live
/// connection when `NATS_URL` is unset; tests exercise the parser layer.
pub struct BinanceAdapter {
    symbol_map: SymbolMap,
    oi_interval: Duration,
    stale_timeout: Duration,
    health: Mutex<HealthInner>,
    backoff: BackoffState,
    http_client: reqwest::Client,
}

impl BinanceAdapter {
    pub fn new(symbol_map: SymbolMap, oi_interval: Duration, stale_timeout: Duration) -> Self {
        Self {
            symbol_map,
            oi_interval,
            stale_timeout,
            health: Mutex::default(),
            backoff: BackoffState::default(),
            http_client: reqwest::Client::new(),
        }
    }

    fn build_ws_url(&self, symbols: &[String]) -> String {
        let streams: Vec<String> = symbols
            .iter()
            .flat_map(|s| {
                let s_lower = s.to_lowercase();
                vec![
                    format!("{s_lower}@aggTrade"),
                    format!("{s_lower}@bookTicker"),
                    format!("{s_lower}@markPrice@1s"),
                ]
            })
            .chain(std::iter::once("!forceOrder@arr".to_string()))
            .collect();
        format!("{WS_BASE_URL}{}", streams.join("/"))
    }

    fn canonical_id(&self, symbol: &str) -> String {
        self.symbol_map.canonical_id(VENUE, symbol)
    }

    /// Run the WebSocket message loop until error or shutdown.
    async fn ws_loop(
        &self,
        symbols: &[String],
        tx: &mpsc::Sender<AdapterEvent>,
        shutdown: &mut watch::Receiver<bool>,
    ) -> Result<(), ProviderError> {
        let url = self.build_ws_url(symbols);
        tracing::info!(url = %url, "Binance WS connecting");

        let (ws, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| ProviderError::Connect(e.to_string()))?;

        {
            let mut h = self.health.lock().unwrap_or_else(|e| e.into_inner());
            h.connected = true;
        }

        let (mut sink, mut stream) = ws.split();
        let received_at_fn = || {
            use time::format_description::well_known::Rfc3339;
            use time::OffsetDateTime;
            OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
        };
        let mut seq: u64 = 0;

        loop {
            let stale = self.stale_timeout;
            tokio::select! {
                biased;
                _ = shutdown.changed() => {
                    if *shutdown.borrow() { return Ok(()); }
                }
                result = tokio::time::timeout(stale, stream.next()) => {
                    let msg = match result {
                        Err(_) => return Err(ProviderError::Io(
                            "stale stream: no messages within timeout".into()
                        )),
                        Ok(None) => return Err(ProviderError::Io("WS stream ended".into())),
                        Ok(Some(Err(e))) => return Err(ProviderError::Io(e.to_string())),
                        Ok(Some(Ok(m))) => m,
                    };

                    match msg {
                        tungstenite::Message::Text(text) => {
                            let bytes = text.as_bytes().to_vec();
                            let received_at = received_at_fn();
                            if let Err(e) = self
                                .process_ws_message(&bytes, seq, &received_at, tx)
                                .await
                            {
                                tracing::warn!(error = %e, "parse error (skipping)");
                                let mut h = self.health.lock().unwrap_or_else(|e| e.into_inner());
                                h.error_count += 1;
                                crate::metrics::inc_errors(VENUE);
                            } else {
                                seq += 1;
                                let mut h = self.health.lock().unwrap_or_else(|e| e.into_inner());
                                h.last_message_at = Some(Instant::now());
                                h.messages_processed += 1;
                            }
                        }
                        tungstenite::Message::Ping(data) => {
                            sink.send(tungstenite::Message::Pong(data))
                                .await
                                .map_err(|e| ProviderError::Io(e.to_string()))?;
                        }
                        tungstenite::Message::Close(_) => {
                            return Err(ProviderError::Io("server closed connection".into()));
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    async fn process_ws_message(
        &self,
        bytes: &[u8],
        seq: u64,
        received_at: &str,
        tx: &mpsc::Sender<AdapterEvent>,
    ) -> Result<(), ProviderError> {
        let combined: parser::CombinedMessage =
            serde_json::from_slice(bytes).map_err(|e| ProviderError::Parse(e.to_string()))?;

        let stream = &combined.stream;
        let data = &combined.data;

        // Extract symbol from stream name (e.g. "btcusdt@aggTrade" → "BTCUSDT")
        let symbol_lower = stream.split('@').next().unwrap_or("");
        let instrument_id = symbol_lower.to_uppercase();
        let canonical = self.canonical_id(&instrument_id);

        let result = if stream.ends_with("@aggTrade") {
            parser::parse_agg_trade(data, VENUE, &instrument_id, &canonical, seq)?
        } else if stream.ends_with("@bookTicker") {
            parser::parse_book_ticker(data, VENUE, &instrument_id, &canonical, seq, received_at)?
        } else if stream.contains("@markPrice") {
            parser::parse_mark_price(data, VENUE, &instrument_id, &canonical, seq)?
        } else if stream == "!forceOrder@arr" {
            parser::parse_force_order(data, VENUE, |sym| self.canonical_id(sym), seq)?
        } else {
            return Ok(()); // unknown stream — silently skip
        };

        let feed = &result.raw_event_type;
        crate::metrics::inc_messages(VENUE, feed);
        crate::metrics::set_last_message_ms(
            VENUE,
            feed,
            result
                .provider_timestamp_ms
                .map(|ms| ms as f64)
                .unwrap_or(0.0),
        );

        let raw = parser::make_raw(&result, bytes, VENUE, SOURCE_PREFIX, seq);

        if !result.normalized.is_empty() {
            tx.send(AdapterEvent {
                raw_bytes: bytes.to_vec(),
                raw,
                normalized: result.normalized,
            })
            .await
            .ok(); // ignore if receiver dropped (shutdown path)
        }

        Ok(())
    }

    /// Poll OI REST endpoint for all symbols at a fixed interval.
    async fn run_oi_poller(
        &self,
        symbols: Vec<String>,
        tx: mpsc::Sender<AdapterEvent>,
        mut shutdown: watch::Receiver<bool>,
    ) {
        let mut ticker = tokio::time::interval(self.oi_interval);
        let mut seq: u64 = 0;
        loop {
            tokio::select! {
                biased;
                _ = shutdown.changed() => {
                    if *shutdown.borrow() { break; }
                }
                _ = ticker.tick() => {
                    for symbol in &symbols {
                        let canonical = self.canonical_id(symbol);
                        match self.fetch_oi(symbol, &canonical, seq).await {
                            Ok(ev) => {
                                let raw_body = format!("{{\"symbol\":\"{symbol}\"}}");
                                let raw = crate::provider::binance::parser::make_raw(
                                    &parser::ParseResult {
                                        raw_event_type: "openInterest".into(),
                                        provider_timestamp_ms: None,
                                        normalized: vec![],
                                    },
                                    raw_body.as_bytes(),
                                    VENUE,
                                    &format!("binance:rest:oi@{}", symbol.to_lowercase()),
                                    seq,
                                );
                                crate::metrics::inc_messages(VENUE, "open_interest");
                                tx.send(AdapterEvent {
                                    raw_bytes: raw_body.into_bytes(),
                                    raw,
                                    normalized: vec![ev],
                                }).await.ok();
                                seq += 1;
                            }
                            Err(e) => {
                                tracing::warn!(symbol, error = %e, "OI fetch failed");
                                crate::metrics::inc_errors(VENUE);
                            }
                        }
                    }
                }
            }
        }
    }

    async fn fetch_oi(
        &self,
        symbol: &str,
        canonical: &str,
        _seq: u64,
    ) -> Result<NormalizedMarketEvent, ProviderError> {
        let url = format!("{OI_BASE_URL}?symbol={symbol}");
        let body: serde_json::Value = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| ProviderError::Io(e.to_string()))?
            .json()
            .await
            .map_err(|e| ProviderError::Parse(e.to_string()))?;
        parser::parse_oi_response(&body, VENUE, symbol, canonical)
    }
}

#[async_trait]
impl Provider for BinanceAdapter {
    fn name(&self) -> &str {
        "binance"
    }
    fn venue(&self) -> &str {
        VENUE
    }

    async fn connect(&mut self) -> Result<(), ProviderError> {
        // No pre-connect needed; connection is established in run().
        Ok(())
    }

    async fn subscribe(&mut self, _symbols: &[String]) -> Result<(), ProviderError> {
        // Symbols are passed to run() directly.
        Ok(())
    }

    fn parse_raw(
        &self,
        raw_bytes: &[u8],
        seq: u64,
    ) -> Result<event_model::market::RawMarketEvent, ProviderError> {
        use crate::hash::sha256_hex;
        use event_model::envelope::SCHEMA_VERSION;
        use event_model::market::RawMarketEvent;
        use time::format_description::well_known::Rfc3339;
        use time::OffsetDateTime;
        let received_at = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
        Ok(RawMarketEvent {
            schema_version: SCHEMA_VERSION,
            source: SOURCE_PREFIX.into(),
            venue: VENUE.into(),
            received_at,
            provider_timestamp: None,
            sequence: seq,
            event_type: "unknown".into(),
            raw_payload_hash: sha256_hex(raw_bytes),
        })
    }

    fn normalize(
        &self,
        _raw: &event_model::market::RawMarketEvent,
        _raw_bytes: &[u8],
    ) -> Result<Vec<event_model::market::NormalizedMarketEvent>, ProviderError> {
        // Normalization happens inside ws_loop via parse_agg_trade etc.
        Ok(vec![])
    }

    async fn reconnect(&mut self) -> Result<(), ProviderError> {
        {
            let mut h = self.health.lock().unwrap_or_else(|e| e.into_inner());
            h.connected = false;
        }
        Ok(())
    }

    fn health(&self) -> ProviderHealth {
        let h = self.health.lock().unwrap_or_else(|e| e.into_inner());
        ProviderHealth {
            connected: h.connected,
            last_message_at: h.last_message_at,
            reconnect_count: h.reconnect_count,
            error_count: h.error_count,
            messages_processed: h.messages_processed,
        }
    }

    async fn run(
        &mut self,
        symbols: Vec<String>,
        tx: mpsc::Sender<AdapterEvent>,
        shutdown: watch::Receiver<bool>,
    ) -> Result<(), ProviderError> {
        // Spawn OI poller as an independent task
        let oi_tx = tx.clone();
        let oi_syms = symbols.clone();
        let oi_interval = self.oi_interval;
        let oi_sym_map = self.symbol_map.clone();
        let mut oi_shutdown = shutdown.clone();
        let http = self.http_client.clone();

        tokio::spawn(async move {
            let poller = BinanceAdapter {
                symbol_map: oi_sym_map,
                oi_interval,
                stale_timeout: Duration::from_secs(60),
                health: Mutex::default(),
                backoff: BackoffState::default(),
                http_client: http,
            };
            poller
                .run_oi_poller(oi_syms, oi_tx, oi_shutdown.clone())
                .await;
            // silence clippy: reference shutdown_clone to suppress unused-variable warning
            let _ = &mut oi_shutdown;
        });

        let mut shutdown_rx = shutdown;
        loop {
            if *shutdown_rx.borrow() {
                break;
            }
            match self.ws_loop(&symbols, &tx, &mut shutdown_rx).await {
                Ok(()) => break, // clean shutdown
                Err(e) if *shutdown_rx.borrow() => {
                    tracing::debug!(error = %e, "ws loop ended at shutdown");
                    break;
                }
                Err(e) => {
                    let delay = self.backoff.next_delay();
                    {
                        let mut h = self.health.lock().unwrap_or_else(|hh| hh.into_inner());
                        h.connected = false;
                        h.reconnect_count += 1;
                    }
                    crate::metrics::inc_reconnects(VENUE);
                    tracing::warn!(
                        error = %e,
                        delay_secs = delay.as_secs(),
                        "Binance WS disconnected, backing off"
                    );
                    tokio::time::sleep(delay).await;
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::symbol_map::SymbolMap;

    fn make_adapter() -> BinanceAdapter {
        BinanceAdapter::new(
            SymbolMap::default(),
            Duration::from_secs(60),
            Duration::from_secs(60),
        )
    }

    #[test]
    fn ws_url_includes_all_stream_types() {
        let a = make_adapter();
        let url = a.build_ws_url(&["BTCUSDT".into(), "ETHUSDT".into()]);
        assert!(url.contains("btcusdt@aggTrade"));
        assert!(url.contains("btcusdt@bookTicker"));
        assert!(url.contains("btcusdt@markPrice@1s"));
        assert!(url.contains("ethusdt@aggTrade"));
        assert!(url.contains("!forceOrder@arr"));
    }

    #[tokio::test]
    async fn process_ws_message_agg_trade() {
        let sym_map = SymbolMap::load("nonexistent.toml"); // loads fixture fallback
        let adapter =
            BinanceAdapter::new(sym_map, Duration::from_secs(60), Duration::from_secs(60));
        let (tx, mut rx) = mpsc::channel(10);

        let msg = serde_json::to_vec(&serde_json::json!({
            "stream": "btcusdt@aggTrade",
            "data": {
                "e": "aggTrade", "E": 1620000000000i64,
                "s": "BTCUSDT", "a": 9999,
                "p": "50000.50", "q": "0.001",
                "T": 1620000000000i64, "m": false
            }
        }))
        .unwrap();

        adapter
            .process_ws_message(&msg, 1, "2026-06-08T12:00:00Z", &tx)
            .await
            .unwrap();

        let ev = rx.try_recv().unwrap();
        assert_eq!(ev.raw.event_type, "aggTrade");
        assert_eq!(ev.normalized.len(), 1);
        assert_eq!(ev.normalized[0].event_type_str(), "trade");
    }

    #[tokio::test]
    async fn process_ws_message_mark_price() {
        let adapter = make_adapter();
        let (tx, mut rx) = mpsc::channel(10);

        let msg = serde_json::to_vec(&serde_json::json!({
            "stream": "btcusdt@markPrice@1s",
            "data": {
                "e": "markPriceUpdate", "E": 1562305380000i64,
                "s": "BTCUSDT", "p": "11794.15000000",
                "i": "11784.00", "r": "0.00038167",
                "T": 1562306400000i64
            }
        }))
        .unwrap();

        adapter
            .process_ws_message(&msg, 2, "2026-06-08T12:00:00Z", &tx)
            .await
            .unwrap();

        let ev = rx.try_recv().unwrap();
        assert_eq!(ev.normalized.len(), 3); // mark + index + funding
    }

    #[tokio::test]
    async fn process_ws_message_liquidation() {
        let adapter = make_adapter();
        let (tx, mut rx) = mpsc::channel(10);

        let msg = serde_json::to_vec(&serde_json::json!({
            "stream": "!forceOrder@arr",
            "data": {
                "e": "forceOrder", "E": 1568014498953i64,
                "o": {
                    "s": "BTCUSDT", "S": "SELL",
                    "q": "0.014", "p": "9910", "ap": "9910",
                    "T": 1568014498953i64
                }
            }
        }))
        .unwrap();

        adapter
            .process_ws_message(&msg, 3, "2026-06-08T12:00:00Z", &tx)
            .await
            .unwrap();

        let ev = rx.try_recv().unwrap();
        assert_eq!(ev.normalized[0].event_type_str(), "liquidation");
    }
}
