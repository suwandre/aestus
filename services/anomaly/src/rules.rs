//! Detector rule configuration (P10-T003+; storage/reload in P10-T017).
//!
//! Holds the deterministic thresholds every detector reads. Defaults live here
//! (seed values); P10-T017 adds Postgres-backed user overrides loaded at
//! startup/reload. Per-asset overrides let the user tune sensitivity per market
//! (e.g. a tighter funding band on BTC than on a thin alt).

use std::collections::HashMap;

/// Funding-spike rule: fire when `|funding_z| >= z_threshold`.
#[derive(Debug, Clone, Copy)]
pub struct FundingRule {
    pub z_threshold: f64,
}

impl Default for FundingRule {
    fn default() -> Self {
        Self { z_threshold: 2.0 }
    }
}

/// All detector thresholds. Cheap to clone; passed by reference to detectors.
#[derive(Debug, Clone)]
pub struct RulesConfig {
    /// Global funding-spike rule.
    pub funding: FundingRule,
    /// Per-asset funding overrides, keyed by `canonical_asset_id`.
    pub funding_overrides: HashMap<String, FundingRule>,
    /// OI surge: fire when `|oi_delta| >= oi_delta_threshold` (fraction, e.g. 0.05 = 5%).
    pub oi_delta_threshold: f64,
    /// Volume anomaly: fire when `volume_z >= volume_z_threshold`.
    pub volume_z_threshold: f64,
    /// Liquidation cluster: min aggregate size and proximity to mid (fraction).
    pub liq_cluster_min_size: f64,
    pub liq_cluster_proximity_pct: f64,
    /// Basis dislocation: fire when cross-venue basis spread (bps) >= threshold.
    pub basis_spread_bps_threshold: f64,
    /// Correlation break: fire when `|correlation|` departs the baseline by >= this.
    pub correlation_break_delta: f64,
    /// Macro approaching: lead-time window (minutes) and minimum importance.
    pub macro_window_minutes: i64,
    pub macro_min_importance: Importance,
    /// Whale flow: min absolute USD value to flag an on-chain move.
    pub whale_min_amount_usd: f64,
    /// News cluster: min items sharing an entity within the window (minutes) at
    /// or above the relevance floor.
    pub news_cluster_min_items: usize,
    pub news_cluster_window_minutes: i64,
    pub news_cluster_min_relevance: f64,
    /// Dedupe cooldown: an identical (type, asset) anomaly is re-emitted at most
    /// once per this many minutes; repeats inside the window bump count/last_seen.
    pub cooldown_minutes: i64,
}

/// Macro importance ordering (low < medium < high). Mirrors `MacroImportance`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Importance {
    Low,
    Medium,
    High,
}

impl Importance {
    /// Parse the contract string; unknown values are treated as `Low`.
    #[must_use]
    pub fn parse(s: &str) -> Self {
        match s {
            "high" => Self::High,
            "medium" => Self::Medium,
            _ => Self::Low,
        }
    }
}

impl Default for RulesConfig {
    fn default() -> Self {
        Self {
            funding: FundingRule::default(),
            funding_overrides: HashMap::new(),
            oi_delta_threshold: 0.05,
            volume_z_threshold: 2.0,
            liq_cluster_min_size: 1.0,
            liq_cluster_proximity_pct: 0.03,
            basis_spread_bps_threshold: 3.0,
            correlation_break_delta: 0.5,
            macro_window_minutes: 60,
            macro_min_importance: Importance::High,
            whale_min_amount_usd: 50_000_000.0,
            news_cluster_min_items: 2,
            news_cluster_window_minutes: 120,
            news_cluster_min_relevance: 0.5,
            cooldown_minutes: 30,
        }
    }
}

impl RulesConfig {
    /// Effective funding rule for an asset (override if present, else global).
    #[must_use]
    pub fn funding_for(&self, asset: &str) -> FundingRule {
        self.funding_overrides
            .get(asset)
            .copied()
            .unwrap_or(self.funding)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sensible() {
        let r = RulesConfig::default();
        assert_eq!(r.funding.z_threshold, 2.0);
        assert_eq!(r.macro_min_importance, Importance::High);
    }

    #[test]
    fn per_asset_funding_override_wins() {
        let mut r = RulesConfig::default();
        r.funding_overrides
            .insert("crypto:btc-usdt".into(), FundingRule { z_threshold: 3.0 });
        assert_eq!(r.funding_for("crypto:btc-usdt").z_threshold, 3.0);
        assert_eq!(r.funding_for("crypto:eth-usdt").z_threshold, 2.0);
    }

    #[test]
    fn importance_orders_correctly() {
        assert!(Importance::High > Importance::Medium);
        assert!(Importance::Medium > Importance::Low);
        assert_eq!(Importance::parse("high"), Importance::High);
        assert_eq!(Importance::parse("garbage"), Importance::Low);
    }
}
