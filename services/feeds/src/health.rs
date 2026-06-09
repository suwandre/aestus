//! HTTP health + metrics endpoint (P07-T001).

use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::net::SocketAddr;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "feeds",
    })
}

async fn metrics_handler() -> String {
    crate::metrics::gather_text()
}

pub async fn serve(port: u16) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/metrics", get(metrics_handler));
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(port, "HTTP health/metrics listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
