use std::collections::{HashMap, VecDeque};

use event_model::market::{NormalizedMarketEvent, Side};
use market_math::timestamps::rfc3339_to_ms;

use crate::candle::CandleAggregator;
use crate::window::RollingWindow;

const PRICE_CAPACITY: usize = 10_000;
const TRADE_CAPACITY: usize = 10_000;
const FUNDING_CAPACITY: usize = 1_000;
const OI_CAPACITY: usize = 1_000;
const LIQ_CAPACITY: usize = 10_000;

/// A liquidation event stored for cluster computation.
#[derive(Debug, Clone)]
pub struct LiqEvent {
    pub timestamp_ms: i64,
    pub price: f64,
    pub size: f64,
    /// true = buy-side liquidation (long position liquidated).
    pub is_buy: bool,
}

/// Per-asset rolling state updated from incoming normalized market events.
pub struct AssetState {
    pub canonical_asset_id: String,
    /// Mid-price (or trade price) time series.
    pub price_window: RollingWindow,
    /// Per-trade size time series (for volume features).
    pub trade_size_window: RollingWindow,
    /// In-memory OHLCV aggregator (T003).
    pub candles: CandleAggregator,
    /// Funding rates per venue.
    pub funding_by_venue: HashMap<String, RollingWindow>,
    /// Open interest history per venue.
    pub oi_by_venue: HashMap<String, RollingWindow>,
    /// Latest OI value per venue (for delta computation).
    pub oi_latest: HashMap<String, f64>,
    /// Previous OI value per venue (before the latest update).
    pub oi_prev: HashMap<String, f64>,
    /// Latest mark price per venue.
    pub mark_price: HashMap<String, f64>,
    /// Latest index price per venue.
    pub index_price: HashMap<String, f64>,
    /// Recent liquidation events (bounded by LIQ_CAPACITY).
    pub liq_events: VecDeque<LiqEvent>,
}

impl AssetState {
    pub fn new(canonical_asset_id: String) -> Self {
        Self {
            canonical_asset_id,
            price_window: RollingWindow::new(PRICE_CAPACITY),
            trade_size_window: RollingWindow::new(TRADE_CAPACITY),
            candles: CandleAggregator::new(),
            funding_by_venue: HashMap::new(),
            oi_by_venue: HashMap::new(),
            oi_latest: HashMap::new(),
            oi_prev: HashMap::new(),
            mark_price: HashMap::new(),
            index_price: HashMap::new(),
            liq_events: VecDeque::with_capacity(LIQ_CAPACITY),
        }
    }

    pub fn update(&mut self, event: &NormalizedMarketEvent) {
        let ts_ms = rfc3339_to_ms(event.timestamp()).unwrap_or(0);
        match event {
            NormalizedMarketEvent::PriceTick { price, .. } => {
                self.price_window.push(ts_ms, *price);
            }
            NormalizedMarketEvent::Trade { price, size, .. } => {
                self.price_window.push(ts_ms, *price);
                self.trade_size_window.push(ts_ms, *size);
                self.candles.update(ts_ms, *price, *size);
            }
            NormalizedMarketEvent::FundingRate {
                funding_rate,
                venue,
                ..
            } => {
                self.funding_by_venue
                    .entry(venue.clone())
                    .or_insert_with(|| RollingWindow::new(FUNDING_CAPACITY))
                    .push(ts_ms, *funding_rate);
            }
            NormalizedMarketEvent::OpenInterest {
                open_interest,
                venue,
                ..
            } => {
                if let Some(&prev) = self.oi_latest.get(venue.as_str()) {
                    self.oi_prev.insert(venue.clone(), prev);
                }
                self.oi_latest.insert(venue.clone(), *open_interest);
                self.oi_by_venue
                    .entry(venue.clone())
                    .or_insert_with(|| RollingWindow::new(OI_CAPACITY))
                    .push(ts_ms, *open_interest);
            }
            NormalizedMarketEvent::MarkPrice {
                mark_price, venue, ..
            } => {
                self.mark_price.insert(venue.clone(), *mark_price);
            }
            NormalizedMarketEvent::IndexPrice {
                index_price, venue, ..
            } => {
                self.index_price.insert(venue.clone(), *index_price);
            }
            NormalizedMarketEvent::Liquidation {
                price, size, side, ..
            } => {
                let is_buy = matches!(side, Side::Buy);
                if self.liq_events.len() >= LIQ_CAPACITY {
                    self.liq_events.pop_front();
                }
                self.liq_events.push_back(LiqEvent {
                    timestamp_ms: ts_ms,
                    price: *price,
                    size: *size,
                    is_buy,
                });
            }
            NormalizedMarketEvent::OrderbookDelta { .. } => {}
        }
    }
}

/// Global market state: all asset states plus cross-asset data.
pub struct MarketState {
    pub assets: HashMap<String, AssetState>,
}

impl MarketState {
    pub fn new() -> Self {
        Self {
            assets: HashMap::new(),
        }
    }

    pub fn update(&mut self, event: &NormalizedMarketEvent) {
        let asset_id = event.canonical_asset_id().to_string();
        self.assets
            .entry(asset_id.clone())
            .or_insert_with(|| AssetState::new(asset_id))
            .update(event);
    }

    pub fn asset_ids(&self) -> impl Iterator<Item = &str> {
        self.assets.keys().map(|s| s.as_str())
    }
}

impl Default for MarketState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use event_model::market::NormalizedMarketEvent;

    #[test]
    fn update_price_tick_populates_window() {
        let mut state = MarketState::new();
        let ev = NormalizedMarketEvent::PriceTick {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-07T12:00:00Z".into(),
            sequence: None,
            price: 68250.0,
            bid: None,
            ask: None,
        };
        state.update(&ev);
        let asset = state.assets.get("crypto:btc-usdt").expect("asset exists");
        assert_eq!(asset.price_window.len(), 1);
        assert_eq!(asset.price_window.latest().map(|(_, v)| v), Some(68250.0));
    }

    #[test]
    fn update_trade_populates_both_windows_and_candles() {
        let mut state = MarketState::new();
        let ev = NormalizedMarketEvent::Trade {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-07T12:00:00Z".into(),
            sequence: None,
            price: 68250.0,
            size: 0.5,
            side: Side::Buy,
            trade_id: None,
        };
        state.update(&ev);
        let asset = state.assets.get("crypto:btc-usdt").expect("asset");
        assert_eq!(asset.price_window.len(), 1);
        assert_eq!(asset.trade_size_window.len(), 1);
        assert!(asset.candles.current_open(60_000).is_some());
    }

    #[test]
    fn update_funding_rate_tracked_per_venue() {
        let mut state = MarketState::new();
        let ev = NormalizedMarketEvent::FundingRate {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-07T12:00:00Z".into(),
            sequence: None,
            funding_rate: 0.0001,
            next_funding_time: None,
            interval_hours: None,
        };
        state.update(&ev);
        let asset = state.assets.get("crypto:btc-usdt").expect("asset");
        assert!(asset.funding_by_venue.contains_key("binance"));
    }

    #[test]
    fn update_oi_tracks_prev_and_latest() {
        let mut state = MarketState::new();
        let make_oi = |oi: f64| NormalizedMarketEvent::OpenInterest {
            schema_version: 1,
            venue: "binance".into(),
            instrument_id: "BTCUSDT".into(),
            canonical_asset_id: "crypto:btc-usdt".into(),
            timestamp: "2026-06-07T12:00:00Z".into(),
            sequence: None,
            open_interest: oi,
            notional: None,
        };
        state.update(&make_oi(100.0));
        state.update(&make_oi(110.0));
        let asset = state.assets.get("crypto:btc-usdt").expect("asset");
        assert_eq!(asset.oi_latest.get("binance"), Some(&110.0));
        assert_eq!(asset.oi_prev.get("binance"), Some(&100.0));
    }
}
