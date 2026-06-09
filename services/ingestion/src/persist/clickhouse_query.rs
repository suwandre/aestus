//! ClickHouse SELECT query builder for the normalized-events explorer (P08-T007).
//!
//! Builds and executes parameterised queries against `normalized_market_events`
//! via the ClickHouse HTTP interface. Returns raw JSON rows; the health-server
//! layer serialises them into the API response.
//!
//! When `base_url` is `None` (fixture/dev mode) every query returns an empty
//! result set so the endpoint stays functional without a live database.

use anyhow::{Context, Result};
use reqwest::Client;
use std::time::Duration;

const TABLE: &str = "normalized_market_events";

/// Query parameters for the normalized-events explorer endpoint.
#[derive(Debug, Clone, Default)]
pub struct NormalizedEventsQuery {
    /// Filter by canonical asset id, e.g. `crypto:btc-usdt`.
    pub asset: Option<String>,
    /// Filter by venue, e.g. `binance`.
    pub venue: Option<String>,
    /// Filter by event type, e.g. `trade`.
    pub event_type: Option<String>,
    /// Return only events at or after this RFC-3339 timestamp.
    pub from: Option<String>,
    /// Maximum rows to return (default: 100, hard cap: 1000).
    pub limit: Option<u32>,
}

impl NormalizedEventsQuery {
    /// Build the ClickHouse SQL SELECT statement.
    #[must_use]
    pub fn to_sql(&self) -> String {
        let limit = self.limit.unwrap_or(100).min(1000);
        let mut wheres: Vec<String> = Vec::new();

        if let Some(ref a) = self.asset {
            wheres.push(format!("canonical_asset_id = '{}'", escape_single(a)));
        }
        if let Some(ref v) = self.venue {
            wheres.push(format!("venue = '{}'", escape_single(v)));
        }
        if let Some(ref t) = self.event_type {
            // The JSONEachRow event_type is stored in the discriminant column.
            wheres.push(format!("event_type = '{}'", escape_single(t)));
        }
        if let Some(ref f) = self.from {
            wheres.push(format!("timestamp >= '{}'", escape_single(f)));
        }

        let where_clause = if wheres.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", wheres.join(" AND "))
        };

        format!(
            "SELECT * FROM {TABLE} {where_clause} ORDER BY timestamp DESC LIMIT {limit} \
             FORMAT JSONEachRow"
        )
    }

    /// Execute the query against ClickHouse and return raw JSON rows.
    ///
    /// Returns an empty `Vec` when `base_url` is `None` (fixture mode).
    pub async fn execute(
        &self,
        base_url: Option<&str>,
    ) -> Result<Vec<serde_json::Value>> {
        let Some(url) = base_url else {
            return Ok(vec![]);
        };

        let sql = self.to_sql();
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .context("build reqwest client")?;

        let response = client
            .get(url)
            .query(&[("query", sql.as_str())])
            .send()
            .await
            .context("ClickHouse HTTP GET")?
            .error_for_status()
            .context("ClickHouse returned error status")?
            .text()
            .await
            .context("read ClickHouse response")?;

        // ClickHouse JSONEachRow: one JSON object per line.
        let rows = response
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
            .collect();

        Ok(rows)
    }
}

/// Escape single quotes in a SQL string literal to prevent injection.
/// ClickHouse uses `''` for literal single quotes inside strings.
fn escape_single(s: &str) -> String {
    s.replace('\'', "''")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_query_selects_all_with_default_limit() {
        let q = NormalizedEventsQuery::default();
        let sql = q.to_sql();
        assert!(sql.contains("SELECT * FROM normalized_market_events"));
        assert!(sql.contains("LIMIT 100"));
        assert!(!sql.contains("WHERE"));
    }

    #[test]
    fn asset_filter_adds_where_clause() {
        let q = NormalizedEventsQuery {
            asset: Some("crypto:btc-usdt".into()),
            ..Default::default()
        };
        let sql = q.to_sql();
        assert!(sql.contains("canonical_asset_id = 'crypto:btc-usdt'"));
        assert!(sql.contains("WHERE"));
    }

    #[test]
    fn multiple_filters_are_joined_with_and() {
        let q = NormalizedEventsQuery {
            asset: Some("crypto:btc-usdt".into()),
            venue: Some("binance".into()),
            event_type: Some("trade".into()),
            ..Default::default()
        };
        let sql = q.to_sql();
        assert!(sql.contains("canonical_asset_id = 'crypto:btc-usdt'"));
        assert!(sql.contains("venue = 'binance'"));
        assert!(sql.contains("event_type = 'trade'"));
        // All three joined with AND
        assert_eq!(sql.matches(" AND ").count(), 2);
    }

    #[test]
    fn limit_is_capped_at_1000() {
        let q = NormalizedEventsQuery {
            limit: Some(9999),
            ..Default::default()
        };
        let sql = q.to_sql();
        assert!(sql.contains("LIMIT 1000"));
        assert!(!sql.contains("LIMIT 9999"));
    }

    #[test]
    fn single_quotes_in_input_are_escaped() {
        let q = NormalizedEventsQuery {
            asset: Some("it's weird".into()),
            ..Default::default()
        };
        let sql = q.to_sql();
        assert!(sql.contains("'it''s weird'"));
        assert!(!sql.contains("'it's weird'"));
    }

    #[test]
    fn from_filter_adds_timestamp_condition() {
        let q = NormalizedEventsQuery {
            from: Some("2026-06-09T00:00:00Z".into()),
            ..Default::default()
        };
        let sql = q.to_sql();
        assert!(sql.contains("timestamp >= '2026-06-09T00:00:00Z'"));
    }

    #[tokio::test]
    async fn execute_no_url_returns_empty() {
        let q = NormalizedEventsQuery::default();
        let rows = q.execute(None).await.unwrap();
        assert!(rows.is_empty());
    }
}
