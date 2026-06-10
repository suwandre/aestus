use std::collections::HashMap;

use crate::window::RollingWindow;

/// Funding features for a single asset.
pub struct FundingFeatures {
    /// Z-score of the current (most recent) funding rate across all venues
    /// relative to the rolling mean. None when insufficient data.
    pub funding_z: Option<f64>,
    /// Cross-venue spread: max_rate - min_rate in the latest snapshot.
    pub funding_spread: Option<f64>,
    /// Latest funding rate per venue.
    pub current_by_venue: HashMap<String, f64>,
    /// Rolling mean per venue.
    pub mean_by_venue: HashMap<String, f64>,
}

/// Compute funding features from per-venue rolling funding windows.
pub fn compute_funding_features(
    funding_by_venue: &HashMap<String, RollingWindow>,
) -> FundingFeatures {
    let mut current_by_venue = HashMap::new();
    let mut mean_by_venue = HashMap::new();
    let mut z_scores = Vec::new();

    for (venue, window) in funding_by_venue {
        if let Some((_, current)) = window.latest() {
            current_by_venue.insert(venue.clone(), current);
            if let Some(mean) = window.mean() {
                mean_by_venue.insert(venue.clone(), mean);
                if let Some(z) = window.z_score(current) {
                    z_scores.push(z);
                }
            }
        }
    }

    let funding_z = if z_scores.is_empty() {
        None
    } else {
        Some(z_scores.iter().sum::<f64>() / z_scores.len() as f64)
    };

    let funding_spread = if current_by_venue.len() >= 2 {
        let max = current_by_venue
            .values()
            .cloned()
            .fold(f64::NEG_INFINITY, f64::max);
        let min = current_by_venue
            .values()
            .cloned()
            .fold(f64::INFINITY, f64::min);
        Some(max - min)
    } else {
        None
    };

    FundingFeatures {
        funding_z,
        funding_spread,
        current_by_venue,
        mean_by_venue,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_funding_window(rates: &[f64]) -> RollingWindow {
        let mut w = RollingWindow::new(100);
        for (i, &r) in rates.iter().enumerate() {
            w.push(i as i64 * 3_600_000, r);
        }
        w
    }

    #[test]
    fn funding_z_none_when_no_data() {
        let by_venue: HashMap<String, RollingWindow> = HashMap::new();
        let f = compute_funding_features(&by_venue);
        assert!(f.funding_z.is_none());
        assert!(f.funding_spread.is_none());
    }

    #[test]
    fn funding_z_positive_for_spike() {
        let mut by_venue = HashMap::new();
        // 9 normal rates, then a spike
        let rates: Vec<f64> = (0..9)
            .map(|_| 0.0001)
            .chain(std::iter::once(0.01))
            .collect();
        by_venue.insert("binance".into(), make_funding_window(&rates));
        let f = compute_funding_features(&by_venue);
        let z = f.funding_z.expect("z-score computed");
        assert!(z > 2.0, "spike funding should have z > 2, got {z}");
    }

    #[test]
    fn funding_spread_computed_across_venues() {
        let mut by_venue = HashMap::new();
        by_venue.insert("binance".into(), make_funding_window(&[0.0001]));
        by_venue.insert("bybit".into(), make_funding_window(&[0.0003]));
        let f = compute_funding_features(&by_venue);
        let spread = f.funding_spread.expect("spread computed");
        assert!((spread - 0.0002).abs() < 1e-10, "got {spread}");
    }
}
