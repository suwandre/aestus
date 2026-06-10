use std::collections::HashMap;

use crate::window::RollingWindow;

const MS_PER_MIN: i64 = 60_000;
const VOLUME_BARS: usize = 30;

/// Aggregate trade sizes into 1-minute volume bars from the given window.
/// Returns a vec of (bucket_ts_ms, total_volume) in chronological order.
fn volume_bars(trade_size_window: &RollingWindow) -> Vec<(i64, f64)> {
    let mut buckets: HashMap<i64, f64> = HashMap::new();
    for &(ts, size) in trade_size_window.samples() {
        let bucket = (ts / MS_PER_MIN) * MS_PER_MIN;
        *buckets.entry(bucket).or_default() += size;
    }
    let mut bars: Vec<(i64, f64)> = buckets.into_iter().collect();
    bars.sort_by_key(|(ts, _)| *ts);
    bars
}

/// Volume z-score for the current minute bar vs the last `VOLUME_BARS` bars.
/// Returns None when fewer than 3 historical bars exist.
pub fn compute_volume_z(trade_size_window: &RollingWindow) -> Option<f64> {
    let bars = volume_bars(trade_size_window);
    if bars.len() < 3 {
        return None;
    }
    // Current bar = last entry; historical = all preceding.
    let (_, current_vol) = *bars.last().unwrap();
    let history_start = bars.len().saturating_sub(VOLUME_BARS + 1);
    let history = &bars[history_start..bars.len() - 1];
    if history.len() < 2 {
        return None;
    }
    let hist_vols: Vec<f64> = history.iter().map(|(_, v)| *v).collect();
    let mean = hist_vols.iter().sum::<f64>() / hist_vols.len() as f64;
    let var =
        hist_vols.iter().map(|&v| (v - mean).powi(2)).sum::<f64>() / (hist_vols.len() - 1) as f64;
    let std = var.sqrt();
    // Use a relative std floor so a spike against a perfectly flat history still
    // yields a non-zero z-score (mean * 1% prevents divide-by-zero for real volumes).
    let effective_std = std.max(mean.abs() * 1e-2 + 1e-10);
    Some((current_vol - mean) / effective_std)
}

/// Volume percentile of the current bar vs recent bars (0–100 scale).
pub fn compute_volume_percentile(trade_size_window: &RollingWindow) -> Option<f64> {
    let bars = volume_bars(trade_size_window);
    if bars.len() < 3 {
        return None;
    }
    let (_, current_vol) = *bars.last().unwrap();
    let history_start = bars.len().saturating_sub(VOLUME_BARS + 1);
    let history_vols: Vec<f64> = bars[history_start..bars.len() - 1]
        .iter()
        .map(|(_, v)| *v)
        .collect();
    if history_vols.is_empty() {
        return None;
    }
    let below = history_vols.iter().filter(|&&v| v <= current_vol).count();
    Some(100.0 * below as f64 / history_vols.len() as f64)
}

/// Returns a map with `"volume_z"` and optionally `"volume_pct"`.
pub fn compute_volume_features(trade_size_window: &RollingWindow) -> HashMap<String, f64> {
    let mut out = HashMap::new();
    if let Some(z) = compute_volume_z(trade_size_window) {
        out.insert("volume_z".to_string(), z);
    }
    if let Some(pct) = compute_volume_percentile(trade_size_window) {
        out.insert("volume_pct".to_string(), pct);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_trade_window(bars: &[(i64, f64)]) -> RollingWindow {
        let mut w = RollingWindow::new(10_000);
        // Each bar entry: one trade at the start of the minute bucket
        for &(bucket_ts, size) in bars {
            w.push(bucket_ts, size);
        }
        w
    }

    #[test]
    fn volume_z_returns_none_for_few_bars() {
        let w = make_trade_window(&[(0, 10.0), (MS_PER_MIN, 12.0)]);
        assert_eq!(compute_volume_z(&w), None);
    }

    #[test]
    fn volume_z_positive_for_high_current_volume() {
        // 30 bars with volume 1.0, then a spike of 100.0
        let mut bars = Vec::new();
        for i in 0..30_i64 {
            bars.push((i * MS_PER_MIN, 1.0));
        }
        bars.push((30 * MS_PER_MIN, 100.0)); // current bar
        let w = make_trade_window(&bars);
        let z = compute_volume_z(&w).expect("z-score should compute");
        assert!(z > 3.0, "spike bar should have z > 3, got {z}");
    }

    #[test]
    fn volume_percentile_spike_is_high() {
        let mut bars = Vec::new();
        for i in 0..30_i64 {
            bars.push((i * MS_PER_MIN, 1.0));
        }
        bars.push((30 * MS_PER_MIN, 100.0));
        let w = make_trade_window(&bars);
        let pct = compute_volume_percentile(&w).expect("pct should compute");
        assert!(pct > 95.0, "spike should be near 100th pct, got {pct}");
    }
}
