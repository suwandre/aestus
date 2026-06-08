//! Exponential-backoff state for Binance WebSocket reconnects (P06-T007).

use std::time::Duration;

/// Tracks exponential backoff state across reconnect attempts.
///
/// Each call to [`BackoffState::next_delay`] doubles the delay up to `max_delay`.
/// Call [`BackoffState::reset`] after a successful connection to start fresh.
#[derive(Debug, Clone)]
pub struct BackoffState {
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub multiplier: f64,
    current: Duration,
}

impl Default for BackoffState {
    fn default() -> Self {
        Self::new(Duration::from_secs(1), Duration::from_secs(60), 2.0)
    }
}

impl BackoffState {
    pub fn new(initial_delay: Duration, max_delay: Duration, multiplier: f64) -> Self {
        Self {
            initial_delay,
            max_delay,
            multiplier,
            current: initial_delay,
        }
    }

    /// Return the current delay for this attempt, then advance to the next.
    pub fn next_delay(&mut self) -> Duration {
        let delay = self.current;
        let next_ms = (delay.as_millis() as f64 * self.multiplier) as u64;
        self.current = Duration::from_millis(next_ms).min(self.max_delay);
        delay
    }

    /// Reset to initial delay after a successful connection.
    pub fn reset(&mut self) {
        self.current = self.initial_delay;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delays_are_exponential() {
        let mut b = BackoffState::new(Duration::from_millis(100), Duration::from_secs(60), 2.0);
        assert_eq!(b.next_delay(), Duration::from_millis(100));
        assert_eq!(b.next_delay(), Duration::from_millis(200));
        assert_eq!(b.next_delay(), Duration::from_millis(400));
        assert_eq!(b.next_delay(), Duration::from_millis(800));
    }

    #[test]
    fn delay_is_capped_at_max() {
        let mut b = BackoffState::new(Duration::from_secs(30), Duration::from_secs(60), 2.0);
        assert_eq!(b.next_delay(), Duration::from_secs(30));
        assert_eq!(b.next_delay(), Duration::from_secs(60)); // 60 is max
        assert_eq!(b.next_delay(), Duration::from_secs(60)); // stays at max
    }

    #[test]
    fn reset_returns_to_initial() {
        let mut b = BackoffState::default();
        b.next_delay();
        b.next_delay();
        b.reset();
        assert_eq!(b.next_delay(), b.initial_delay);
    }
}
