// placeholder — full ingestion service implemented in P06.
//
// P05-T003: proves the NATS publisher helper end-to-end by emitting one test
// event on startup. With `NATS_URL` set it publishes to a live server; without
// it (fixture-first) it records to an in-memory publisher and logs the result.
use event_model::envelope::Envelope;
use event_model::streams::{subject, SYSTEM_HEALTH};
use nats_publisher::{publish_envelope, NatsPublisher, Publisher, RecordingPublisher, RetryConfig};
use serde::{Deserialize, Serialize};

const SOURCE: &str = "ingestion";

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
struct TestEvent {
    note: String,
}

/// Build and publish a single test event via the given publisher. Returns the
/// subject it was published to.
async fn publish_test_event(publisher: &dyn Publisher) -> anyhow::Result<String> {
    let subj = subject(&SYSTEM_HEALTH, &[SOURCE]);
    let envelope = Envelope::new(
        SOURCE,
        "TestEvent",
        TestEvent {
            note: "ingestion publisher smoke test".to_string(),
        },
    );
    publish_envelope(publisher, &subj, &envelope).await?;
    Ok(subj)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().json().init();
    tracing::info!("ingestion service placeholder");

    match std::env::var("NATS_URL") {
        Ok(url) if !url.is_empty() => {
            let publisher = NatsPublisher::connect(&url, RetryConfig::default()).await?;
            let subj = publish_test_event(&publisher).await?;
            tracing::info!(subject = %subj, url = %url, "published test event to NATS");
        }
        _ => {
            // Fixture-first: no live NATS required to run.
            let publisher = RecordingPublisher::new();
            let subj = publish_test_event(&publisher).await?;
            tracing::info!(
                subject = %subj,
                recorded = publisher.len().await,
                "NATS_URL unset — recorded test event in-memory (fixture mode)"
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn publishes_one_test_event() {
        let publisher = RecordingPublisher::new();
        let subj = publish_test_event(&publisher).await.expect("publish");
        assert_eq!(subj, "system.health.ingestion");
        let records = publisher.records().await;
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].0, "system.health.ingestion");
        let env: Envelope<TestEvent> = serde_json::from_slice(&records[0].1).expect("decode");
        assert_eq!(env.source, "ingestion");
        assert_eq!(env.payload_type, "TestEvent");
        assert_eq!(env.payload.note, "ingestion publisher smoke test");
    }
}
