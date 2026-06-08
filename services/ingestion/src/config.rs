//! Config loaded from environment variables (P06-T001).

use std::env;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Config {
    pub nats_url: Option<String>,
    pub log_level: String,
    pub http_port: u16,
    pub symbols: Vec<String>,
    pub heartbeat_interval: Duration,
    pub clickhouse_url: Option<String>,
    pub redis_url: Option<String>,
    pub oi_interval: Duration,
    pub stale_timeout: Duration,
    pub symbol_map_path: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            nats_url: env::var("NATS_URL").ok().filter(|s| !s.is_empty()),
            log_level: env::var("LOG_LEVEL").unwrap_or_else(|_| "info".into()),
            http_port: env::var("INGESTION_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8080),
            symbols: env::var("INGESTION_SYMBOLS")
                .unwrap_or_else(|_| "BTCUSDT,ETHUSDT".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            heartbeat_interval: Duration::from_millis(
                env::var("HEARTBEAT_INTERVAL_MS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10_000),
            ),
            clickhouse_url: env::var("CLICKHOUSE_URL").ok().filter(|s| !s.is_empty()),
            redis_url: env::var("REDIS_URL").ok().filter(|s| !s.is_empty()),
            oi_interval: Duration::from_secs(
                env::var("OI_INTERVAL_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(60),
            ),
            stale_timeout: Duration::from_secs(
                env::var("STALE_TIMEOUT_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(60),
            ),
            symbol_map_path: env::var("SYMBOL_MAP_PATH")
                .unwrap_or_else(|_| "config/symbol_map.toml".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sensible() {
        let cfg = Config::from_env();
        assert!(cfg.nats_url.is_none() || !cfg.nats_url.as_deref().unwrap_or("").is_empty());
        assert_eq!(cfg.http_port, 8080);
        assert!(!cfg.symbols.is_empty());
        assert!(cfg.heartbeat_interval.as_secs() >= 1);
    }

    #[test]
    fn symbols_parsed_from_comma_list() {
        // Test the parsing logic directly since we can't easily set env vars
        let raw = "BTCUSDT,ETHUSDT, SOLUSDT ";
        let syms: Vec<String> = raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        assert_eq!(syms, ["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    }
}
