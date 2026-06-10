//! Funding-spike detector (P10-T003).
//!
//! Fires when a feature snapshot's `funding_z` crosses the configured threshold
//! (`|z| >= z_threshold`), with per-asset rule overrides. Severity comes from
//! the registry sigma bands. The funding z-score is computed upstream by the
//! features service; this detector only applies the rule.

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::registry::meta_for;
use crate::rules::RulesConfig;
use crate::state::EngineState;

const RULE_PREFIX: &str = "rule:funding_z";

/// Detect funding spikes across all assets with a current snapshot.
#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    let bands = meta_for(AnomalyType::FundingSpike).sigma_bands;

    for snap in state.snapshots.values() {
        let Some(z) = snap.funding_z else { continue };
        let rule = rules.funding_for(&snap.canonical_asset_id);
        let abs_z = z.abs();
        if abs_z < rule.z_threshold {
            continue;
        }
        // Severity from sigma bands; if the rule threshold sits below the lowest
        // band, still surface at least `low`.
        let severity = bands
            .and_then(|b| b.severity_for(abs_z))
            .unwrap_or(AnomalySeverity::Low);

        let direction = if z >= 0.0 { "elevated" } else { "depressed" };
        let title = "Funding rate spike".to_string();
        let description = format!(
            "{} funding z-score reached {:.2} (threshold {:.1}).",
            direction, z, rule.z_threshold
        );
        let context_ref = format!("feature:{}:{}", snap.canonical_asset_id, snap.timestamp);
        let rule_ref = Some(format!("{RULE_PREFIX}>{:.1}", rule.z_threshold));

        out.push(new_anomaly(
            AnomalyType::FundingSpike,
            severity,
            Some(z),
            vec![snap.canonical_asset_id.clone()],
            Vec::new(),
            title,
            description,
            snap.timestamp.clone(),
            vec![context_ref],
            rule_ref,
        ));
    }
    // Deterministic ordering across assets (HashMap iteration is unordered).
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::FeatureSnapshot;

    fn snap_with_funding_z(asset: &str, z: Option<f64>) -> FeatureSnapshot {
        let z_json = match z {
            Some(v) => v.to_string(),
            None => "null".to_string(),
        };
        serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": asset,
            "timestamp": "2026-06-07T12:00:00Z",
            "funding_z": serde_json::from_str::<serde_json::Value>(&z_json).unwrap(),
            "regime": {}
        }))
        .expect("build snapshot")
    }

    #[test]
    fn elevated_funding_emits_one_spike() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap_with_funding_z("crypto:btc-usdt", Some(2.6)));
        let out = detect(&st, &RulesConfig::default());
        assert_eq!(out.len(), 1);
        let a = &out[0];
        assert_eq!(a.anomaly_type, AnomalyType::FundingSpike);
        assert_eq!(a.assets, vec!["crypto:btc-usdt".to_string()]);
        assert_eq!(a.sigma, Some(2.6));
        a.validate().expect("valid anomaly");
    }

    #[test]
    fn normal_funding_does_not_fire() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap_with_funding_z("crypto:btc-usdt", Some(0.4)));
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }

    #[test]
    fn missing_funding_is_skipped() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap_with_funding_z("macro:spx", None));
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }

    #[test]
    fn negative_funding_spike_fires() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap_with_funding_z("crypto:btc-usdt", Some(-2.8)));
        let out = detect(&st, &RulesConfig::default());
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].sigma, Some(-2.8));
    }

    #[test]
    fn per_asset_override_suppresses() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap_with_funding_z("crypto:btc-usdt", Some(2.6)));
        let mut rules = RulesConfig::default();
        rules.funding_overrides.insert(
            "crypto:btc-usdt".into(),
            crate::rules::FundingRule { z_threshold: 3.0 },
        );
        assert!(
            detect(&st, &rules).is_empty(),
            "override raises bar above 2.6"
        );
    }
}
