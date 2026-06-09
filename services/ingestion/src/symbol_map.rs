//! Symbol mapping: venue instrument IDs → canonical asset IDs (P06-T012, P08-T003).
//!
//! Loaded from `config/symbol_map.toml` (or `SYMBOL_MAP_PATH` env var).
//! Falls back to `fixtures/venues/instruments.json` if the TOML file is missing,
//! so fixture-first mode works without any extra setup.
//!
//! ## Perp vs spot disambiguation (P08-T003)
//!
//! The map key is `(venue_id, market_type, instrument_id)` so that
//! `binance:perp:BTCUSDT` and `binance:spot:BTCUSDT` resolve to *different*
//! canonical IDs (`crypto:btc-usdt` vs `crypto:btc-spot`) and are never
//! confused. All existing exchange adapters call [`SymbolMap::canonical_id`]
//! which defaults to `market_type = "perp"` — they need not change.

use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct TomlEntry {
    venue_id: String,
    #[serde(default = "default_perp")]
    market_type: String,
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
    #[serde(default = "default_perp")]
    market_type: String,
    instrument_id: String,
    canonical_asset_id: String,
}

fn default_perp() -> String {
    "perp".to_string()
}

/// Maps `(venue_id, market_type, instrument_id)` → `canonical_asset_id`.
///
/// `market_type` disambiguates perp, spot, and macro proxy instruments so that
/// the same exchange symbol (e.g. `BTCUSDT`) in different market contexts maps
/// to distinct canonical IDs.
#[derive(Debug, Clone, Default)]
pub struct SymbolMap {
    /// Key: (venue_id, market_type, instrument_id)
    map: HashMap<(String, String, String), String>,
}

impl SymbolMap {
    /// Load from a TOML file at `path`. Returns an empty map if the file
    /// doesn't exist (fixture-first: adapters still work, they emit unknown IDs).
    pub fn load(path: &str) -> Self {
        if !Path::new(path).exists() {
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
        let map: HashMap<(String, String, String), String> = file
            .instruments
            .into_iter()
            .map(|e| {
                (
                    (e.venue_id, e.market_type, e.instrument_id),
                    e.canonical_asset_id,
                )
            })
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
        let map: HashMap<(String, String, String), String> = entries
            .into_iter()
            .map(|e| {
                (
                    (e.venue_id, e.market_type, e.instrument_id),
                    e.canonical_asset_id,
                )
            })
            .collect();
        Self { map }
    }

    /// Look up canonical asset id using an explicit `market_type`.
    ///
    /// Returns `"unknown:{venue}:{market_type}:{instrument_id}"` as a fallback
    /// so events can still flow for unmapped instruments.
    pub fn canonical_id_typed(
        &self,
        venue: &str,
        market_type: &str,
        instrument_id: &str,
    ) -> String {
        self.map
            .get(&(
                venue.to_string(),
                market_type.to_string(),
                instrument_id.to_string(),
            ))
            .cloned()
            .unwrap_or_else(|| format!("unknown:{venue}:{market_type}:{instrument_id}"))
    }

    /// Look up canonical asset id for a perpetual futures instrument.
    ///
    /// Shorthand for `canonical_id_typed(venue, "perp", instrument_id)`.
    /// All existing exchange adapters (Binance, Bybit, Hyperliquid, OKX) deal
    /// exclusively with perp feeds and use this method.
    pub fn canonical_id(&self, venue: &str, instrument_id: &str) -> String {
        self.canonical_id_typed(venue, "perp", instrument_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn perp_map() -> SymbolMap {
        let mut map = HashMap::new();
        map.insert(
            ("binance".into(), "perp".into(), "BTCUSDT".into()),
            "crypto:btc-usdt".into(),
        );
        map.insert(
            ("binance".into(), "perp".into(), "ETHUSDT".into()),
            "crypto:eth-usdt".into(),
        );
        map.insert(
            ("bybit".into(), "perp".into(), "BTCUSDT".into()),
            "crypto:btc-usdt".into(),
        );
        map.insert(
            ("hyperliquid".into(), "perp".into(), "BTC".into()),
            "crypto:btc-usdt".into(),
        );
        map.insert(
            ("okx".into(), "perp".into(), "BTC-USDT-SWAP".into()),
            "crypto:btc-usdt".into(),
        );
        SymbolMap { map }
    }

    fn mixed_map() -> SymbolMap {
        let mut map = perp_map().map;
        // Spot BTCUSDT on Binance maps to a DIFFERENT canonical ID than the perp.
        map.insert(
            ("binance".into(), "spot".into(), "BTCUSDT".into()),
            "crypto:btc-spot".into(),
        );
        map.insert(
            ("macro".into(), "macro_proxy".into(), "SPX".into()),
            "macro:spx".into(),
        );
        SymbolMap { map }
    }

    #[test]
    fn btcusdt_perp_maps_same_canonical_across_venues() {
        let m = perp_map();
        assert_eq!(m.canonical_id("binance", "BTCUSDT"), "crypto:btc-usdt");
        assert_eq!(m.canonical_id("bybit", "BTCUSDT"), "crypto:btc-usdt");
        assert_eq!(m.canonical_id("hyperliquid", "BTC"), "crypto:btc-usdt");
        assert_eq!(m.canonical_id("okx", "BTC-USDT-SWAP"), "crypto:btc-usdt");
    }

    #[test]
    fn btcusdt_perp_and_spot_are_different_canonical_ids() {
        let m = mixed_map();
        let perp = m.canonical_id_typed("binance", "perp", "BTCUSDT");
        let spot = m.canonical_id_typed("binance", "spot", "BTCUSDT");
        assert_ne!(
            perp, spot,
            "perp and spot must resolve to different canonical IDs"
        );
        assert_eq!(perp, "crypto:btc-usdt");
        assert_eq!(spot, "crypto:btc-spot");
    }

    #[test]
    fn perp_not_confused_with_spot_via_shorthand() {
        let m = mixed_map();
        // canonical_id() is the perp shorthand — it must NOT return the spot ID
        let via_shorthand = m.canonical_id("binance", "BTCUSDT");
        assert_eq!(
            via_shorthand, "crypto:btc-usdt",
            "shorthand must resolve to perp"
        );
        assert_ne!(
            via_shorthand, "crypto:btc-spot",
            "shorthand must not return spot canonical"
        );
    }

    #[test]
    fn macro_proxy_uses_typed_lookup() {
        let m = mixed_map();
        let spx = m.canonical_id_typed("macro", "macro_proxy", "SPX");
        assert_eq!(spx, "macro:spx");
    }

    #[test]
    fn unknown_instrument_returns_fallback_string() {
        let m = perp_map();
        let id = m.canonical_id("binance", "FAKECOIN");
        assert!(id.starts_with("unknown:"), "got: {id}");
    }

    #[test]
    fn loads_from_fixture_fallback() {
        let m = SymbolMap::load("nonexistent_path.toml");
        // fallback to fixtures/venues/instruments.json
        assert!(!m.map.is_empty());
        // Perp lookup via shorthand
        assert_eq!(m.canonical_id("binance", "BTCUSDT"), "crypto:btc-usdt");
        // Spot lookup via typed method
        let spot = m.canonical_id_typed("binance", "spot", "BTCUSDT");
        assert_eq!(
            spot, "crypto:btc-spot",
            "spot should map to crypto:btc-spot"
        );
    }
}
