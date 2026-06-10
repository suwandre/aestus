//! Detector implementations (P10-T003+).
//!
//! Each detector is a pure function over [`crate::state::EngineState`] +
//! [`crate::rules::RulesConfig`] returning the anomalies it finds. They never
//! invent price levels and never touch the LLM — purely deterministic rules and
//! statistics (hard rules #1, #2). Shared construction helpers live here.

pub mod funding;
pub mod oi;

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyStatus, AnomalyType};

/// Deterministic anomaly id: `<type>:<primary_asset>:<detected_at>`. Stable for
/// the same (type, asset, timestamp) so dedupe (P10-T012) and persistence
/// (P10-T015) can recognise a repeat without a random id.
#[must_use]
pub fn anomaly_id(anomaly_type: AnomalyType, primary_asset: &str, detected_at: &str) -> String {
    format!(
        "{}:{}:{}",
        anomaly_type.as_str(),
        primary_asset,
        detected_at
    )
}

/// Builder for a freshly-detected anomaly. Status defaults to `active`; severity
/// is supplied by the detector (usually via the registry sigma bands).
#[allow(clippy::too_many_arguments)]
#[must_use]
pub fn new_anomaly(
    anomaly_type: AnomalyType,
    severity: AnomalySeverity,
    sigma: Option<f64>,
    assets: Vec<String>,
    venues: Vec<String>,
    title: String,
    description: String,
    detected_at: String,
    context_refs: Vec<String>,
    rule_ref: Option<String>,
) -> AnomalyEvent {
    let primary = assets.first().map(String::as_str).unwrap_or("");
    AnomalyEvent {
        id: anomaly_id(anomaly_type, primary, &detected_at),
        anomaly_type,
        severity,
        sigma,
        assets,
        venues,
        title,
        description,
        detected_at,
        status: AnomalyStatus::Active,
        context_refs,
        rule_ref,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_is_deterministic() {
        let a = anomaly_id(
            AnomalyType::FundingSpike,
            "crypto:btc-usdt",
            "2026-06-07T12:00:00Z",
        );
        let b = anomaly_id(
            AnomalyType::FundingSpike,
            "crypto:btc-usdt",
            "2026-06-07T12:00:00Z",
        );
        assert_eq!(a, b);
        assert_eq!(a, "funding_spike:crypto:btc-usdt:2026-06-07T12:00:00Z");
    }
}
