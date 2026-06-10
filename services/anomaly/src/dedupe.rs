//! Alert dedupe + cooldown (P10-T012).
//!
//! Detectors re-run every evaluation tick, so the same condition (e.g. BTC
//! funding still elevated) would otherwise spam an anomaly each pass. The
//! [`Deduper`] collapses repeats of the same logical alert — keyed by
//! `(type, primary asset)` — to at most one emission per cooldown window, while
//! tracking `count` and `last_seen` on the active record so the UI can show
//! "seen 5×, last 2m ago". Repeats inside the window are suppressed (not
//! re-published); the first occurrence and any post-cooldown re-fire are emitted.

use std::collections::HashMap;

use crate::anomaly::AnomalyEvent;
use market_math::timestamps::rfc3339_to_ms;

/// Active record for one logical alert (type + asset).
#[derive(Debug, Clone)]
pub struct DedupeRecord {
    pub key: String,
    /// The representative anomaly (first occurrence).
    pub anomaly: AnomalyEvent,
    pub first_seen_ms: i64,
    pub last_seen_ms: i64,
    /// Last time this alert was actually emitted/published.
    pub last_emitted_ms: i64,
    /// Total times this logical alert has been observed.
    pub count: u64,
}

/// Stateful deduper. Lives for the process lifetime in the evaluator task.
#[derive(Debug, Default)]
pub struct Deduper {
    records: HashMap<String, DedupeRecord>,
}

/// Logical alert identity: type + primary asset.
fn dedupe_key(a: &AnomalyEvent) -> String {
    let asset = a.assets.first().map(String::as_str).unwrap_or("");
    format!("{}|{}", a.anomaly_type.as_str(), asset)
}

impl Deduper {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Snapshot of current active records (for persistence / inspection).
    #[must_use]
    pub fn records(&self) -> impl Iterator<Item = &DedupeRecord> {
        self.records.values()
    }

    /// Process a batch of freshly-detected anomalies, returning only those that
    /// should be emitted now. `now_ms` is the evaluation wall-clock; each
    /// anomaly's `detected_at` is used as its observation time when parseable.
    pub fn process(
        &mut self,
        anomalies: Vec<AnomalyEvent>,
        now_ms: i64,
        cooldown_ms: i64,
    ) -> Vec<AnomalyEvent> {
        let mut emit = Vec::new();
        for anomaly in anomalies {
            let key = dedupe_key(&anomaly);
            let ts = rfc3339_to_ms(&anomaly.detected_at).unwrap_or(now_ms);
            match self.records.get_mut(&key) {
                None => {
                    self.records.insert(
                        key.clone(),
                        DedupeRecord {
                            key,
                            anomaly: anomaly.clone(),
                            first_seen_ms: ts,
                            last_seen_ms: ts,
                            last_emitted_ms: ts,
                            count: 1,
                        },
                    );
                    emit.push(anomaly);
                }
                Some(rec) => {
                    rec.count += 1;
                    rec.last_seen_ms = ts.max(rec.last_seen_ms);
                    if ts - rec.last_emitted_ms >= cooldown_ms {
                        rec.last_emitted_ms = ts;
                        emit.push(anomaly);
                    }
                    // else: within cooldown → suppress (count/last_seen updated).
                }
            }
        }
        emit
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anomaly::{AnomalySeverity, AnomalyStatus, AnomalyType};

    fn sample(ts: &str) -> AnomalyEvent {
        AnomalyEvent {
            id: format!("funding_spike:crypto:btc-usdt:{ts}"),
            anomaly_type: AnomalyType::FundingSpike,
            severity: AnomalySeverity::High,
            sigma: Some(2.6),
            assets: vec!["crypto:btc-usdt".into()],
            venues: vec![],
            title: "Funding spike".into(),
            description: "z 2.6".into(),
            detected_at: ts.into(),
            status: AnomalyStatus::Active,
            context_refs: vec![],
            rule_ref: None,
        }
    }

    const COOLDOWN: i64 = 30 * 60_000;

    #[test]
    fn repeat_within_cooldown_emits_once_and_bumps_count() {
        let mut d = Deduper::new();
        let ts = "2026-06-07T12:00:00Z";
        let now = rfc3339_to_ms(ts).unwrap();
        let first = d.process(vec![sample(ts)], now, COOLDOWN);
        assert_eq!(first.len(), 1, "first occurrence emits");
        // Same alert again within cooldown → suppressed.
        let second = d.process(vec![sample(ts)], now, COOLDOWN);
        assert_eq!(second.len(), 0, "repeat suppressed");
        let rec = d.records().next().expect("one record");
        assert_eq!(rec.count, 2);
        assert_eq!(rec.last_seen_ms, now);
    }

    #[test]
    fn refires_after_cooldown_elapses() {
        let mut d = Deduper::new();
        let t0 = "2026-06-07T12:00:00Z";
        let t1 = "2026-06-07T12:31:00Z"; // 31 min later > 30 min cooldown
        d.process(vec![sample(t0)], rfc3339_to_ms(t0).unwrap(), COOLDOWN);
        let again = d.process(vec![sample(t1)], rfc3339_to_ms(t1).unwrap(), COOLDOWN);
        assert_eq!(again.len(), 1, "re-fires after cooldown");
        assert_eq!(d.records().next().unwrap().count, 2);
    }

    #[test]
    fn distinct_alerts_are_independent() {
        let mut d = Deduper::new();
        let ts = "2026-06-07T12:00:00Z";
        let now = rfc3339_to_ms(ts).unwrap();
        let mut eth = sample(ts);
        eth.assets = vec!["crypto:eth-usdt".into()];
        let emitted = d.process(vec![sample(ts), eth], now, COOLDOWN);
        assert_eq!(emitted.len(), 2, "different assets are distinct alerts");
    }
}
