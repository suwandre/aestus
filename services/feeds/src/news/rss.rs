//! RSS news fetcher with configurable sources and fixture fallback (P07-T004).
//!
//! When `sources` is empty (or all live fetches fail) the fetcher falls back to
//! the JSON fixture at `fixture_path`, satisfying the fixture-first hard rule.
//! Deduplication by URL hash happens in [`dedupe::DedupeSet`]; this module
//! only returns a deduplicated-by-URL batch within a single poll call.

use super::{url_hash, NewsItem};
use std::collections::HashSet;
use std::path::Path;

/// Polls RSS feed URLs and normalises items to [`NewsItem`].
pub struct RssFetcher {
    sources: Vec<String>,
    fixture_path: String,
}

impl RssFetcher {
    /// Create a new fetcher.
    ///
    /// `sources` — comma-split list of RSS feed URLs (empty = fixture only).
    /// `fixture_path` — path to `fixtures/news/items.json`.
    pub fn new(sources: Vec<String>, fixture_path: impl Into<String>) -> Self {
        Self {
            sources,
            fixture_path: fixture_path.into(),
        }
    }

    /// Poll once.  Falls back to fixture when no live sources are configured.
    pub async fn poll_once(&self) -> anyhow::Result<Vec<NewsItem>> {
        if self.sources.is_empty() {
            return load_fixture_news(&self.fixture_path);
        }

        let mut items = Vec::new();
        let client = reqwest::Client::new();
        for url in &self.sources {
            match fetch_rss_feed(&client, url).await {
                Ok(mut batch) => items.append(&mut batch),
                Err(e) => {
                    tracing::warn!(source = %url, error = %e, "RSS fetch failed");
                    crate::metrics::inc_errors("news");
                }
            }
        }

        if items.is_empty() {
            tracing::warn!("all RSS sources failed, falling back to fixture");
            return load_fixture_news(&self.fixture_path);
        }

        Ok(dedup_within_batch(items))
    }
}

/// Load news items from a JSON fixture file.
pub fn load_fixture_news(path: impl AsRef<Path>) -> anyhow::Result<Vec<NewsItem>> {
    let path = path.as_ref();
    let data = std::fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("news fixture '{}': {}", path.display(), e))?;
    let raw: Vec<serde_json::Value> = serde_json::from_str(&data)?;
    let items = raw.iter().filter_map(normalise_fixture_item).collect();
    Ok(items)
}

fn normalise_fixture_item(v: &serde_json::Value) -> Option<NewsItem> {
    let id = v["id"].as_str()?.to_string();
    let url = v["url"].as_str()?.to_string();
    Some(NewsItem {
        url_hash: url_hash(&url),
        id,
        title: v["title"].as_str().unwrap_or("").to_string(),
        url,
        source: v["source"].as_str().unwrap_or("unknown").to_string(),
        source_type: v["source_type"].as_str().unwrap_or("news").to_string(),
        published_at: v["published_at"].as_str().unwrap_or("").to_string(),
        entities: v["entities"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        summary: v["summary"].as_str().unwrap_or("").to_string(),
        relevance_score: v["relevance_score"].as_f64().unwrap_or(0.0),
        sentiment: v["sentiment"].as_str().unwrap_or("neutral").to_string(),
        tags: v["tags"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
    })
}

async fn fetch_rss_feed(client: &reqwest::Client, url: &str) -> anyhow::Result<Vec<NewsItem>> {
    let body = client.get(url).send().await?.text().await?;
    parse_rss_xml(&body, url)
}

/// Lightweight RSS 2.0 / Atom XML line-scanner.
/// Extracts `<title>`, `<link>`, `<description>`, `<pubDate>`/`<published>`.
fn parse_rss_xml(xml: &str, feed_url: &str) -> anyhow::Result<Vec<NewsItem>> {
    let source = extract_domain(feed_url);
    let mut items = Vec::new();
    let mut in_item = false;
    let mut title = String::new();
    let mut link = String::new();
    let mut description = String::new();
    let mut pub_date = String::new();

    for line in xml.lines() {
        let l = line.trim();
        if l == "<item>" || l.starts_with("<item ") || l == "<entry>" {
            in_item = true;
            title.clear();
            link.clear();
            description.clear();
            pub_date.clear();
            continue;
        }
        if l == "</item>" || l == "</entry>" {
            if !link.is_empty() {
                let hash = url_hash(&link);
                items.push(NewsItem {
                    id: hash.clone(),
                    url_hash: hash,
                    url: link.clone(),
                    title: title.clone(),
                    summary: description.clone(),
                    source: source.clone(),
                    source_type: "rss".into(),
                    published_at: pub_date.clone(),
                    entities: vec![],
                    relevance_score: 0.0,
                    sentiment: "neutral".into(),
                    tags: vec![],
                });
            }
            in_item = false;
            continue;
        }
        if !in_item {
            continue;
        }
        if let Some(v) = extract_xml_tag(l, "title") {
            title = v;
        } else if let Some(v) = extract_xml_tag(l, "link") {
            link = v;
        } else if let Some(v) = extract_xml_tag(l, "description") {
            description = v;
        } else if let Some(v) = extract_xml_tag(l, "pubDate") {
            pub_date = v;
        } else if let Some(v) = extract_xml_tag(l, "published") {
            pub_date = v;
        }
    }

    Ok(dedup_within_batch(items))
}

fn extract_xml_tag(line: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = line.find(&open)?;
    let end = line.rfind(&close)?;
    let inner = &line[start + open.len()..end];
    let stripped = inner
        .trim()
        .trim_start_matches("<![CDATA[")
        .trim_end_matches("]]>");
    Some(stripped.trim().to_string())
}

fn extract_domain(url: &str) -> String {
    url.trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("unknown")
        .to_string()
}

/// Remove items with duplicate url_hash within a single batch.
fn dedup_within_batch(items: Vec<NewsItem>) -> Vec<NewsItem> {
    let mut seen = HashSet::new();
    items
        .into_iter()
        .filter(|i| seen.insert(i.url_hash.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_path() -> &'static str {
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/news/items.json"
        )
    }

    #[tokio::test]
    async fn poll_once_returns_fixture_items() {
        let fetcher = RssFetcher::new(vec![], fixture_path().to_string());
        let items = fetcher.poll_once().await.expect("poll_once");
        assert!(!items.is_empty(), "fixture must contain news items");
        for item in &items {
            assert!(!item.url.is_empty(), "item must have URL");
            assert!(!item.url_hash.is_empty(), "item must have url_hash");
        }
    }

    #[test]
    fn url_hash_is_deterministic() {
        let h1 = url_hash("https://coindesk.com/article/1");
        let h2 = url_hash("https://coindesk.com/article/1");
        assert_eq!(h1, h2);
        let h3 = url_hash("https://coindesk.com/article/2");
        assert_ne!(h1, h3);
    }

    #[test]
    fn url_hash_normalises_trailing_slash() {
        let a = url_hash("https://example.com/page");
        let b = url_hash("https://example.com/page/");
        assert_eq!(a, b);
    }

    #[test]
    fn parse_rss_xml_extracts_items() {
        let xml = r#"
<rss>
  <channel>
    <item>
      <title>BTC hits $68k</title>
      <link>https://example.com/btc-68k</link>
      <description>Bitcoin reclaims $68,000.</description>
      <pubDate>Mon, 07 Jun 2026 11:45:00 +0000</pubDate>
    </item>
    <item>
      <title>ETH staking update</title>
      <link>https://example.com/eth-staking</link>
      <description>New staking changes.</description>
      <pubDate>Mon, 07 Jun 2026 10:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>"#;
        let items = parse_rss_xml(xml, "https://example.com/rss").unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].title, "BTC hits $68k");
        assert_eq!(items[0].source_type, "rss");
    }

    #[test]
    fn parse_rss_xml_deduplicates_same_link() {
        let xml = r#"
<rss>
  <channel>
    <item>
      <title>Article A</title>
      <link>https://example.com/a</link>
      <description>desc</description>
    </item>
    <item>
      <title>Article A duplicate</title>
      <link>https://example.com/a</link>
      <description>same link</description>
    </item>
  </channel>
</rss>"#;
        let items = parse_rss_xml(xml, "https://example.com/rss").unwrap();
        assert_eq!(items.len(), 1, "duplicate URL must be deduped within batch");
    }
}
