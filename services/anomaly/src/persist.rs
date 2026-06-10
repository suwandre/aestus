//! Anomaly persistence (P10-T015).
//!
//! - **Postgres** (`anomalies` + `anomaly_context_refs`, migration 0005/0011) is
//!   the durable inbox: anomalies are upserted by id so status survives a
//!   restart, and [`PostgresAnomalySink::load_active`] reloads the open inbox on
//!   startup. The canonical anomaly record.
//! - **ClickHouse** (`anomaly_metrics`, migration 0005) is the analytics side:
//!   one row per trigger capturing severity/sigma and the feature state behind
//!   the anomaly.
//!
//! Both sinks are no-ops when their URL is unset (fixture-first hard rule).
//! Connections are opened per call — fine at the engine's evaluation cadence.

use std::collections::HashMap;

use anyhow::{Context, Result};
use reqwest::Client;
use serde::Serialize;
use std::time::Duration;

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyStatus, AnomalyType};
use crate::input::FeatureSnapshot;
use crate::rules::RuleRow;

// ── Postgres inbox ────────────────────────────────────────────────────────────

/// Map a context-ref string to the `anomaly_context_ref_type` enum by prefix.
/// Returns `None` for refs we don't model as typed links (they are still kept on
/// the in-memory anomaly's `context_refs`).
fn ref_type_of(r: &str) -> Option<&'static str> {
    let prefix = r.split(':').next().unwrap_or("");
    match prefix {
        "feature" => Some("feature"),
        "macro" => Some("macro"),
        "news" => Some("news"),
        "onchain" | "on_chain" => Some("on_chain"),
        "market" => Some("market"),
        "historical" => Some("historical"),
        _ => None,
    }
}

/// Postgres durable sink for the anomaly inbox. No-op when `db_url` is `None`.
pub struct PostgresAnomalySink {
    db_url: Option<String>,
}

impl PostgresAnomalySink {
    #[must_use]
    pub fn new(db_url: Option<String>) -> Self {
        Self { db_url }
    }

    #[must_use]
    pub fn is_enabled(&self) -> bool {
        self.db_url.is_some()
    }

    /// Upsert an anomaly and its typed context refs. Status/severity are updated
    /// on conflict so a re-fire reflects the latest assessment.
    pub async fn upsert_anomaly(&self, a: &AnomalyEvent) -> Result<()> {
        let Some(ref url) = self.db_url else {
            return Ok(());
        };
        let (client, conn) = tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!(error = %e, "postgres connection error");
            }
        });

        client
            .execute(
                "INSERT INTO anomalies \
                 (id, type, severity, sigma, assets, venues, title, description, \
                  detected_at, status, rule_ref) \
                 VALUES ($1,$2::anomaly_type,$3::anomaly_severity,$4,$5,$6,$7,$8,\
                         $9::timestamptz,$10::anomaly_status,$11) \
                 ON CONFLICT (id) DO UPDATE SET \
                   severity   = EXCLUDED.severity, \
                   status     = EXCLUDED.status, \
                   updated_at = now()",
                &[
                    &a.id,
                    &a.anomaly_type.as_str(),
                    &a.severity.as_str(),
                    &a.sigma,
                    &a.assets,
                    &a.venues,
                    &a.title,
                    &a.description,
                    &a.detected_at.as_str(),
                    &a.status.as_str(),
                    &a.rule_ref,
                ],
            )
            .await
            .context("upsert anomaly")?;

        for r in &a.context_refs {
            if let Some(ref_type) = ref_type_of(r) {
                client
                    .execute(
                        "INSERT INTO anomaly_context_refs (anomaly_id, ref_type, ref) \
                         VALUES ($1, $2::anomaly_context_ref_type, $3) \
                         ON CONFLICT DO NOTHING",
                        &[&a.id, &ref_type, r],
                    )
                    .await
                    .context("insert anomaly context ref")?;
            }
        }
        Ok(())
    }

    /// Update just the status (+ `updated_at`) of an existing anomaly by id, so a
    /// status change driven by the API/UI survives a restart (P10-T014). Returns
    /// whether a row was updated; `false` (not an error) when no DB is configured.
    pub async fn update_status(&self, id: &str, status: AnomalyStatus) -> Result<bool> {
        let Some(ref url) = self.db_url else {
            return Ok(false);
        };
        let (client, conn) = tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!(error = %e, "postgres connection error");
            }
        });
        let n = client
            .execute(
                "UPDATE anomalies SET status = $2::anomaly_status, updated_at = now() \
                 WHERE id = $1",
                &[&id, &status.as_str()],
            )
            .await
            .context("update anomaly status")?;
        Ok(n > 0)
    }

    /// Load enabled user-defined rule rows from `alert_rules` (P10-T017). Empty
    /// when no DB — the engine then runs on built-in defaults.
    pub async fn load_alert_rules(&self) -> Result<Vec<RuleRow>> {
        let Some(ref url) = self.db_url else {
            return Ok(Vec::new());
        };
        let (client, conn) = tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!(error = %e, "postgres connection error");
            }
        });
        let rows = client
            .query(
                "SELECT condition, canonical_asset_id, params, enabled \
                 FROM alert_rules WHERE enabled = TRUE",
                &[],
            )
            .await
            .context("load alert_rules")?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let params_json: serde_json::Value = row.get(2);
            out.push(RuleRow {
                condition: row.get(0),
                canonical_asset_id: row.get(1),
                params: params_json,
                enabled: row.get(3),
            });
        }
        Ok(out)
    }

    /// Reload the open inbox (non-terminal statuses) so a restart does not lose
    /// active anomalies or re-alert ones already seen. Empty when no DB.
    pub async fn load_active(&self) -> Result<Vec<AnomalyEvent>> {
        let Some(ref url) = self.db_url else {
            return Ok(Vec::new());
        };
        let (client, conn) = tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!(error = %e, "postgres connection error");
            }
        });

        let rows = client
            .query(
                "SELECT a.id, a.type::text, a.severity::text, a.sigma, a.assets, a.venues, \
                        a.title, a.description, a.detected_at::text, a.status::text, a.rule_ref, \
                        COALESCE(array_agg(r.ref) FILTER (WHERE r.ref IS NOT NULL), '{}') AS refs \
                 FROM anomalies a \
                 LEFT JOIN anomaly_context_refs r ON r.anomaly_id = a.id \
                 WHERE a.status NOT IN ('resolved','expired','dismissed') \
                 GROUP BY a.id",
                &[],
            )
            .await
            .context("load active anomalies")?;

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let type_s: String = row.get(1);
            let sev_s: String = row.get(2);
            let status_s: String = row.get(9);
            out.push(AnomalyEvent {
                id: row.get(0),
                anomaly_type: AnomalyType::from_str(&type_s).unwrap_or(AnomalyType::FundingSpike),
                severity: AnomalySeverity::from_str(&sev_s).unwrap_or(AnomalySeverity::Low),
                sigma: row.get(3),
                assets: row.get(4),
                venues: row.get(5),
                title: row.get(6),
                description: row.get(7),
                detected_at: row.get(8),
                status: AnomalyStatus::from_str(&status_s).unwrap_or(AnomalyStatus::Active),
                context_refs: row.get(11),
                rule_ref: row.get(10),
            });
        }
        Ok(out)
    }
}

// ── ClickHouse anomaly metrics ────────────────────────────────────────────────

const METRICS_TABLE: &str = "anomaly_metrics";

#[derive(Serialize)]
struct MetricRow<'a> {
    anomaly_id: &'a str,
    #[serde(rename = "type")]
    anomaly_type: &'a str,
    severity: &'a str,
    sigma: Option<f64>,
    canonical_asset_id: &'a str,
    detected_at: &'a str,
    funding_z: Option<f64>,
    oi_delta: Option<f64>,
    volume_z: Option<f64>,
    feature_values: HashMap<String, f64>,
    regime_trend: String,
    regime_volatility: String,
    regime_risk: String,
}

/// ClickHouse sink for anomaly metric snapshots. No-op when `base_url` is `None`.
pub struct ClickHouseAnomalyMetrics {
    client: Client,
    base_url: Option<String>,
}

impl ClickHouseAnomalyMetrics {
    #[must_use]
    pub fn new(url: Option<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            base_url: url,
        }
    }

    /// Build the metric row for an anomaly, enriched with the triggering feature
    /// snapshot when available.
    fn row<'a>(a: &'a AnomalyEvent, snap: Option<&'a FeatureSnapshot>) -> MetricRow<'a> {
        let asset = a.assets.first().map(String::as_str).unwrap_or("");
        let mut feature_values = HashMap::new();
        if let Some(s) = snap {
            for (k, v) in &s.z_scores {
                feature_values.insert(format!("z.{k}"), *v);
            }
            for (k, v) in &s.returns {
                feature_values.insert(format!("ret.{k}"), *v);
            }
        }
        let regime = snap.map(|s| &s.regime);
        MetricRow {
            anomaly_id: &a.id,
            anomaly_type: a.anomaly_type.as_str(),
            severity: a.severity.as_str(),
            sigma: a.sigma,
            canonical_asset_id: asset,
            detected_at: &a.detected_at,
            funding_z: snap.and_then(|s| s.funding_z),
            oi_delta: snap.and_then(|s| s.oi_delta),
            volume_z: snap.and_then(|s| s.volume_z),
            feature_values,
            regime_trend: regime
                .and_then(|r| r.trend.clone())
                .unwrap_or_else(|| "unknown".into()),
            regime_volatility: regime
                .and_then(|r| r.volatility.clone())
                .unwrap_or_else(|| "unknown".into()),
            regime_risk: regime
                .and_then(|r| r.risk.clone())
                .unwrap_or_else(|| "unknown".into()),
        }
    }

    /// Write one metric snapshot row. `snap` is the feature snapshot that
    /// triggered the anomaly, if available (enriches feature columns).
    pub async fn write_metric(
        &self,
        anomaly: &AnomalyEvent,
        snap: Option<&FeatureSnapshot>,
    ) -> Result<()> {
        let Some(ref url) = self.base_url else {
            return Ok(());
        };
        let row = Self::row(anomaly, snap);
        let body = serde_json::to_string(&row).context("serialize anomaly metric row")?;
        let query = format!("INSERT INTO {METRICS_TABLE} FORMAT JSONEachRow");
        self.client
            .post(url)
            .query(&[("query", query.as_str())])
            .body(body)
            .send()
            .await
            .context("ClickHouse INSERT anomaly_metrics")?
            .error_for_status()
            .context("ClickHouse error status")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::detectors::new_anomaly;

    fn sample() -> AnomalyEvent {
        new_anomaly(
            AnomalyType::FundingSpike,
            AnomalySeverity::High,
            Some(2.6),
            vec!["crypto:btc-usdt".into()],
            vec!["binance".into()],
            "Funding spike".into(),
            "z 2.6".into(),
            "2026-06-07T12:00:00Z".into(),
            vec!["feature:crypto:btc-usdt:2026-06-07T12:00:00Z".into()],
            Some("rule:funding_z>2.0".into()),
        )
    }

    #[test]
    fn ref_type_mapping() {
        assert_eq!(ref_type_of("feature:crypto:btc-usdt:t"), Some("feature"));
        assert_eq!(ref_type_of("onchain:whale_transfer:abcd"), Some("on_chain"));
        assert_eq!(ref_type_of("macro:us-cpi"), Some("macro"));
        assert_eq!(ref_type_of("oi_state:oi_increasing"), None);
    }

    #[tokio::test]
    async fn postgres_no_url_is_noop() {
        let sink = PostgresAnomalySink::new(None);
        assert!(!sink.is_enabled());
        sink.upsert_anomaly(&sample()).await.expect("noop upsert");
        assert!(sink.load_active().await.expect("noop load").is_empty());
        // Status update is a no-op (false) without a DB, never an error.
        assert!(!sink
            .update_status("anom-001", AnomalyStatus::Dismissed)
            .await
            .expect("noop status update"));
    }

    #[tokio::test]
    async fn clickhouse_no_url_is_noop() {
        let sink = ClickHouseAnomalyMetrics::new(None);
        sink.write_metric(&sample(), None)
            .await
            .expect("noop metric");
    }

    #[test]
    fn metric_row_uses_unknown_regime_without_snapshot() {
        let a = sample();
        let row = ClickHouseAnomalyMetrics::row(&a, None);
        assert_eq!(row.regime_trend, "unknown");
        assert_eq!(row.anomaly_type, "funding_spike");
        assert_eq!(row.canonical_asset_id, "crypto:btc-usdt");
    }
}
