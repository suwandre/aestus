use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrelationEntry {
    pub asset: String,
    pub correlation: f64,
    pub window: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BasisEntry {
    pub reference: String,
    pub basis_bps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrendRegime {
    TrendingUp,
    TrendingDown,
    Ranging,
}

impl TrendRegime {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TrendingUp => "trending_up",
            Self::TrendingDown => "trending_down",
            Self::Ranging => "ranging",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VolatilityRegime {
    VeryLow,
    Low,
    Normal,
    High,
    Extreme,
}

impl VolatilityRegime {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::VeryLow => "very_low",
            Self::Low => "low",
            Self::Normal => "normal",
            Self::High => "high",
            Self::Extreme => "extreme",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskRegime {
    RiskOn,
    RiskOff,
    Neutral,
}

impl RiskRegime {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RiskOn => "risk_on",
            Self::RiskOff => "risk_off",
            Self::Neutral => "neutral",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Regime {
    pub trend: TrendRegime,
    pub volatility: VolatilityRegime,
    pub risk: RiskRegime,
}

impl Default for Regime {
    fn default() -> Self {
        Self {
            trend: TrendRegime::Ranging,
            volatility: VolatilityRegime::Normal,
            risk: RiskRegime::Neutral,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquidationCluster {
    pub price_low: f64,
    pub price_high: f64,
    pub total_size: f64,
    pub side: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureSnapshot {
    pub schema_version: u32,
    pub canonical_asset_id: String,
    pub timestamp: String,
    #[serde(default)]
    pub returns: HashMap<String, f64>,
    #[serde(default)]
    pub volatility: HashMap<String, f64>,
    #[serde(default)]
    pub z_scores: HashMap<String, f64>,
    #[serde(default)]
    pub funding_z: Option<f64>,
    #[serde(default)]
    pub oi_delta: Option<f64>,
    #[serde(default)]
    pub volume_z: Option<f64>,
    #[serde(default)]
    pub correlation_set: Vec<CorrelationEntry>,
    #[serde(default)]
    pub basis: Vec<BasisEntry>,
    pub regime: Regime,
    #[serde(default)]
    pub liq_clusters: Vec<LiquidationCluster>,
    #[serde(default)]
    pub oi_state: Option<String>,
    #[serde(default)]
    pub funding_spread: Option<f64>,
    #[serde(default)]
    pub breadth_up_pct: Option<f64>,
    #[serde(default)]
    pub breadth_down_pct: Option<f64>,
}

impl FeatureSnapshot {
    pub fn placeholder(canonical_asset_id: String, timestamp: String) -> Self {
        Self {
            schema_version: 1,
            canonical_asset_id,
            timestamp,
            returns: HashMap::new(),
            volatility: HashMap::new(),
            z_scores: HashMap::new(),
            funding_z: None,
            oi_delta: None,
            volume_z: None,
            correlation_set: Vec::new(),
            basis: Vec::new(),
            regime: Regime::default(),
            liq_clusters: Vec::new(),
            oi_state: None,
            funding_spread: None,
            breadth_up_pct: None,
            breadth_down_pct: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_roundtrips_json() {
        let snap =
            FeatureSnapshot::placeholder("crypto:btc-usdt".into(), "2026-06-07T12:00:00Z".into());
        let json = serde_json::to_string(&snap).expect("serialize");
        let back: FeatureSnapshot = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.canonical_asset_id, "crypto:btc-usdt");
        assert_eq!(back.schema_version, 1);
    }

    #[test]
    fn trend_regime_serializes_snake_case() {
        let t = TrendRegime::TrendingUp;
        let json = serde_json::to_string(&t).expect("serialize");
        assert_eq!(json, "\"trending_up\"");
        assert_eq!(t.as_str(), "trending_up");
    }

    #[test]
    fn regime_default_is_ranging_normal_neutral() {
        let r = Regime::default();
        assert_eq!(r.trend.as_str(), "ranging");
        assert_eq!(r.volatility.as_str(), "normal");
        assert_eq!(r.risk.as_str(), "neutral");
    }
}
