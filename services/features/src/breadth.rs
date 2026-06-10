use std::collections::HashMap;

use crate::returns::compute_returns;
use crate::snapshot::RiskRegime;
use crate::state::AssetState;
use crate::volatility::compute_volatility;

/// Market breadth summary across all tracked assets.
pub struct BreadthResult {
    /// Fraction of assets with positive 24h return (0–1).
    pub up_pct: f64,
    /// Fraction of assets with negative 24h return (0–1).
    pub down_pct: f64,
    /// Average realized 24h volatility across all assets.
    pub avg_vol: f64,
    /// Global risk regime derived from breadth.
    pub risk_regime: RiskRegime,
}

/// Compute market breadth from all asset states.
/// Returns None when no asset has sufficient price data.
pub fn compute_breadth(assets: &HashMap<String, AssetState>) -> Option<BreadthResult> {
    if assets.is_empty() {
        return None;
    }
    let mut up = 0usize;
    let mut down = 0usize;
    let mut with_return = 0usize;
    let mut vols: Vec<f64> = Vec::new();

    for state in assets.values() {
        let returns = compute_returns(&state.price_window);
        if let Some(&ret_24h) = returns.get("24h") {
            with_return += 1;
            if ret_24h > 0.0 {
                up += 1;
            } else if ret_24h < 0.0 {
                down += 1;
            }
        }
        let vol = compute_volatility(&state.price_window);
        if let Some(&v) = vol.get("24h") {
            vols.push(v);
        }
    }

    if with_return == 0 {
        return None;
    }

    let up_pct = up as f64 / with_return as f64;
    let down_pct = down as f64 / with_return as f64;
    let avg_vol = if vols.is_empty() {
        0.0
    } else {
        vols.iter().sum::<f64>() / vols.len() as f64
    };

    let risk_regime = if up_pct > 0.6 {
        RiskRegime::RiskOn
    } else if up_pct < 0.4 {
        RiskRegime::RiskOff
    } else {
        RiskRegime::Neutral
    };

    Some(BreadthResult {
        up_pct,
        down_pct,
        avg_vol,
        risk_regime,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AssetState;

    fn make_asset_with_returns(asset_id: &str, old_price: f64, new_price: f64) -> AssetState {
        use event_model::market::NormalizedMarketEvent;
        let ms_24h = 86_400_000_i64;
        let mut state = AssetState::new(asset_id.to_string());
        let ts_old = ms_24h;
        let ts_now = 2 * ms_24h;
        let make_tick = |ts: i64, price: f64| NormalizedMarketEvent::PriceTick {
            schema_version: 1,
            venue: "test".into(),
            instrument_id: "TEST".into(),
            canonical_asset_id: asset_id.into(),
            timestamp: market_math::timestamps::ms_to_rfc3339(ts),
            sequence: None,
            price,
            bid: None,
            ask: None,
        };
        state.update(&make_tick(ts_old, old_price));
        state.update(&make_tick(ts_now, new_price));
        state
    }

    #[test]
    fn breadth_all_up() {
        let mut assets = HashMap::new();
        assets.insert("btc".into(), make_asset_with_returns("btc", 100.0, 105.0));
        assets.insert("eth".into(), make_asset_with_returns("eth", 100.0, 103.0));
        let result = compute_breadth(&assets).expect("breadth computed");
        assert!((result.up_pct - 1.0).abs() < 1e-10);
        assert!((result.down_pct).abs() < 1e-10);
        assert!(matches!(result.risk_regime, RiskRegime::RiskOn));
    }

    #[test]
    fn breadth_all_down() {
        let mut assets = HashMap::new();
        assets.insert("btc".into(), make_asset_with_returns("btc", 100.0, 92.0));
        assets.insert("eth".into(), make_asset_with_returns("eth", 100.0, 94.0));
        let result = compute_breadth(&assets).expect("breadth computed");
        assert!((result.down_pct - 1.0).abs() < 1e-10);
        assert!(matches!(result.risk_regime, RiskRegime::RiskOff));
    }

    #[test]
    fn breadth_none_for_empty_assets() {
        assert!(compute_breadth(&HashMap::new()).is_none());
    }
}
