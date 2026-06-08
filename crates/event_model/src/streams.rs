//! Canonical NATS JetStream stream + subject definitions (P05-T001).
//!
//! Rust mirror of `packages/contracts/src/streams.ts` — the TypeScript file is
//! the source of truth; keep this in sync by hand (no codegen yet). See
//! `docs/event_streams.md` for the subject-token conventions.

/// A single JetStream stream and the subject hierarchy it captures.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StreamDefinition {
    /// JetStream stream name (UPPER_SNAKE, no dots).
    pub name: &'static str,
    /// Dotted subject base producers publish under, e.g. `raw.market`.
    pub base: &'static str,
    /// Subjects bound to the stream: the bare base plus `<base>.>`.
    pub subjects: &'static [&'static str],
    /// Human description of what flows through the stream.
    pub description: &'static str,
}

macro_rules! stream {
    ($konst:ident, $name:literal, $base:literal, $desc:literal) => {
        pub const $konst: StreamDefinition = StreamDefinition {
            name: $name,
            base: $base,
            subjects: &[$base, concat!($base, ".>")],
            description: $desc,
        };
    };
}

stream!(
    RAW_MARKET,
    "RAW_MARKET",
    "raw.market",
    "Raw market messages as ingested, one subject token per venue/symbol."
);
stream!(
    NORMALIZED_MARKET,
    "NORMALIZED_MARKET",
    "normalized.market",
    "Normalized market events keyed by canonical asset id."
);
stream!(
    FEATURE_SNAPSHOT,
    "FEATURE_SNAPSHOT",
    "feature.snapshot",
    "Deterministic feature snapshots per asset/timeframe."
);
stream!(
    ANOMALY_DETECTED,
    "ANOMALY_DETECTED",
    "anomaly.detected",
    "Anomalies flagged by the detection engine."
);
stream!(
    CONTEXT_PACKET,
    "CONTEXT_PACKET",
    "context.packet",
    "Context packets assembled for briefing generation."
);
stream!(
    BRIEFING_GENERATED,
    "BRIEFING_GENERATED",
    "briefing.generated",
    "LLM-generated briefings (proposals with reasoning)."
);
stream!(
    DECISION_LOGGED,
    "DECISION_LOGGED",
    "decision.logged",
    "User decisions (act/skip/snooze/dismiss/watch) with informing context."
);
stream!(
    SYSTEM_HEALTH,
    "SYSTEM_HEALTH",
    "system.health",
    "Periodic per-service health heartbeats."
);
stream!(
    DEAD_LETTER,
    "DLQ",
    "dlq",
    "Dead-lettered events with error metadata, for inspection and replay."
);

/// Every stream in publish/topology order (DLQ last — it is operational).
pub const STREAMS: &[StreamDefinition] = &[
    RAW_MARKET,
    NORMALIZED_MARKET,
    FEATURE_SNAPSHOT,
    ANOMALY_DETECTED,
    CONTEXT_PACKET,
    BRIEFING_GENERATED,
    DECISION_LOGGED,
    SYSTEM_HEALTH,
    DEAD_LETTER,
];

/// Dead-letter subject for a failed event: `dlq.<original-subject>`.
#[must_use]
pub fn dead_letter_subject(original_subject: &str) -> String {
    format!("{}.{}", DEAD_LETTER.base, original_subject)
}

/// Look up a stream definition by its dotted base, e.g. `raw.market`.
#[must_use]
pub fn stream_for_base(base: &str) -> Option<StreamDefinition> {
    STREAMS.iter().copied().find(|s| s.base == base)
}

/// Build a fully-qualified subject from a stream base and routing tokens.
/// Tokens are sanitized to `a-z0-9_`; empty tokens are dropped.
#[must_use]
pub fn subject(stream: &StreamDefinition, tokens: &[&str]) -> String {
    let mut parts = vec![stream.base.to_string()];
    for token in tokens {
        let clean: String = token
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect();
        let trimmed = clean.trim_matches('_').replace("__", "_");
        if !trimmed.is_empty() {
            parts.push(trimmed);
        }
    }
    parts.join(".")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_stream_binds_base_and_wildcard() {
        for s in STREAMS {
            assert_eq!(s.subjects.len(), 2);
            assert_eq!(s.subjects[0], s.base);
            assert!(s.subjects[1].ends_with(".>"));
        }
    }

    #[test]
    fn lookup_by_base() {
        assert_eq!(stream_for_base("raw.market"), Some(RAW_MARKET));
        assert_eq!(stream_for_base("nope"), None);
    }

    #[test]
    fn subject_sanitizes_tokens() {
        assert_eq!(
            subject(&RAW_MARKET, &["Binance", "BTC-USDT"]),
            "raw.market.binance.btc_usdt"
        );
    }

    #[test]
    fn dead_letter_subject_prefixes_dlq() {
        assert_eq!(
            dead_letter_subject("raw.market.binance"),
            "dlq.raw.market.binance"
        );
    }
}
