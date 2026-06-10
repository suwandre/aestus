use anyhow::{Context, Result};
use reqwest::Client;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::snapshot::FeatureSnapshot;

// ── ClickHouse ───────────────────────────────────────────────────────────────

const TABLE: &str = "feature_snapshots";

/// Row shape for ClickHouse JSONEachRow insertion.
/// Nested columns (correlation_set, basis) use ClickHouse dot-notation keys.
#[derive(Serialize)]
struct ChRow<'a> {
    schema_version: u32,
    canonical_asset_id: &'a str,
    timestamp: &'a str,
    returns: &'a HashMap<String, f64>,
    volatility: &'a HashMap<String, f64>,
    z_scores: &'a HashMap<String, f64>,
    funding_z: Option<f64>,
    oi_delta: Option<f64>,
    volume_z: Option<f64>,
    #[serde(rename = "correlation_set.asset")]
    corr_asset: Vec<&'a str>,
    #[serde(rename = "correlation_set.correlation")]
    corr_correlation: Vec<f64>,
    #[serde(rename = "correlation_set.window")]
    corr_window: Vec<&'a str>,
    #[serde(rename = "basis.reference")]
    basis_reference: Vec<&'a str>,
    #[serde(rename = "basis.basis_bps")]
    basis_bps: Vec<f64>,
    regime_trend: &'a str,
    regime_volatility: &'a str,
    regime_risk: &'a str,
}

/// ClickHouse HTTP sink for feature snapshots.
pub struct ClickHouseSnapshotSink {
    client: Client,
    base_url: Option<String>,
}

impl ClickHouseSnapshotSink {
    pub fn new(url: Option<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("build reqwest client"),
            base_url: url,
        }
    }

    /// Write a batch of snapshots to ClickHouse as a single INSERT.
    /// No-op when no ClickHouse URL is configured (fixture-first).
    pub async fn write_batch(&self, snapshots: &[FeatureSnapshot]) -> Result<()> {
        if snapshots.is_empty() {
            return Ok(());
        }
        let Some(ref url) = self.base_url else {
            return Ok(());
        };

        let mut rows = Vec::with_capacity(snapshots.len());
        for snap in snapshots {
            let row = ChRow {
                schema_version: snap.schema_version,
                canonical_asset_id: &snap.canonical_asset_id,
                timestamp: &snap.timestamp,
                returns: &snap.returns,
                volatility: &snap.volatility,
                z_scores: &snap.z_scores,
                funding_z: snap.funding_z,
                oi_delta: snap.oi_delta,
                volume_z: snap.volume_z,
                corr_asset: snap
                    .correlation_set
                    .iter()
                    .map(|e| e.asset.as_str())
                    .collect(),
                corr_correlation: snap.correlation_set.iter().map(|e| e.correlation).collect(),
                corr_window: snap
                    .correlation_set
                    .iter()
                    .map(|e| e.window.as_str())
                    .collect(),
                basis_reference: snap.basis.iter().map(|e| e.reference.as_str()).collect(),
                basis_bps: snap.basis.iter().map(|e| e.basis_bps).collect(),
                regime_trend: snap.regime.trend.as_str(),
                regime_volatility: snap.regime.volatility.as_str(),
                regime_risk: snap.regime.risk.as_str(),
            };
            rows.push(serde_json::to_string(&row).context("serialize snapshot row")?);
        }

        let body = rows.join("\n");
        let query = format!("INSERT INTO {TABLE} FORMAT JSONEachRow");
        self.client
            .post(url)
            .query(&[("query", query.as_str())])
            .body(body)
            .send()
            .await
            .context("ClickHouse INSERT feature_snapshots")?
            .error_for_status()
            .context("ClickHouse error status")?;

        Ok(())
    }
}

// ── Redis ────────────────────────────────────────────────────────────────────

const REDIS_TTL: u64 = 3_600;

/// Redis store for latest feature snapshot per asset.
pub struct RedisSnapshotStore {
    conn: Option<Arc<Mutex<redis::Connection>>>,
}

impl RedisSnapshotStore {
    pub fn connect(url: Option<&str>) -> Self {
        let conn = url.and_then(|u| {
            redis::Client::open(u)
                .ok()
                .and_then(|c| c.get_connection().ok())
                .map(|c| Arc::new(Mutex::new(c)))
        });
        Self { conn }
    }

    /// Write the latest snapshot for `canonical_asset_id` to Redis.
    /// Key: `feature:snapshot:{canonical_asset_id}`, TTL: 1 hour.
    /// No-op when no Redis connection is available.
    pub fn write(&self, snapshot: &FeatureSnapshot) -> Result<()> {
        let Some(ref conn_arc) = self.conn else {
            return Ok(());
        };
        let key = format!("feature:snapshot:{}", snapshot.canonical_asset_id);
        let value = serde_json::to_string(snapshot).context("serialize snapshot for Redis")?;
        let mut conn = conn_arc
            .lock()
            .map_err(|_| anyhow::anyhow!("Redis lock poisoned"))?;
        redis::pipe()
            .set_ex(&key, &value, REDIS_TTL)
            .query::<()>(&mut *conn)
            .context("Redis SET EX feature snapshot")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn clickhouse_no_url_is_noop() {
        let sink = ClickHouseSnapshotSink::new(None);
        let snap =
            FeatureSnapshot::placeholder("crypto:btc-usdt".into(), "2026-06-07T00:00:00Z".into());
        sink.write_batch(&[snap])
            .await
            .expect("no-op should not error");
    }

    #[tokio::test]
    async fn clickhouse_empty_batch_is_noop() {
        let sink = ClickHouseSnapshotSink::new(None);
        sink.write_batch(&[]).await.expect("empty batch is noop");
    }

    #[test]
    fn redis_no_url_is_noop() {
        let store = RedisSnapshotStore::connect(None);
        let snap =
            FeatureSnapshot::placeholder("crypto:btc-usdt".into(), "2026-06-07T00:00:00Z".into());
        store.write(&snap).expect("no-op should not error");
    }
}
