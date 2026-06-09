//! News/narrative feed types and jobs (P07-T004 to P07-T007).

pub mod embeddings;
pub mod entity_extractor;
pub mod relevance;
pub mod rss;

use crate::confidence::Confidence;
use serde::{Deserialize, Serialize};

/// A normalised news or narrative item.
///
/// Mirrors `NewsItem` in `packages/contracts/src/news.ts` and the
/// `news_items` Postgres table (P04-T003). `url_hash` is the sha256 of the
/// canonical URL — used for dedup across provider polls.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewsItem {
    pub id: String,
    pub title: String,
    pub url: String,
    /// SHA-256 hex of the normalised URL, for dedup.
    pub url_hash: String,
    pub source: String,
    pub source_type: String,
    pub published_at: String,
    /// Entity tags: canonical asset ids, tickers, venue names, macro labels.
    pub entities: Vec<String>,
    pub summary: String,
    /// Relevance score 0 (noise) to 1 (high signal), set by the relevance job.
    pub relevance_score: f64,
    pub sentiment: String,
    pub tags: Vec<String>,
    /// Source data confidence (P08-T006): RSS/aggregated news defaults to Medium.
    #[serde(default)]
    pub source_confidence: Confidence,
}

/// Compute the sha256 hex digest of a URL (lowercased, trailing slash stripped).
pub fn url_hash(url: &str) -> String {
    use sha2::{Digest, Sha256};
    let normalised = url.trim().to_lowercase();
    let normalised = normalised.trim_end_matches('/');
    let hash = Sha256::digest(normalised.as_bytes());
    hex::encode(hash)
}
