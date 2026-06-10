//! Basis dislocation detector (P10-T007).
//!
//! Fires when the cross-venue basis spread (max − min `basis_bps` across the
//! snapshot's basis references) exceeds the configured threshold. The basis
//! readings are computed upstream (features P09-T010); this detector measures
//! their divergence. Venues are derived from the reference labels
//! (`binance-spot` → `binance`).

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::rules::RulesConfig;
use crate::state::EngineState;

/// Derive a venue id from a basis reference label like `binance-spot`.
fn venue_of(reference: &str) -> String {
    reference
        .split(['-', '_', ':'])
        .next()
        .unwrap_or(reference)
        .to_string()
}

fn severity_for(spread: f64, threshold: f64) -> AnomalySeverity {
    if spread >= threshold * 3.0 {
        AnomalySeverity::High
    } else if spread >= threshold * 2.0 {
        AnomalySeverity::Medium
    } else {
        AnomalySeverity::Low
    }
}

#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    for snap in state.snapshots.values() {
        if snap.basis.len() < 2 {
            continue;
        }
        let mut min = f64::INFINITY;
        let mut max = f64::NEG_INFINITY;
        let mut min_ref = "";
        let mut max_ref = "";
        for entry in &snap.basis {
            if entry.basis_bps < min {
                min = entry.basis_bps;
                min_ref = &entry.reference;
            }
            if entry.basis_bps > max {
                max = entry.basis_bps;
                max_ref = &entry.reference;
            }
        }
        let spread = max - min;
        if spread < rules.basis_spread_bps_threshold {
            continue;
        }
        let severity = severity_for(spread, rules.basis_spread_bps_threshold);

        // Venues from the two extreme references (deduped, sorted).
        let mut venues = vec![venue_of(max_ref), venue_of(min_ref)];
        venues.sort();
        venues.dedup();

        let description = format!(
            "Cross-venue basis spread widened to {spread:.1} bps ({max_ref} {max:.1} vs {min_ref} {min:.1}); threshold {:.1} bps.",
            rules.basis_spread_bps_threshold
        );
        out.push(new_anomaly(
            AnomalyType::BasisDislocation,
            severity,
            None,
            vec![snap.canonical_asset_id.clone()],
            venues,
            "Cross-venue basis dislocation".to_string(),
            description,
            snap.timestamp.clone(),
            vec![format!(
                "feature:{}:{}",
                snap.canonical_asset_id, snap.timestamp
            )],
            Some(format!(
                "rule:basis_spread_bps>{:.1}",
                rules.basis_spread_bps_threshold
            )),
        ));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_venue_divergence_emits_basis_dislocation() {
        let mut st = EngineState::new();
        for snap in crate::detectors::test_support::load_snapshots() {
            st.ingest_snapshot(snap);
        }
        let out = detect(&st, &RulesConfig::default());
        let btc = out
            .iter()
            .find(|a| a.assets.iter().any(|x| x == "crypto:btc-usdt"))
            .expect("BTC basis dislocation fires (12.5 vs 8.1 = 4.4 bps)");
        assert_eq!(btc.anomaly_type, AnomalyType::BasisDislocation);
        // venues derived from references binance-spot / okx-perp.
        assert!(btc.venues.contains(&"binance".to_string()));
        assert!(btc.venues.contains(&"okx".to_string()));
        btc.validate().expect("valid");
    }

    #[test]
    fn single_reference_does_not_fire() {
        use crate::input::FeatureSnapshot;
        let mut st = EngineState::new();
        let snap: FeatureSnapshot = serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": "crypto:eth-usdt",
            "timestamp": "2026-06-07T12:00:00Z",
            "basis": [{ "reference": "binance-spot", "basis_bps": 9.0 }],
            "regime": {}
        }))
        .expect("snapshot");
        st.ingest_snapshot(snap);
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }

    #[test]
    fn tight_basis_does_not_fire() {
        use crate::input::FeatureSnapshot;
        let mut st = EngineState::new();
        let snap: FeatureSnapshot = serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": "crypto:eth-usdt",
            "timestamp": "2026-06-07T12:00:00Z",
            "basis": [
                { "reference": "binance-spot", "basis_bps": 9.0 },
                { "reference": "okx-perp", "basis_bps": 8.5 }
            ],
            "regime": {}
        }))
        .expect("snapshot");
        st.ingest_snapshot(snap);
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }
}
