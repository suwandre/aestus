use event_model::envelope::Envelope;
use event_model::streams::{subject, FEATURE_SNAPSHOT};
use nats_publisher::{publish_envelope, PublishError, Publisher};

use crate::snapshot::FeatureSnapshot;

/// Publish a feature snapshot envelope to NATS on
/// `feature.snapshot.{sanitized_canonical_asset_id}`.
pub async fn publish_snapshot(
    publisher: &dyn Publisher,
    snapshot: &FeatureSnapshot,
) -> Result<(), PublishError> {
    let subj = subject(&FEATURE_SNAPSHOT, &[snapshot.canonical_asset_id.as_str()]);
    let env = Envelope::new("features", "FeatureSnapshot", snapshot.clone());
    publish_envelope(publisher, &subj, &env).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use nats_publisher::RecordingPublisher;

    #[tokio::test]
    async fn publish_snapshot_emits_to_correct_subject() {
        let pub_r = RecordingPublisher::new();
        let snap =
            FeatureSnapshot::placeholder("crypto:btc-usdt".into(), "2026-06-07T12:00:00Z".into());
        publish_snapshot(&pub_r, &snap).await.expect("publish");
        let records = pub_r.records().await;
        assert_eq!(records.len(), 1);
        // Subject is sanitized: "crypto:btc-usdt" → "crypto_btc_usdt"
        assert_eq!(records[0].0, "feature.snapshot.crypto_btc_usdt");
        // Payload is a valid Envelope<FeatureSnapshot>
        let env: event_model::envelope::Envelope<FeatureSnapshot> =
            serde_json::from_slice(&records[0].1).expect("decode");
        assert_eq!(env.payload.canonical_asset_id, "crypto:btc-usdt");
        assert_eq!(env.source, "features");
        assert_eq!(env.payload_type, "FeatureSnapshot");
    }
}
