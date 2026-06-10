//! Macro-approaching detector (P10-T009).
//!
//! Schedule-driven: emits a `macro_approaching` anomaly when a macro-calendar
//! event at or above the configured importance is scheduled within the lead-time
//! window (`0 <= scheduled_at - now <= window`). Past events and events beyond
//! the window do not fire. Macro prints move the whole crypto book, so the
//! anomaly links the currently-watched crypto assets (plus a `macro:<region>`
//! proxy) so the cockpit can surface it against those markets.

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::rules::{Importance, RulesConfig};
use crate::state::EngineState;
use market_math::timestamps::{ms_to_rfc3339, rfc3339_to_ms};

/// Assets a macro event is attached to: watched crypto markets, else a
/// `macro:<region>` proxy so the anomaly always references at least one asset.
fn affected_assets(state: &EngineState, region: &str) -> Vec<String> {
    let mut crypto: Vec<String> = state
        .snapshots
        .keys()
        .filter(|id| id.starts_with("crypto:"))
        .cloned()
        .collect();
    crypto.sort();
    if crypto.is_empty() {
        vec![format!("macro:{}", region.to_lowercase())]
    } else {
        crypto
    }
}

fn severity_for(lead_minutes: i64) -> AnomalySeverity {
    if lead_minutes <= 15 {
        AnomalySeverity::High
    } else {
        AnomalySeverity::Medium
    }
}

#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig, now_ms: i64) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    let window_ms = rules.macro_window_minutes * 60_000;

    for ev in state.macro_events.values() {
        if Importance::parse(&ev.importance) < rules.macro_min_importance {
            continue;
        }
        let Some(scheduled_ms) = rfc3339_to_ms(&ev.scheduled_at) else {
            continue;
        };
        let lead_ms = scheduled_ms - now_ms;
        if lead_ms < 0 || lead_ms > window_ms {
            continue;
        }
        let lead_minutes = lead_ms / 60_000;
        let severity = severity_for(lead_minutes);
        let detected_at = ms_to_rfc3339(now_ms);
        let title = format!("{} {} approaching", ev.region, ev.title);
        let description = format!(
            "High-importance {} ({}) scheduled at {} — {} minute(s) away; expect elevated volatility.",
            ev.title, ev.currency, ev.scheduled_at, lead_minutes
        );
        out.push(new_anomaly(
            AnomalyType::MacroApproaching,
            severity,
            None,
            affected_assets(state, &ev.region),
            Vec::new(),
            title,
            description,
            detected_at,
            vec![format!("macro:{}", ev.event_id)],
            Some(format!("rule:macro_window<{}m", rules.macro_window_minutes)),
        ));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{FeatureSnapshot, MacroEvent};

    fn load_macro_fixture() -> Vec<MacroEvent> {
        let raw = std::fs::read_to_string("../../fixtures/macro/events.json")
            .expect("read macro fixture");
        serde_json::from_str(&raw).expect("parse macro")
    }

    fn btc_snapshot() -> FeatureSnapshot {
        serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": "crypto:btc-usdt",
            "timestamp": "2026-06-10T12:00:00Z",
            "regime": {}
        }))
        .expect("snapshot")
    }

    #[test]
    fn cpi_within_window_emits_macro_approaching() {
        let mut st = EngineState::new();
        st.ingest_snapshot(btc_snapshot());
        for ev in load_macro_fixture() {
            st.ingest_macro(ev);
        }
        // now = 2026-06-10T12:00:00Z; CPI is at 12:30Z (30 min away, high).
        let now_ms = rfc3339_to_ms("2026-06-10T12:00:00Z").unwrap();
        let out = detect(&st, &RulesConfig::default(), now_ms);
        // Only CPI qualifies: FOMC is a week out, NFP already passed,
        // PPI/jobless-claims are medium importance.
        assert_eq!(out.len(), 1, "got {out:?}");
        let a = &out[0];
        assert_eq!(a.anomaly_type, AnomalyType::MacroApproaching);
        assert!(a.context_refs.contains(&"macro:us-cpi-2026-06".to_string()));
        assert!(a.assets.contains(&"crypto:btc-usdt".to_string()));
        assert_eq!(a.severity, AnomalySeverity::Medium); // 30 min → medium
        a.validate().expect("valid");
    }

    #[test]
    fn passed_event_does_not_fire() {
        let mut st = EngineState::new();
        for ev in load_macro_fixture() {
            st.ingest_macro(ev);
        }
        // now after CPI but before FOMC, outside any window.
        let now_ms = rfc3339_to_ms("2026-06-10T14:00:00Z").unwrap();
        assert!(detect(&st, &RulesConfig::default(), now_ms).is_empty());
    }

    #[test]
    fn medium_importance_filtered_out() {
        let mut st = EngineState::new();
        for ev in load_macro_fixture() {
            st.ingest_macro(ev);
        }
        // Just before PPI (medium) at 2026-06-11T12:30Z — must not fire.
        let now_ms = rfc3339_to_ms("2026-06-11T12:00:00Z").unwrap();
        assert!(detect(&st, &RulesConfig::default(), now_ms).is_empty());
    }
}
