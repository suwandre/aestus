//! HTTP health + metrics + data explorer + data-quality endpoints
//! (P06-T001/T016, P08-T007/T008).

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::feed_health::{FeedHealth, FeedState};
use crate::metrics;
use crate::persist::clickhouse_query::NormalizedEventsQuery;

/// Shared state injected into all HTTP handlers.
#[derive(Clone)]
pub struct AppState {
    pub clickhouse_url: Option<String>,
    pub feed_health: FeedHealth,
    pub stale_threshold_secs: u64,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "ingestion",
    })
}

async fn metrics_handler() -> String {
    metrics::gather_text()
}

/// Query parameters for `/data/normalized-events`.
#[derive(Debug, Deserialize)]
pub struct NormalizedEventsParams {
    pub asset: Option<String>,
    pub venue: Option<String>,
    /// Event type, e.g. `trade`, `price_tick`.
    #[serde(rename = "type")]
    pub event_type: Option<String>,
    /// ISO-8601 timestamp lower bound.
    pub from: Option<String>,
    /// Max rows to return (default 100, hard cap 1000).
    pub limit: Option<u32>,
}

#[derive(Serialize)]
struct NormalizedEventsResponse {
    rows: Vec<serde_json::Value>,
    count: usize,
}

async fn normalized_events_handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<NormalizedEventsParams>,
) -> Json<NormalizedEventsResponse> {
    let query = NormalizedEventsQuery {
        asset: params.asset,
        venue: params.venue,
        event_type: params.event_type,
        from: params.from,
        limit: params.limit,
    };

    let rows = query
        .execute(state.clickhouse_url.as_deref())
        .await
        .unwrap_or_else(|e| {
            tracing::warn!(error = %e, "clickhouse query failed");
            vec![]
        });

    let count = rows.len();
    Json(NormalizedEventsResponse { rows, count })
}

/// Per-feed data-quality record returned by `/data-quality`.
#[derive(Serialize)]
pub struct FeedQualityRecord {
    pub feed_id: String,
    /// RFC-3339 string of the last message, or `null` if never seen.
    pub last_message_at: Option<String>,
    /// Epoch milliseconds of the last message, or `null` if never seen.
    pub last_message_epoch_ms: Option<u64>,
    pub is_stale: bool,
    pub state: &'static str,
}

/// `GET /data-quality` — per-feed freshness, lag, and event counts (P08-T008).
async fn data_quality_handler(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<FeedQualityRecord>> {
    let statuses = state
        .feed_health
        .feed_statuses(state.stale_threshold_secs);

    let records = statuses
        .into_iter()
        .map(|s| {
            let last_at = s.last_message_epoch_ms.map(epoch_ms_to_rfc3339);
            let (is_stale, state_str) = match s.state {
                FeedState::Fresh => (false, "fresh"),
                FeedState::Stale => (true, "stale"),
                FeedState::Unknown => (true, "unknown"),
            };
            FeedQualityRecord {
                feed_id: s.feed_id,
                last_message_at: last_at,
                last_message_epoch_ms: s.last_message_epoch_ms,
                is_stale,
                state: state_str,
            }
        })
        .collect();

    Json(records)
}

/// Convert Unix epoch milliseconds to an RFC-3339 string (best-effort).
fn epoch_ms_to_rfc3339(ms: u64) -> String {
    market_math::timestamps::ms_to_rfc3339(ms as i64)
}

pub async fn serve(
    port: u16,
    clickhouse_url: Option<String>,
    feed_health: FeedHealth,
    stale_threshold_secs: u64,
) -> anyhow::Result<()> {
    let state = Arc::new(AppState {
        clickhouse_url,
        feed_health,
        stale_threshold_secs,
    });

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/metrics", get(metrics_handler))
        .route("/data/normalized-events", get(normalized_events_handler))
        .route("/data-quality", get(data_quality_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(port, "HTTP health/metrics/data listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
