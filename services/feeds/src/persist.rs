//! Postgres persistence for contextual items (P07-T011).
//!
//! Upserts news, macro, and on-chain items so the context assembler can query
//! them from Postgres. When `POSTGRES_URL` is unset the sink is a no-op —
//! satisfying the fixture-first hard rule. No connection pool is used at this
//! stage; connections are opened per-call (acceptable at 5-minute poll cadence).

use crate::calendar::CalendarItem;
use crate::news::NewsItem;
use crate::onchain::OnChainItem;

/// Postgres upsert sink. All methods are no-ops when `db_url` is `None`.
pub struct PostgresSink {
    db_url: Option<String>,
}

impl PostgresSink {
    pub fn new(db_url: Option<String>) -> Self {
        Self { db_url }
    }

    /// Whether the sink has a configured database URL.
    pub fn is_enabled(&self) -> bool {
        self.db_url.is_some()
    }

    /// Upsert a news item into `news_items` + `news_entities`.
    pub async fn upsert_news_item(&self, item: &NewsItem) -> anyhow::Result<()> {
        let Some(ref url) = self.db_url else {
            return Ok(());
        };
        let (client, conn) =
            tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!(error = %e, "postgres connection error");
            }
        });

        // ENUM casts via SQL: $6::news_source_type, $10::sentiment
        client
            .execute(
                "INSERT INTO news_items \
                 (id, title, url, url_hash, source, source_type, \
                  published_at, summary, relevance_score, sentiment, tags) \
                 VALUES ($1,$2,$3,$4,$5,$6::news_source_type,$7::timestamptz,\
                         $8,$9,$10::sentiment,$11) \
                 ON CONFLICT (id) DO UPDATE SET \
                   relevance_score = EXCLUDED.relevance_score, \
                   sentiment       = EXCLUDED.sentiment, \
                   tags            = EXCLUDED.tags",
                &[
                    &item.id,
                    &item.title,
                    &item.url,
                    &item.url_hash,
                    &item.source,
                    &item.source_type.as_str(),
                    &item.published_at.as_str(),
                    &item.summary,
                    &item.relevance_score,
                    &item.sentiment.as_str(),
                    &item.tags,
                ],
            )
            .await?;

        for entity in &item.entities {
            client
                .execute(
                    "INSERT INTO news_entities (news_id, entity) \
                     VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    &[&item.id, entity],
                )
                .await?;
        }

        Ok(())
    }

    /// Upsert a macro event into `macro_events`.
    pub async fn upsert_macro_event(&self, item: &CalendarItem) -> anyhow::Result<()> {
        let Some(ref url) = self.db_url else {
            return Ok(());
        };
        let (client, conn) =
            tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!(error = %e, "postgres connection error");
            }
        });

        client
            .execute(
                "INSERT INTO macro_events \
                 (event_id, region, currency, title, scheduled_at, importance, \
                  consensus, previous, actual, source) \
                 VALUES ($1,$2,$3,$4,$5::timestamptz,$6::macro_importance,\
                         $7,$8,$9,$10) \
                 ON CONFLICT (event_id) DO UPDATE SET \
                   actual     = EXCLUDED.actual, \
                   updated_at = now()",
                &[
                    &item.event_id,
                    &item.region,
                    &item.currency,
                    &item.title,
                    &item.scheduled_at.as_str(),
                    &item.importance.as_str(),
                    &item.consensus,
                    &item.previous,
                    &item.actual,
                    &item.source,
                ],
            )
            .await?;

        Ok(())
    }

    /// Write an embedding reference to `news_embeddings`.
    ///
    /// The `embedding` vector column is left NULL in this placeholder phase
    /// (pgvector crate not yet added). Stores model name and dimension so the
    /// row exists for later vector back-fill.
    pub async fn upsert_news_embedding(
        &self,
        news_id: &str,
        model: &str,
        dim: u32,
    ) -> anyhow::Result<()> {
        let Some(ref url) = self.db_url else {
            return Ok(());
        };
        let (client, conn) =
            tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!(error = %e, "postgres connection error");
            }
        });

        let dim_i32 = dim as i32;
        client
            .execute(
                "INSERT INTO news_embeddings (news_id, model, dim) \
                 VALUES ($1, $2, $3) \
                 ON CONFLICT (news_id) DO UPDATE SET \
                   model = EXCLUDED.model, \
                   dim   = EXCLUDED.dim",
                &[&news_id, &model, &dim_i32],
            )
            .await?;

        Ok(())
    }

    /// Upsert an on-chain event into `on_chain_events`.
    pub async fn upsert_on_chain_event(&self, item: &OnChainItem) -> anyhow::Result<()> {
        let Some(ref url) = self.db_url else {
            return Ok(());
        };
        let (client, conn) =
            tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!(error = %e, "postgres connection error");
            }
        });

        let attrs_json = item.attributes.to_string();
        client
            .execute(
                "INSERT INTO on_chain_events \
                 (id, event_type, chain, asset_id, value, value_usd, \
                  addresses, attributes, source, occurred_at) \
                 VALUES ($1,$2::on_chain_event_type,$3,$4,$5,$6,\
                         $7,$8::jsonb,$9,$10::timestamptz) \
                 ON CONFLICT (id) DO NOTHING",
                &[
                    &item.id,
                    &item.event_type.as_str(),
                    &item.chain,
                    &item.asset,
                    &item.value,
                    &item.value_usd,
                    &item.addresses,
                    &attrs_json.as_str(),
                    &item.source,
                    &item.occurred_at.as_str(),
                ],
            )
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::news::url_hash;
    use crate::onchain::Confidence;

    fn make_news() -> NewsItem {
        NewsItem {
            id: "news-001".into(),
            url: "https://example.com/news".into(),
            url_hash: url_hash("https://example.com/news"),
            title: "Test news".into(),
            summary: "Test summary".into(),
            source: "test".into(),
            source_type: "rss".into(),
            published_at: "2026-06-07T10:00:00.000Z".into(),
            entities: vec!["BTC".into()],
            relevance_score: 0.7,
            sentiment: "positive".into(),
            tags: vec!["btc".into()],
        }
    }

    fn make_calendar() -> CalendarItem {
        CalendarItem {
            event_id: "us-cpi-2026-06".into(),
            region: "US".into(),
            currency: "USD".into(),
            title: "CPI (YoY)".into(),
            scheduled_at: "2026-06-10T12:30:00.000Z".into(),
            importance: "high".into(),
            consensus: Some(3.1),
            previous: Some(3.4),
            actual: None,
            source: "te".into(),
        }
    }

    fn make_onchain() -> OnChainItem {
        OnChainItem {
            id: "tx-001".into(),
            event_type: "exchange_flow".into(),
            chain: "bitcoin".into(),
            asset: "crypto:btc-usdt".into(),
            value: 100.0,
            value_usd: Some(6_800_000.0),
            addresses: vec![],
            attributes: serde_json::json!({"direction": "net"}),
            source: "glassnode".into(),
            confidence: Confidence::High,
            occurred_at: "2026-06-07T00:00:00.000Z".into(),
        }
    }

    #[tokio::test]
    async fn upsert_news_no_postgres_is_noop() {
        let sink = PostgresSink::new(None);
        assert!(!sink.is_enabled());
        sink.upsert_news_item(&make_news()).await.unwrap();
    }

    #[tokio::test]
    async fn upsert_macro_no_postgres_is_noop() {
        let sink = PostgresSink::new(None);
        sink.upsert_macro_event(&make_calendar()).await.unwrap();
    }

    #[tokio::test]
    async fn upsert_onchain_no_postgres_is_noop() {
        let sink = PostgresSink::new(None);
        sink.upsert_on_chain_event(&make_onchain()).await.unwrap();
    }

    #[tokio::test]
    async fn upsert_embedding_no_postgres_is_noop() {
        let sink = PostgresSink::new(None);
        sink.upsert_news_embedding("news-001", "noop", 0).await.unwrap();
    }
}
