//! Aestus ingestion service — crypto market data MVP (P06).
//!
//! Reads from exchange WebSocket feeds (Binance live; Bybit/Hyperliquid/OKX
//! fixture replay), normalizes events, publishes to NATS JetStream, persists
//! hot-state to Redis, and archives to ClickHouse.

mod config;
mod hash;
mod health;
mod metrics;
mod persist;
mod provider;
mod symbol_map;

use config::Config;
use event_model::streams::{subject, NORMALIZED_MARKET, RAW_MARKET};
use nats_publisher::{NatsPublisher, Publisher, RecordingPublisher, RetryConfig};
use persist::{clickhouse::ClickHouseSink, redis_store::RedisStore};
use provider::{
    binance::BinanceAdapter, bybit::BybitAdapter, hyperliquid::HyperliquidAdapter,
    okx::OkxAdapter, AdapterEvent, Provider,
};
use symbol_map::SymbolMap;
use tokio::sync::{mpsc, watch};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(&cfg.log_level)
        .json()
        .init();

    tracing::info!("ingestion service starting");

    metrics::init();

    let sym_map = SymbolMap::load(&cfg.symbol_map_path);

    // NATS: use live publisher if URL is set, otherwise record in-memory.
    let publisher: Box<dyn Publisher> = match &cfg.nats_url {
        Some(url) => {
            let p = NatsPublisher::connect(url, RetryConfig::default()).await?;
            tracing::info!(url = %url, "connected to NATS");
            Box::new(p)
        }
        None => {
            tracing::warn!("NATS_URL unset — using in-memory RecordingPublisher (fixture mode)");
            Box::new(RecordingPublisher::new())
        }
    };

    // Health + metrics HTTP endpoint.
    let http_port = cfg.http_port;
    tokio::spawn(async move {
        if let Err(e) = health::serve(http_port).await {
            tracing::error!(error = %e, "health server exited");
        }
    });

    // Graceful shutdown via Ctrl-C / SIGTERM.
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            let _ = shutdown_tx.send(true);
        }
    });

    // Shared adapter-event channel.
    let (tx, mut rx) = mpsc::channel::<AdapterEvent>(4096);

    // Spawn each provider adapter.
    let symbols = cfg.symbols.clone();
    let providers: Vec<Box<dyn Provider>> = vec![
        Box::new(BinanceAdapter::new(sym_map.clone(), cfg.oi_interval, cfg.stale_timeout)),
        Box::new(BybitAdapter::new(sym_map.clone())),
        Box::new(HyperliquidAdapter::new(sym_map.clone())),
        Box::new(OkxAdapter::new(sym_map.clone())),
    ];

    for mut p in providers {
        let tx2 = tx.clone();
        let syms = symbols.clone();
        let srx = shutdown_rx.clone();
        tokio::spawn(async move {
            let name = p.name().to_string();
            if let Err(e) = p.run(syms, tx2, srx).await {
                tracing::error!(provider = %name, error = %e, "provider exited with error");
            }
        });
    }
    drop(tx); // Drop the original so the channel closes when all providers drop theirs.

    // Persistence sinks.
    let mut ch_sink = ClickHouseSink::new(cfg.clickhouse_url.clone());
    let redis = RedisStore::connect(cfg.redis_url.as_deref(), 300);

    // Event routing loop.
    while let Some(ev) = rx.recv().await {
        // Publish raw event.
        let raw_subject = subject(&RAW_MARKET, &[ev.raw.venue.as_str(), ev.raw.event_type.as_str()]);
        if let Ok(raw_bytes) = serde_json::to_vec(&ev.raw) {
            if let Err(e) = publisher.publish_bytes(&raw_subject, raw_bytes).await {
                tracing::warn!(subject = %raw_subject, error = %e, "raw publish failed");
                metrics::inc_errors(ev.raw.venue.as_str());
            }
        }

        for norm in &ev.normalized {
            let event_type = norm.event_type_str();
            let canonical = norm.canonical_asset_id();
            let venue = norm.venue();

            let norm_subject = subject(&NORMALIZED_MARKET, &[canonical, event_type]);

            match serde_json::to_vec(norm) {
                Ok(bytes) => {
                    if let Err(e) = publisher.publish_bytes(&norm_subject, bytes).await {
                        tracing::warn!(subject = %norm_subject, error = %e, "normalized publish failed");
                        metrics::inc_errors(venue);
                    } else {
                        metrics::inc_messages(venue, event_type);
                    }
                }
                Err(e) => {
                    tracing::warn!(error = %e, "serialize normalized event failed");
                    metrics::inc_errors(venue);
                }
            }

            // Persist to ClickHouse (best-effort, non-blocking).
            if let Err(e) = ch_sink.push(norm).await {
                tracing::warn!(error = %e, "clickhouse push failed");
            }

            // Write hot-state to Redis (no-op if unconfigured).
            if let Err(e) = redis.write(norm) {
                tracing::warn!(error = %e, "redis write failed");
            }
        }

        // Flush ClickHouse buffer periodically (every event for now; batching
        // happens inside ClickHouseSink when the buffer reaches max_batch).
    }

    // Flush any remaining ClickHouse rows.
    if let Err(e) = ch_sink.flush().await {
        tracing::warn!(error = %e, "final clickhouse flush failed");
    }

    tracing::info!("ingestion service stopped");
    Ok(())
}

#[cfg(test)]
mod tests {
    use nats_publisher::RecordingPublisher;

    #[tokio::test]
    async fn recording_publisher_fixture_mode_works() {
        // Sanity-check that the RecordingPublisher can publish without panicking.
        use nats_publisher::Publisher;
        let p = RecordingPublisher::new();
        p.publish_bytes("test.subject", b"hello".to_vec()).await.unwrap();
        assert_eq!(p.len().await, 1);
    }
}
