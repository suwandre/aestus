mod basis;
mod breadth;
mod candle;
mod config;
mod correlation;
mod funding;
mod liquidations;
mod oi;
mod persist;
mod publish;
mod returns;
mod snapshot;
mod state;
mod volatility;
mod volume;
mod window;

use std::collections::HashMap;
use std::sync::Arc;

use event_model::market::NormalizedMarketEvent;
use futures::StreamExt;
use market_math::timestamps::{ms_to_rfc3339, now_rfc3339};
use nats_publisher::{Heartbeat, NatsPublisher, Publisher, RecordingPublisher, RetryConfig};
use snapshot::FeatureSnapshot;
use state::{AssetState, MarketState};
use tokio::sync::Mutex;

use config::Config;

// ── Feature snapshot builder ─────────────────────────────────────────────────

fn build_snapshot(asset: &AssetState, all_assets: &HashMap<String, AssetState>) -> FeatureSnapshot {
    let timestamp = asset
        .price_window
        .latest()
        .map(|(ts, _)| ms_to_rfc3339(ts))
        .unwrap_or_else(now_rfc3339);

    let ret = returns::compute_returns(&asset.price_window);
    let vol = volatility::compute_volatility(&asset.price_window);
    let regime = volatility::compute_regime(&asset.price_window, &ret);

    let volume_z = volume::compute_volume_z(&asset.trade_size_window);

    let mut z_scores = HashMap::new();
    if let Some((_, latest_price)) = asset.price_window.latest() {
        if let Some(z) = asset.price_window.z_score(latest_price) {
            z_scores.insert("price".to_string(), z);
        }
    }

    let funding = funding::compute_funding_features(&asset.funding_by_venue);
    let funding_z = funding.funding_z;
    let funding_spread = funding.funding_spread;

    let price_return_24h = ret.get("24h").copied();
    let oi_feat = oi::compute_oi_features(
        &asset.oi_by_venue,
        &asset.oi_latest,
        &asset.oi_prev,
        price_return_24h,
    );
    let oi_delta = oi_feat.oi_delta;
    let oi_state = oi_feat.oi_state;

    let mid_price = asset.price_window.latest().map(|(_, p)| p).unwrap_or(0.0);
    let now_ms = asset.price_window.latest().map(|(ts, _)| ts).unwrap_or(0);
    let liq_clusters = liquidations::compute_liq_clusters(&asset.liq_events, mid_price, now_ms);

    let price_by_venue: HashMap<String, f64> = asset
        .price_window
        .latest()
        .map(|(_, p)| {
            let mut m = HashMap::new();
            m.insert("primary".to_string(), p);
            m
        })
        .unwrap_or_default();
    let basis = basis::compute_basis(&asset.mark_price, &asset.index_price, &price_by_venue);

    let other_windows = all_assets
        .iter()
        .filter(|(id, _)| *id != &asset.canonical_asset_id)
        .map(|(id, s)| (id.clone(), &s.price_window))
        .collect::<HashMap<_, _>>();
    let correlation_set = correlation::compute_correlations(&asset.price_window, &other_windows);

    let breadth = breadth::compute_breadth(all_assets);
    let breadth_up_pct = breadth.as_ref().map(|b| b.up_pct * 100.0);
    let breadth_down_pct = breadth.as_ref().map(|b| b.down_pct * 100.0);

    FeatureSnapshot {
        schema_version: 1,
        canonical_asset_id: asset.canonical_asset_id.clone(),
        timestamp,
        returns: ret,
        volatility: vol,
        z_scores,
        funding_z,
        oi_delta,
        volume_z,
        correlation_set,
        basis,
        regime,
        liq_clusters,
        oi_state,
        funding_spread,
        breadth_up_pct,
        breadth_down_pct,
    }
}

fn build_all_snapshots(market: &MarketState) -> Vec<FeatureSnapshot> {
    let ids: Vec<String> = market.assets.keys().cloned().collect();
    ids.into_iter()
        .filter_map(|id| {
            market
                .assets
                .get(&id)
                .map(|asset| build_snapshot(asset, &market.assets))
        })
        .collect()
}

// ── Fixture helpers ───────────────────────────────────────────────────────────

fn load_fixture_events() -> Vec<NormalizedMarketEvent> {
    let path = "fixtures/market/normalized_events.json";
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => vec![],
    }
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

// ── Service entrypoint ────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(&cfg.log_level)
        .json()
        .init();

    tracing::info!("feature engine starting");

    let publisher: Arc<dyn Publisher> = match &cfg.nats_url {
        Some(url) => {
            let p = NatsPublisher::connect(url, RetryConfig::default()).await?;
            tracing::info!(url = %url, "connected to NATS");
            Arc::new(p)
        }
        None => {
            tracing::warn!("NATS_URL unset — fixture/replay mode");
            Arc::new(RecordingPublisher::new())
        }
    };

    let state = Arc::new(Mutex::new(MarketState::new()));

    // Health heartbeat
    let hb_pub = Arc::clone(&publisher);
    let hb_interval = cfg.heartbeat_interval;
    tokio::spawn(async move {
        let hb = Heartbeat::new("features", "0.1.0");
        hb.run(&*hb_pub, hb_interval, || vec![]).await;
    });

    // HTTP health endpoint
    let http_port = cfg.http_port;
    tokio::spawn(async move {
        if let Err(e) = health_server(http_port).await {
            tracing::error!(error = %e, "health server error");
        }
    });

    // NATS consumer or fixture replay
    let state_c = Arc::clone(&state);
    let nats_url = cfg.nats_url.clone();
    let consumer_task = tokio::spawn(async move {
        if let Some(ref url) = nats_url {
            match async_nats::connect(url.as_str()).await {
                Ok(client) => match client.subscribe("normalized.market.>").await {
                    Ok(mut sub) => {
                        while let Some(msg) = sub.next().await {
                            if let Ok(event) =
                                serde_json::from_slice::<NormalizedMarketEvent>(&msg.payload)
                            {
                                state_c.lock().await.update(&event);
                            }
                        }
                    }
                    Err(e) => tracing::error!(error = %e, "NATS subscribe failed"),
                },
                Err(e) => tracing::error!(error = %e, "NATS connect failed"),
            }
        } else {
            let events = load_fixture_events();
            let count = events.len();
            {
                let mut st = state_c.lock().await;
                for ev in events {
                    st.update(&ev);
                }
            }
            tracing::info!(count, "fixture events loaded");
        }
    });

    // Periodic snapshot publisher
    let state_p = Arc::clone(&state);
    let pub_snap = Arc::clone(&publisher);
    let ch_url = cfg.clickhouse_url.clone();
    let redis_url = cfg.redis_url.clone();
    let snap_interval = cfg.snapshot_interval;
    let snap_task = tokio::spawn(async move {
        let ch_sink = persist::ClickHouseSnapshotSink::new(ch_url);
        let redis_store = persist::RedisSnapshotStore::connect(redis_url.as_deref());
        let mut interval = tokio::time::interval(snap_interval);
        loop {
            interval.tick().await;
            let snapshots = {
                let st = state_p.lock().await;
                build_all_snapshots(&st)
            };
            for snap in &snapshots {
                if let Err(e) = publish::publish_snapshot(&*pub_snap, snap).await {
                    tracing::warn!(error = %e, asset = %snap.canonical_asset_id, "snapshot publish failed");
                }
                if let Err(e) = redis_store.write(snap) {
                    tracing::warn!(error = %e, asset = %snap.canonical_asset_id, "redis write failed");
                }
            }
            if !snapshots.is_empty() {
                if let Err(e) = ch_sink.write_batch(&snapshots).await {
                    tracing::warn!(error = %e, "clickhouse batch write failed");
                }
            }
        }
    });

    tokio::select! {
        _ = consumer_task => {}
        _ = snap_task => {}
    }

    Ok(())
}

// ── T015 replay tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::snapshot::FeatureSnapshot;
    use super::state::MarketState;
    use super::{build_all_snapshots, funding, publish, returns, volatility};
    use event_model::envelope::Envelope;
    use event_model::market::{NormalizedMarketEvent, Side};
    use market_math::timestamps::ms_to_rfc3339;
    use nats_publisher::RecordingPublisher;

    fn make_trade(ts_ms: i64, asset: &str, price: f64, size: f64) -> NormalizedMarketEvent {
        NormalizedMarketEvent::Trade {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "TESTUSDT".into(),
            canonical_asset_id: asset.into(),
            timestamp: ms_to_rfc3339(ts_ms),
            sequence: None,
            price,
            size,
            side: Side::Buy,
            trade_id: None,
        }
    }

    fn make_funding(ts_ms: i64, asset: &str, rate: f64) -> NormalizedMarketEvent {
        NormalizedMarketEvent::FundingRate {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "TESTUSDT".into(),
            canonical_asset_id: asset.into(),
            timestamp: ms_to_rfc3339(ts_ms),
            sequence: None,
            funding_rate: rate,
            next_funding_time: None,
            interval_hours: None,
        }
    }

    /// Linear price series 50_000 → 52_500 over 1440 minutes → ~5% 24h return.
    /// 9 normal + 1 spike funding rate for z-score test.
    fn replay_events() -> Vec<NormalizedMarketEvent> {
        let base_ms = 86_400_000_i64;
        let asset = "crypto:btc-usdt";
        let mut events = Vec::new();
        for i in 0..=1440_i64 {
            let ts = base_ms + i * 60_000;
            let price = 50_000.0 + (i as f64 / 1440.0) * 2_500.0;
            events.push(make_trade(ts, asset, price, 1.0));
        }
        for j in 0..9_i64 {
            events.push(make_funding(base_ms + j * 3_600_000, asset, 0.0001));
        }
        events.push(make_funding(base_ms + 9 * 3_600_000, asset, 0.01));
        events
    }

    #[test]
    fn replay_produces_nonzero_returns_and_vol() {
        let mut market = MarketState::new();
        for ev in replay_events() {
            market.update(&ev);
        }
        let asset = market.assets.get("crypto:btc-usdt").expect("asset present");
        let ret = returns::compute_returns(&asset.price_window);
        let ret_24h = ret.get("24h").copied().unwrap_or(0.0);
        assert!(
            ret_24h > 0.03 && ret_24h < 0.07,
            "expected ~5% 24h return, got {ret_24h}"
        );
        let vol = volatility::compute_volatility(&asset.price_window);
        let vol_24h = vol.get("24h").copied().unwrap_or(0.0);
        assert!(
            vol_24h > 0.0,
            "realized vol must be positive, got {vol_24h}"
        );
    }

    #[test]
    fn replay_vol_regime_classified_correctly() {
        let mut market = MarketState::new();
        for ev in replay_events() {
            market.update(&ev);
        }
        let asset = market.assets.get("crypto:btc-usdt").expect("asset present");
        let ret = returns::compute_returns(&asset.price_window);
        let regime = volatility::compute_regime(&asset.price_window, &ret);
        assert_eq!(
            regime.trend.as_str(),
            "trending_up",
            "linear up series should be trending_up"
        );
    }

    #[test]
    fn replay_funding_z_positive_for_spike() {
        let mut market = MarketState::new();
        for ev in replay_events() {
            market.update(&ev);
        }
        let asset = market.assets.get("crypto:btc-usdt").expect("asset present");
        let ff = funding::compute_funding_features(&asset.funding_by_venue);
        let z = ff.funding_z.expect("funding z-score computed");
        assert!(z > 2.0, "spike funding should produce z > 2, got {z}");
    }

    #[tokio::test]
    async fn replay_snapshot_publishes_to_nats() {
        let pub_r = RecordingPublisher::new();
        let mut market = MarketState::new();
        for ev in replay_events() {
            market.update(&ev);
        }
        let snapshots = build_all_snapshots(&market);
        assert!(!snapshots.is_empty(), "at least one snapshot produced");
        for snap in &snapshots {
            publish::publish_snapshot(&pub_r, snap)
                .await
                .expect("publish");
        }
        let records = pub_r.records().await;
        assert_eq!(records.len(), snapshots.len());
        for (subject, payload) in &records {
            assert!(
                subject.starts_with("feature.snapshot."),
                "subject: {subject}"
            );
            let env: Envelope<FeatureSnapshot> =
                serde_json::from_slice(payload).expect("valid envelope");
            assert_eq!(env.payload_type, "FeatureSnapshot");
        }
    }
}
