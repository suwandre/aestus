//! Whale / on-chain flow detector (P10-T010).
//!
//! Emits a `whale_flow` anomaly for large single transfers (`whale_transfer`)
//! and an `exchange_flow` anomaly for large net exchange flows
//! (`exchange_flow`), gated on absolute USD value. Direction/classification
//! shapes the description (accumulation vs distribution, inflow vs outflow). Other
//! on-chain event types (stablecoin mint/burn, token unlock, dex activity) are
//! left for future detectors.

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::input::OnChainEvent;
use crate::rules::RulesConfig;
use crate::state::EngineState;

fn severity_for(abs_usd: f64, threshold: f64) -> AnomalySeverity {
    let ratio = if threshold > 0.0 {
        abs_usd / threshold
    } else {
        abs_usd
    };
    if ratio >= 3.0 {
        AnomalySeverity::High
    } else if ratio >= 1.5 {
        AnomalySeverity::Medium
    } else {
        AnomalySeverity::Low
    }
}

/// Best available USD magnitude for the event: explicit `amount_usd` if present,
/// else fall back to the raw `amount` (units, treated as a magnitude proxy).
fn magnitude_usd(ev: &OnChainEvent) -> f64 {
    ev.amount_usd.or(ev.amount).unwrap_or(0.0).abs()
}

fn context_ref(ev: &OnChainEvent) -> String {
    match &ev.tx_hash {
        Some(h) => format!("onchain:{}:{}", ev.event_type, &h[..h.len().min(8)]),
        None => format!("onchain:{}:{}", ev.event_type, ev.timestamp),
    }
}

fn whale_flow(ev: &OnChainEvent) -> AnomalyEvent {
    let classification = ev.classification.as_deref().unwrap_or("neutral");
    let (verb, title) = match classification {
        "accumulation" => ("accumulation", "Whale accumulation detected"),
        "distribution" => ("distribution", "Whale distribution detected"),
        _ => ("transfer", "Large whale transfer detected"),
    };
    let route = match (&ev.from_label, &ev.to_label) {
        (Some(f), Some(t)) => format!(" from {f} to {t}"),
        _ => String::new(),
    };
    let usd = ev
        .amount_usd
        .map(|v| format!(" (~${:.1}M)", v.abs() / 1_000_000.0))
        .unwrap_or_default();
    let description = format!(
        "{:.0} {} moved{route}{usd}: {verb}.",
        ev.amount.unwrap_or(0.0),
        ev.asset
    );
    new_anomaly(
        AnomalyType::WhaleFlow,
        severity_for(magnitude_usd(ev), 50_000_000.0),
        None,
        vec![ev.asset.clone()],
        Vec::new(),
        title.to_string(),
        description,
        ev.timestamp.clone(),
        vec![context_ref(ev)],
        Some("rule:whale_amount_usd".to_string()),
    )
}

fn exchange_flow(ev: &OnChainEvent, threshold: f64) -> AnomalyEvent {
    let direction = ev.direction.as_deref().unwrap_or("net");
    let signed = ev.amount.unwrap_or(0.0);
    let flow_word = match direction {
        "inflow" => "inflow to exchanges",
        "outflow" => "outflow from exchanges",
        _ if signed >= 0.0 => "net inflow to exchanges",
        _ => "net outflow from exchanges",
    };
    let usd = ev
        .amount_usd
        .map(|v| format!(" (~${:.1}M)", v.abs() / 1_000_000.0))
        .unwrap_or_default();
    let description = format!("{:.0} {} {flow_word}{usd}.", signed.abs(), ev.asset);
    new_anomaly(
        AnomalyType::ExchangeFlow,
        severity_for(magnitude_usd(ev), threshold),
        None,
        vec![ev.asset.clone()],
        Vec::new(),
        "Exchange flow".to_string(),
        description,
        ev.timestamp.clone(),
        vec![context_ref(ev)],
        Some("rule:exchange_amount_usd".to_string()),
    )
}

#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig) -> Vec<AnomalyEvent> {
    let mut out = Vec::new();
    for ev in &state.onchain_events {
        if magnitude_usd(ev) < rules.whale_min_amount_usd {
            continue;
        }
        match ev.event_type.as_str() {
            "whale_transfer" => out.push(whale_flow(ev)),
            "exchange_flow" => out.push(exchange_flow(ev, rules.whale_min_amount_usd)),
            _ => {}
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_onchain() -> Vec<OnChainEvent> {
        let raw = std::fs::read_to_string("../../fixtures/onchain/events.json")
            .expect("read onchain fixture");
        serde_json::from_str(&raw).expect("parse onchain")
    }

    #[test]
    fn whale_accumulation_fixture_emits_whale_flow() {
        let mut st = EngineState::new();
        for ev in load_onchain() {
            st.ingest_onchain(ev);
        }
        let out = detect(&st, &RulesConfig::default());
        let whale = out
            .iter()
            .find(|a| a.anomaly_type == AnomalyType::WhaleFlow)
            .expect("whale_flow fires for 950 BTC ($64.8M) accumulation");
        assert!(whale.description.contains("accumulation"));
        assert!(whale.assets.contains(&"crypto:btc-usdt".to_string()));
        whale.validate().expect("valid");
    }

    #[test]
    fn large_net_outflow_emits_exchange_flow() {
        let mut st = EngineState::new();
        for ev in load_onchain() {
            st.ingest_onchain(ev);
        }
        let out = detect(&st, &RulesConfig::default());
        // -1850 BTC / -$126.3M net flow → exchange_flow.
        let xf = out
            .iter()
            .find(|a| a.anomaly_type == AnomalyType::ExchangeFlow)
            .expect("exchange_flow fires for -$126.3M net flow");
        assert!(xf.description.contains("outflow"));
        xf.validate().expect("valid");
    }

    #[test]
    fn small_flow_below_threshold_is_skipped() {
        let mut st = EngineState::new();
        let ev: OnChainEvent = serde_json::from_value(serde_json::json!({
            "chain": "bitcoin",
            "asset": "crypto:btc-usdt",
            "timestamp": "2026-06-07T00:00:00Z",
            "source": "test",
            "event_type": "whale_transfer",
            "amount": 5.0,
            "amount_usd": 340000.0
        }))
        .expect("event");
        st.ingest_onchain(ev);
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }
}
