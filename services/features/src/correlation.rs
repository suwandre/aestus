use std::collections::HashMap;

use crate::snapshot::CorrelationEntry;
use crate::window::RollingWindow;

const MS_PER_HOUR: i64 = 3_600_000;
const LOOKBACK_HOURS: i64 = 30 * 24; // 30 days

/// Pearson correlation of two equal-length slices.
/// Returns None when n < 3 or denominator is near zero.
pub fn pearson_correlation(xs: &[f64], ys: &[f64]) -> Option<f64> {
    let n = xs.len().min(ys.len());
    if n < 3 {
        return None;
    }
    let mean_x = xs[..n].iter().sum::<f64>() / n as f64;
    let mean_y = ys[..n].iter().sum::<f64>() / n as f64;
    let num = xs[..n]
        .iter()
        .zip(ys[..n].iter())
        .map(|(&x, &y)| (x - mean_x) * (y - mean_y))
        .sum::<f64>();
    let den_x = xs[..n]
        .iter()
        .map(|&x| (x - mean_x).powi(2))
        .sum::<f64>()
        .sqrt();
    let den_y = ys[..n]
        .iter()
        .map(|&y| (y - mean_y).powi(2))
        .sum::<f64>()
        .sqrt();
    if den_x < 1e-10 || den_y < 1e-10 {
        return None;
    }
    Some(num / (den_x * den_y))
}

/// Downsample a price window to hourly closing prices and return log returns.
pub fn hourly_log_returns(w: &RollingWindow) -> Vec<f64> {
    let Some((latest_ts, _)) = w.latest() else {
        return vec![];
    };
    let cutoff = latest_ts - LOOKBACK_HOURS * MS_PER_HOUR;

    // Bucket prices into 1h slots, keep last price in each slot.
    let mut hourly: Vec<(i64, f64)> = Vec::new();
    let mut current_bucket = cutoff / MS_PER_HOUR * MS_PER_HOUR;
    while current_bucket <= latest_ts {
        let bucket_end = current_bucket + MS_PER_HOUR;
        let last_in_bucket = w
            .samples()
            .iter()
            .filter(|&&(ts, _)| ts >= current_bucket && ts < bucket_end)
            .last();
        if let Some(&(_, price)) = last_in_bucket {
            hourly.push((current_bucket, price));
        }
        current_bucket = bucket_end;
    }

    hourly
        .windows(2)
        .filter_map(|pair| {
            let (_, p0) = pair[0];
            let (_, p1) = pair[1];
            if p0 > 0.0 && p1 > 0.0 {
                Some((p1 / p0).ln())
            } else {
                None
            }
        })
        .collect()
}

/// Compute rolling correlations for a target asset against a set of other assets.
///
/// `asset_windows`: map of canonical_asset_id → price window for all other assets.
/// Returns a vec of CorrelationEntry for pairs with sufficient aligned data.
pub fn compute_correlations(
    target_window: &RollingWindow,
    asset_windows: &HashMap<String, &RollingWindow>,
) -> Vec<CorrelationEntry> {
    let target_returns = hourly_log_returns(target_window);
    if target_returns.len() < 3 {
        return vec![];
    }

    let mut entries = Vec::new();
    for (asset_id, other_window) in asset_windows {
        let other_returns = hourly_log_returns(other_window);
        if other_returns.len() < 3 {
            continue;
        }
        let n = target_returns.len().min(other_returns.len());
        let t = &target_returns[target_returns.len() - n..];
        let o = &other_returns[other_returns.len() - n..];
        if let Some(corr) = pearson_correlation(t, o) {
            entries.push(CorrelationEntry {
                asset: asset_id.clone(),
                correlation: (corr * 1000.0).round() / 1000.0,
                window: "30d".to_string(),
            });
        }
    }

    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pearson_perfect_positive() {
        let xs = [1.0, 2.0, 3.0, 4.0, 5.0];
        let ys = [2.0, 4.0, 6.0, 8.0, 10.0];
        let r = pearson_correlation(&xs, &ys).expect("correlation computed");
        assert!((r - 1.0).abs() < 1e-10, "got {r}");
    }

    #[test]
    fn pearson_perfect_negative() {
        let xs = [1.0, 2.0, 3.0, 4.0, 5.0];
        let ys = [10.0, 8.0, 6.0, 4.0, 2.0];
        let r = pearson_correlation(&xs, &ys).expect("correlation computed");
        assert!((r - (-1.0)).abs() < 1e-10, "got {r}");
    }

    #[test]
    fn pearson_too_few_points_is_none() {
        let xs = [1.0, 2.0];
        let ys = [3.0, 4.0];
        assert_eq!(pearson_correlation(&xs, &ys), None);
    }

    #[test]
    fn pearson_flat_series_is_none() {
        let xs = [5.0, 5.0, 5.0, 5.0];
        let ys = [1.0, 2.0, 3.0, 4.0];
        assert_eq!(pearson_correlation(&xs, &ys), None);
    }

    #[test]
    fn hourly_returns_empty_for_empty_window() {
        let w = RollingWindow::new(100);
        assert!(hourly_log_returns(&w).is_empty());
    }

    #[test]
    fn compute_correlations_with_aligned_data() {
        let mut w_btc = RollingWindow::new(10_000);
        let mut w_eth = RollingWindow::new(10_000);
        let base = 0_i64;
        // Create 48 hourly prices that move together
        for i in 0..48_i64 {
            let ts = base + i * MS_PER_HOUR;
            w_btc.push(ts, 50_000.0 + i as f64 * 100.0);
            w_eth.push(ts, 3_000.0 + i as f64 * 6.0);
        }
        let mut others = HashMap::new();
        others.insert("crypto:eth-usdt".into(), &w_eth);
        let entries = compute_correlations(&w_btc, &others);
        assert_eq!(entries.len(), 1);
        let corr = entries[0].correlation;
        assert!(corr > 0.9, "BTC/ETH strongly correlated series, got {corr}");
    }
}
