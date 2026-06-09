//! Per-feed staleness tracking (P08-T004).
//!
//! [`FeedHealth`] tracks the last-seen epoch-ms for each feed and computes
//! fresh/stale/unknown states. It is updated on every event in the main
//! routing loop and polled by the heartbeat closure so stale feeds appear
//! in `system.health` events as `Degraded` dependencies.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

/// Staleness state for a single feed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FeedState {
    /// A message was received within the configured threshold.
    Fresh,
    /// No message has arrived within the configured threshold.
    Stale,
    /// This feed has never been seen (no messages since startup).
    Unknown,
}

/// Status record for one feed, suitable for health reports.
#[derive(Debug, Clone)]
pub struct FeedStatus {
    /// Composite feed identifier, e.g. `"binance:trade"`.
    pub feed_id: String,
    /// Unix epoch milliseconds of the last message, or `None` if never seen.
    pub last_message_epoch_ms: Option<u64>,
    /// Fresh/Stale/Unknown based on the supplied threshold.
    pub state: FeedState,
}

/// Shared per-feed health tracker.
///
/// Safe to clone; all clones share the same underlying state.
#[derive(Debug, Clone)]
pub struct FeedHealth {
    inner: Arc<Mutex<HashMap<String, u64>>>,
}

impl Default for FeedHealth {
    fn default() -> Self {
        Self::new()
    }
}

impl FeedHealth {
    /// Create a new, empty tracker.
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Record a message arrival for `feed_id` at `epoch_ms`.
    pub fn update(&self, feed_id: &str, epoch_ms: u64) {
        if let Ok(mut map) = self.inner.lock() {
            map.insert(feed_id.to_string(), epoch_ms);
        }
    }

    /// Staleness state for `feed_id` given a `threshold_secs` window.
    ///
    /// Uses the current wall clock; the feed is `Fresh` if a message arrived
    /// within `threshold_secs` seconds of now.
    #[must_use]
    pub fn state(&self, feed_id: &str, threshold_secs: u64) -> FeedState {
        let now_ms = current_epoch_ms();
        let guard = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return FeedState::Unknown,
        };
        match guard.get(feed_id) {
            None => FeedState::Unknown,
            Some(&last) => {
                let age_secs = now_ms.saturating_sub(last) / 1000;
                if age_secs <= threshold_secs {
                    FeedState::Fresh
                } else {
                    FeedState::Stale
                }
            }
        }
    }

    /// Snapshot of all tracked feeds with their staleness states.
    #[must_use]
    pub fn feed_statuses(&self, threshold_secs: u64) -> Vec<FeedStatus> {
        let now_ms = current_epoch_ms();
        let guard = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return vec![],
        };
        guard
            .iter()
            .map(|(id, &last_ms)| {
                let age_secs = now_ms.saturating_sub(last_ms) / 1000;
                let state = if age_secs <= threshold_secs {
                    FeedState::Fresh
                } else {
                    FeedState::Stale
                };
                FeedStatus {
                    feed_id: id.clone(),
                    last_message_epoch_ms: Some(last_ms),
                    state,
                }
            })
            .collect()
    }
}

/// Current wall-clock time in Unix milliseconds.
fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_before_any_update() {
        let fh = FeedHealth::new();
        assert_eq!(fh.state("binance:trade", 60), FeedState::Unknown);
    }

    #[test]
    fn fresh_immediately_after_update() {
        let fh = FeedHealth::new();
        let now_ms = current_epoch_ms();
        fh.update("binance:trade", now_ms);
        assert_eq!(fh.state("binance:trade", 60), FeedState::Fresh);
    }

    #[test]
    fn stale_after_threshold_exceeded() {
        let fh = FeedHealth::new();
        // Set last_message to 120 seconds ago
        let old_ms = current_epoch_ms().saturating_sub(120_000);
        fh.update("binance:funding", old_ms);
        // With a 60s threshold, this should be stale
        assert_eq!(fh.state("binance:funding", 60), FeedState::Stale);
    }

    #[test]
    fn fresh_when_within_threshold() {
        let fh = FeedHealth::new();
        // Set last_message to 30 seconds ago
        let recent_ms = current_epoch_ms().saturating_sub(30_000);
        fh.update("binance:oi", recent_ms);
        // With a 60s threshold, this should still be fresh
        assert_eq!(fh.state("binance:oi", 60), FeedState::Fresh);
    }

    #[test]
    fn feed_statuses_reflects_all_feeds() {
        let fh = FeedHealth::new();
        let now_ms = current_epoch_ms();
        fh.update("binance:trade", now_ms);
        fh.update("binance:funding", now_ms.saturating_sub(200_000));

        let statuses = fh.feed_statuses(60);
        assert_eq!(statuses.len(), 2);

        let trade = statuses
            .iter()
            .find(|s| s.feed_id == "binance:trade")
            .unwrap();
        let funding = statuses
            .iter()
            .find(|s| s.feed_id == "binance:funding")
            .unwrap();
        assert_eq!(trade.state, FeedState::Fresh);
        assert_eq!(funding.state, FeedState::Stale);
    }

    #[test]
    fn clone_shares_state() {
        let fh = FeedHealth::new();
        let fh2 = fh.clone();
        let now_ms = current_epoch_ms();
        fh.update("binance:trade", now_ms);
        // Clone should see the update
        assert_eq!(fh2.state("binance:trade", 60), FeedState::Fresh);
    }
}
