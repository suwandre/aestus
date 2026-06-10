//! Volume anomaly detector (P10-T005).
//!
//! Fires when a snapshot's `volume_z` (rolling z-score computed upstream)
//! crosses the configured threshold. `volume_z` is a genuine z-score, so this
//! is a sigma-based detector and severity comes from the registry sigma bands.
//! The percentile breakout the spec mentions is folded into the upstream
//! z-score (features service P09-T006); here we apply the rule.

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::registry::meta_for;
use crate::rules::RulesConfig;
use crate::state::EngineState;

#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    let bands = meta_for(AnomalyType::VolumeAnomaly).sigma_bands;

    for snap in state.snapshots.values() {
        let Some(z) = snap.volume_z else { continue };
        if z < rules.volume_z_threshold {
            continue;
        }
        let severity = bands
            .and_then(|b| b.severity_for(z))
            .unwrap_or(AnomalySeverity::Low);
        let description = format!(
            "Rolling volume z-score {:.1} versus baseline (threshold {:.1}).",
            z, rules.volume_z_threshold
        );
        out.push(new_anomaly(
            AnomalyType::VolumeAnomaly,
            severity,
            Some(z),
            vec![snap.canonical_asset_id.clone()],
            Vec::new(),
            "Volume anomaly".to_string(),
            description,
            snap.timestamp.clone(),
            vec![format!(
                "feature:{}:{}",
                snap.canonical_asset_id, snap.timestamp
            )],
            Some(format!("rule:volume_z>{:.1}", rules.volume_z_threshold)),
        ));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn high_volume_sol_fixture_emits_volume_anomaly() {
        let mut st = EngineState::new();
        for snap in crate::detectors::test_support::load_snapshots() {
            st.ingest_snapshot(snap);
        }
        let out = detect(&st, &RulesConfig::default());
        assert!(
            out.iter()
                .any(|a| a.assets.iter().any(|x| x == "crypto:sol-usdt")),
            "SOL high-volume event should emit a volume_anomaly; got {out:?}"
        );
        // BTC fixture volume_z is 1.9 (below 2.0) → must not fire.
        assert!(!out
            .iter()
            .any(|a| a.assets.iter().any(|x| x == "crypto:btc-usdt")));
    }

    #[test]
    fn below_threshold_does_not_fire() {
        use crate::input::FeatureSnapshot;
        let mut st = EngineState::new();
        let snap: FeatureSnapshot = serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": "crypto:btc-usdt",
            "timestamp": "2026-06-07T12:00:00Z",
            "volume_z": 1.5,
            "regime": {}
        }))
        .expect("snapshot");
        st.ingest_snapshot(snap);
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }
}
