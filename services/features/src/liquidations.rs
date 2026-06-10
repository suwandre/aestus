use std::collections::HashMap;
use std::collections::VecDeque;

use crate::snapshot::LiquidationCluster;
use crate::state::LiqEvent;

const BUCKET_WIDTH_PCT: f64 = 0.001; // 0.1% price buckets
const WINDOW_MS: i64 = 3_600_000; // 1-hour window
const TOP_N: usize = 5;
const MIN_EVENTS: usize = 2;

/// Compute liquidation clusters from recent liquidation events.
///
/// Buckets prices into 0.1% bands and accumulates size per band + side.
/// Returns the top N buckets by total size, split by side.
pub fn compute_liq_clusters(
    liq_events: &VecDeque<LiqEvent>,
    mid_price: f64,
    now_ms: i64,
) -> Vec<LiquidationCluster> {
    if liq_events.is_empty() || mid_price <= 0.0 {
        return vec![];
    }
    let cutoff = now_ms - WINDOW_MS;
    let bucket_width = mid_price * BUCKET_WIDTH_PCT;

    // Accumulate (bucket_idx, is_buy) → (event_count, total_size)
    let mut buckets: HashMap<(i64, bool), (usize, f64)> = HashMap::new();
    for ev in liq_events {
        if ev.timestamp_ms < cutoff {
            continue;
        }
        let bucket_idx = (ev.price / bucket_width).floor() as i64;
        let entry = buckets.entry((bucket_idx, ev.is_buy)).or_default();
        entry.0 += 1;
        entry.1 += ev.size;
    }

    let mut clusters: Vec<LiquidationCluster> = buckets
        .into_iter()
        .filter(|(_, (count, _))| *count >= MIN_EVENTS)
        .map(|((idx, is_buy), (_, total_size))| {
            let price_low = idx as f64 * bucket_width;
            LiquidationCluster {
                price_low,
                price_high: price_low + bucket_width,
                total_size,
                side: if is_buy {
                    "buy".to_string()
                } else {
                    "sell".to_string()
                },
            }
        })
        .collect();

    // Sort by total_size descending, keep top N.
    clusters.sort_by(|a, b| {
        b.total_size
            .partial_cmp(&a.total_size)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    clusters.truncate(TOP_N);
    clusters
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_events(
        count: usize,
        price: f64,
        size: f64,
        is_buy: bool,
        now_ms: i64,
    ) -> VecDeque<LiqEvent> {
        (0..count)
            .map(|_| LiqEvent {
                timestamp_ms: now_ms - 1_000,
                price,
                size,
                is_buy,
            })
            .collect()
    }

    #[test]
    fn empty_events_returns_empty() {
        let events = VecDeque::new();
        assert!(compute_liq_clusters(&events, 50_000.0, 1_000_000).is_empty());
    }

    #[test]
    fn clusters_aggregated_by_bucket() {
        let now = 1_000_000_i64;
        let mut events: VecDeque<LiqEvent> = VecDeque::new();
        for _ in 0..5 {
            events.push_back(LiqEvent {
                timestamp_ms: now - 100,
                price: 50_000.0,
                size: 1.0,
                is_buy: false,
            });
        }
        let clusters = compute_liq_clusters(&events, 50_000.0, now);
        assert!(!clusters.is_empty());
        // All 5 events in the same bucket → total_size = 5.0
        assert!((clusters[0].total_size - 5.0).abs() < 1e-10);
        assert_eq!(clusters[0].side, "sell");
    }

    #[test]
    fn old_events_outside_window_excluded() {
        let now = 1_000_000_i64;
        let old_event = LiqEvent {
            timestamp_ms: now - WINDOW_MS - 1_000,
            price: 50_000.0,
            size: 100.0,
            is_buy: true,
        };
        let mut events: VecDeque<LiqEvent> = VecDeque::new();
        events.push_back(old_event);
        let clusters = compute_liq_clusters(&events, 50_000.0, now);
        assert!(clusters.is_empty(), "old events should be excluded");
    }

    #[test]
    fn top_n_limit_enforced() {
        let now = 1_000_000_i64;
        // Create events in 10 different price buckets
        let mid = 50_000.0_f64;
        let bw = mid * BUCKET_WIDTH_PCT;
        let events: VecDeque<LiqEvent> = (0..10)
            .map(|i| LiqEvent {
                timestamp_ms: now - 100,
                price: mid + i as f64 * bw * 2.0,
                size: 1.0,
                is_buy: false,
            })
            .collect();
        let clusters = compute_liq_clusters(&events, mid, now);
        assert!(clusters.len() <= TOP_N);
    }
}
