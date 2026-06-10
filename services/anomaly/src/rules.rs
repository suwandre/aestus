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
    /// Per-asset priority (0..1) feeding severity scoring; higher = the user
    /// cares more. Defaults below; unknown assets fall back to `asset_priority_default`.
    pub asset_priority: HashMap<String, f64>,
    pub asset_priority_default: f64,
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
            asset_priority: HashMap::from([
                ("crypto:btc-usdt".to_string(), 1.0),
                ("crypto:eth-usdt".to_string(), 0.9),
                ("crypto:sol-usdt".to_string(), 0.7),
            ]),
            asset_priority_default: 0.5,
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

    /// Priority (0..1) for an asset, falling back to the default.
    #[must_use]
    pub fn priority_for(&self, asset: &str) -> f64 {
        self.asset_priority
            .get(asset)
            .copied()
            .unwrap_or(self.asset_priority_default)
    }

    /// Overlay defaults with the user-defined rules loaded from Postgres
    /// (`alert_rules`). Disabled rows are ignored. Unknown conditions/params are
    /// skipped so an unrecognised rule never breaks the engine (P10-T017).
    #[must_use]
    pub fn with_rules(rows: &[RuleRow]) -> Self {
        let mut cfg = Self::default();
        for row in rows {
            cfg.apply_rule(row);
        }
        cfg
    }

    /// Apply one stored rule row, mutating the matching threshold.
    pub fn apply_rule(&mut self, row: &RuleRow) {
        if !row.enabled {
            return;
        }
        let num = |k: &str| row.params.get(k).and_then(serde_json::Value::as_f64);
        match row.condition.as_str() {
            "funding_spike" => {
                if let Some(z) = num("sigma")
                    .or_else(|| num("z"))
                    .or_else(|| num("threshold"))
                {
                    match &row.canonical_asset_id {
                        Some(asset) => {
                            self.funding_overrides
                                .insert(asset.clone(), FundingRule { z_threshold: z });
                        }
                        None => self.funding.z_threshold = z,
                    }
                }
            }
            "oi_surge" => {
                if let Some(d) = num("oi_delta").or_else(|| num("threshold")) {
                    self.oi_delta_threshold = d;
                }
            }
            "volume_anomaly" => {
                if let Some(z) = num("sigma")
                    .or_else(|| num("z"))
                    .or_else(|| num("threshold"))
                {
                    self.volume_z_threshold = z;
                }
            }
            "basis_dislocation" => {
                if let Some(b) = num("bps").or_else(|| num("threshold")) {
                    self.basis_spread_bps_threshold = b;
                }
            }
            "correlation_break" => {
                if let Some(d) = num("delta").or_else(|| num("threshold")) {
                    self.correlation_break_delta = d;
                }
            }
            "liquidation_cluster" => {
                if let Some(s) = num("min_size").or_else(|| num("threshold")) {
                    self.liq_cluster_min_size = s;
                }
            }
            "whale_flow" | "exchange_flow" => {
                if let Some(u) = num("amount_usd").or_else(|| num("threshold")) {
                    self.whale_min_amount_usd = u;
                }
            }
            "news_cluster" => {
                if let Some(n) = num("min_items") {
                    self.news_cluster_min_items = n.max(1.0) as usize;
                }
                if let Some(r) = num("min_relevance") {
                    self.news_cluster_min_relevance = r;
                }
                if let Some(w) = num("window_minutes") {
                    self.news_cluster_window_minutes = w as i64;
                }
            }
            "macro_approaching" => {
                if let Some(m) = num("lead_minutes").or_else(|| num("window_minutes")) {
                    self.macro_window_minutes = m as i64;
                }
                if let Some(imp) = row.params.get("importance").and_then(|v| v.as_str()) {
                    self.macro_min_importance = Importance::parse(imp);
                }
            }
            "cooldown" => {
                if let Some(m) = num("minutes") {
                    self.cooldown_minutes = m as i64;
                }
            }
            _ => {}
        }
    }
}

/// A user-defined rule row loaded from Postgres `alert_rules`.
#[derive(Debug, Clone)]
pub struct RuleRow {
    pub condition: String,
    pub canonical_asset_id: Option<String>,
    pub params: serde_json::Value,
    pub enabled: bool,
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

    fn rule(condition: &str, asset: Option<&str>, params: serde_json::Value) -> RuleRow {
        RuleRow {
            condition: condition.into(),
            canonical_asset_id: asset.map(str::to_string),
            params,
            enabled: true,
        }
    }

    #[test]
    fn rules_overlay_changes_thresholds() {
        let rows = vec![
            rule(
                "funding_spike",
                Some("crypto:btc-usdt"),
                serde_json::json!({"sigma": 3.5}),
            ),
            rule("oi_surge", None, serde_json::json!({"oi_delta": 0.12})),
            rule("volume_anomaly", None, serde_json::json!({"sigma": 4.0})),
            rule(
                "macro_approaching",
                None,
                serde_json::json!({"lead_minutes": 15, "importance": "medium"}),
            ),
            rule("cooldown", None, serde_json::json!({"minutes": 90})),
        ];
        let cfg = RulesConfig::with_rules(&rows);
        assert_eq!(cfg.funding_for("crypto:btc-usdt").z_threshold, 3.5);
        assert_eq!(cfg.funding_for("crypto:eth-usdt").z_threshold, 2.0); // default
        assert_eq!(cfg.oi_delta_threshold, 0.12);
        assert_eq!(cfg.volume_z_threshold, 4.0);
        assert_eq!(cfg.macro_window_minutes, 15);
        assert_eq!(cfg.macro_min_importance, Importance::Medium);
        assert_eq!(cfg.cooldown_minutes, 90);
    }

    #[test]
    fn disabled_rule_is_ignored() {
        let mut row = rule("funding_spike", None, serde_json::json!({"sigma": 9.9}));
        row.enabled = false;
        let cfg = RulesConfig::with_rules(&[row]);
        assert_eq!(cfg.funding.z_threshold, 2.0);
    }

    #[test]
    fn unknown_condition_is_skipped() {
        let cfg = RulesConfig::with_rules(&[rule("not_a_rule", None, serde_json::json!({"x": 1}))]);
        assert_eq!(cfg.funding.z_threshold, 2.0);
    }
}
