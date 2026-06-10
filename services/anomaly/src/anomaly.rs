//! Anomaly event payload — Rust mirror of `packages/contracts/src/anomaly.ts`
//! (P10-T001). The TypeScript zod schema is the source of truth; keep this in
//! sync by hand. Detectors construct [`AnomalyEvent`]s; [`AnomalyEvent::validate`]
//! enforces the same invariants the zod schema does (non-empty assets/title/
//! description) before an anomaly is published.

use serde::{Deserialize, Serialize};

/// Anomaly taxonomy (spec §117). Mirrors `AnomalyType` in the TS contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnomalyType {
    FundingSpike,
    OiSurge,
    VolumeAnomaly,
    CorrelationBreak,
    BasisDislocation,
    WhaleFlow,
    MacroApproaching,
}

impl AnomalyType {
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::FundingSpike => "funding_spike",
            Self::OiSurge => "oi_surge",
            Self::VolumeAnomaly => "volume_anomaly",
            Self::CorrelationBreak => "correlation_break",
            Self::BasisDislocation => "basis_dislocation",
            Self::WhaleFlow => "whale_flow",
            Self::MacroApproaching => "macro_approaching",
        }
    }
}

/// Severity buckets. Mirrors `AnomalySeverity` in the TS contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnomalySeverity {
    Low,
    Medium,
    High,
    Critical,
}

impl AnomalySeverity {
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }
}

/// Lifecycle state. Mirrors `AnomalyStatus` in the TS contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnomalyStatus {
    Active,
    Acknowledged,
    Resolved,
    Expired,
    Dismissed,
}

impl AnomalyStatus {
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Acknowledged => "acknowledged",
            Self::Resolved => "resolved",
            Self::Expired => "expired",
            Self::Dismissed => "dismissed",
        }
    }
}

/// A deterministic anomaly emitted by the detection engine (spec §100, §117).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AnomalyEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub anomaly_type: AnomalyType,
    pub severity: AnomalySeverity,
    /// Statistical magnitude in standard deviations; `None` for schedule-driven
    /// types (e.g. `macro_approaching`, `whale_flow`).
    pub sigma: Option<f64>,
    /// FKs to `AssetIdentity.canonical_id`; at least one required.
    pub assets: Vec<String>,
    /// FKs to `Venue.venue_id`; may be empty for cross-asset/macro anomalies.
    #[serde(default)]
    pub venues: Vec<String>,
    pub title: String,
    pub description: String,
    pub detected_at: String,
    pub status: AnomalyStatus,
    /// References to supporting events/snapshots/context packets.
    #[serde(default)]
    pub context_refs: Vec<String>,
    /// Id of the detection rule that fired, if rule-based.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rule_ref: Option<String>,
}

/// Reasons an [`AnomalyEvent`] fails the contract invariants.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AnomalyValidationError {
    #[error("anomaly id must be non-empty")]
    EmptyId,
    #[error("anomaly must reference at least one asset")]
    NoAssets,
    #[error("anomaly title must be non-empty")]
    EmptyTitle,
    #[error("anomaly description must be non-empty")]
    EmptyDescription,
}

impl AnomalyEvent {
    /// Validate the same invariants the zod contract enforces: non-empty `id`,
    /// at least one asset, non-empty `title`/`description`. Returns the first
    /// violation found.
    pub fn validate(&self) -> Result<(), AnomalyValidationError> {
        if self.id.trim().is_empty() {
            return Err(AnomalyValidationError::EmptyId);
        }
        if self.assets.is_empty() {
            return Err(AnomalyValidationError::NoAssets);
        }
        if self.title.trim().is_empty() {
            return Err(AnomalyValidationError::EmptyTitle);
        }
        if self.description.trim().is_empty() {
            return Err(AnomalyValidationError::EmptyDescription);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> AnomalyEvent {
        AnomalyEvent {
            id: "anom-001".into(),
            anomaly_type: AnomalyType::FundingSpike,
            severity: AnomalySeverity::High,
            sigma: Some(2.6),
            assets: vec!["crypto:btc-usdt".into()],
            venues: vec!["binance".into()],
            title: "BTC funding rate spike".into(),
            description: "Funding z-score reached 2.6.".into(),
            detected_at: "2026-06-07T12:00:00Z".into(),
            status: AnomalyStatus::Active,
            context_refs: vec![],
            rule_ref: Some("rule:funding_z>2".into()),
        }
    }

    #[test]
    fn type_serializes_snake_case() {
        let json = serde_json::to_string(&AnomalyType::FundingSpike).expect("serialize");
        assert_eq!(json, "\"funding_spike\"");
    }

    #[test]
    fn event_roundtrips_with_type_field_renamed() {
        let ev = sample();
        let json = serde_json::to_string(&ev).expect("serialize");
        assert!(json.contains("\"type\":\"funding_spike\""));
        let back: AnomalyEvent = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back, ev);
    }

    #[test]
    fn parses_fixture_shape() {
        // Matches fixtures/anomalies/events.json entry shape.
        let raw = r#"{
            "id": "anom-002",
            "type": "oi_surge",
            "severity": "medium",
            "sigma": 2.1,
            "assets": ["crypto:btc-usdt"],
            "venues": ["binance", "bybit"],
            "title": "Open interest surge",
            "description": "Aggregate OI rose 8.5% in one hour across venues.",
            "detected_at": "2026-06-07T12:01:00.000Z",
            "status": "active",
            "context_refs": []
        }"#;
        let ev: AnomalyEvent = serde_json::from_str(raw).expect("parse fixture");
        assert_eq!(ev.anomaly_type, AnomalyType::OiSurge);
        assert!(ev.rule_ref.is_none());
        ev.validate().expect("fixture is valid");
    }

    #[test]
    fn validate_rejects_empty_assets() {
        let mut ev = sample();
        ev.assets.clear();
        assert_eq!(ev.validate(), Err(AnomalyValidationError::NoAssets));
    }

    #[test]
    fn validate_rejects_empty_title() {
        let mut ev = sample();
        ev.title = "   ".into();
        assert_eq!(ev.validate(), Err(AnomalyValidationError::EmptyTitle));
    }

    #[test]
    fn valid_event_passes() {
        sample().validate().expect("sample is valid");
    }
}
