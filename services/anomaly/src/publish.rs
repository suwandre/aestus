//! Publish anomaly events to NATS on `anomaly.detected.<type>.<asset>` (P10-T001,
//! fleshed out in P10-T016). Each anomaly is validated against the contract
//! invariants before it is wrapped in an [`Envelope`] and emitted.

use event_model::envelope::Envelope;
use event_model::streams::{subject, ANOMALY_DETECTED};
use nats_publisher::{publish_envelope, PublishError, Publisher};

use crate::anomaly::AnomalyEvent;

/// Error returned when an anomaly fails validation or publishing.
#[derive(Debug, thiserror::Error)]
pub enum PublishAnomalyError {
    #[error("anomaly validation failed: {0}")]
    Invalid(#[from] crate::anomaly::AnomalyValidationError),
    #[error(transparent)]
    Publish(#[from] PublishError),
}

/// Validate and publish a single anomaly. The subject routes by anomaly type
/// and primary asset so consumers can subscribe narrowly
/// (`anomaly.detected.funding_spike.>`).
pub async fn publish_anomaly(
    publisher: &dyn Publisher,
    anomaly: &AnomalyEvent,
) -> Result<(), PublishAnomalyError> {
    anomaly.validate()?;
    let primary_asset = anomaly.assets.first().map(String::as_str).unwrap_or("");
    let subj = subject(
        &ANOMALY_DETECTED,
        &[anomaly.anomaly_type.as_str(), primary_asset],
    );
    let env = Envelope::new("anomaly", "AnomalyEvent", anomaly.clone());
    publish_envelope(publisher, &subj, &env).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anomaly::{AnomalySeverity, AnomalyStatus, AnomalyType};
    use nats_publisher::RecordingPublisher;

    fn sample() -> AnomalyEvent {
        AnomalyEvent {
            id: "anom-001".into(),
            anomaly_type: AnomalyType::FundingSpike,
            severity: AnomalySeverity::High,
            sigma: Some(2.6),
            assets: vec!["crypto:btc-usdt".into()],
            venues: vec!["binance".into()],
            title: "BTC funding rate spike".into(),
            description: "Funding z-score reached 2.6.".into(),
            detected_at: "2026-06-07T12:00:00Z".into(),
            status: AnomalyStatus::Active,
            context_refs: vec![],
            rule_ref: None,
        }
    }

    #[tokio::test]
    async fn publishes_to_typed_subject() {
        let pubr = RecordingPublisher::new();
        publish_anomaly(&pubr, &sample()).await.expect("publish");
        let records = pubr.records().await;
        assert_eq!(records.len(), 1);
        assert_eq!(
            records[0].0,
            "anomaly.detected.funding_spike.crypto_btc_usdt"
        );
        let env: Envelope<AnomalyEvent> =
            serde_json::from_slice(&records[0].1).expect("decode envelope");
        assert_eq!(env.payload_type, "AnomalyEvent");
        assert_eq!(env.source, "anomaly");
    }

    #[tokio::test]
    async fn invalid_anomaly_is_not_published() {
        let pubr = RecordingPublisher::new();
        let mut bad = sample();
        bad.assets.clear();
        let err = publish_anomaly(&pubr, &bad).await.expect_err("must reject");
        assert!(matches!(err, PublishAnomalyError::Invalid(_)));
        assert!(pubr.is_empty().await);
    }
}
