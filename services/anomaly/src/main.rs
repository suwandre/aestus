//! Aestus anomaly detection engine (P10).
//!
//! Consumes feature snapshots (`feature.snapshot.>`) and contextual events
//! (`context.packet.>`: macro / news / on-chain), runs deterministic detectors,
//! and publishes `anomaly.detected` events. Fixture-first: with `NATS_URL`
//! unset it loads the repo fixtures, runs one evaluation pass, and records the
//! anomalies in-memory. No LLM, no order placement — pure deterministic rules.

mod anomaly;
mod config;
mod dedupe;
mod detect;
mod detectors;
mod input;
mod lifecycle;
mod persist;
mod publish;
mod registry;
mod rules;
mod severity;
mod state;

use std::sync::Arc;

use anomaly::AnomalyStatus;
use async_nats::Subject;
use config::Config;
use event_model::envelope::Envelope;
use futures::StreamExt;
use input::{FeatureSnapshot, MacroEvent, NewsItem, OnChainEvent};
use lifecycle::StatusStore;
use nats_publisher::{Heartbeat, NatsPublisher, Publisher, RecordingPublisher, RetryConfig};
use state::EngineState;
use tokio::sync::Mutex;

// ── Contextual-event routing ──────────────────────────────────────────────────

/// Route a raw `context.packet.<kind>...` message into the engine state.
/// Feeds publishes contextual items un-enveloped (raw JSON), so we parse by the
/// subject's second token.
fn ingest_context(state: &mut EngineState, subject: &str, payload: &[u8]) {
    // subject: context.packet.<kind>[.<...>]
    let kind = subject.split('.').nth(2).unwrap_or("");
    match kind {
        "macro" => {
            if let Ok(ev) = serde_json::from_slice::<MacroEvent>(payload) {
                state.ingest_macro(ev);
            }
        }
        "news" => {
            if let Ok(item) = serde_json::from_slice::<NewsItem>(payload) {
                state.ingest_news(item);
            }
        }
        "onchain" => {
            if let Ok(ev) = serde_json::from_slice::<OnChainEvent>(payload) {
                state.ingest_onchain(ev);
            }
        }
        other => tracing::debug!(kind = other, "ignoring unknown context kind"),
    }
}

// ── Fixture loading ───────────────────────────────────────────────────────────

fn load_json<T: serde::de::DeserializeOwned>(path: &str) -> Vec<T> {
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn load_fixtures(state: &mut EngineState, base: &str) {
    for snap in load_json::<FeatureSnapshot>(&format!("{base}/features/snapshots.json")) {
        state.ingest_snapshot(snap);
    }
    for ev in load_json::<MacroEvent>(&format!("{base}/macro/events.json")) {
        state.ingest_macro(ev);
    }
    for item in load_json::<NewsItem>(&format!("{base}/news/items.json")) {
        state.ingest_news(item);
    }
    for ev in load_json::<OnChainEvent>(&format!("{base}/onchain/events.json")) {
        state.ingest_onchain(ev);
    }
}

// ── Evaluation pass ─────────────────────────────────────────────────────────

/// Run one detection pass: collect anomalies, dedupe/cooldown, validate, publish.
async fn evaluate(
    state: &EngineState,
    rules: &rules::RulesConfig,
    now_ms: i64,
    deduper: &mut dedupe::Deduper,
    publisher: &dyn Publisher,
    pg: &persist::PostgresAnomalySink,
    ch: &persist::ClickHouseAnomalyMetrics,
) -> usize {
    let detected = detect::run_detectors(state, rules, now_ms);
    // Unified severity scoring (magnitude/confidence/recency/priority).
    let scored: Vec<_> = detected
        .into_iter()
        .map(|a| severity::rescore(a, rules, now_ms))
        .collect();
    let cooldown_ms = rules.cooldown_minutes * 60_000;
    let anomalies = deduper.process(scored, now_ms, cooldown_ms);
    let mut published = 0;
    for anomaly in &anomalies {
        match publish::publish_anomaly(publisher, anomaly).await {
            Ok(()) => published += 1,
            Err(e) => {
                tracing::warn!(error = %e, id = %anomaly.id, "anomaly publish skipped");
                continue;
            }
        }
        // Persist the durable inbox record + analytics metric snapshot.
        if let Err(e) = pg.upsert_anomaly(anomaly).await {
            tracing::warn!(error = %e, id = %anomaly.id, "anomaly postgres upsert failed");
        }
        let snap = anomaly.assets.first().and_then(|a| state.snapshots.get(a));
        if let Err(e) = ch.write_metric(anomaly, snap).await {
            tracing::warn!(error = %e, id = %anomaly.id, "anomaly metric write failed");
        }
    }
    published
}

// ── HTTP server (health + status lifecycle) ───────────────────────────────────

/// Shared HTTP state: the in-process status source of truth plus the Postgres
/// URL used to persist status changes (P10-T014).
#[derive(Clone)]
struct HttpState {
    store: Arc<Mutex<StatusStore>>,
    pg_url: Option<String>,
}

/// Body of a status-change request from the API/UI.
#[derive(serde::Deserialize)]
struct StatusChange {
    status: String,
    /// Wake time (epoch ms) when transitioning to `snoozed`.
    #[serde(default)]
    snooze_until_ms: Option<i64>,
}

/// `GET /anomalies/{id}/status` — current lifecycle status of an anomaly.
async fn get_status(
    axum::extract::State(state): axum::extract::State<HttpState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> axum::Json<serde_json::Value> {
    let status = state.store.lock().await.status_of(&id);
    axum::Json(serde_json::json!({ "id": id, "status": status.as_str() }))
}

/// `POST /anomalies/{id}/status` — change an anomaly's status. Enforces legal
/// transitions via [`StatusStore`] and persists the change to Postgres so it
/// survives a restart. This is the externally-callable interface the API/UI
/// drive (P10-T014 "API/UI can change status and status persists").
async fn set_status(
    axum::extract::State(state): axum::extract::State<HttpState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    axum::Json(req): axum::Json<StatusChange>,
) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    let Some(to) = AnomalyStatus::from_str(&req.status) else {
        return (
            StatusCode::BAD_REQUEST,
            format!("unknown status '{}'", req.status),
        )
            .into_response();
    };
    let now_ms = market_math::timestamps::rfc3339_to_ms(&market_math::timestamps::now_rfc3339())
        .unwrap_or(0);
    {
        let mut store = state.store.lock().await;
        if let Err(e) = store.set_status(&id, to, now_ms, req.snooze_until_ms) {
            return (StatusCode::CONFLICT, e.to_string()).into_response();
        }
    }
    // Persist so the change survives a restart (no-op when no DB is configured).
    let pg = persist::PostgresAnomalySink::new(state.pg_url.clone());
    if let Err(e) = pg.update_status(&id, to).await {
        tracing::warn!(error = %e, id = %id, "anomaly status persist failed");
    }
    axum::Json(serde_json::json!({ "id": id, "status": to.as_str() })).into_response()
}

async fn http_server(port: u16, state: HttpState) -> anyhow::Result<()> {
    use axum::{routing::get, Router};
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/anomalies/{id}/status", get(get_status).post(set_status))
        .with_state(state);
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(addr = %addr, "http server listening");
    axum::serve(listener, app).await?;
    Ok(())
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(&cfg.log_level)
        .json()
        .init();

    tracing::info!("anomaly engine starting");

    let publisher: Arc<dyn Publisher> = match &cfg.nats_url {
        Some(url) => {
            let p = NatsPublisher::connect(url, RetryConfig::default()).await?;
            tracing::info!(url = %url, "connected to NATS");
            Arc::new(p)
        }
        None => {
            tracing::warn!("NATS_URL unset — fixture mode");
            Arc::new(RecordingPublisher::new())
        }
    };

    let state = Arc::new(Mutex::new(EngineState::new()));
    // In-process status source of truth, driven by the HTTP status endpoint and
    // seeded from the durable inbox on startup (P10-T014).
    let status_store = Arc::new(Mutex::new(StatusStore::new()));

    // Heartbeat on system.health.anomaly.
    let hb_pub = Arc::clone(&publisher);
    let hb_interval = cfg.heartbeat_interval;
    tokio::spawn(async move {
        let hb = Heartbeat::new("anomaly", env!("CARGO_PKG_VERSION"));
        hb.run(hb_pub.as_ref(), hb_interval, || vec![]).await;
    });

    // HTTP server: health + anomaly status lifecycle endpoint.
    let http_port = cfg.http_port;
    let http_state = HttpState {
        store: Arc::clone(&status_store),
        pg_url: cfg.postgres_url.clone(),
    };
    tokio::spawn(async move {
        if let Err(e) = http_server(http_port, http_state).await {
            tracing::error!(error = %e, "http server error");
        }
    });

    // Consumer: live NATS subscriptions or one-shot fixture load.
    let state_c = Arc::clone(&state);
    let nats_url = cfg.nats_url.clone();
    let consumer = tokio::spawn(async move {
        if let Some(ref url) = nats_url {
            match async_nats::connect(url.as_str()).await {
                Ok(client) => consume_live(client, state_c).await,
                Err(e) => tracing::error!(error = %e, "NATS connect failed"),
            }
        } else {
            let mut st = state_c.lock().await;
            load_fixtures(&mut st, "fixtures");
            tracing::info!(
                snapshots = st.snapshots.len(),
                macro_events = st.macro_events.len(),
                news = st.news_items.len(),
                onchain = st.onchain_events.len(),
                "fixtures loaded"
            );
        }
    });

    // Periodic evaluation pass.
    let state_e = Arc::clone(&state);
    let eval_pub = Arc::clone(&publisher);
    let eval_interval = cfg.eval_interval;
    let pg_url = cfg.postgres_url.clone();
    let ch_url = cfg.clickhouse_url.clone();
    let status_store_e = Arc::clone(&status_store);
    let evaluator = tokio::spawn(async move {
        let mut interval = tokio::time::interval(eval_interval);
        let mut deduper = dedupe::Deduper::new();
        let pg = persist::PostgresAnomalySink::new(pg_url);
        let ch = persist::ClickHouseAnomalyMetrics::new(ch_url);

        // Load user-defined rule thresholds from Postgres, overlaying defaults
        // (P10-T017). With no DB the built-in defaults stand.
        let rules_cfg = match pg.load_alert_rules().await {
            Ok(rows) => {
                tracing::info!(rules = rows.len(), "loaded alert rules from postgres");
                rules::RulesConfig::with_rules(&rows)
            }
            Err(e) => {
                tracing::warn!(error = %e, "alert rule load failed — using defaults");
                rules::RulesConfig::default()
            }
        };

        // Reload the open inbox so a restart neither loses active anomalies nor
        // re-alerts ones already seen (P10-T015 Done-when).
        match pg.load_active().await {
            Ok(existing) if !existing.is_empty() => {
                let seed_ms =
                    market_math::timestamps::rfc3339_to_ms(&market_math::timestamps::now_rfc3339())
                        .unwrap_or(0);
                // Seed the status store with persisted statuses so the HTTP
                // endpoint validates transitions against the restored state and
                // reports the restart-surviving status (P10-T014/T015).
                {
                    let mut store = status_store_e.lock().await;
                    for a in &existing {
                        if a.status != AnomalyStatus::Active {
                            let _ = store.set_status(&a.id, a.status, seed_ms, None);
                        }
                    }
                }
                let cooldown_ms = rules_cfg.cooldown_minutes * 60_000;
                deduper.process(existing.clone(), seed_ms, cooldown_ms);
                tracing::info!(
                    count = existing.len(),
                    "reloaded anomaly inbox from postgres"
                );
            }
            Ok(_) => {}
            Err(e) => tracing::warn!(error = %e, "anomaly inbox reload failed"),
        }

        loop {
            interval.tick().await;
            let now_ms =
                market_math::timestamps::rfc3339_to_ms(&market_math::timestamps::now_rfc3339())
                    .unwrap_or(0);
            let st = state_e.lock().await;
            let n = evaluate(
                &st,
                &rules_cfg,
                now_ms,
                &mut deduper,
                eval_pub.as_ref(),
                &pg,
                &ch,
            )
            .await;
            if n > 0 {
                tracing::info!(published = n, "evaluation pass emitted anomalies");
            }
        }
    });

    tokio::select! {
        _ = consumer => {}
        _ = evaluator => {}
    }

    Ok(())
}

/// Subscribe to feature snapshots + contextual events and fold them into state.
async fn consume_live(client: async_nats::Client, state: Arc<Mutex<EngineState>>) {
    let feat = client.subscribe("feature.snapshot.>").await;
    let ctx = client.subscribe("context.packet.>").await;
    let (mut feat, mut ctx) = match (feat, ctx) {
        (Ok(f), Ok(c)) => (f, c),
        _ => {
            tracing::error!("NATS subscribe failed");
            return;
        }
    };
    loop {
        tokio::select! {
            Some(msg) = feat.next() => {
                if let Ok(env) = serde_json::from_slice::<Envelope<FeatureSnapshot>>(&msg.payload) {
                    state.lock().await.ingest_snapshot(env.payload);
                }
            }
            Some(msg) = ctx.next() => {
                let subject: &Subject = &msg.subject;
                ingest_context(&mut *state.lock().await, subject.as_str(), &msg.payload);
            }
            else => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fixture_load_populates_state() {
        let mut st = EngineState::new();
        load_fixtures(&mut st, "../../fixtures");
        assert!(!st.snapshots.is_empty(), "snapshots loaded");
        assert!(!st.macro_events.is_empty(), "macro events loaded");
        assert!(!st.onchain_events.is_empty(), "onchain events loaded");
    }

    #[tokio::test]
    async fn evaluate_on_empty_state_publishes_nothing() {
        let st = EngineState::new();
        let pubr = RecordingPublisher::new();
        let mut deduper = dedupe::Deduper::new();
        let pg = persist::PostgresAnomalySink::new(None);
        let ch = persist::ClickHouseAnomalyMetrics::new(None);
        let n = evaluate(
            &st,
            &rules::RulesConfig::default(),
            0,
            &mut deduper,
            &pubr,
            &pg,
            &ch,
        )
        .await;
        assert_eq!(n, 0);
        assert!(pubr.is_empty().await);
    }

    #[tokio::test]
    async fn evaluate_publishes_funding_spike_from_fixtures() {
        let mut st = EngineState::new();
        load_fixtures(&mut st, "../../fixtures");
        let pubr = RecordingPublisher::new();
        let mut deduper = dedupe::Deduper::new();
        let pg = persist::PostgresAnomalySink::new(None);
        let ch = persist::ClickHouseAnomalyMetrics::new(None);
        let n = evaluate(
            &st,
            &rules::RulesConfig::default(),
            0,
            &mut deduper,
            &pubr,
            &pg,
            &ch,
        )
        .await;
        // BTC fixture has funding_z 2.6 → one funding_spike.
        assert!(n >= 1, "fixture funding spike should publish");
        let records = pubr.records().await;
        assert!(records
            .iter()
            .any(|(s, _)| s.starts_with("anomaly.detected.funding_spike")));
    }

    /// P10-T014: the externally-callable status endpoint changes an anomaly's
    /// status, the change persists in the in-process store, and illegal/unknown
    /// transitions are rejected. (Postgres persistence is a no-op without a DB.)
    #[tokio::test]
    async fn http_status_endpoint_changes_and_reports_status() {
        use axum::extract::{Path, State};
        use axum::http::StatusCode;
        use axum::Json;

        let state = HttpState {
            store: Arc::new(Mutex::new(StatusStore::new())),
            pg_url: None,
        };

        // Untracked anomalies default to active.
        let resp = get_status(State(state.clone()), Path("anom-001".into())).await;
        assert_eq!(resp.0["status"], "active");

        // API changes status to snoozed → 200, and the change is readable back.
        let r = set_status(
            State(state.clone()),
            Path("anom-001".into()),
            Json(StatusChange {
                status: "snoozed".into(),
                snooze_until_ms: Some(5000),
            }),
        )
        .await;
        assert_eq!(r.status(), StatusCode::OK);
        let resp = get_status(State(state.clone()), Path("anom-001".into())).await;
        assert_eq!(resp.0["status"], "snoozed");

        // Unknown status string → 400.
        let r = set_status(
            State(state.clone()),
            Path("anom-001".into()),
            Json(StatusChange {
                status: "bogus".into(),
                snooze_until_ms: None,
            }),
        )
        .await;
        assert_eq!(r.status(), StatusCode::BAD_REQUEST);

        // Illegal transition (self-transition) → 409.
        let r = set_status(
            State(state.clone()),
            Path("anom-001".into()),
            Json(StatusChange {
                status: "snoozed".into(),
                snooze_until_ms: None,
            }),
        )
        .await;
        assert_eq!(r.status(), StatusCode::CONFLICT);
    }

    #[test]
    fn ingest_context_routes_by_subject_token() {
        let mut st = EngineState::new();
        let macro_json = br#"{"event_id":"e1","region":"US","currency":"USD","title":"CPI","scheduled_at":"2026-06-10T12:30:00Z","importance":"high","consensus":null,"previous":null,"actual":null,"source":"te"}"#;
        ingest_context(&mut st, "context.packet.macro.us", macro_json);
        assert_eq!(st.macro_events.len(), 1);
    }

    /// P10-T016: every event published to NATS is a schema-valid AnomalyEvent
    /// envelope on an `anomaly.detected.<type>.<asset>` subject — i.e. a NATS
    /// tail would show only valid anomaly events for the context builder / API /
    /// alerts / UI to consume.
    #[tokio::test]
    async fn all_published_events_are_valid_anomaly_detected_envelopes() {
        use anomaly::AnomalyEvent;
        let mut st = EngineState::new();
        load_fixtures(&mut st, "../../fixtures");
        // Seed correlation history so the correlation detector can fire too.
        let pubr = RecordingPublisher::new();
        let mut deduper = dedupe::Deduper::new();
        let pg = persist::PostgresAnomalySink::new(None);
        let ch = persist::ClickHouseAnomalyMetrics::new(None);
        let now_ms = market_math::timestamps::rfc3339_to_ms("2026-06-10T12:00:00Z").unwrap_or(0);
        let n = evaluate(
            &st,
            &rules::RulesConfig::default(),
            now_ms,
            &mut deduper,
            &pubr,
            &pg,
            &ch,
        )
        .await;
        assert!(n >= 1, "fixtures should emit at least one anomaly");
        let records = pubr.records().await;
        assert_eq!(records.len(), n, "every published anomaly recorded");
        for (subject, payload) in &records {
            assert!(
                subject.starts_with("anomaly.detected."),
                "subject must route under anomaly.detected.*: {subject}"
            );
            let env: Envelope<AnomalyEvent> =
                serde_json::from_slice(payload).expect("payload is a valid AnomalyEvent envelope");
            assert_eq!(env.payload_type, "AnomalyEvent");
            assert_eq!(env.source, "anomaly");
            env.payload
                .validate()
                .expect("payload satisfies contract invariants");
        }
    }
}
