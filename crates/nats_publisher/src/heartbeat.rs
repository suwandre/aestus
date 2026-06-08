//! Service-health heartbeat publisher (P05-T009).
//!
//! A service constructs a [`Heartbeat`] once and either calls
//! [`Heartbeat::publish_once`] or spawns [`Heartbeat::run`] to emit a
//! `SystemHealth` envelope on `system.health.<service>` at a fixed interval.

use std::time::{Duration, Instant};

use event_model::envelope::Envelope;
use event_model::health::{DependencyHealth, SystemHealth};
use event_model::streams::{subject, SYSTEM_HEALTH};

use crate::{publish_envelope, Publisher};

/// Builds and publishes periodic [`SystemHealth`] events for one service.
pub struct Heartbeat {
    service: String,
    version: String,
    started: Instant,
}

impl Heartbeat {
    /// Create a heartbeat for `service` at build `version`; uptime is measured
    /// from now.
    #[must_use]
    pub fn new(service: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            version: version.into(),
            started: Instant::now(),
        }
    }

    /// The subject this service publishes health on: `system.health.<service>`.
    #[must_use]
    pub fn subject(&self) -> String {
        subject(&SYSTEM_HEALTH, &[&self.service])
    }

    /// Build the current health record from the supplied dependency statuses.
    #[must_use]
    pub fn snapshot(&self, dependencies: Vec<DependencyHealth>) -> SystemHealth {
        SystemHealth::new(
            self.service.clone(),
            self.version.clone(),
            self.started.elapsed().as_secs(),
            dependencies,
        )
    }

    /// Publish a single heartbeat with the given dependency statuses.
    ///
    /// # Errors
    /// Propagates the publisher's error if delivery fails.
    pub async fn publish_once(
        &self,
        publisher: &dyn Publisher,
        dependencies: Vec<DependencyHealth>,
    ) -> Result<(), crate::PublishError> {
        let health = self.snapshot(dependencies);
        let envelope = Envelope::new(&self.service, "SystemHealth", health);
        publish_envelope(publisher, &self.subject(), &envelope).await
    }

    /// Run forever, publishing a heartbeat every `interval`. `deps` is invoked
    /// each tick to gather current dependency statuses. Publish failures are
    /// logged and the loop continues (a heartbeat must not crash its service).
    pub async fn run<F>(self, publisher: &dyn Publisher, interval: Duration, mut deps: F)
    where
        F: FnMut() -> Vec<DependencyHealth>,
    {
        let mut ticker = tokio::time::interval(interval);
        loop {
            ticker.tick().await;
            if let Err(e) = self.publish_once(publisher, deps()).await {
                tracing::warn!(service = %self.service, error = %e, "heartbeat publish failed");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RecordingPublisher;
    use event_model::health::HealthStatus;

    #[tokio::test]
    async fn publish_once_emits_one_health_envelope() {
        let publisher = RecordingPublisher::new();
        let hb = Heartbeat::new("ingestion", "0.1.0");
        hb.publish_once(
            &publisher,
            vec![DependencyHealth {
                name: "nats".into(),
                status: HealthStatus::Ok,
                detail: None,
            }],
        )
        .await
        .expect("publish");

        let records = publisher.records().await;
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].0, "system.health.ingestion");
        let env: Envelope<SystemHealth> = serde_json::from_slice(&records[0].1).expect("decode");
        assert_eq!(env.payload_type, "SystemHealth");
        assert_eq!(env.payload.service, "ingestion");
        assert_eq!(env.payload.status, HealthStatus::Ok);
    }
}
