//! Liquidation cluster detector (P10-T006).
//!
//! Fires when a snapshot carries a bucketed liquidation cluster (computed
//! upstream by the features service, P09-T009) whose aggregate size crosses the
//! configured threshold. The features service already buckets clusters near the
//! mid price, so a cluster present in the snapshot is by construction "near
//! price"; this detector flags the large ones and labels which side of price
//! they sit on.
//!
//! Side convention (from the upstream liquidation `side`): a `buy`-side cluster
//! is short positions being force-bought, which sits **above** current price; a
//! `sell`-side cluster is longs being force-sold, **below** price.

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::input::LiquidationCluster;
use crate::rules::RulesConfig;
use crate::state::EngineState;

fn side_position(side: &str) -> &'static str {
    match side {
        "buy" => "above current price (short liquidations)",
        "sell" => "below current price (long liquidations)",
        _ => "near current price",
    }
}

fn severity_for(size: f64, threshold: f64) -> AnomalySeverity {
    let ratio = if threshold > 0.0 {
        size / threshold
    } else {
        size
    };
    if ratio >= 100.0 {
        AnomalySeverity::High
    } else if ratio >= 10.0 {
        AnomalySeverity::Medium
    } else {
        AnomalySeverity::Low
    }
}

#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    for snap in state.snapshots.values() {
        // Largest qualifying cluster per asset (avoid spamming one per bucket).
        let largest: Option<&LiquidationCluster> = snap
            .liq_clusters
            .iter()
            .filter(|c| c.total_size >= rules.liq_cluster_min_size)
            .max_by(|a, b| a.total_size.total_cmp(&b.total_size));
        let Some(cluster) = largest else { continue };

        let severity = severity_for(cluster.total_size, rules.liq_cluster_min_size);
        let position = side_position(&cluster.side);
        let description = format!(
            "Liquidation cluster of {:.1} units between {:.0} and {:.0}, {position}.",
            cluster.total_size, cluster.price_low, cluster.price_high
        );
        out.push(new_anomaly(
            AnomalyType::LiquidationCluster,
            severity,
            None,
            vec![snap.canonical_asset_id.clone()],
            Vec::new(),
            "Liquidation cluster".to_string(),
            description,
            snap.timestamp.clone(),
            vec![format!(
                "feature:{}:{}",
                snap.canonical_asset_id, snap.timestamp
            )],
            Some(format!(
                "rule:liq_cluster_size>{:.0}",
                rules.liq_cluster_min_size
            )),
        ));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_cluster_above_price_emits_liquidation_cluster() {
        let mut st = EngineState::new();
        for snap in crate::detectors::test_support::load_snapshots() {
            st.ingest_snapshot(snap);
        }
        let out = detect(&st, &RulesConfig::default());
        let btc = out
            .iter()
            .find(|a| a.assets.iter().any(|x| x == "crypto:btc-usdt"))
            .expect("BTC liquidation cluster fires");
        assert_eq!(btc.anomaly_type, AnomalyType::LiquidationCluster);
        // The 820.5-unit buy-side cluster (above price) wins over the small one.
        assert!(
            btc.description.contains("above current price"),
            "desc: {}",
            btc.description
        );
        btc.validate().expect("valid");
    }

    #[test]
    fn no_clusters_does_not_fire() {
        use crate::input::FeatureSnapshot;
        let mut st = EngineState::new();
        let snap: FeatureSnapshot = serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": "macro:spx",
            "timestamp": "2026-06-07T12:00:00Z",
            "regime": {}
        }))
        .expect("snapshot");
        st.ingest_snapshot(snap);
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }

    #[test]
    fn tiny_cluster_below_threshold_is_skipped() {
        use crate::input::FeatureSnapshot;
        let mut st = EngineState::new();
        let snap: FeatureSnapshot = serde_json::from_value(serde_json::json!({
            "schema_version": 1,
            "canonical_asset_id": "crypto:eth-usdt",
            "timestamp": "2026-06-07T12:00:00Z",
            "liq_clusters": [
                { "price_low": 3400, "price_high": 3410, "total_size": 0.2, "side": "sell" }
            ],
            "regime": {}
        }))
        .expect("snapshot");
        st.ingest_snapshot(snap);
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }
}
