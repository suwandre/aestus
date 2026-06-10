//! Detector orchestrator (P10-T001).
//!
//! On each evaluation tick the engine snapshots [`EngineState`] and runs every
//! registered detector, collecting the anomalies they emit. Individual detectors
//! live in [`crate::detectors`] and are wired in here as they are implemented
//! (P10-T003+).

use crate::anomaly::AnomalyEvent;
use crate::state::EngineState;

/// Run all registered detectors against the current engine state and return the
/// anomalies they produce (pre-dedupe, pre-severity-rescore).
#[must_use]
pub fn run_detectors(_state: &EngineState) -> Vec<AnomalyEvent> {
    // Detectors are appended here as they land (P10-T003 funding, T004 OI, …).
    Vec::new()
}
