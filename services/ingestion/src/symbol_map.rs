//! Symbol mapping: venue instrument IDs → canonical asset IDs (P06-T012).
//!
//! Loaded from `config/symbol_map.toml` (or `SYMBOL_MAP_PATH` env var).
//! Falls back to `fixtures/venues/instruments.json` if the TOML file is missing,
//! so fixture-first mode works without any extra setup.

use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct TomlEntry {
    venue_id: String,
    instrument_id: String,
    canonical_asset_id: String,
}

#[derive(Debug, Deserialize)]
struct TomlFile {
    instruments: Vec<TomlEntry>,
}

/// JSON shape in fixtures/venues/instruments.json (fallback).
#[derive(Debug, Deserialize)]
struct JsonEntry {
    venue_id: String,
    instrument_id: String,
    canonical_asset_id: String,
}

/// Maps `(venue_id, instrument_id)` → `canonical_asset_id`.
#[derive(Debug, Clone, Default)]
pub struct SymbolMap {
    map: HashMap<(String, String), String>,
}

impl SymbolMap {
    /// Load from a TOML file at `path`. Returns an empty map if the file
    /// doesn't exist (fixture-first: adapters still work, they emit unknown IDs).
    pub fn load(path: &str) -> Self {
        if !Path::new(path).exists() {
            // Try fixture fallback
            return Self::load_fixture_fallback();
        }
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(path, error = %e, "symbol_map: cannot read TOML, using fallback");
                return Self::load_fixture_fallback();
            }
        };
        let file: TomlFile = match toml::from_str(&content) {
            Ok(f) => f,
            Err(e) => {
                tracing::warn!(path, error = %e, "symbol_map: TOML parse error, using fallback");
                return Self::load_fixture_fallback();
            }
        };
        let map: HashMap<(String, String), String> = file
            .instruments
            .into_iter()
            .map(|e| ((e.venue_id, e.instrument_id), e.canonical_asset_id))
            .collect();
        tracing::info!(path, entries = map.len(), "symbol_map loaded");
        Self { map }
    }

    fn load_fixture_fallback() -> Self {
        let fallback = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/venues/instruments.json"
        );
        let content = std::fs::read_to_string(fallback).unwrap_or_default();
        let entries: Vec<JsonEntry> = serde_json::from_str(&content).unwrap_or_default();
        let map = entries
            .into_iter()
            .map(|e| ((e.venue_id, e.instrument_id), e.canonical_asset_id))
            .collect();
        Self { map }
    }

    /// Look up the canonical asset id for `(venue_id, instrument_id)`.
    /// Returns the instrument_id prefixed with the venue as a fallback so
    /// events can still flow even for unmapped instruments.
    pub fn canonical_id(&self, venue: &str, instrument_id: &str) -> String {
        self.map
            .get(&(venue.to_string(), instrument_id.to_string()))
            .cloned()
            .unwrap_or_else(|| format!("unknown:{venue}:{instrument_id}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_map() -> SymbolMap {
        // Build a minimal map directly for tests
        let mut map = HashMap::new();
        map.insert(
            ("binance".into(), "BTCUSDT".into()),
            "crypto:btc-usdt".into(),
        );
        map.insert(("bybit".into(), "BTCUSDT".into()), "crypto:btc-usdt".into());
        map.insert(
            ("hyperliquid".into(), "BTC".into()),
            "crypto:btc-usdt".into(),
        );
        map.insert(
            ("okx".into(), "BTC-USDT-SWAP".into()),
            "crypto:btc-usdt".into(),
        );
        SymbolMap { map }
    }

    #[test]
    fn btcusdt_maps_same_canonical_across_venues() {
        let m = fixture_map();
        assert_eq!(m.canonical_id("binance", "BTCUSDT"), "crypto:btc-usdt");
        assert_eq!(m.canonical_id("bybit", "BTCUSDT"), "crypto:btc-usdt");
        assert_eq!(m.canonical_id("hyperliquid", "BTC"), "crypto:btc-usdt");
        assert_eq!(m.canonical_id("okx", "BTC-USDT-SWAP"), "crypto:btc-usdt");
    }

    #[test]
    fn unknown_returns_fallback_string() {
        let m = fixture_map();
        let id = m.canonical_id("binance", "FAKECOIN");
        assert!(id.starts_with("unknown:"));
    }

    #[test]
    fn loads_from_fixture_fallback() {
        // fixture file exists in the repo, so this should return a non-empty map
        let m = SymbolMap::load("nonexistent_path.toml");
        // fallback to fixtures/venues/instruments.json which has 6 entries
        assert!(!m.map.is_empty());
        assert_eq!(m.canonical_id("binance", "BTCUSDT"), "crypto:btc-usdt");
    }
}
