//! Prometheus metrics for the feeds service (P07-T001).

use prometheus::{register_counter_vec, register_gauge_vec, CounterVec, GaugeVec, TextEncoder};
use std::sync::OnceLock;

static ITEMS: OnceLock<CounterVec> = OnceLock::new();
static ERRORS: OnceLock<CounterVec> = OnceLock::new();
static LAST_POLL_MS: OnceLock<GaugeVec> = OnceLock::new();

/// Register all metrics. Safe to call multiple times.
pub fn init() {
    ITEMS.get_or_init(|| {
        register_counter_vec!(
            "feeds_items_total",
            "Total contextual items processed per feed type and source",
            &["feed", "source"]
        )
        .expect("register feeds_items_total")
    });
    ERRORS.get_or_init(|| {
        register_counter_vec!(
            "feeds_errors_total",
            "Total errors per feed type",
            &["feed"]
        )
        .expect("register feeds_errors_total")
    });
    LAST_POLL_MS.get_or_init(|| {
        register_gauge_vec!(
            "feeds_last_poll_epoch_ms",
            "Unix epoch (ms) of the last successful poll per feed",
            &["feed"]
        )
        .expect("register feeds_last_poll_epoch_ms")
    });
}

pub fn inc_items(feed: &str, source: &str) {
    if let Some(c) = ITEMS.get() {
        c.with_label_values(&[feed, source]).inc();
    }
}

pub fn inc_errors(feed: &str) {
    if let Some(c) = ERRORS.get() {
        c.with_label_values(&[feed]).inc();
    }
}

pub fn set_last_poll_ms(feed: &str, epoch_ms: f64) {
    if let Some(g) = LAST_POLL_MS.get() {
        g.with_label_values(&[feed]).set(epoch_ms);
    }
}

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
        assert!(!text.contains("ERROR"));
    }

    #[test]
    fn inc_items_does_not_panic() {
        init();
        inc_items("news", "rss");
        inc_errors("news");
        set_last_poll_ms("news", 1_000_000.0);
    }
}
