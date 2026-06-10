# Feature Formulas

Reference for every deterministic feature computed by the `features` service.
All formulas match the implementation in `services/features/src/`.
Future agents: change the formula here _and_ in the code together.

---

## Rolling Window (`window.rs`)

The foundation of all features. A capacity-bounded, time-ordered deque of
`(timestamp_ms, value)` samples.

| Statistic | Formula | Notes |
|-----------|---------|-------|
| Mean | `Σv / n` | Returns `None` on empty window |
| Variance | `Σ(v-μ)² / (n-1)` | Bessel correction; `None` if n < 2 |
| Std dev | `√variance` | `None` if n < 2 |
| Min / Max | linear scan | `None` on empty |
| Percentile(p) | linear interpolation on sorted values | p ∈ [0, 100] |
| Z-score(x) | `(x - μ) / σ` | Returns `0.0` when σ < 1e-10 (flat window) |

**Eviction:** `evict_before(cutoff_ms)` drops all samples with
`timestamp_ms < cutoff_ms` from the front.

---

## Returns (`returns.rs`)

Simple (arithmetic) return over standard horizons.

```
return(horizon) = (price_current - price_at(now - horizon)) / price_at(now - horizon)
```

| Key | Lookback | Tolerance |
|-----|---------|-----------|
| `1m` | 1 minute | ±2 min |
| `5m` | 5 minutes | ±5 min |
| `15m` | 15 minutes | ±15 min |
| `1h` | 1 hour | ±1 h |
| `24h` | 24 hours | ±24 h |
| `7d` | 7 days | ±7 d |

A horizon key is **omitted** when no sample falls within the tolerance window.
Returns are omitted when `price_current ≤ 0`.

---

## Realized Volatility (`volatility.rs`)

Standard deviation of log-returns within a sliding time window.

```
log_return[i] = ln(price[i] / price[i-1])
realized_vol = std_dev(log_returns)   -- Bessel-corrected, n ≥ 2 required
```

| Key | Window |
|-----|--------|
| `24h` | Last 24 hours |
| `7d` | Last 7 days |

Returned as a dimensionless number (e.g., `0.032` ≈ 3.2% per interval).

### Volatility Regime Labels

| Label | 24h Vol Range |
|-------|--------------|
| `very_low` | < 0.005 |
| `low` | 0.005 – 0.015 |
| `normal` | 0.015 – 0.030 |
| `high` | 0.030 – 0.060 |
| `extreme` | ≥ 0.060 |

### Trend Regime (from 24h return)

| Label | 24h Return |
|-------|-----------|
| `trending_up` | > +2% |
| `trending_down` | < −2% |
| `ranging` | otherwise |

### Risk Regime

| Label | Condition |
|-------|----------|
| `risk_on` | trend=up AND vol ∈ {very_low, low, normal} |
| `risk_off` | trend=down AND vol ∈ {high, extreme} |
| `neutral` | all other combinations |

---

## Volume Anomaly (`volume.rs`)

Aggregates raw trade sizes into 1-minute volume bars, then computes statistics
over the rolling history of bars.

**Volume bars:** sum of all trade sizes within each 1-minute bucket.

### Volume Z-score

```
history = last min(30, n-1) bars (excluding current)
volume_z = (current_bar_vol - mean(history)) / effective_std(history)
```

`effective_std = max(std(history), mean(history) × 0.01 + ε)` — the relative
floor (1% of mean) ensures a spike against a perfectly flat baseline still
produces a large z-score instead of zero.

Requires ≥ 3 total bars (≥ 2 history bars).

### Volume Percentile

```
volume_pct = 100 × |{h ∈ history : h ≤ current_vol}| / |history|
```

Scale: 0–100 (100 = higher than all historical bars).

---

## Funding Features (`funding.rs`)

Per-venue funding rates are stored as rolling time series. Features are computed
across all venues for which data is present.

| Feature | Formula |
|---------|---------|
| `current_by_venue` | Latest funding rate per venue |
| `mean_by_venue` | Rolling mean of funding rates per venue |
| `funding_z` | Z-score of latest rate vs its own venue history |
| `funding_spread` | `max(rates) - min(rates)` across venues |

`funding_z` uses `RollingWindow::z_score` (returns `None` if < 2 samples or flat window).

---

## Open Interest Features (`oi.rs`)

| Feature | Formula | Notes |
|---------|---------|-------|
| `oi_delta` | `(latest_oi - prev_oi) / prev_oi` | Per-venue; averaged across venues |
| `oi_z` | Z-score of latest OI vs rolling window | Omitted from snapshot (computed for internal use) |
| `oi_state` | `"oi_increasing"` / `"oi_decreasing"` / `None` | Based on oi_delta vs threshold ±0.02 (2%) |
| `oi_price_divergence` | `sign(oi_delta) ≠ sign(price_return_24h)` | Boolean flag |

**OI State thresholds:**
- `oi_increasing`: mean oi_delta > +2%
- `oi_decreasing`: mean oi_delta < −2%
- `None`: insufficient data or change within threshold

---

## Liquidation Clusters (`liquidations.rs`)

Aggregates liquidation events within a lookback window into price buckets.

```
bucket_size = 0.1%  (0.001 × mid_price, rounded to nearest 10)
lookback    = 1 hour (3_600_000 ms)
min_events  = 2 per bucket (single events filtered out as noise)
```

Each cluster output:

| Field | Meaning |
|-------|---------|
| `price_low` | Lower bound of bucket |
| `price_high` | Upper bound of bucket |
| `total_size` | Sum of liquidation sizes in bucket |
| `side` | `"buy"` (longs liquidated) or `"sell"` (shorts liquidated) |

---

## Cross-Venue Basis (`basis.rs`)

Computes the spread between different price series in basis points (bps).

```
basis_bps = (price_a - price_b) / price_b × 10_000
```

Computed references (when data exists):

| Reference | Description |
|-----------|-------------|
| `mark-index` | Mark price vs index price |
| `{venue}-spot` | Perp price vs each venue's spot price |
| `{venue1}-{venue2}` | Cross-venue perp price comparison |

Returns empty vec when only one price series is available.

---

## Rolling Correlations (`correlation.rs`)

Pearson correlation between the primary asset's price window and each other
asset's price window, computed over **aligned timestamps** (samples within
±1 second tolerance).

```
r = Σ((x-μx)(y-μy)) / √(Σ(x-μx)² × Σ(y-μy)²)
```

**Window label:** `"price_window"` (uses all available aligned samples up to
the capacity of each window).

Requires ≥ 3 aligned samples per pair; skips pairs with insufficient overlap.

---

## Market Breadth (`breadth.rs`)

Computed across all assets currently in `MarketState`.

| Feature | Formula |
|---------|---------|
| `up_pct` | `100 × |assets with return_1h > 0| / total_assets` |
| `down_pct` | `100 × |assets with return_1h < 0| / total_assets` |
| `avg_vol` | Mean 24h realized volatility across assets |
| `risk_regime` | `risk_on` if up_pct > 60%; `risk_off` if down_pct > 60%; else `neutral` |

`total_assets` counts only assets with a computable 1h return (assets lacking
sufficient price history are excluded from the denominator). Returns `None`
when no tracked asset has a computable 1h return (including the no-assets case).

---

## OHLCV Aggregation (`candle.rs`)

Maintains in-memory OHLCV candles at multiple timeframes from incoming trade
events.

**Supported timeframes (ms):**

| Label | ms |
|-------|----|
| 1m | 60,000 |
| 5m | 300,000 |
| 15m | 900,000 |
| 1h | 3,600,000 |

Each bucket stores: `(ts, open, high, low, close, volume)`.

The current open candle is updated on each trade tick; a closed candle is
emitted when a new bucket begins. ClickHouse writes use the `candles` table
(schema defined in migrations at P04).

---

## Known Limitations

- **Window stale-eviction:** windows are capacity-bounded, not time-bounded.
  `evict_before` must be called explicitly; the main event loop calls it on a
  configurable `snapshot_interval` cadence.
- **Flat-baseline z-scores:** a relative std floor (1% of mean) substitutes for
  zero variance. This means z-scores for flat baselines reflect proportional
  distance from mean, not statistical significance.
- **Correlation sparsity:** macro proxy assets (SPX, DXY, etc.) may have far
  fewer samples than crypto assets; correlations are only computed when ≥ 3
  aligned points exist.
- **Basis accuracy:** the basis computation uses a single "primary" price per
  asset (the last trade/tick price). Multi-venue basis requires separate
  per-venue price series (deferred to P10+).
- **Liquidation clusters:** side is determined by `Side::Buy` (longs liquidated)
  vs `Side::Sell` (shorts liquidated). Exchanges use different conventions;
  normalization happens at the ingestion layer.
