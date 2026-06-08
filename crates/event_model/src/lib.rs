//! Shared event-model types for the Aestus event backbone (P05).
//!
//! Mirrors the TypeScript contracts in `packages/contracts`. The stream
//! topology lives in [`streams`]; the transport envelope in [`envelope`].

pub mod envelope;
pub mod streams;
