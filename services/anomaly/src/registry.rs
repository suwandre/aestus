//! Anomaly type registry (P10-T002).
//!
//! One [`AnomalyTypeMeta`] per [`AnomalyType`], giving each type a display label,
//! a severity policy (how severity is derived), the fields a valid anomaly of
//! that type must populate, and a UI color token. This is the single source of
//! truth detectors, the severity scorer (P10-T013), and the UI consult so the
//! taxonomy stays consistent. UI color tokens are CSS variables from
//! `docs/specs/cockpit.html` (`.al-type.* .ti` rules).

use crate::anomaly::{AnomalySeverity, AnomalyType};

/// How an anomaly type's severity is determined.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeverityBasis {
    /// Statistical: severity from the magnitude of `|sigma|` crossing bands.
    Sigma,
    /// Magnitude/relevance driven (notional, news velocity); no `sigma`.
    Magnitude,
    /// Schedule/proximity driven (time-to-event); no `sigma`.
    Schedule,
}

/// `|sigma|` thresholds that map a statistical magnitude onto severity buckets.
/// A value `>= critical` is critical, `>= high` is high, and so on; below `low`
/// the anomaly should not fire.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SigmaBands {
    pub low: f64,
    pub medium: f64,
    pub high: f64,
    pub critical: f64,
}

impl SigmaBands {
    /// Map an absolute sigma onto a severity bucket using these bands.
    /// Returns `None` if `abs_sigma` is below the `low` band (not anomalous).
    #[must_use]
    pub fn severity_for(&self, abs_sigma: f64) -> Option<AnomalySeverity> {
        if abs_sigma >= self.critical {
            Some(AnomalySeverity::Critical)
        } else if abs_sigma >= self.high {
            Some(AnomalySeverity::High)
        } else if abs_sigma >= self.medium {
            Some(AnomalySeverity::Medium)
        } else if abs_sigma >= self.low {
            Some(AnomalySeverity::Low)
        } else {
            None
        }
    }
}

/// Metadata describing one anomaly type.
#[derive(Debug, Clone)]
pub struct AnomalyTypeMeta {
    pub anomaly_type: AnomalyType,
    /// Human-facing label (matches the cockpit Active Alerts table).
    pub label: &'static str,
    /// How severity is derived for this type.
    pub severity_basis: SeverityBasis,
    /// Sigma → severity bands; `Some` only when `severity_basis == Sigma`.
    pub sigma_bands: Option<SigmaBands>,
    /// `AnomalyEvent` fields a valid anomaly of this type must populate (beyond
    /// the always-required id/title/description/detected_at/status).
    pub required_fields: &'static [&'static str],
    /// UI color token (CSS variable from `cockpit.html`).
    pub ui_color: &'static str,
}

const SIGMA_DEFAULT: SigmaBands = SigmaBands {
    low: 1.5,
    medium: 2.0,
    high: 2.5,
    critical: 3.5,
};

/// Registry metadata for one type. Total over [`AnomalyType::ALL`].
#[must_use]
pub fn meta_for(anomaly_type: AnomalyType) -> AnomalyTypeMeta {
    use AnomalyType as T;
    match anomaly_type {
        T::FundingSpike => AnomalyTypeMeta {
            anomaly_type,
            label: "Funding Spike",
            severity_basis: SeverityBasis::Sigma,
            sigma_bands: Some(SIGMA_DEFAULT),
            required_fields: &["sigma", "assets", "venues"],
            ui_color: "--orange",
        },
        T::OiSurge => AnomalyTypeMeta {
            // Magnitude-driven: the feature snapshot carries `oi_delta` (a
            // fraction), not an OI z-score, so severity comes from the delta,
            // not sigma bands.
            anomaly_type,
            label: "OI Surge",
            severity_basis: SeverityBasis::Magnitude,
            sigma_bands: None,
            required_fields: &["assets"],
            ui_color: "--blue",
        },
        T::VolumeAnomaly => AnomalyTypeMeta {
            anomaly_type,
            label: "Volume Anomaly",
            severity_basis: SeverityBasis::Sigma,
            sigma_bands: Some(SIGMA_DEFAULT),
            required_fields: &["sigma", "assets"],
            ui_color: "--teal",
        },
        T::CorrelationBreak => AnomalyTypeMeta {
            anomaly_type,
            label: "Correlation Break",
            severity_basis: SeverityBasis::Sigma,
            sigma_bands: Some(SIGMA_DEFAULT),
            required_fields: &["sigma", "assets"],
            ui_color: "--purple",
        },
        T::BasisDislocation => AnomalyTypeMeta {
            // Magnitude-driven by the cross-venue basis spread in bps.
            anomaly_type,
            label: "Basis Dislocation",
            severity_basis: SeverityBasis::Magnitude,
            sigma_bands: None,
            required_fields: &["assets", "venues"],
            ui_color: "--pink",
        },
        T::WhaleFlow => AnomalyTypeMeta {
            anomaly_type,
            label: "Whale Flow",
            severity_basis: SeverityBasis::Magnitude,
            sigma_bands: None,
            required_fields: &["assets", "context_refs"],
            ui_color: "--green",
        },
        T::MacroApproaching => AnomalyTypeMeta {
            anomaly_type,
            label: "Macro Approaching",
            severity_basis: SeverityBasis::Schedule,
            sigma_bands: None,
            required_fields: &["assets", "context_refs"],
            ui_color: "--blue",
        },
        T::NewsCluster => AnomalyTypeMeta {
            anomaly_type,
            label: "News Cluster",
            severity_basis: SeverityBasis::Magnitude,
            sigma_bands: None,
            required_fields: &["assets", "context_refs"],
            ui_color: "--red",
        },
        T::LiquidationCluster => AnomalyTypeMeta {
            // Magnitude-driven by aggregate cluster size near price.
            anomaly_type,
            label: "Liquidation Cluster",
            severity_basis: SeverityBasis::Magnitude,
            sigma_bands: None,
            required_fields: &["assets"],
            ui_color: "--orange",
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_type_has_complete_metadata() {
        for &t in AnomalyType::ALL {
            let m = meta_for(t);
            assert_eq!(m.anomaly_type, t);
            assert!(!m.label.is_empty(), "{} has a label", t.as_str());
            assert!(
                m.ui_color.starts_with("--"),
                "{} ui_color is a CSS var token",
                t.as_str()
            );
            assert!(
                !m.required_fields.is_empty(),
                "{} declares required fields",
                t.as_str()
            );
            // Sigma-based types carry bands; others must not.
            match m.severity_basis {
                SeverityBasis::Sigma => assert!(
                    m.sigma_bands.is_some(),
                    "{} sigma basis needs bands",
                    t.as_str()
                ),
                _ => assert!(
                    m.sigma_bands.is_none(),
                    "{} non-sigma basis must not carry bands",
                    t.as_str()
                ),
            }
        }
    }

    #[test]
    fn sigma_bands_map_to_buckets() {
        let b = SIGMA_DEFAULT;
        assert_eq!(b.severity_for(1.0), None);
        assert_eq!(b.severity_for(1.6), Some(AnomalySeverity::Low));
        assert_eq!(b.severity_for(2.1), Some(AnomalySeverity::Medium));
        assert_eq!(b.severity_for(2.8), Some(AnomalySeverity::High));
        assert_eq!(b.severity_for(4.0), Some(AnomalySeverity::Critical));
    }

    #[test]
    fn labels_are_unique() {
        let mut labels: Vec<&str> = AnomalyType::ALL
            .iter()
            .map(|&t| meta_for(t).label)
            .collect();
        labels.sort_unstable();
        let before = labels.len();
        labels.dedup();
        assert_eq!(before, labels.len(), "labels must be unique");
    }
}
