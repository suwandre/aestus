//! Correlation break detector (P10-T008).
//!
//! Fires when an asset's rolling correlation against a cross-asset pair departs
//! from its baseline by at least the configured delta. The baseline is the mean
//! of prior readings held in [`EngineState::correlation_history`]; the current
//! reading is the latest snapshot value. A sign flip (e.g. BTC/SPX +0.42 →
//! −0.18) is the canonical break. Needs at least two observations of a pair —
//! a single snapshot establishes the baseline but cannot show a shift.

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::rules::RulesConfig;
use crate::state::{correlation_key, EngineState};

fn severity_for(departure: f64, delta: f64) -> AnomalySeverity {
    if departure >= delta * 2.5 {
        AnomalySeverity::High
    } else if departure >= delta * 1.5 {
        AnomalySeverity::Medium
    } else {
        AnomalySeverity::Low
    }
}

#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    for snap in state.snapshots.values() {
        for entry in &snap.correlation_set {
            let key = correlation_key(&snap.canonical_asset_id, &entry.asset, &entry.window);
            let Some(hist) = state.correlation_history.get(&key) else {
                continue;
            };
            // Need a prior baseline (>= 2 points; latest is `entry.correlation`).
            if hist.len() < 2 {
                continue;
            }
            let prior = &hist[..hist.len() - 1];
            let baseline = prior.iter().sum::<f64>() / prior.len() as f64;
            let current = entry.correlation;
            let departure = (current - baseline).abs();
            if departure < rules.correlation_break_delta {
                continue;
            }
            let severity = severity_for(departure, rules.correlation_break_delta);
            let description = format!(
                "{}/{} {} correlation shifted from {:+.2} (baseline) to {:+.2}, a {:.2} move.",
                snap.canonical_asset_id, entry.asset, entry.window, baseline, current, departure
            );
            out.push(new_anomaly(
                AnomalyType::CorrelationBreak,
                severity,
                None,
                vec![snap.canonical_asset_id.clone(), entry.asset.clone()],
                Vec::new(),
                "Correlation break".to_string(),
                description,
                snap.timestamp.clone(),
                vec![format!(
                    "feature:{}:{}",
                    snap.canonical_asset_id, snap.timestamp
                )],
                Some(format!(
                    "rule:corr_departure>{:.2}",
                    rules.correlation_break_delta
                )),
            ));
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::FeatureSnapshot;

    fn btc_corr_snapshot(spx_corr: f64) -> FeatureSnapshot {
        serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": "crypto:btc-usdt",
            "timestamp": "2026-06-07T12:00:00Z",
            "correlation_set": [
                { "asset": "macro:spx", "correlation": spx_corr, "window": "30d" }
            ],
            "regime": {}
        }))
        .expect("snapshot")
    }

    #[test]
    fn btc_spx_correlation_flip_emits_break() {
        let mut st = EngineState::new();
        // Baseline +0.42, then flips to -0.18 (departure 0.60 >= 0.5).
        st.ingest_snapshot(btc_corr_snapshot(0.42));
        st.ingest_snapshot(btc_corr_snapshot(-0.18));
        let out = detect(&st, &RulesConfig::default());
        assert_eq!(out.len(), 1);
        let a = &out[0];
        assert_eq!(a.anomaly_type, AnomalyType::CorrelationBreak);
        assert!(a.assets.contains(&"macro:spx".to_string()));
        a.validate().expect("valid");
    }

    #[test]
    fn stable_correlation_does_not_fire() {
        let mut st = EngineState::new();
        st.ingest_snapshot(btc_corr_snapshot(0.42));
        st.ingest_snapshot(btc_corr_snapshot(0.45));
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }

    #[test]
    fn single_observation_only_sets_baseline() {
        let mut st = EngineState::new();
        st.ingest_snapshot(btc_corr_snapshot(0.42));
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }
}
