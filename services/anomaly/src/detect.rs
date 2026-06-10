//! Detector orchestrator (P10-T001).
//!
//! On each evaluation tick the engine snapshots [`EngineState`] and runs every
//! registered detector, collecting the anomalies they emit. Individual detectors
//! live in [`crate::detectors`].

use crate::anomaly::AnomalyEvent;
use crate::detectors;
use crate::rules::RulesConfig;
use crate::state::EngineState;

/// Run all registered detectors against the current engine state and return the
/// anomalies they produce (pre-dedupe, pre-severity-rescore). `now_ms` is the
/// reference wall-clock for schedule-driven detectors (macro proximity).
#[must_use]
pub fn run_detectors(state: &EngineState, rules: &RulesConfig, now_ms: i64) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    out.extend(detectors::funding::detect(state, rules));
    out.extend(detectors::oi::detect(state, rules));
    out.extend(detectors::volume::detect(state, rules));
    out.extend(detectors::liquidations::detect(state, rules));
    out.extend(detectors::basis::detect(state, rules));
    out.extend(detectors::correlation::detect(state, rules));
    out.extend(detectors::macro_event::detect(state, rules, now_ms));
    // Further detectors (whale, news, …) are appended here as they land.
    out
}
