use std::collections::HashMap;

pub const TIMEFRAMES_MS: &[i64] = &[
    60_000,    // 1m
    300_000,   // 5m
    900_000,   // 15m
    3_600_000, // 1h
];

/// An OHLCV candle for a single time bucket.
#[derive(Debug, Clone)]
pub struct Candle {
    /// Bucket start timestamp in ms since epoch.
    pub ts: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub trades: u64,
}

impl Candle {
    fn new(ts: i64) -> Self {
        Self {
            ts,
            open: 0.0,
            high: 0.0,
            low: 0.0,
            close: 0.0,
            volume: 0.0,
            trades: 0,
        }
    }

    fn update(&mut self, price: f64, size: f64) {
        if self.trades == 0 {
            self.open = price;
            self.high = price;
            self.low = price;
        } else {
            if price > self.high {
                self.high = price;
            }
            if price < self.low {
                self.low = price;
            }
        }
        self.close = price;
        self.volume += size;
        self.trades += 1;
    }
}

/// Maintains in-memory OHLCV candles for multiple timeframes.
///
/// Call `update` with each trade/price event; the method returns any candles
/// that were closed (i.e., their bucket period ended) by this update.
pub struct CandleAggregator {
    open_buckets: HashMap<i64, HashMap<i64, Candle>>,
    closed: HashMap<i64, Vec<Candle>>,
    max_closed: usize,
}

impl CandleAggregator {
    pub fn new() -> Self {
        let mut open_buckets = HashMap::new();
        let mut closed = HashMap::new();
        for &tf in TIMEFRAMES_MS {
            open_buckets.insert(tf, HashMap::new());
            closed.insert(tf, Vec::new());
        }
        Self {
            open_buckets,
            closed,
            max_closed: 200,
        }
    }

    /// Process a trade/price event. Returns `(timeframe_ms, closed_candle)` pairs
    /// for any buckets that were just closed.
    pub fn update(&mut self, timestamp_ms: i64, price: f64, size: f64) -> Vec<(i64, Candle)> {
        let mut finished = Vec::new();
        for &tf in TIMEFRAMES_MS {
            let bucket_ts = (timestamp_ms / tf) * tf;
            let bucket_map = self.open_buckets.get_mut(&tf).expect("tf key exists");

            // Close any open buckets that are older than the current bucket.
            let old_keys: Vec<i64> = bucket_map
                .keys()
                .filter(|&&k| k < bucket_ts)
                .copied()
                .collect();
            for k in old_keys {
                if let Some(candle) = bucket_map.remove(&k) {
                    finished.push((tf, candle.clone()));
                    if let Some(cv) = self.closed.get_mut(&tf) {
                        cv.push(candle);
                        if cv.len() > self.max_closed {
                            cv.remove(0);
                        }
                    }
                }
            }

            bucket_map
                .entry(bucket_ts)
                .or_insert_with(|| Candle::new(bucket_ts))
                .update(price, size);
        }
        finished
    }

    /// Latest closed candle for the given timeframe, if any.
    pub fn latest_closed(&self, timeframe_ms: i64) -> Option<&Candle> {
        self.closed.get(&timeframe_ms)?.last()
    }

    /// All closed candles for the given timeframe.
    pub fn all_closed(&self, timeframe_ms: i64) -> &[Candle] {
        self.closed
            .get(&timeframe_ms)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    /// Current open (in-progress) candle for the given timeframe, if any.
    pub fn current_open(&self, timeframe_ms: i64) -> Option<&Candle> {
        self.open_buckets.get(&timeframe_ms)?.values().next()
    }
}

impl Default for CandleAggregator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candle_ohlcv_updates_correctly() {
        let mut agg = CandleAggregator::new();
        let base_ts = 1_704_067_200_000_i64; // 2024-01-01T00:00:00Z in ms
        agg.update(base_ts, 100.0, 1.0);
        agg.update(base_ts + 10_000, 110.0, 2.0);
        agg.update(base_ts + 20_000, 95.0, 0.5);

        let candle = agg.current_open(60_000).expect("1m candle should exist");
        assert_eq!(candle.open, 100.0);
        assert_eq!(candle.high, 110.0);
        assert_eq!(candle.low, 95.0);
        assert_eq!(candle.close, 95.0);
        assert!((candle.volume - 3.5).abs() < 1e-10);
        assert_eq!(candle.trades, 3);
    }

    #[test]
    fn candle_closes_on_new_bucket() {
        let mut agg = CandleAggregator::new();
        let base_ts = 1_704_067_200_000_i64;
        agg.update(base_ts, 100.0, 1.0);
        // Advance to next 1m bucket
        let closed = agg.update(base_ts + 60_001, 200.0, 1.0);
        // Should have closed the 1m (and possibly 5m/15m/1h if applicable)
        assert!(closed.iter().any(|(tf, _)| *tf == 60_000));
        assert!(agg.latest_closed(60_000).is_some());
    }
}
