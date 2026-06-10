use std::collections::HashMap;

use crate::snapshot::{Regime, RiskRegime, TrendRegime, VolatilityRegime};
use crate::window::RollingWindow;

const MS_PER_24H: i64 = 86_400_000;
const MS_PER_7D: i64 = 604_800_000;

/// Realized volatility as std dev of log returns over a time window.
/// Returns `None` when fewer than 3 samples exist in the window.
pub fn realized_vol(price_window: &RollingWindow, window_ms: i64) -> Option<f64> {
    let (latest_ts, _) = price_window.latest()?;
    let cutoff = latest_ts - window_ms;
    let samples: Vec<(i64, f64)> = price_window
        .samples()
        .iter()
        .filter(|&&(ts, _)| ts >= cutoff)
        .copied()
        .collect();
    if samples.len() < 3 {
        return None;
    }
    let log_returns: Vec<f64> = samples
        .windows(2)
        .filter_map(|w| {
            let (_, p0) = w[0];
            let (_, p1) = w[1];
            if p0 > 0.0 && p1 > 0.0 {
                Some((p1 / p0).ln())
            } else {
                None
            }
        })
        .collect();
    if log_returns.len() < 2 {
        return None;
    }
    let mean = log_returns.iter().sum::<f64>() / log_returns.len() as f64;
    let var = log_returns.iter().map(|&r| (r - mean).powi(2)).sum::<f64>()
        / (log_returns.len() - 1) as f64;
    Some(var.sqrt())
}

/// Volatility map with `"24h"` and `"7d"` keys.
pub fn compute_volatility(price_window: &RollingWindow) -> HashMap<String, f64> {
    let mut vol = HashMap::new();
    if let Some(v) = realized_vol(price_window, MS_PER_24H) {
        vol.insert("24h".to_string(), v);
    }
    if let Some(v) = realized_vol(price_window, MS_PER_7D) {
        vol.insert("7d".to_string(), v);
    }
    vol
}

pub fn classify_vol_regime(vol_24h: f64) -> VolatilityRegime {
    if vol_24h < 0.005 {
        VolatilityRegime::VeryLow
    } else if vol_24h < 0.015 {
        VolatilityRegime::Low
    } else if vol_24h < 0.030 {
        VolatilityRegime::Normal
    } else if vol_24h < 0.060 {
        VolatilityRegime::High
    } else {
        VolatilityRegime::Extreme
    }
}

pub fn classify_trend_regime(returns: &HashMap<String, f64>) -> TrendRegime {
    let ret_24h = returns.get("24h").copied().unwrap_or(0.0);
    if ret_24h > 0.02 {
        TrendRegime::TrendingUp
    } else if ret_24h < -0.02 {
        TrendRegime::TrendingDown
    } else {
        TrendRegime::Ranging
    }
}

pub fn classify_risk_regime(trend: &TrendRegime, vol: &VolatilityRegime) -> RiskRegime {
    match (trend, vol) {
        (
            TrendRegime::TrendingUp,
            VolatilityRegime::VeryLow | VolatilityRegime::Low | VolatilityRegime::Normal,
        ) => RiskRegime::RiskOn,
        (TrendRegime::TrendingDown, VolatilityRegime::High | VolatilityRegime::Extreme) => {
            RiskRegime::RiskOff
        }
        _ => RiskRegime::Neutral,
    }
}

/// Compute the full volatility + trend + risk regime for a snapshot.
pub fn compute_regime(price_window: &RollingWindow, returns: &HashMap<String, f64>) -> Regime {
    let vol_map = compute_volatility(price_window);
    let vol_24h = vol_map.get("24h").copied().unwrap_or(0.02);
    let vol_regime = classify_vol_regime(vol_24h);
    let trend_regime = classify_trend_regime(returns);
    let risk_regime = classify_risk_regime(&trend_regime, &vol_regime);
    Regime {
        trend: trend_regime,
        volatility: vol_regime,
        risk: risk_regime,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_price_series(prices: &[(i64, f64)]) -> RollingWindow {
        let mut w = RollingWindow::new(1000);
        for &(ts, p) in prices {
            w.push(ts, p);
        }
        w
    }

    #[test]
    fn vol_none_for_fewer_than_three_samples() {
        let w = make_price_series(&[(0, 100.0), (1000, 101.0)]);
        assert_eq!(realized_vol(&w, MS_PER_24H), None);
    }

    #[test]
    fn vol_positive_for_moving_prices() {
        let ms = MS_PER_24H / 100;
        let prices: Vec<(i64, f64)> = (0..=100)
            .map(|i| (i * ms, 100.0 + (i as f64) * 0.1))
            .collect();
        let w = make_price_series(&prices);
        let v = realized_vol(&w, MS_PER_24H);
        assert!(v.is_some(), "should compute vol");
        assert!(v.unwrap() > 0.0, "vol must be positive");
    }

    #[test]
    fn classify_vol_regime_thresholds() {
        assert!(matches!(
            classify_vol_regime(0.003),
            VolatilityRegime::VeryLow
        ));
        assert!(matches!(classify_vol_regime(0.010), VolatilityRegime::Low));
        assert!(matches!(
            classify_vol_regime(0.020),
            VolatilityRegime::Normal
        ));
        assert!(matches!(classify_vol_regime(0.040), VolatilityRegime::High));
        assert!(matches!(
            classify_vol_regime(0.070),
            VolatilityRegime::Extreme
        ));
    }

    #[test]
    fn trend_regime_based_on_24h_return() {
        let mut r = HashMap::new();
        r.insert("24h".into(), 0.03);
        assert!(matches!(classify_trend_regime(&r), TrendRegime::TrendingUp));
        *r.get_mut("24h").unwrap() = -0.03;
        assert!(matches!(
            classify_trend_regime(&r),
            TrendRegime::TrendingDown
        ));
        *r.get_mut("24h").unwrap() = 0.01;
        assert!(matches!(classify_trend_regime(&r), TrendRegime::Ranging));
    }

    #[test]
    fn risk_regime_logic() {
        assert!(matches!(
            classify_risk_regime(&TrendRegime::TrendingUp, &VolatilityRegime::Normal),
            RiskRegime::RiskOn
        ));
        assert!(matches!(
            classify_risk_regime(&TrendRegime::TrendingDown, &VolatilityRegime::Extreme),
            RiskRegime::RiskOff
        ));
        assert!(matches!(
            classify_risk_regime(&TrendRegime::Ranging, &VolatilityRegime::High),
            RiskRegime::Neutral
        ));
    }
}
