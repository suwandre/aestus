//! Shared event-model types for the Aestus event backbone (P05).
//!
//! Mirrors the TypeScript contracts in `packages/contracts`. The stream
//! topology lives in [`streams`]; the transport envelope in [`envelope`];
//! service-health types in [`health`].

pub mod envelope;
pub mod health;
pub mod market;
pub mod streams;
