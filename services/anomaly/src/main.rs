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
mod publish;
mod registry;
mod rules;
mod severity;
mod state;

use std::sync::Arc;

use async_nats::Subject;
use config::Config;
use event_model::envelope::Envelope;
use futures::StreamExt;
use input::{FeatureSnapshot, MacroEvent, NewsItem, OnChainEvent};
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
            Err(e) => tracing::warn!(error = %e, id = %anomaly.id, "anomaly publish skipped"),
        }
    }
    published
}

// ── Health HTTP server ───────────────────────────────────────────────────────

async fn health_server(port: u16) -> anyhow::Result<()> {
    use axum::{routing::get, Router};
    let app = Router::new().route("/health", get(|| async { "ok" }));
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(addr = %addr, "health server listening");
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

    // Heartbeat on system.health.anomaly.
    let hb_pub = Arc::clone(&publisher);
    let hb_interval = cfg.heartbeat_interval;
    tokio::spawn(async move {
        let hb = Heartbeat::new("anomaly", env!("CARGO_PKG_VERSION"));
        hb.run(hb_pub.as_ref(), hb_interval, || vec![]).await;
    });

    // HTTP health endpoint.
    let http_port = cfg.http_port;
    tokio::spawn(async move {
        if let Err(e) = health_server(http_port).await {
            tracing::error!(error = %e, "health server error");
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
    let rules_cfg = rules::RulesConfig::default();
    let evaluator = tokio::spawn(async move {
        let mut interval = tokio::time::interval(eval_interval);
        let mut deduper = dedupe::Deduper::new();
        loop {
            interval.tick().await;
            let now_ms =
                market_math::timestamps::rfc3339_to_ms(&market_math::timestamps::now_rfc3339())
                    .unwrap_or(0);
            let st = state_e.lock().await;
            let n = evaluate(&st, &rules_cfg, now_ms, &mut deduper, eval_pub.as_ref()).await;
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
        let n = evaluate(&st, &rules::RulesConfig::default(), 0, &mut deduper, &pubr).await;
        assert_eq!(n, 0);
        assert!(pubr.is_empty().await);
    }

    #[tokio::test]
    async fn evaluate_publishes_funding_spike_from_fixtures() {
        let mut st = EngineState::new();
        load_fixtures(&mut st, "../../fixtures");
        let pubr = RecordingPublisher::new();
        let mut deduper = dedupe::Deduper::new();
        let n = evaluate(&st, &rules::RulesConfig::default(), 0, &mut deduper, &pubr).await;
        // BTC fixture has funding_z 2.6 → one funding_spike.
        assert!(n >= 1, "fixture funding spike should publish");
        let records = pubr.records().await;
        assert!(records
            .iter()
            .any(|(s, _)| s.starts_with("anomaly.detected.funding_spike")));
    }

    #[test]
    fn ingest_context_routes_by_subject_token() {
        let mut st = EngineState::new();
        let macro_json = br#"{"event_id":"e1","region":"US","currency":"USD","title":"CPI","scheduled_at":"2026-06-10T12:30:00Z","importance":"high","consensus":null,"previous":null,"actual":null,"source":"te"}"#;
        ingest_context(&mut st, "context.packet.macro.us", macro_json);
        assert_eq!(st.macro_events.len(), 1);
    }
}
