//! Rules-based news relevance scoring (P07-T006).
//!
//! Scores a [`NewsItem`] 0–1 based on its relation to the watched assets and
//! the signals the system considers high-value. The result is stored in
//! `NewsItem::relevance_score` so consumers can sort/filter by signal strength.
//!
//! ## Scoring rules (additive, clamped to 1.0)
//!
//! - `+0.5` per watched asset mentioned in `entities`
//! - `+0.3` for high-impact macro entity (FOMC, CPI, NFP)
//! - `+0.2` for whale / institutional tag
//! - `+0.1` for ETF tag
//! - `-0.1` penalty: neutral sentiment on a high-macro item (likely noise)

use super::NewsItem;

const HIGH_MACRO: &[&str] = &["FOMC", "CPI", "NFP"];

/// Score `item` against `watched_assets` and update `item.relevance_score`.
pub fn score_relevance(item: &mut NewsItem, watched_assets: &[String]) {
    let mut score = 0.0_f64;

    for watched in watched_assets {
        if item.entities.iter().any(|e| e == watched) {
            score += 0.5;
        }
    }

    if item
        .entities
        .iter()
        .any(|e| HIGH_MACRO.contains(&e.as_str()))
    {
        score += 0.3;
    }

    if item
        .tags
        .iter()
        .any(|t| t == "whale" || t == "institutional")
    {
        score += 0.2;
    }

    if item.tags.iter().any(|t| t == "etf") {
        score += 0.1;
    }

    // Neutral sentiment on a high-macro item signals noise over signal.
    if item.sentiment == "neutral"
        && item
            .entities
            .iter()
            .any(|e| HIGH_MACRO.contains(&e.as_str()))
    {
        score -= 0.1;
    }

    item.relevance_score = score.clamp(0.0, 1.0);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::news::url_hash;

    fn make_item(entities: &[&str], tags: &[&str], sentiment: &str) -> NewsItem {
        NewsItem {
            id: "test".into(),
            url: "https://example.com".into(),
            url_hash: url_hash("https://example.com"),
            title: "Test".into(),
            summary: "Test summary".into(),
            source: "test".into(),
            source_type: "rss".into(),
            published_at: "2026-06-07T10:00:00.000Z".into(),
            entities: entities.iter().map(|s| s.to_string()).collect(),
            relevance_score: 0.0,
            sentiment: sentiment.into(),
            tags: tags.iter().map(|s| s.to_string()).collect(),
            source_confidence: crate::confidence::Confidence::Medium,
        }
    }

    fn btc_watched() -> Vec<String> {
        vec!["crypto:btc-usdt".to_string(), "crypto:eth-usdt".to_string()]
    }

    #[test]
    fn watched_asset_match_scores_high() {
        let mut item = make_item(&["BTC", "crypto:btc-usdt"], &[], "positive");
        score_relevance(&mut item, &btc_watched());
        assert!(
            item.relevance_score >= 0.5,
            "watched asset match should score >= 0.5"
        );
    }

    #[test]
    fn irrelevant_item_scores_zero() {
        let mut item = make_item(&["EUR", "Forex"], &[], "neutral");
        score_relevance(&mut item, &btc_watched());
        assert!(
            item.relevance_score < 0.1,
            "unrelated item should score < 0.1"
        );
    }

    #[test]
    fn fomc_news_gets_macro_boost() {
        let mut item = make_item(&["FOMC"], &[], "positive");
        score_relevance(&mut item, &btc_watched());
        assert!(
            item.relevance_score >= 0.3,
            "FOMC item must have >= 0.3 from macro boost"
        );
    }

    #[test]
    fn neutral_macro_penalised() {
        let mut item_positive = make_item(&["CPI"], &[], "positive");
        let mut item_neutral = make_item(&["CPI"], &[], "neutral");
        score_relevance(&mut item_positive, &btc_watched());
        score_relevance(&mut item_neutral, &btc_watched());
        assert!(
            item_positive.relevance_score > item_neutral.relevance_score,
            "positive-sentiment macro should outscore neutral macro"
        );
    }

    #[test]
    fn whale_tag_adds_signal() {
        let mut item_no_tag = make_item(&["BTC", "crypto:btc-usdt"], &[], "neutral");
        let mut item_whale = make_item(&["BTC", "crypto:btc-usdt"], &["whale"], "neutral");
        score_relevance(&mut item_no_tag, &btc_watched());
        score_relevance(&mut item_whale, &btc_watched());
        assert!(
            item_whale.relevance_score > item_no_tag.relevance_score,
            "whale tag should add score"
        );
    }

    #[test]
    fn score_is_clamped_to_one() {
        let mut item = make_item(
            &["BTC", "crypto:btc-usdt", "ETH", "crypto:eth-usdt", "FOMC"],
            &["whale", "etf"],
            "positive",
        );
        score_relevance(&mut item, &btc_watched());
        assert!(item.relevance_score <= 1.0, "score must never exceed 1.0");
        assert!(item.relevance_score >= 0.0, "score must never go below 0.0");
    }
}
