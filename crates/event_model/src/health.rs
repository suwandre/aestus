//! Service-health types (P05-T009). Rust mirror of
//! `packages/contracts/src/health.ts`. Services publish `SystemHealth` on
//! `system.health.<service>` so the Data tab can render live service states.

use serde::{Deserialize, Serialize};

/// Health status, worst-wins when aggregated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Ok,
    Degraded,
    Down,
}

/// Health of a single dependency (NATS, Postgres, a provider, …).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DependencyHealth {
    pub name: String,
    pub status: HealthStatus,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub detail: Option<String>,
}

/// A periodic service-health record.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SystemHealth {
    pub schema_version: u32,
    pub service: String,
    pub version: String,
    pub status: HealthStatus,
    pub uptime_seconds: u64,
    #[serde(default)]
    pub dependencies: Vec<DependencyHealth>,
}

impl SystemHealth {
    /// Build a record, deriving overall `status` as the worst dependency status.
    #[must_use]
    pub fn new(
        service: impl Into<String>,
        version: impl Into<String>,
        uptime_seconds: u64,
        dependencies: Vec<DependencyHealth>,
    ) -> Self {
        let status = Self::overall(&dependencies);
        Self {
            schema_version: crate::envelope::SCHEMA_VERSION,
            service: service.into(),
            version: version.into(),
            status,
            uptime_seconds,
            dependencies,
        }
    }

    fn overall(deps: &[DependencyHealth]) -> HealthStatus {
        if deps.iter().any(|d| d.status == HealthStatus::Down) {
            HealthStatus::Down
        } else if deps.iter().any(|d| d.status == HealthStatus::Degraded) {
            HealthStatus::Degraded
        } else {
            HealthStatus::Ok
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overall_status_is_worst_dependency() {
        let healthy = SystemHealth::new("ingestion", "0.1.0", 10, vec![]);
        assert_eq!(healthy.status, HealthStatus::Ok);

        let degraded = SystemHealth::new(
            "ingestion",
            "0.1.0",
            10,
            vec![
                DependencyHealth {
                    name: "nats".into(),
                    status: HealthStatus::Ok,
                    detail: None,
                },
                DependencyHealth {
                    name: "binance".into(),
                    status: HealthStatus::Degraded,
                    detail: Some("slow".into()),
                },
            ],
        );
        assert_eq!(degraded.status, HealthStatus::Degraded);
    }

    #[test]
    fn serializes_status_lowercase() {
        let h = SystemHealth::new("svc", "1", 0, vec![]);
        let json = serde_json::to_string(&h).expect("serialize");
        assert!(json.contains("\"status\":\"ok\""));
    }
}
