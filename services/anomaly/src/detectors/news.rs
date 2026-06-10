//! News clustering detector (P10-T011) — placeholder.
//!
//! Groups recent news items by canonical-asset entity and emits a `news_cluster`
//! anomaly when enough relevant headlines about the same asset land inside a
//! short window (velocity). This is the deterministic, keyword/entity version;
//! semantic (embedding) clustering is a future enhancement once the feeds
//! embedding provider is wired (P07). Only entities that are canonical asset ids
//! (contain `:`) are grouped, so we don't double-count tickers and tags.

use std::collections::HashMap;

use crate::anomaly::{AnomalyEvent, AnomalySeverity, AnomalyType};
use crate::detectors::new_anomaly;
use crate::input::NewsItem;
use crate::rules::RulesConfig;
use crate::state::EngineState;
use market_math::timestamps::rfc3339_to_ms;

fn severity_for(count: usize, avg_relevance: f64) -> AnomalySeverity {
    if count >= 4 || avg_relevance >= 0.85 {
        AnomalySeverity::High
    } else if count >= 3 || avg_relevance >= 0.7 {
        AnomalySeverity::Medium
    } else {
        AnomalySeverity::Low
    }
}

#[must_use]
pub fn detect(state: &EngineState, rules: &RulesConfig) -> Vec<AnomalyEvent> {
    let window_ms = rules.news_cluster_window_minutes * 60_000;

    // Group relevant items by canonical-asset entity.
    let mut by_entity: HashMap<String, Vec<&NewsItem>> = HashMap::new();
    for item in state.news_items.values() {
        if item.relevance_score < rules.news_cluster_min_relevance {
            continue;
        }
        for entity in &item.entities {
            if entity.contains(':') {
                by_entity.entry(entity.clone()).or_default().push(item);
            }
        }
    }

    let mut out = Vec::new();
    for (entity, mut items) in by_entity {
        // Newest first; keep only items within the window of the newest.
        items.sort_by(|a, b| b.published_at.cmp(&a.published_at));
        let Some(newest_ms) = items.first().and_then(|i| rfc3339_to_ms(&i.published_at)) else {
            continue;
        };
        let in_window: Vec<&NewsItem> = items
            .into_iter()
            .filter(|i| {
                rfc3339_to_ms(&i.published_at)
                    .map(|ms| (newest_ms - ms).abs() <= window_ms)
                    .unwrap_or(false)
            })
            .collect();
        if in_window.len() < rules.news_cluster_min_items {
            continue;
        }

        let count = in_window.len();
        let avg_relevance = in_window.iter().map(|i| i.relevance_score).sum::<f64>() / count as f64;
        let severity = severity_for(count, avg_relevance);

        // Most common tag for a human label.
        let mut tag_counts: HashMap<&str, usize> = HashMap::new();
        for i in &in_window {
            for t in &i.tags {
                *tag_counts.entry(t.as_str()).or_default() += 1;
            }
        }
        let top_tag = tag_counts
            .iter()
            .max_by_key(|(_, c)| **c)
            .map(|(t, _)| *t)
            .unwrap_or("news");

        let mut refs: Vec<String> = in_window.iter().map(|i| format!("news:{}", i.id)).collect();
        refs.sort();

        let description = format!(
            "{count} relevant '{top_tag}' headlines on {entity} within {} min (avg relevance {avg_relevance:.2}).",
            rules.news_cluster_window_minutes
        );
        out.push(new_anomaly(
            AnomalyType::NewsCluster,
            severity,
            None,
            vec![entity.clone()],
            Vec::new(),
            "News cluster forming".to_string(),
            description,
            in_window
                .iter()
                .map(|i| i.published_at.clone())
                .max()
                .unwrap_or_default(),
            refs,
            Some(format!(
                "rule:news_cluster>={}",
                rules.news_cluster_min_items
            )),
        ));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_news() -> Vec<NewsItem> {
        let raw =
            std::fs::read_to_string("../../fixtures/news/items.json").expect("read news fixture");
        serde_json::from_str(&raw).expect("parse news")
    }

    #[test]
    fn multiple_btc_etf_headlines_emit_news_cluster() {
        let mut st = EngineState::new();
        for item in load_news() {
            st.ingest_news(item);
        }
        let out = detect(&st, &RulesConfig::default());
        let btc = out
            .iter()
            .find(|a| a.assets.iter().any(|x| x == "crypto:btc-usdt"))
            .expect("two BTC ETF headlines should cluster");
        assert_eq!(btc.anomaly_type, AnomalyType::NewsCluster);
        assert!(btc.context_refs.len() >= 2);
        assert!(btc.description.contains("etf"));
        btc.validate().expect("valid");
        // ETH has a single relevant item → no cluster.
        assert!(!out
            .iter()
            .any(|a| a.assets.iter().any(|x| x == "crypto:eth-usdt")));
    }

    #[test]
    fn single_headline_does_not_cluster() {
        let mut st = EngineState::new();
        let item: NewsItem = serde_json::from_value(serde_json::json!({
            "id": "n1",
            "title": "BTC up",
            "source": "x",
            "published_at": "2026-06-07T12:00:00Z",
            "entities": ["crypto:btc-usdt"],
            "summary": "s",
            "relevance_score": 0.9,
            "sentiment": "positive",
            "tags": ["btc"]
        }))
        .expect("item");
        st.ingest_news(item);
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }

    #[test]
    fn headlines_outside_window_do_not_cluster() {
        let mut st = EngineState::new();
        for (i, ts) in ["2026-06-07T00:00:00Z", "2026-06-07T12:00:00Z"]
            .iter()
            .enumerate()
        {
            let item: NewsItem = serde_json::from_value(serde_json::json!({
                "id": format!("n{i}"),
                "title": "BTC ETF",
                "source": "x",
                "published_at": ts,
                "entities": ["crypto:btc-usdt"],
                "summary": "s",
                "relevance_score": 0.9,
                "sentiment": "positive",
                "tags": ["etf"]
            }))
            .expect("item");
            st.ingest_news(item);
        }
        // 12h apart > 120 min window → no cluster.
        assert!(detect(&st, &RulesConfig::default()).is_empty());
    }
}
