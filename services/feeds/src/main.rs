//! Aestus feeds service — contextual data ingestion MVP (P07).
//!
//! Polls lower-frequency contextual feeds (macro calendar, news RSS, on-chain)
//! on a configurable schedule, normalises and deduplicates items, publishes to
//! NATS, and persists to Postgres. Runs separately from the high-frequency
//! exchange ingestion service (`services/ingestion`).

mod calendar;
mod config;
mod dedupe;
mod health;
mod metrics;
mod news;
mod onchain;
mod persist;

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use calendar::CalendarProvider;
use config::Config;
use event_model::streams::{subject, CONTEXT_PACKET};
use nats_publisher::{Heartbeat, NatsPublisher, Publisher, RecordingPublisher, RetryConfig};
use onchain::OnChainProvider;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(&cfg.log_level)
        .json()
        .init();

    tracing::info!("feeds service starting");

    metrics::init();

    // NATS: live publisher when URL is set, otherwise record in-memory.
    let publisher: Arc<dyn Publisher> = match &cfg.nats_url {
        Some(url) => {
            let p = NatsPublisher::connect(url, RetryConfig::default()).await?;
            tracing::info!(url = %url, "connected to NATS");
            Arc::new(p)
        }
        None => {
            tracing::warn!("NATS_URL unset — using in-memory RecordingPublisher (fixture mode)");
            Arc::new(RecordingPublisher::new())
        }
    };

    // Health + metrics HTTP endpoint.
    let http_port = cfg.http_port;
    tokio::spawn(async move {
        if let Err(e) = health::serve(http_port).await {
            tracing::error!(error = %e, "health server exited");
        }
    });

    // Periodic heartbeat on system.health.feeds.
    let hb_publisher = Arc::clone(&publisher);
    let hb_interval = cfg.heartbeat_interval;
    tokio::spawn(async move {
        Heartbeat::new("feeds", env!("CARGO_PKG_VERSION"))
            .run(hb_publisher.as_ref(), hb_interval, || vec![])
            .await;
    });

    // Contextual feed providers.
    let calendar = calendar::fixture::FixtureCalendarProvider::load(&cfg.calendar_fixture_path)?;
    let rss = news::rss::RssFetcher::new(cfg.rss_sources.clone(), &cfg.news_fixture_path);
    let onchain = onchain::fixture::FixtureOnChainProvider::load(&cfg.onchain_fixture_path)?;

    // Embedding provider (no-op until configured).
    let embed = news::embeddings::build_provider(cfg.embedding_provider.as_deref());

    let pg = persist::PostgresSink::new(cfg.postgres_url.clone());
    let watched_assets = cfg.watched_assets.clone();
    let poll_interval = cfg.poll_interval;
    let mut dedup = dedupe::DedupeSet::new();

    tracing::info!(
        poll_interval_secs = poll_interval.as_secs(),
        postgres_enabled = pg.is_enabled(),
        "feeds poll loop starting"
    );

    loop {
        let tick_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as f64)
            .unwrap_or(0.0);

        // — Calendar —
        match calendar.fetch().await {
            Ok(items) => {
                for item in items {
                    if !dedup.seen_calendar(&item) {
                        if let Err(e) = pg.upsert_macro_event(&item).await {
                            tracing::warn!(error = %e, "macro persist failed");
                            metrics::inc_errors("calendar");
                        }
                        let subj =
                            subject(&CONTEXT_PACKET, &["macro", &item.region.to_lowercase()]);
                        if let Ok(bytes) = serde_json::to_vec(&item) {
                            if let Err(e) = publisher.publish_bytes(&subj, bytes).await {
                                tracing::warn!(subject = %subj, error = %e, "calendar publish failed");
                            }
                        }
                        metrics::inc_items("calendar", &item.source);
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "calendar poll failed");
                metrics::inc_errors("calendar");
            }
        }

        // — News RSS —
        match rss.poll_once().await {
            Ok(mut items) => {
                for item in &mut items {
                    news::entity_extractor::extract_entities(item);
                    news::relevance::score_relevance(item, &watched_assets);
                }
                for item in items {
                    if !dedup.seen_news(&item) {
                        if let Err(e) = pg.upsert_news_item(&item).await {
                            tracing::warn!(error = %e, "news persist failed");
                            metrics::inc_errors("news");
                        }
                        // Embed title+summary and persist ref; noop returns None and is skipped.
                        let embed_text = format!("{} {}", item.title, item.summary);
                        match embed.embed(&embed_text).await {
                            Ok(Some(_)) => {
                                if let Err(e) = pg
                                    .upsert_news_embedding(&item.id, embed.name(), embed.dim())
                                    .await
                                {
                                    tracing::warn!(error = %e, "embedding persist failed");
                                }
                            }
                            Ok(None) => {}
                            Err(e) => tracing::warn!(error = %e, "embedding failed"),
                        }
                        let subj = subject(&CONTEXT_PACKET, &["news"]);
                        if let Ok(bytes) = serde_json::to_vec(&item) {
                            if let Err(e) = publisher.publish_bytes(&subj, bytes).await {
                                tracing::warn!(subject = %subj, error = %e, "news publish failed");
                            }
                        }
                        metrics::inc_items("news", &item.source);
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "news poll failed");
                metrics::inc_errors("news");
            }
        }

        // — On-chain —
        match onchain.fetch().await {
            Ok(items) => {
                for item in items {
                    if !dedup.seen_onchain(&item) {
                        if let Err(e) = pg.upsert_on_chain_event(&item).await {
                            tracing::warn!(error = %e, "onchain persist failed");
                            metrics::inc_errors("onchain");
                        }
                        let subj = subject(&CONTEXT_PACKET, &["onchain", &item.chain]);
                        if let Ok(bytes) = serde_json::to_vec(&item) {
                            if let Err(e) = publisher.publish_bytes(&subj, bytes).await {
                                tracing::warn!(subject = %subj, error = %e, "onchain publish failed");
                            }
                        }
                        metrics::inc_items("onchain", &item.source);
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "onchain poll failed");
                metrics::inc_errors("onchain");
            }
        }

        let (news_n, cal_n, onchain_n) = dedup.sizes();
        tracing::debug!(
            news_seen = news_n,
            calendar_seen = cal_n,
            onchain_seen = onchain_n,
            "poll cycle complete"
        );
        metrics::set_last_poll_ms("all", tick_ms);

        tokio::time::sleep(poll_interval).await;
    }
}

#[cfg(test)]
mod tests {
    use nats_publisher::Publisher;

    #[tokio::test]
    async fn recording_publisher_fixture_mode_works() {
        let p = nats_publisher::RecordingPublisher::new();
        p.publish_bytes("feeds.test", b"hello".to_vec())
            .await
            .unwrap();
        assert_eq!(p.len().await, 1);
    }
}
