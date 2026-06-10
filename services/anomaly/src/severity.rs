//! Severity / conviction scoring (P10-T013).
//!
//! Detectors emit a coarse severity bucket; this module recomputes a unified
//! 0–100 conviction-input score from four components and maps it back to a
//! stable severity bucket so every anomaly is ranked on the same scale
//! regardless of which detector produced it:
//!
//! - **magnitude**   — how extreme the signal is (sigma vs bands, else the
//!   detector's bucket as a proxy).
//! - **confidence**  — trust in the source/method, per anomaly type.
//! - **recency**     — how fresh the observation is relative to now.
//! - **priority**    — how much the user cares about the asset.
//!
//! The score also feeds briefing conviction downstream (P12); here it only sets
//! `AnomalyEvent.severity`.

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::registry::meta_for;
use crate::rules::RulesConfig;
use market_math::timestamps::rfc3339_to_ms;

/// Decay horizon for recency: an observation this old scores ~0 on recency.
const RECENCY_DECAY_MS: f64 = 24.0 * 3_600_000.0;

/// Component weights (sum to 1.0).
const W_MAGNITUDE: f64 = 0.40;
const W_CONFIDENCE: f64 = 0.25;
const W_RECENCY: f64 = 0.15;
const W_PRIORITY: f64 = 0.20;

/// Inputs to the conviction score, each normalized to 0..1.
#[derive(Debug, Clone, Copy)]
pub struct ScoreInputs {
    pub magnitude: f64,
    pub confidence: f64,
    pub recency: f64,
    pub priority: f64,
}

/// Weighted conviction score, 0..100 (rounded).
#[must_use]
pub fn conviction_score(i: ScoreInputs) -> u8 {
    let clamp01 = |x: f64| x.clamp(0.0, 1.0);
    let s = W_MAGNITUDE * clamp01(i.magnitude)
        + W_CONFIDENCE * clamp01(i.confidence)
        + W_RECENCY * clamp01(i.recency)
        + W_PRIORITY * clamp01(i.priority);
    (s * 100.0).round().clamp(0.0, 100.0) as u8
}

/// Map a 0..100 score to a severity bucket.
#[must_use]
pub fn bucket(score: u8) -> AnomalySeverity {
    match score {
        0..=44 => AnomalySeverity::Low,
        45..=64 => AnomalySeverity::Medium,
        65..=84 => AnomalySeverity::High,
        _ => AnomalySeverity::Critical,
    }
}

/// Source/method confidence per anomaly type (0..1).
fn confidence_for(t: AnomalyType) -> f64 {
    use AnomalyType as T;
    match t {
        T::FundingSpike | T::VolumeAnomaly => 0.9, // genuine z-scores
        T::MacroApproaching => 0.95,               // calendar is near-certain
        T::OiSurge | T::BasisDislocation | T::LiquidationCluster => 0.8,
        T::CorrelationBreak => 0.75,
        T::WhaleFlow | T::ExchangeFlow => 0.7, // provider-dependent
        T::NewsCluster => 0.5,                 // keyword placeholder
    }
}

/// Magnitude proxy (0..1): sigma vs the type's critical band when available,
/// else the detector's bucket mapped onto a coarse scale.
fn magnitude_of(a: &AnomalyEvent) -> f64 {
    let meta = meta_for(a.anomaly_type);
    if let (Some(sigma), Some(bands)) = (a.sigma, meta.sigma_bands) {
        return (sigma.abs() / bands.critical).clamp(0.0, 1.0);
    }
    match a.severity {
        AnomalySeverity::Low => 0.3,
        AnomalySeverity::Medium => 0.55,
        AnomalySeverity::High => 0.8,
        AnomalySeverity::Critical => 1.0,
    }
}

fn recency_of(detected_at: &str, now_ms: i64) -> f64 {
    let Some(ts) = rfc3339_to_ms(detected_at) else {
        return 0.5;
    };
    let age = (now_ms - ts).max(0) as f64;
    (1.0 - age / RECENCY_DECAY_MS).clamp(0.0, 1.0)
}

/// Build the score inputs for an anomaly given config + now.
#[must_use]
pub fn inputs_for(a: &AnomalyEvent, rules: &RulesConfig, now_ms: i64) -> ScoreInputs {
    let priority = a
        .assets
        .iter()
        .map(|asset| rules.priority_for(asset))
        .fold(0.0_f64, f64::max);
    ScoreInputs {
        magnitude: magnitude_of(a),
        confidence: confidence_for(a.anomaly_type),
        recency: recency_of(&a.detected_at, now_ms),
        priority,
    }
}

/// Recompute and set `severity` from the unified conviction score, returning the
/// updated anomaly. Stable: same inputs → same severity.
#[must_use]
pub fn rescore(mut a: AnomalyEvent, rules: &RulesConfig, now_ms: i64) -> AnomalyEvent {
    let score = conviction_score(inputs_for(&a, rules, now_ms));
    a.severity = bucket(score);
    a
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anomaly::AnomalyStatus;

    fn anomaly(
        t: AnomalyType,
        sigma: Option<f64>,
        sev: AnomalySeverity,
        asset: &str,
    ) -> AnomalyEvent {
        AnomalyEvent {
            id: "x".into(),
            anomaly_type: t,
            severity: sev,
            sigma,
            assets: vec![asset.into()],
            venues: vec![],
            title: "t".into(),
            description: "d".into(),
            detected_at: "2026-06-10T12:00:00Z".into(),
            status: AnomalyStatus::Active,
            context_refs: vec![],
            rule_ref: None,
        }
    }

    #[test]
    fn score_is_in_range_and_stable() {
        let i = ScoreInputs {
            magnitude: 0.8,
            confidence: 0.9,
            recency: 1.0,
            priority: 1.0,
        };
        let s1 = conviction_score(i);
        let s2 = conviction_score(i);
        assert_eq!(s1, s2, "stable");
        assert!(s1 <= 100);
    }

    #[test]
    fn buckets_cover_full_range() {
        assert_eq!(bucket(10), AnomalySeverity::Low);
        assert_eq!(bucket(50), AnomalySeverity::Medium);
        assert_eq!(bucket(70), AnomalySeverity::High);
        assert_eq!(bucket(95), AnomalySeverity::Critical);
    }

    #[test]
    fn high_sigma_btc_outranks_weak_news() {
        let rules = RulesConfig::default();
        let now = rfc3339_to_ms("2026-06-10T12:00:00Z").unwrap();
        let strong = anomaly(
            AnomalyType::FundingSpike,
            Some(3.6),
            AnomalySeverity::Critical,
            "crypto:btc-usdt",
        );
        let weak = anomaly(
            AnomalyType::NewsCluster,
            None,
            AnomalySeverity::Low,
            "crypto:doge-usdt",
        );
        let s_strong = conviction_score(inputs_for(&strong, &rules, now));
        let s_weak = conviction_score(inputs_for(&weak, &rules, now));
        assert!(s_strong > s_weak, "{s_strong} vs {s_weak}");
    }

    #[test]
    fn rescore_sets_bucket_from_score() {
        let rules = RulesConfig::default();
        let now = rfc3339_to_ms("2026-06-10T12:00:00Z").unwrap();
        // A funding spike at sigma 3.6 on BTC, fresh, high priority → high/critical.
        let a = anomaly(
            AnomalyType::FundingSpike,
            Some(3.6),
            AnomalySeverity::Low,
            "crypto:btc-usdt",
        );
        let scored = rescore(a, &rules, now);
        assert!(matches!(
            scored.severity,
            AnomalySeverity::High | AnomalySeverity::Critical
        ));
    }

    #[test]
    fn old_observation_scores_lower_recency() {
        let fresh = recency_of(
            "2026-06-10T12:00:00Z",
            rfc3339_to_ms("2026-06-10T12:00:00Z").unwrap(),
        );
        let stale = recency_of(
            "2026-06-09T12:00:00Z",
            rfc3339_to_ms("2026-06-10T12:00:00Z").unwrap(),
        );
        assert!(fresh > stale);
    }
}
