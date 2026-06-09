//! Config loaded from environment variables (P07-T001).

use std::env;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Config {
    pub nats_url: Option<String>,
    pub log_level: String,
    pub http_port: u16,
    pub heartbeat_interval: Duration,
    /// How long to sleep between poll cycles across all feeds.
    pub poll_interval: Duration,
    pub postgres_url: Option<String>,
    pub calendar_fixture_path: String,
    pub onchain_fixture_path: String,
    pub news_fixture_path: String,
    /// Live RSS feed URLs to poll; empty falls back to fixture.
    pub rss_sources: Vec<String>,
    /// Canonical asset ids used for relevance scoring.
    pub watched_assets: Vec<String>,
    /// Embedding provider name (`noop` or unset disables).
    pub embedding_provider: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            nats_url: env::var("NATS_URL").ok().filter(|s| !s.is_empty()),
            log_level: env::var("LOG_LEVEL").unwrap_or_else(|_| "info".into()),
            http_port: env::var("FEEDS_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8082),
            heartbeat_interval: Duration::from_millis(
                env::var("HEARTBEAT_INTERVAL_MS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10_000),
            ),
            poll_interval: Duration::from_secs(
                env::var("FEEDS_POLL_INTERVAL_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(300),
            ),
            postgres_url: env::var("POSTGRES_URL").ok().filter(|s| !s.is_empty()),
            calendar_fixture_path: env::var("CALENDAR_FIXTURE_PATH")
                .unwrap_or_else(|_| "fixtures/macro/events.json".into()),
            onchain_fixture_path: env::var("ONCHAIN_FIXTURE_PATH")
                .unwrap_or_else(|_| "fixtures/onchain/events.json".into()),
            news_fixture_path: env::var("NEWS_FIXTURE_PATH")
                .unwrap_or_else(|_| "fixtures/news/items.json".into()),
            rss_sources: env::var("RSS_SOURCES")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            watched_assets: env::var("WATCHED_ASSETS")
                .unwrap_or_else(|_| "crypto:btc-usdt,crypto:eth-usdt".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            embedding_provider: env::var("EMBEDDING_PROVIDER")
                .ok()
                .filter(|s| !s.is_empty()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sensible() {
        let cfg = Config::from_env();
        assert_eq!(cfg.http_port, 8082);
        assert!(!cfg.watched_assets.is_empty());
        assert!(cfg.poll_interval.as_secs() >= 60);
        assert!(cfg.heartbeat_interval.as_secs() >= 1);
    }

    #[test]
    fn rss_sources_parsed_from_comma_list() {
        let raw = "https://a.com/rss, https://b.com/rss, ";
        let sources: Vec<String> = raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        assert_eq!(sources.len(), 2);
        assert_eq!(sources[0], "https://a.com/rss");
    }
}
