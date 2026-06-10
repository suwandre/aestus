//! Anomaly status lifecycle (P10-T014).
//!
//! Defines the legal status transitions and a [`StatusStore`] the API/UI drive
//! to acknowledge, snooze, dismiss, resolve, or expire an anomaly. The store is
//! the in-process source of truth for the current status of each anomaly id;
//! P10-T015 backs it with Postgres so the inbox survives a restart. Snoozed
//! anomalies carry a `snooze_until`; [`StatusStore::tick`] wakes elapsed snoozes
//! back to `active` and expires stale active alerts.

use std::collections::HashMap;

use crate::anomaly::AnomalyStatus;

/// Legal transitions. Terminal states (resolved/expired/dismissed) are sinks.
#[must_use]
pub fn can_transition(from: AnomalyStatus, to: AnomalyStatus) -> bool {
    use AnomalyStatus as S;
    if from == to {
        return false;
    }
    if from.is_terminal() {
        return false;
    }
    match (from, to) {
        // From active: any non-active state.
        (S::Active, _) => true,
        // Acknowledged can be snoozed or closed, or re-opened to active.
        (S::Acknowledged, S::Active | S::Snoozed | S::Resolved | S::Expired | S::Dismissed) => true,
        // Snoozed wakes to active, or is closed directly.
        (S::Snoozed, S::Active | S::Acknowledged | S::Resolved | S::Expired | S::Dismissed) => true,
        _ => false,
    }
}

/// Stored status for one anomaly id.
#[derive(Debug, Clone, PartialEq)]
pub struct StatusRecord {
    pub status: AnomalyStatus,
    pub updated_at_ms: i64,
    /// Wake time for `Snoozed` (epoch ms); `None` otherwise.
    pub snooze_until_ms: Option<i64>,
}

/// Error when a requested status change is not legal.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum LifecycleError {
    #[error("illegal transition from {from} to {to}")]
    IllegalTransition {
        from: &'static str,
        to: &'static str,
    },
}

/// In-memory status store. Designed to be mirrored to Postgres (P10-T015).
#[derive(Debug, Default)]
pub struct StatusStore {
    records: HashMap<String, StatusRecord>,
}

impl StatusStore {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Current status of an anomaly (defaults to `Active` if untracked).
    #[must_use]
    pub fn status_of(&self, id: &str) -> AnomalyStatus {
        self.records
            .get(id)
            .map(|r| r.status)
            .unwrap_or(AnomalyStatus::Active)
    }

    #[must_use]
    pub fn get(&self, id: &str) -> Option<&StatusRecord> {
        self.records.get(id)
    }

    /// Apply a status change, enforcing legal transitions. `snooze_until_ms` is
    /// recorded only when transitioning to `Snoozed`.
    pub fn set_status(
        &mut self,
        id: &str,
        to: AnomalyStatus,
        now_ms: i64,
        snooze_until_ms: Option<i64>,
    ) -> Result<(), LifecycleError> {
        let from = self.status_of(id);
        if !can_transition(from, to) {
            return Err(LifecycleError::IllegalTransition {
                from: from.as_str(),
                to: to.as_str(),
            });
        }
        self.records.insert(
            id.to_string(),
            StatusRecord {
                status: to,
                updated_at_ms: now_ms,
                snooze_until_ms: if to == AnomalyStatus::Snoozed {
                    snooze_until_ms
                } else {
                    None
                },
            },
        );
        Ok(())
    }

    /// Advance time-driven transitions: wake elapsed snoozes to `active`, and
    /// expire active/acknowledged alerts older than `ttl_ms`. Returns the ids
    /// whose status changed.
    pub fn tick(&mut self, now_ms: i64, ttl_ms: i64) -> Vec<String> {
        let mut changed = Vec::new();
        for (id, rec) in self.records.iter_mut() {
            match rec.status {
                AnomalyStatus::Snoozed => {
                    if let Some(until) = rec.snooze_until_ms {
                        if now_ms >= until {
                            rec.status = AnomalyStatus::Active;
                            rec.snooze_until_ms = None;
                            rec.updated_at_ms = now_ms;
                            changed.push(id.clone());
                        }
                    }
                }
                AnomalyStatus::Active | AnomalyStatus::Acknowledged => {
                    if now_ms - rec.updated_at_ms >= ttl_ms {
                        rec.status = AnomalyStatus::Expired;
                        rec.updated_at_ms = now_ms;
                        changed.push(id.clone());
                    }
                }
                _ => {}
            }
        }
        changed.sort();
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legal_and_illegal_transitions() {
        assert!(can_transition(
            AnomalyStatus::Active,
            AnomalyStatus::Snoozed
        ));
        assert!(can_transition(
            AnomalyStatus::Snoozed,
            AnomalyStatus::Active
        ));
        assert!(can_transition(
            AnomalyStatus::Active,
            AnomalyStatus::Dismissed
        ));
        // Terminal states are sinks.
        assert!(!can_transition(
            AnomalyStatus::Resolved,
            AnomalyStatus::Active
        ));
        assert!(!can_transition(
            AnomalyStatus::Dismissed,
            AnomalyStatus::Snoozed
        ));
        // No self-transition.
        assert!(!can_transition(
            AnomalyStatus::Active,
            AnomalyStatus::Active
        ));
    }

    #[test]
    fn set_status_persists_in_store() {
        let mut store = StatusStore::new();
        assert_eq!(store.status_of("a1"), AnomalyStatus::Active);
        store
            .set_status("a1", AnomalyStatus::Snoozed, 1000, Some(5000))
            .expect("snooze");
        assert_eq!(store.status_of("a1"), AnomalyStatus::Snoozed);
        assert_eq!(store.get("a1").unwrap().snooze_until_ms, Some(5000));
    }

    #[test]
    fn illegal_transition_is_rejected() {
        let mut store = StatusStore::new();
        store
            .set_status("a1", AnomalyStatus::Resolved, 1000, None)
            .expect("resolve");
        let err = store
            .set_status("a1", AnomalyStatus::Active, 2000, None)
            .expect_err("cannot reopen resolved");
        assert!(matches!(err, LifecycleError::IllegalTransition { .. }));
    }

    #[test]
    fn snooze_wakes_after_until() {
        let mut store = StatusStore::new();
        store
            .set_status("a1", AnomalyStatus::Snoozed, 1000, Some(5000))
            .expect("snooze");
        // Before wake time: unchanged.
        assert!(store.tick(4000, i64::MAX).is_empty());
        assert_eq!(store.status_of("a1"), AnomalyStatus::Snoozed);
        // At/after wake time: back to active.
        let changed = store.tick(5000, i64::MAX);
        assert_eq!(changed, vec!["a1".to_string()]);
        assert_eq!(store.status_of("a1"), AnomalyStatus::Active);
    }

    #[test]
    fn active_expires_after_ttl() {
        let mut store = StatusStore::new();
        store
            .set_status("a1", AnomalyStatus::Acknowledged, 1000, None)
            .expect("ack");
        let changed = store.tick(1000 + 3_600_000, 3_600_000);
        assert_eq!(changed, vec!["a1".to_string()]);
        assert_eq!(store.status_of("a1"), AnomalyStatus::Expired);
    }
}
