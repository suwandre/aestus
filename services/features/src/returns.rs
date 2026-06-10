use std::collections::HashMap;

use crate::window::RollingWindow;

const MS_PER_MIN: i64 = 60_000;
const MS_PER_HOUR: i64 = 3_600_000;
const MS_PER_24H: i64 = 86_400_000;
const MS_PER_7D: i64 = 604_800_000;

/// Compute simple returns at standard horizons from a price window.
///
/// Keys in the returned map: `"1m"`, `"5m"`, `"15m"`, `"1h"`, `"24h"`, `"7d"`.
/// A horizon is omitted when no price exists within its tolerance window.
pub fn compute_returns(price_window: &RollingWindow) -> HashMap<String, f64> {
    let mut returns = HashMap::new();
    let Some((current_ts, current_price)) = price_window.latest() else {
        return returns;
    };
    if current_price <= 0.0 {
        return returns;
    }

    let horizons: &[(&str, i64, i64)] = &[
        ("1m", current_ts - MS_PER_MIN, 2 * MS_PER_MIN),
        ("5m", current_ts - 5 * MS_PER_MIN, 5 * MS_PER_MIN),
        ("15m", current_ts - 15 * MS_PER_MIN, 15 * MS_PER_MIN),
        ("1h", current_ts - MS_PER_HOUR, MS_PER_HOUR),
        ("24h", current_ts - MS_PER_24H, MS_PER_24H),
        ("7d", current_ts - MS_PER_7D, MS_PER_7D),
    ];

    for &(label, target_ts, tolerance_ms) in horizons {
        if let Some(old_price) = price_window.value_near(target_ts, tolerance_ms) {
            if old_price > 0.0 {
                returns.insert(label.to_string(), (current_price - old_price) / old_price);
            }
        }
    }

    returns
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(h: i64) -> i64 {
        h * MS_PER_HOUR
    }

    #[test]
    fn returns_empty_when_no_data() {
        let w = RollingWindow::new(100);
        assert!(compute_returns(&w).is_empty());
    }

    #[test]
    fn returns_1h_correct() {
        let mut w = RollingWindow::new(1000);
        let now = ms(24); // arbitrary base
        w.push(now - MS_PER_HOUR, 100.0);
        w.push(now, 105.0);
        let r = compute_returns(&w);
        let ret_1h = r["1h"];
        assert!((ret_1h - 0.05).abs() < 1e-9, "got {ret_1h}");
    }

    #[test]
    fn returns_24h_correct() {
        let mut w = RollingWindow::new(1000);
        let now = ms(25);
        w.push(now - MS_PER_24H, 200.0);
        w.push(now, 180.0);
        let r = compute_returns(&w);
        let ret_24h = r["24h"];
        assert!((ret_24h - (-0.1)).abs() < 1e-9, "got {ret_24h}");
    }

    #[test]
    fn negative_price_omitted() {
        let mut w = RollingWindow::new(10);
        w.push(0, 0.0); // price = 0 → skip
        w.push(1000, 100.0);
        let r = compute_returns(&w);
        // 1m target would look for price at ts=1000 - 60_000 = -59_000; no such sample
        // so only keys present are those with actual lookbacks
        assert!(r.is_empty() || !r.contains_key("1m"));
    }
}
