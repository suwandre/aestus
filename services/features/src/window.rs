use std::collections::VecDeque;

/// A capacity-bounded, time-ordered rolling window of `(timestamp_ms, value)` samples.
///
/// Push appends to the back; evict_before drops stale samples from the front.
/// All statistical functions operate over the current window contents.
#[derive(Debug, Clone)]
pub struct RollingWindow {
    capacity: usize,
    samples: VecDeque<(i64, f64)>,
}

impl RollingWindow {
    pub fn new(capacity: usize) -> Self {
        let cap = capacity.max(1);
        Self {
            capacity: cap,
            samples: VecDeque::with_capacity(cap.min(4096)),
        }
    }

    /// Append a sample. Drops the oldest entry when capacity is reached.
    pub fn push(&mut self, timestamp_ms: i64, value: f64) {
        if self.samples.len() >= self.capacity {
            self.samples.pop_front();
        }
        self.samples.push_back((timestamp_ms, value));
    }

    /// Evict all samples with timestamp_ms strictly less than `cutoff_ms`.
    pub fn evict_before(&mut self, cutoff_ms: i64) {
        while let Some(&(ts, _)) = self.samples.front() {
            if ts < cutoff_ms {
                self.samples.pop_front();
            } else {
                break;
            }
        }
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    pub fn latest(&self) -> Option<(i64, f64)> {
        self.samples.back().copied()
    }

    pub fn oldest(&self) -> Option<(i64, f64)> {
        self.samples.front().copied()
    }

    pub fn samples(&self) -> &VecDeque<(i64, f64)> {
        &self.samples
    }

    pub fn values(&self) -> impl Iterator<Item = f64> + '_ {
        self.samples.iter().map(|(_, v)| *v)
    }

    pub fn sum(&self) -> f64 {
        self.values().sum()
    }

    pub fn count(&self) -> usize {
        self.len()
    }

    pub fn mean(&self) -> Option<f64> {
        if self.is_empty() {
            return None;
        }
        Some(self.sum() / self.len() as f64)
    }

    /// Sample variance (Bessel's correction: n-1 denominator).
    pub fn variance(&self) -> Option<f64> {
        let n = self.len();
        if n < 2 {
            return None;
        }
        let mean = self.mean()?;
        let var = self.values().map(|v| (v - mean).powi(2)).sum::<f64>() / (n - 1) as f64;
        Some(var)
    }

    pub fn std_dev(&self) -> Option<f64> {
        self.variance().map(|v| v.sqrt())
    }

    pub fn min(&self) -> Option<f64> {
        self.values().reduce(|a, b| a.min(b))
    }

    pub fn max(&self) -> Option<f64> {
        self.values().reduce(|a, b| a.max(b))
    }

    /// Linear-interpolation percentile. `p` is in [0, 100].
    pub fn percentile(&self, p: f64) -> Option<f64> {
        if self.is_empty() {
            return None;
        }
        let mut sorted: Vec<f64> = self.values().collect();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let p_clamped = p.clamp(0.0, 100.0);
        let idx = (p_clamped / 100.0 * (sorted.len() as f64 - 1.0)).round() as usize;
        sorted.get(idx.min(sorted.len() - 1)).copied()
    }

    /// Z-score of `value` relative to the window distribution.
    /// Returns `Some(0.0)` when std_dev < 1e-10 (flat window).
    /// Returns `None` when fewer than 2 samples are present.
    pub fn z_score(&self, value: f64) -> Option<f64> {
        let mean = self.mean()?;
        let std = self.std_dev()?;
        if std < 1e-10 {
            return Some(0.0);
        }
        Some((value - mean) / std)
    }

    /// Nearest value to `target_ms` within `tolerance_ms`. Returns the closest
    /// sample by absolute timestamp distance, or None if none qualify.
    pub fn value_near(&self, target_ms: i64, tolerance_ms: i64) -> Option<f64> {
        let mut best_dist = i64::MAX;
        let mut best_val = None;
        for &(ts, v) in &self.samples {
            let dist = (ts - target_ms).abs();
            if dist <= tolerance_ms && dist < best_dist {
                best_dist = dist;
                best_val = Some(v);
            }
        }
        best_val
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window_from(data: &[(i64, f64)]) -> RollingWindow {
        let mut w = RollingWindow::new(100);
        for &(ts, v) in data {
            w.push(ts, v);
        }
        w
    }

    #[test]
    fn mean_of_three_values() {
        let w = window_from(&[(1000, 10.0), (2000, 20.0), (3000, 30.0)]);
        assert!((w.mean().unwrap() - 20.0).abs() < 1e-10);
    }

    #[test]
    fn variance_bessel_correction() {
        let w = window_from(&[(1000, 10.0), (2000, 20.0), (3000, 30.0)]);
        // var = ((10-20)^2 + (20-20)^2 + (30-20)^2) / 2 = 200/2 = 100
        assert!((w.variance().unwrap() - 100.0).abs() < 1e-10);
        assert!((w.std_dev().unwrap() - 10.0).abs() < 1e-10);
    }

    #[test]
    fn min_max() {
        let w = window_from(&[(1, 5.0), (2, 1.0), (3, 9.0), (4, 3.0)]);
        assert_eq!(w.min(), Some(1.0));
        assert_eq!(w.max(), Some(9.0));
    }

    #[test]
    fn percentile_median() {
        let w = window_from(&[(1, 1.0), (2, 2.0), (3, 3.0), (4, 4.0), (5, 5.0)]);
        assert_eq!(w.percentile(50.0), Some(3.0));
        assert_eq!(w.percentile(0.0), Some(1.0));
        assert_eq!(w.percentile(100.0), Some(5.0));
    }

    #[test]
    fn z_score_of_mean_is_zero() {
        let w = window_from(&[(1, 10.0), (2, 20.0), (3, 30.0)]);
        let z = w.z_score(20.0).unwrap();
        assert!(z.abs() < 1e-10);
    }

    #[test]
    fn z_score_of_one_std_dev_above() {
        let w = window_from(&[(1, 10.0), (2, 20.0), (3, 30.0)]);
        let z = w.z_score(30.0).unwrap();
        assert!((z - 1.0).abs() < 1e-10);
    }

    #[test]
    fn evict_before_removes_old() {
        let mut w = window_from(&[(1000, 10.0), (2000, 20.0), (3000, 30.0)]);
        w.evict_before(2000);
        assert_eq!(w.len(), 2); // 2000 and 3000 remain
        assert_eq!(w.oldest(), Some((2000, 20.0)));
    }

    #[test]
    fn capacity_drops_oldest() {
        let mut w = RollingWindow::new(3);
        w.push(1, 1.0);
        w.push(2, 2.0);
        w.push(3, 3.0);
        w.push(4, 4.0); // capacity=3, drops ts=1
        assert_eq!(w.len(), 3);
        assert_eq!(w.oldest(), Some((2, 2.0)));
    }

    #[test]
    fn value_near_finds_closest() {
        let w = window_from(&[(1000, 10.0), (5000, 50.0), (9000, 90.0)]);
        assert_eq!(w.value_near(4800, 500), Some(50.0));
        assert_eq!(w.value_near(100, 500), None);
    }

    #[test]
    fn empty_window_returns_none_for_stats() {
        let w = RollingWindow::new(10);
        assert_eq!(w.mean(), None);
        assert_eq!(w.variance(), None);
        assert_eq!(w.std_dev(), None);
        assert_eq!(w.min(), None);
        assert_eq!(w.max(), None);
        assert_eq!(w.percentile(50.0), None);
        assert_eq!(w.z_score(0.0), None);
    }

    #[test]
    fn flat_window_z_score_returns_zero() {
        let w = window_from(&[(1, 5.0), (2, 5.0), (3, 5.0)]);
        assert_eq!(w.z_score(5.0), Some(0.0));
    }
}
