//! Embedding pipeline placeholder (P07-T007).
//!
//! Defines [`EmbeddingProvider`] and [`EmbeddingRef`] so the Postgres storage
//! pathway (`news_embeddings` table, P04-T003) exists and the provider can be
//! enabled later via config without changing the ingestion loop.
//!
//! No-op fallback is returned by default so the service runs without an
//! embedding API key.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// A stored embedding reference: which news item it belongs to, which model
/// produced it, and the vector dimension. The actual float vector lives in the
/// `news_embeddings.embedding` column (pgvector).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingRef {
    pub news_id: String,
    /// Model identifier, e.g. `text-embedding-ada-002`, `all-MiniLM-L6-v2`.
    pub model: String,
    /// Vector dimension; set to 0 for the no-op provider.
    pub dim: u32,
}

/// Generates float embeddings for text.
///
/// An ivfflat/hnsw index over the fixed-dim column in `news_embeddings` is
/// added when the provider is selected (see `docs/migrations.md`).
#[async_trait]
pub trait EmbeddingProvider: Send + Sync {
    /// Provider name, e.g. `openai`, `ollama`, `noop`.
    fn name(&self) -> &str;

    /// Embedding dimension this provider produces. `0` for no-op.
    fn dim(&self) -> u32;

    /// Embed `text` and return the float vector.
    /// Returns `None` when the provider is disabled or `text` is empty.
    async fn embed(&self, text: &str) -> anyhow::Result<Option<Vec<f32>>>;
}

/// No-op provider — never issues an API call.
/// Used when `EMBEDDING_PROVIDER` is unset, empty, or `"noop"`.
pub struct NoOpEmbeddingProvider;

#[async_trait]
impl EmbeddingProvider for NoOpEmbeddingProvider {
    fn name(&self) -> &str {
        "noop"
    }

    fn dim(&self) -> u32 {
        0
    }

    async fn embed(&self, _text: &str) -> anyhow::Result<Option<Vec<f32>>> {
        Ok(None)
    }
}

/// Build the appropriate provider from config.
///
/// Returns [`NoOpEmbeddingProvider`] for `None`, `""`, or `"noop"`. Live
/// provider construction is wired in a later phase.
pub fn build_provider(provider_name: Option<&str>) -> Box<dyn EmbeddingProvider> {
    match provider_name {
        Some(name) if !name.is_empty() && name != "noop" => {
            tracing::warn!(
                provider = name,
                "embedding provider not yet implemented; using noop"
            );
            Box::new(NoOpEmbeddingProvider)
        }
        _ => Box::new(NoOpEmbeddingProvider),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn noop_provider_returns_none() {
        let p = NoOpEmbeddingProvider;
        let result = p.embed("Bitcoin price surges past $68k").await.unwrap();
        assert!(result.is_none(), "noop should always return None");
    }

    #[test]
    fn build_provider_returns_noop_for_none() {
        let p = build_provider(None);
        assert_eq!(p.name(), "noop");
        assert_eq!(p.dim(), 0);
    }

    #[test]
    fn build_provider_returns_noop_for_empty() {
        let p = build_provider(Some(""));
        assert_eq!(p.name(), "noop");
    }

    #[test]
    fn build_provider_falls_back_for_unknown_provider() {
        // Unknown provider names fall back to noop until implemented.
        let p = build_provider(Some("openai"));
        assert_eq!(p.name(), "noop");
    }

    #[test]
    fn embedding_ref_fields_correct() {
        let r = EmbeddingRef {
            news_id: "news-001".into(),
            model: "text-embedding-ada-002".into(),
            dim: 1536,
        };
        assert_eq!(r.news_id, "news-001");
        assert_eq!(r.model, "text-embedding-ada-002");
        assert_eq!(r.dim, 1536);
    }
}
