//! Transport envelope for the NATS event backbone (P05-T002).
//!
//! Rust mirror of `packages/contracts/src/envelope.ts`. Producers wrap every
//! payload in an [`Envelope`] so consumers, the replay utility, and the
//! inspection CLI see consistent metadata regardless of stream/subject.

use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

/// Wire-format version of the envelope. Mirrors `SCHEMA_VERSION` in the TS
/// contracts (`packages/contracts/src/common.ts`).
pub const SCHEMA_VERSION: u32 = 1;

/// A transport envelope carrying a typed `payload` plus pipeline metadata.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Envelope<T> {
    /// Unique id for this event (dedup, idempotency).
    pub event_id: String,
    /// Wire-format version of the envelope.
    pub schema_version: u32,
    /// Correlates events across the pipeline; defaults to `event_id` at origin.
    pub trace_id: String,
    /// Logical producer id, e.g. `ingestion`, `features`.
    pub source: String,
    /// RFC-3339 timestamp of when the producer emitted the envelope.
    pub emitted_at: String,
    /// Canonical name of the payload contract, e.g. `RawMarketEvent`.
    pub payload_type: String,
    /// The contract instance.
    pub payload: T,
}

impl<T> Envelope<T> {
    /// Build an envelope, generating a fresh `event_id` (UUID v4) and stamping
    /// `emitted_at` with the current UTC time. `trace_id` defaults to the
    /// generated `event_id` (the origin of a new trace).
    #[must_use]
    pub fn new(source: impl Into<String>, payload_type: impl Into<String>, payload: T) -> Self {
        let event_id = Uuid::new_v4().to_string();
        Self {
            trace_id: event_id.clone(),
            event_id,
            schema_version: SCHEMA_VERSION,
            source: source.into(),
            emitted_at: now_rfc3339(),
            payload_type: payload_type.into(),
            payload,
        }
    }

    /// Set the trace id (propagate an existing trace through this producer).
    #[must_use]
    pub fn with_trace_id(mut self, trace_id: impl Into<String>) -> Self {
        self.trace_id = trace_id.into();
        self
    }

    /// Fully-explicit constructor for deterministic fixtures/tests.
    #[must_use]
    pub fn with(
        event_id: impl Into<String>,
        trace_id: impl Into<String>,
        source: impl Into<String>,
        emitted_at: impl Into<String>,
        payload_type: impl Into<String>,
        payload: T,
    ) -> Self {
        Self {
            event_id: event_id.into(),
            schema_version: SCHEMA_VERSION,
            trace_id: trace_id.into(),
            source: source.into(),
            emitted_at: emitted_at.into(),
            payload_type: payload_type.into(),
            payload,
        }
    }
}

/// Current UTC time as an RFC-3339 string. Falls back to the Unix epoch if the
/// platform clock is unavailable or formatting fails (never panics — the crate
/// denies `unwrap`/`expect`).
fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone)]
    struct Ping {
        msg: String,
    }

    #[test]
    fn new_fills_metadata_and_defaults_trace_id() {
        let env = Envelope::new("ingestion", "Ping", Ping { msg: "hi".into() });
        assert_eq!(env.schema_version, SCHEMA_VERSION);
        assert!(!env.event_id.is_empty());
        assert_eq!(env.trace_id, env.event_id);
        assert_eq!(env.source, "ingestion");
        assert_eq!(env.payload_type, "Ping");
    }

    #[test]
    fn roundtrips_through_json() {
        let env = Envelope::with(
            "evt-1",
            "trace-1",
            "ingestion",
            "2026-06-08T00:00:00Z",
            "Ping",
            Ping { msg: "hi".into() },
        );
        let bytes = serde_json::to_vec(&env).expect("serialize");
        let back: Envelope<Ping> = serde_json::from_slice(&bytes).expect("deserialize");
        assert_eq!(env, back);
    }

    #[test]
    fn with_trace_id_overrides() {
        let env =
            Envelope::new("features", "Ping", Ping { msg: "x".into() }).with_trace_id("trace-99");
        assert_eq!(env.trace_id, "trace-99");
        assert_ne!(env.event_id, "trace-99");
    }
}
