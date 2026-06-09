//! Shared data-confidence type used across news, calendar, and on-chain feeds
//! (P08-T006).
//!
//! Briefings use this to signal when context depends on weak, derived, or
//! fixture/proxy data so the user can weigh it accordingly.

use serde::{Deserialize, Serialize};

/// Confidence level of a contextual data source.
///
/// Used by [`NewsItem`](crate::news::NewsItem),
/// [`CalendarItem`](crate::calendar::CalendarItem), and
/// [`OnChainItem`](crate::onchain::OnChainItem) so the briefing layer can
/// render a uniform quality badge next to each data point.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    /// Primary source: direct on-chain confirmation, tier-1 news outlet, or
    /// official economic release.
    High,
    /// Derived or labelled data: provider inference, aggregation, or secondary
    /// outlets.
    Medium,
    /// Heuristic estimate, proxy, fixture, or low-reputation source.
    Low,
}

impl Default for Confidence {
    fn default() -> Self {
        Self::Medium
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialises_lowercase() {
        assert_eq!(serde_json::to_string(&Confidence::High).unwrap(), "\"high\"");
        assert_eq!(serde_json::to_string(&Confidence::Medium).unwrap(), "\"medium\"");
        assert_eq!(serde_json::to_string(&Confidence::Low).unwrap(), "\"low\"");
    }

    #[test]
    fn deserialises_from_string() {
        let c: Confidence = serde_json::from_str("\"high\"").unwrap();
        assert_eq!(c, Confidence::High);
    }

    #[test]
    fn default_is_medium() {
        assert_eq!(Confidence::default(), Confidence::Medium);
    }
}
