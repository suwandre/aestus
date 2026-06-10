use std::collections::HashMap;

use crate::window::RollingWindow;

/// OI feature results for a single asset.
pub struct OiFeatures {
    /// Percentage OI delta vs previous reading (averaged across venues).
    pub oi_delta: Option<f64>,
    /// Z-score of recent OI delta vs historical deltas (averaged across venues).
    pub oi_z: Option<f64>,
    /// Human-readable OI state: `"oi_increasing"`, `"oi_decreasing"`, or `None` (within threshold).
    pub oi_state: Option<String>,
    /// Flag: OI direction contradicts price return direction (possible divergence).
    pub oi_price_divergence: bool,
}

/// Compute OI features from per-venue OI windows and latest/previous OI values.
pub fn compute_oi_features(
    oi_by_venue: &HashMap<String, RollingWindow>,
    oi_latest: &HashMap<String, f64>,
    oi_prev: &HashMap<String, f64>,
    price_return_24h: Option<f64>,
) -> OiFeatures {
    let mut deltas: Vec<f64> = Vec::new();
    let mut z_scores: Vec<f64> = Vec::new();

    for venue in oi_latest.keys() {
        let latest = match oi_latest.get(venue) {
            Some(&v) => v,
            None => continue,
        };
        let prev = match oi_prev.get(venue) {
            Some(&v) => v,
            None => continue,
        };
        if prev > 0.0 {
            let delta = (latest - prev) / prev;
            deltas.push(delta);
        }
        // Z-score of OI level in the rolling window
        if let Some(window) = oi_by_venue.get(venue) {
            if let Some(z) = window.z_score(latest) {
                z_scores.push(z);
            }
        }
    }

    let oi_delta = if deltas.is_empty() {
        None
    } else {
        Some(deltas.iter().sum::<f64>() / deltas.len() as f64)
    };

    let oi_z = if z_scores.is_empty() {
        None
    } else {
        Some(z_scores.iter().sum::<f64>() / z_scores.len() as f64)
    };

    let oi_state = oi_delta.and_then(|d| {
        if d > 0.02 {
            Some("oi_increasing".to_string())
        } else if d < -0.02 {
            Some("oi_decreasing".to_string())
        } else {
            None
        }
    });

    // Divergence: OI increasing while price falling, or OI falling while price rising.
    let oi_price_divergence = match (oi_delta, price_return_24h) {
        (Some(d), Some(r)) => (d > 0.0 && r < -0.01) || (d < 0.0 && r > 0.01),
        _ => false,
    };

    OiFeatures {
        oi_delta,
        oi_z,
        oi_state,
        oi_price_divergence,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_oi_window(values: &[f64]) -> RollingWindow {
        let mut w = RollingWindow::new(100);
        for (i, &v) in values.iter().enumerate() {
            w.push(i as i64 * 3_600_000, v);
        }
        w
    }

    #[test]
    fn oi_delta_positive_increase() {
        let mut oi_by_venue = HashMap::new();
        oi_by_venue.insert("binance".into(), make_oi_window(&[100.0, 110.0]));
        let mut oi_latest = HashMap::new();
        oi_latest.insert("binance".into(), 110.0_f64);
        let mut oi_prev = HashMap::new();
        oi_prev.insert("binance".into(), 100.0_f64);
        let f = compute_oi_features(&oi_by_venue, &oi_latest, &oi_prev, None);
        let delta = f.oi_delta.expect("delta computed");
        assert!((delta - 0.1).abs() < 1e-10, "got {delta}");
        assert_eq!(f.oi_state.as_deref(), Some("oi_increasing"));
    }

    #[test]
    fn oi_state_decreasing() {
        let mut oi_by_venue = HashMap::new();
        oi_by_venue.insert("binance".into(), make_oi_window(&[100.0, 85.0]));
        let mut oi_latest = HashMap::new();
        oi_latest.insert("binance".into(), 85.0_f64);
        let mut oi_prev = HashMap::new();
        oi_prev.insert("binance".into(), 100.0_f64);
        let f = compute_oi_features(&oi_by_venue, &oi_latest, &oi_prev, None);
        assert_eq!(f.oi_state.as_deref(), Some("oi_decreasing"));
    }

    #[test]
    fn oi_price_divergence_detected() {
        let mut oi_by_venue = HashMap::new();
        oi_by_venue.insert("binance".into(), make_oi_window(&[100.0, 110.0]));
        let mut oi_latest = HashMap::new();
        oi_latest.insert("binance".into(), 110.0_f64);
        let mut oi_prev = HashMap::new();
        oi_prev.insert("binance".into(), 100.0_f64);
        // OI increasing but price falling → divergence
        let f = compute_oi_features(&oi_by_venue, &oi_latest, &oi_prev, Some(-0.03));
        assert!(f.oi_price_divergence);
    }

    #[test]
    fn oi_none_when_no_data() {
        let f = compute_oi_features(&HashMap::new(), &HashMap::new(), &HashMap::new(), None);
        assert!(f.oi_delta.is_none());
        assert!(f.oi_state.is_none());
        assert!(!f.oi_price_divergence);
    }
}
