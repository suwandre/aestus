//! Deterministic keyword-based entity extraction for news items (P07-T005).
//!
//! Scans `title` and `summary` for known asset tickers, macro event names,
//! venue names, and special tags. Discovered entities are appended to
//! `NewsItem::entities`; matched categories are appended to `NewsItem::tags`.

use super::NewsItem;

/// (keyword patterns, output entity tag)
static ASSET_RULES: &[(&[&str], &str)] = &[
    (&["bitcoin", "btc"], "BTC"),
    (&["ethereum", "eth"], "ETH"),
    (&["solana", "sol"], "SOL"),
    (&["xrp", "ripple"], "XRP"),
    (&["bnb", "binance coin"], "BNB"),
    (&["dogecoin", "doge"], "DOGE"),
    (&["avalanche", "avax"], "AVAX"),
    (&["chainlink", "link"], "LINK"),
];

static CANONICAL_MAP: &[(&str, &str)] = &[
    ("BTC", "crypto:btc-usdt"),
    ("ETH", "crypto:eth-usdt"),
    ("SOL", "crypto:sol-usdt"),
];

static MACRO_RULES: &[(&[&str], &str)] = &[
    (&["cpi", "consumer price index"], "CPI"),
    (
        &[
            "fomc",
            "federal reserve",
            "fed rate",
            "interest rate decision",
        ],
        "FOMC",
    ),
    (&["nfp", "non-farm payroll", "payrolls"], "NFP"),
    (&["ppi", "producer price"], "PPI"),
    (&["gdp", "gross domestic"], "GDP"),
    (
        &["jobless claims", "unemployment claims", "initial claims"],
        "JOBLESS_CLAIMS",
    ),
    (&["dxy", "dollar index", "usd index"], "DXY"),
    (&["vix", "volatility index"], "VIX"),
    (&["spx", "s&p 500", "s&p500", "s&p five hundred"], "SPX"),
    (&["etf", "exchange traded fund"], "ETF"),
];

static VENUE_RULES: &[(&[&str], &str)] = &[
    (&["binance"], "Binance"),
    (&["coinbase"], "Coinbase"),
    (&["bybit"], "Bybit"),
    (&["okx", "okex"], "OKX"),
    (&["hyperliquid"], "Hyperliquid"),
    (&["kraken"], "Kraken"),
    (&["bitfinex"], "Bitfinex"),
];

static TAG_RULES: &[(&[&str], &str)] = &[
    (&["whale", "whale alert"], "whale"),
    (&["institutional", "institution"], "institutional"),
    (&["spot etf", "bitcoin etf", "crypto etf"], "etf"),
    (&["hack", "exploit", "vulnerability"], "security"),
    (&["regulation", "regulatory", "sec ", "cftc"], "regulation"),
    (&["defi", "decentralized finance"], "defi"),
    (&["liquidat"], "liquidation"),
];

/// Extract entities from `item.title` and `item.summary`.
///
/// Appends newly discovered entities to `item.entities` and matched
/// category labels to `item.tags`. No duplicates are added.
pub fn extract_entities(item: &mut NewsItem) {
    let haystack = format!("{} {}", item.title, item.summary).to_lowercase();

    for (patterns, ticker) in ASSET_RULES {
        if patterns.iter().any(|p| haystack.contains(*p)) {
            add_unique(&mut item.entities, ticker);
            if let Some(canonical) = CANONICAL_MAP
                .iter()
                .find(|(t, _)| *t == *ticker)
                .map(|(_, c)| *c)
            {
                add_unique(&mut item.entities, canonical);
            }
        }
    }

    for (patterns, label) in MACRO_RULES {
        if patterns.iter().any(|p| haystack.contains(*p)) {
            add_unique(&mut item.entities, label);
            add_unique(&mut item.tags, &label.to_lowercase());
        }
    }

    for (patterns, venue) in VENUE_RULES {
        if patterns.iter().any(|p| haystack.contains(*p)) {
            add_unique(&mut item.entities, venue);
        }
    }

    for (patterns, tag) in TAG_RULES {
        if patterns.iter().any(|p| haystack.contains(*p)) {
            add_unique(&mut item.tags, tag);
        }
    }
}

fn add_unique(v: &mut Vec<String>, s: &str) {
    if !v.iter().any(|x| x == s) {
        v.push(s.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::news::url_hash;

    fn make_item(title: &str, summary: &str) -> NewsItem {
        NewsItem {
            id: "test".into(),
            url: "https://example.com/test".into(),
            url_hash: url_hash("https://example.com/test"),
            title: title.into(),
            summary: summary.into(),
            source: "test".into(),
            source_type: "rss".into(),
            published_at: "2026-06-07T10:00:00.000Z".into(),
            entities: vec![],
            relevance_score: 0.0,
            sentiment: "neutral".into(),
            tags: vec![],
        }
    }

    #[test]
    fn extracts_btc_from_title() {
        let mut item = make_item("Bitcoin reclaims $68k", "BTC price action");
        extract_entities(&mut item);
        assert!(item.entities.contains(&"BTC".to_string()));
        assert!(item.entities.contains(&"crypto:btc-usdt".to_string()));
    }

    #[test]
    fn extracts_eth_from_summary() {
        let mut item = make_item("Market update", "Ethereum trading volume rises");
        extract_entities(&mut item);
        assert!(item.entities.contains(&"ETH".to_string()));
        assert!(item.entities.contains(&"crypto:eth-usdt".to_string()));
    }

    #[test]
    fn extracts_multiple_assets() {
        let mut item = make_item("ETH and BTC rally", "Ethereum and Bitcoin surge");
        extract_entities(&mut item);
        assert!(item.entities.contains(&"ETH".to_string()));
        assert!(item.entities.contains(&"BTC".to_string()));
    }

    #[test]
    fn extracts_fomc() {
        let mut item = make_item("FOMC holds rates", "Federal Reserve decision");
        extract_entities(&mut item);
        assert!(item.entities.contains(&"FOMC".to_string()));
        assert!(item.tags.contains(&"fomc".to_string()));
    }

    #[test]
    fn extracts_cpi() {
        let mut item = make_item("CPI data released", "Consumer price index up 3.1%");
        extract_entities(&mut item);
        assert!(item.entities.contains(&"CPI".to_string()));
    }

    #[test]
    fn extracts_binance_venue() {
        let mut item = make_item("Binance lists new token", "Exchange announcement");
        extract_entities(&mut item);
        assert!(item.entities.contains(&"Binance".to_string()));
    }

    #[test]
    fn extracts_etf_tag() {
        let mut item = make_item("Bitcoin ETF inflows record high", "Spot ETF data");
        extract_entities(&mut item);
        assert!(item.entities.contains(&"ETF".to_string()));
        assert!(item.tags.contains(&"etf".to_string()));
    }

    #[test]
    fn no_duplicates_added() {
        let mut item = make_item("Bitcoin Bitcoin Bitcoin", "BTC BTC BTC");
        extract_entities(&mut item);
        let btc_count = item.entities.iter().filter(|e| e.as_str() == "BTC").count();
        assert_eq!(btc_count, 1, "entity must not be duplicated");
    }

    #[test]
    fn unrelated_content_extracts_nothing() {
        let mut item = make_item("Weather forecast for Berlin", "Cloudy with a chance of rain");
        extract_entities(&mut item);
        assert!(item.entities.is_empty());
    }
}
