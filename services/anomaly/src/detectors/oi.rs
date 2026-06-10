//! Open-interest surge detector (P10-T004).
//!
//! Fires when a snapshot's `oi_delta` (fractional change, computed upstream)
//! crosses the configured threshold, and annotates the anomaly with price
//! direction so the user sees whether OI is building into a rally or a fade
//! (rising OI + rising price = new longs; rising OI + falling price = new
//! shorts). `oi_delta` carries no z-score, so severity is magnitude-driven.

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::rules::RulesConfig;
use crate::state::EngineState;

/// `|oi_delta|` severity bands (fractions). 8.5% fixture jump → medium.
const OI_HIGH: f64 = 0.10;
const OI_CRITICAL: f64 = 0.15;

fn severity_for(abs_delta: f64, threshold: f64) -> AnomalySeverity {
    if abs_delta >= OI_CRITICAL {
        AnomalySeverity::Critical
    } else if abs_delta >= OI_HIGH {
        AnomalySeverity::High
    } else if abs_delta >= (threshold + OI_HIGH) / 2.0 {
        AnomalySeverity::Medium
    } else {
        AnomalySeverity::Low
    }
}

/// Best available price-direction return for context (prefer 1h, then 24h).
fn price_return(snap: &crate::input::FeatureSnapshot) -> Option<(&'static str, f64)> {
    const HORIZONS: [&str; 4] = ["1h", "24h", "15m", "5m"];
    for h in HORIZONS {
        if let Some(&r) = snap.returns.get(h) {
            return Some((h, r));
        }
    }
    None
}

#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    for snap in state.snapshots.values() {
        let Some(delta) = snap.oi_delta else { continue };
        let abs_delta = delta.abs();
        if abs_delta < rules.oi_delta_threshold {
            continue;
        }
        let severity = severity_for(abs_delta, rules.oi_delta_threshold);

        // Price direction context.
        let price_ctx = price_return(snap);
        let direction = match price_ctx {
            Some((_, r)) if r > 0.0 => "price rising (new longs building)",
            Some((_, r)) if r < 0.0 => "price falling (new shorts building)",
            _ => "price flat",
        };
        let pct = delta * 100.0;
        let price_str = price_ctx
            .map(|(h, r)| format!(", {h} return {:+.2}%", r * 100.0))
            .unwrap_or_default();
        let description = format!("Open interest moved {pct:+.1}% ({direction}){price_str}.");
        let oi_state = snap
            .oi_state
            .clone()
            .unwrap_or_else(|| "oi_changing".into());

        out.push(new_anomaly(
            AnomalyType::OiSurge,
            severity,
            None,
            vec![snap.canonical_asset_id.clone()],
            Vec::new(),
            "Open interest surge".to_string(),
            description,
            snap.timestamp.clone(),
            vec![
                format!("feature:{}:{}", snap.canonical_asset_id, snap.timestamp),
                format!("oi_state:{oi_state}"),
            ],
            Some(format!(
                "rule:oi_delta>{:.0}%",
                rules.oi_delta_threshold * 100.0
            )),
        ));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::FeatureSnapshot;

    fn snap(asset: &str, oi_delta: Option<f64>, ret_1h: Option<f64>) -> FeatureSnapshot {
        let mut returns = serde_json::Map::new();
        if let Some(r) = ret_1h {
            returns.insert("1h".into(), serde_json::json!(r));
        }
        serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": asset,
            "timestamp": "2026-06-07T12:00:00Z",
            "returns": returns,
            "oi_delta": oi_delta,
            "oi_state": "oi_increasing",
            "regime": {}
        }))
        .expect("build snapshot")
    }

    #[test]
    fn oi_jump_emits_surge_with_price_and_oi_context() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap("crypto:btc-usdt", Some(0.085), Some(0.021)));
        let out = detect(&st, &RulesConfig::default());
        assert_eq!(out.len(), 1);
        let a = &out[0];
        assert_eq!(a.anomaly_type, AnomalyType::OiSurge);
        assert_eq!(a.severity, AnomalySeverity::Medium);
        assert!(
            a.description.contains("new longs"),
            "price ctx: {}",
            a.description
        );
        assert!(a.context_refs.iter().any(|c| c.starts_with("oi_state:")));
        a.validate().expect("valid");
    }

    #[test]
    fn small_oi_change_does_not_fire() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap("crypto:btc-usdt", Some(0.01), Some(0.0)));
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }

    #[test]
    fn large_oi_drop_with_falling_price_is_high_and_shorts() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap("crypto:eth-usdt", Some(-0.12), Some(-0.03)));
        let out = detect(&st, &RulesConfig::default());
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].severity, AnomalySeverity::High);
        assert!(out[0].description.contains("new shorts"));
    }

    #[test]
    fn missing_oi_is_skipped() {
        let mut st = EngineState::new();
        st.ingest_snapshot(snap("macro:spx", None, Some(-0.006)));
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }
}
