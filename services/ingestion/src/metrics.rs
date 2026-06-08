//! Prometheus metrics for the ingestion service (P06-T016).
//!
//! Exposes per-provider/feed counters and last-message gauges. The `/metrics`
//! endpoint is wired in `health.rs`; call `init()` once at startup.

use prometheus::{
    register_counter_vec, register_gauge_vec, CounterVec, GaugeVec, TextEncoder,
};
use std::sync::OnceLock;

static MESSAGES: OnceLock<CounterVec> = OnceLock::new();
static ERRORS: OnceLock<CounterVec> = OnceLock::new();
static RECONNECTS: OnceLock<CounterVec> = OnceLock::new();
static LAST_MSG_MS: OnceLock<GaugeVec> = OnceLock::new();

/// Register all metrics with the global Prometheus registry. Safe to call once.
pub fn init() {
    MESSAGES.get_or_init(|| {
        register_counter_vec!(
            "ingestion_messages_total",
            "Total messages processed per provider and feed",
            &["provider", "feed"]
        )
        .expect("register ingestion_messages_total")
    });
    ERRORS.get_or_init(|| {
        register_counter_vec!(
            "ingestion_errors_total",
            "Total errors per provider",
            &["provider"]
        )
        .expect("register ingestion_errors_total")
    });
    RECONNECTS.get_or_init(|| {
        register_counter_vec!(
            "ingestion_reconnects_total",
            "Total reconnect attempts per provider",
            &["provider"]
        )
        .expect("register ingestion_reconnects_total")
    });
    LAST_MSG_MS.get_or_init(|| {
        register_gauge_vec!(
            "ingestion_last_message_epoch_ms",
            "Unix epoch (ms) of the last message per provider and feed",
            &["provider", "feed"]
        )
        .expect("register ingestion_last_message_epoch_ms")
    });
}

pub fn inc_messages(provider: &str, feed: &str) {
    if let Some(c) = MESSAGES.get() {
        c.with_label_values(&[provider, feed]).inc();
    }
}

pub fn inc_errors(provider: &str) {
    if let Some(c) = ERRORS.get() {
        c.with_label_values(&[provider]).inc();
    }
}

pub fn inc_reconnects(provider: &str) {
    if let Some(c) = RECONNECTS.get() {
        c.with_label_values(&[provider]).inc();
    }
}

pub fn set_last_message_ms(provider: &str, feed: &str, epoch_ms: f64) {
    if let Some(g) = LAST_MSG_MS.get() {
        g.with_label_values(&[provider, feed]).set(epoch_ms);
    }
}

/// Render all registered metrics as a Prometheus text exposition string.
pub fn gather_text() -> String {
    let encoder = TextEncoder::new();
    encoder
        .encode_to_string(&prometheus::gather())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gather_text_does_not_panic() {
        init();
        let text = gather_text();
        // Should be valid prometheus text (may be empty if no metrics have values)
        assert!(!text.contains("ERROR"));
    }

    #[test]
    fn inc_messages_does_not_panic() {
        init();
        inc_messages("binance", "trade");
        inc_messages("binance", "price_tick");
        inc_errors("binance");
        inc_reconnects("binance");
        set_last_message_ms("binance", "trade", 1_000_000.0);
    }
}
