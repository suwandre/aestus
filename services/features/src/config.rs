use std::env;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Config {
    pub nats_url: Option<String>,
    pub log_level: String,
    pub http_port: u16,
    pub redis_url: Option<String>,
    pub clickhouse_url: Option<String>,
    pub heartbeat_interval: Duration,
    pub snapshot_interval: Duration,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            nats_url: env::var("NATS_URL").ok().filter(|s| !s.is_empty()),
            log_level: env::var("LOG_LEVEL").unwrap_or_else(|_| "info".into()),
            http_port: env::var("FEATURES_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8082),
            redis_url: env::var("REDIS_URL").ok().filter(|s| !s.is_empty()),
            clickhouse_url: env::var("CLICKHOUSE_URL").ok().filter(|s| !s.is_empty()),
            heartbeat_interval: Duration::from_millis(
                env::var("HEARTBEAT_INTERVAL_MS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(10_000),
            ),
            snapshot_interval: Duration::from_secs(
                env::var("SNAPSHOT_INTERVAL_SECS")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(60),
            ),
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
        assert_eq!(cfg.http_port, 8082);
        assert!(cfg.heartbeat_interval.as_secs() >= 1);
        assert!(cfg.snapshot_interval.as_secs() >= 10);
    }
}
