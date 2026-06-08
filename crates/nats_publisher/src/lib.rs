//! Rust NATS publisher helper for the Aestus event backbone (P05-T003).
//!
//! Producers (ingestion, features, …) wrap payloads in an [`Envelope`] and
//! publish them with retries and structured errors. The transport is abstracted
//! behind the [`Publisher`] trait so the same call sites work against a live
//! NATS connection ([`NatsPublisher`]) or an in-memory recorder
//! ([`RecordingPublisher`]) for fixture-first development and tests.

use std::future::Future;
use std::time::Duration;

use async_trait::async_trait;
use event_model::envelope::Envelope;
use serde::Serialize;

pub mod heartbeat;
pub use heartbeat::Heartbeat;

/// Structured failures from the publish path.
#[derive(Debug, thiserror::Error)]
pub enum PublishError {
    /// Could not establish/obtain a NATS connection.
    #[error("nats connect failed: {0}")]
    Connect(String),
    /// Envelope payload could not be serialized to JSON.
    #[error("serialize failed: {0}")]
    Serialize(#[from] serde_json::Error),
    /// Publish still failing after all retry attempts.
    #[error("publish to '{subject}' failed after {attempts} attempt(s): {cause}")]
    Publish {
        subject: String,
        attempts: u32,
        cause: String,
    },
}

/// Retry policy for transient publish failures (linear backoff).
#[derive(Debug, Clone, Copy)]
pub struct RetryConfig {
    /// Total attempts including the first try. Must be >= 1.
    pub max_attempts: u32,
    /// Base delay; attempt `n` (1-based) waits `base_delay * n` before retrying.
    pub base_delay: Duration,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_millis(100),
        }
    }
}

/// Transport abstraction: publish raw bytes to a subject.
#[async_trait]
pub trait Publisher: Send + Sync {
    /// Publish `payload` to `subject`. Implementations own their retry policy.
    async fn publish_bytes(&self, subject: &str, payload: Vec<u8>) -> Result<(), PublishError>;
}

/// Run `attempt` up to `retry.max_attempts` times, waiting `base_delay * n`
/// between tries. Returns `Ok` on the first success; otherwise a
/// [`PublishError::Publish`] carrying the attempt count and last error string.
/// This is the single retry code path shared by [`NatsPublisher`] (and tested
/// directly with a flaky transport).
pub async fn with_retries<F, Fut>(
    retry: RetryConfig,
    subject: &str,
    mut attempt: F,
) -> Result<(), PublishError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<(), String>>,
{
    let attempts = retry.max_attempts.max(1);
    let mut last_err = String::from("no attempt made");
    for n in 1..=attempts {
        match attempt().await {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = e;
                if n < attempts {
                    tracing::warn!(subject, attempt = n, error = %last_err, "publish failed, retrying");
                    tokio::time::sleep(retry.base_delay * n).await;
                }
            }
        }
    }
    Err(PublishError::Publish {
        subject: subject.to_string(),
        attempts,
        cause: last_err,
    })
}

/// Serialize an [`Envelope`] to JSON and publish it via any [`Publisher`].
///
/// # Errors
/// Returns [`PublishError::Serialize`] if the payload cannot be encoded, or the
/// publisher's error (e.g. [`PublishError::Publish`]) if delivery fails.
pub async fn publish_envelope<P, T>(
    publisher: &P,
    subject: &str,
    envelope: &Envelope<T>,
) -> Result<(), PublishError>
where
    P: Publisher + ?Sized,
    T: Serialize + Sync,
{
    let bytes = serde_json::to_vec(envelope)?;
    publisher.publish_bytes(subject, bytes).await
}

/// Publisher backed by a live NATS core connection, with linear-backoff retries.
pub struct NatsPublisher {
    client: async_nats::Client,
    retry: RetryConfig,
}

impl NatsPublisher {
    /// Connect to NATS at `url` (e.g. `nats://127.0.0.1:4222`).
    ///
    /// # Errors
    /// Returns [`PublishError::Connect`] if the connection cannot be established.
    pub async fn connect(url: &str, retry: RetryConfig) -> Result<Self, PublishError> {
        let client = async_nats::connect(url)
            .await
            .map_err(|e| PublishError::Connect(e.to_string()))?;
        Ok(Self { client, retry })
    }

    /// Wrap an existing client (e.g. a shared connection).
    #[must_use]
    pub fn from_client(client: async_nats::Client, retry: RetryConfig) -> Self {
        Self { client, retry }
    }
}

#[async_trait]
impl Publisher for NatsPublisher {
    async fn publish_bytes(&self, subject: &str, payload: Vec<u8>) -> Result<(), PublishError> {
        with_retries(self.retry, subject, || async {
            // async-nats wants an owned Subject + Bytes; clone per attempt.
            self.client
                .publish(subject.to_string(), payload.clone().into())
                .await
                .map_err(|e| e.to_string())
        })
        .await
    }
}

/// In-memory publisher that records every published message. For fixture-first
/// development and tests — no NATS server required.
#[derive(Default)]
pub struct RecordingPublisher {
    records: tokio::sync::Mutex<Vec<(String, Vec<u8>)>>,
}

impl RecordingPublisher {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Snapshot of all `(subject, payload)` pairs published so far.
    pub async fn records(&self) -> Vec<(String, Vec<u8>)> {
        self.records.lock().await.clone()
    }

    /// Number of messages published so far.
    pub async fn len(&self) -> usize {
        self.records.lock().await.len()
    }

    /// Whether nothing has been published yet.
    pub async fn is_empty(&self) -> bool {
        self.records.lock().await.is_empty()
    }
}

#[async_trait]
impl Publisher for RecordingPublisher {
    async fn publish_bytes(&self, subject: &str, payload: Vec<u8>) -> Result<(), PublishError> {
        self.records
            .lock()
            .await
            .push((subject.to_string(), payload));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::sync::atomic::{AtomicU32, Ordering};

    #[derive(Serialize, Deserialize)]
    struct Ping {
        msg: String,
    }

    #[tokio::test]
    async fn recording_publisher_captures_envelope() {
        let pubr = RecordingPublisher::new();
        assert!(pubr.is_empty().await);
        let env = Envelope::new("ingestion", "Ping", Ping { msg: "hi".into() });
        publish_envelope(&pubr, "system.health.ingestion", &env)
            .await
            .expect("publish");
        let records = pubr.records().await;
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].0, "system.health.ingestion");
        let back: Envelope<Ping> = serde_json::from_slice(&records[0].1).expect("decode");
        assert_eq!(back.payload.msg, "hi");
        assert_eq!(back.source, "ingestion");
    }

    #[tokio::test]
    async fn retry_succeeds_after_transient_failures() {
        // Transport fails twice, then succeeds — with_retries should swallow the
        // transient errors and report success on the third attempt.
        let seen = AtomicU32::new(0);
        let retry = RetryConfig {
            max_attempts: 3,
            base_delay: Duration::from_millis(0),
        };
        let result = with_retries(retry, "s", || {
            let n = seen.fetch_add(1, Ordering::SeqCst) + 1;
            async move {
                if n <= 2 {
                    Err("transient".to_string())
                } else {
                    Ok(())
                }
            }
        })
        .await;
        assert!(result.is_ok());
        assert_eq!(seen.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn retry_gives_up_and_reports_structured_error() {
        let seen = AtomicU32::new(0);
        let retry = RetryConfig {
            max_attempts: 2,
            base_delay: Duration::from_millis(0),
        };
        let err = with_retries(retry, "raw.market.binance", || {
            seen.fetch_add(1, Ordering::SeqCst);
            async { Err("down".to_string()) }
        })
        .await
        .expect_err("should fail");
        match err {
            PublishError::Publish {
                subject,
                attempts,
                cause,
            } => {
                assert_eq!(subject, "raw.market.binance");
                assert_eq!(attempts, 2);
                assert_eq!(cause, "down");
            }
            other => panic!("unexpected error: {other:?}"),
        }
        assert_eq!(seen.load(Ordering::SeqCst), 2);
    }
}
