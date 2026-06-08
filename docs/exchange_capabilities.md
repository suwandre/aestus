# Exchange Capability Matrix

> P06-T011 — Source of truth for what each venue currently supports in Aestus.
> Update this file whenever an adapter is promoted from placeholder to live.

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ live | Implemented and connected to live exchange |
| 🔧 fixture | Parser written and fixture-tested; no live WebSocket |
| ❌ not implemented | No Aestus code exists yet |
| — | Not available from this venue |

---

## Binance (Futures Perpetual — USDT-M)

**Protocol:** WebSocket combined streams + REST polling  
**Base URL:** `wss://fstream.binance.com/stream?streams=`  
**OI URL:** `https://fapi.binance.com/fapi/v1/openInterest`  
**Rate limits:** 300 WebSocket connections per IP; REST 2 400 weight/min

| Feed | Event type | Status | Notes |
|------|-----------|--------|-------|
| Trade (aggTrade) | `trade` | ✅ live | Side from `buyer_is_maker` flag |
| Best bid/ask (bookTicker) | `price_tick` | ✅ live | Mid = (bid+ask)/2 |
| Mark price (markPriceUpdate@1s) | `mark_price` | ✅ live | 1-second cadence |
| Index price | `index_price` | ✅ live | Emitted together with mark price |
| Funding rate | `funding_rate` | ✅ live | interval_hours = 8 |
| Liquidation (!forceOrder@arr) | `liquidation` | ✅ live | notional = price × size |
| Open interest (REST poll) | `open_interest` | ✅ live | Polled every 60 s (configurable) |
| Orderbook delta | `orderbook_delta` | ❌ not implemented | Out of P06 scope |

---

## Bybit (Linear Perpetual — USDT)

**Protocol:** WebSocket V5 public streams  
**MVP status:** 🔧 fixture — parser complete, live WebSocket not yet connected

| Feed | Event type | Status | Notes |
|------|-----------|--------|-------|
| Trade (publicTrade) | `trade` | 🔧 fixture | Side from `S` field |
| Best bid/ask (tickers) | `price_tick` | 🔧 fixture | Mid from bid1Price/ask1Price |
| Mark price (tickers) | `mark_price` | 🔧 fixture | In same tickers snapshot |
| Funding rate (tickers) | `funding_rate` | 🔧 fixture | interval_hours = 8 |
| Open interest (tickers) | `open_interest` | ❌ not implemented | Available in tickers; add in future phase |
| Liquidation | `liquidation` | ❌ not implemented | Separate topic not yet parsed |
| Index price | `index_price` | ❌ not implemented | Present in tickers snapshot |
| Orderbook delta | `orderbook_delta` | ❌ not implemented | Out of P06 scope |

---

## Hyperliquid

**Protocol:** WebSocket JSON-RPC, channel-based subscriptions  
**MVP status:** 🔧 fixture — trades + allMids parsers complete, live WS not connected

| Feed | Event type | Status | Notes |
|------|-----------|--------|-------|
| Trade (trades channel) | `trade` | 🔧 fixture | Side: "B" = buy aggressor |
| Mid price (allMids channel) | `price_tick` | 🔧 fixture | No bid/ask spread available |
| Mark price | `mark_price` | ❌ not implemented | Available via info API |
| Funding rate | `funding_rate` | ❌ not implemented | Available via info API |
| Open interest | `open_interest` | ❌ not implemented | Available via REST |
| Liquidation | `liquidation` | ❌ not implemented | Available in trades channel (is_liquidation flag) |
| Orderbook | `orderbook_delta` | ❌ not implemented | l2Book channel; out of P06 scope |

**Note:** Hyperliquid uses coin symbols (`BTC`) not pair symbols (`BTCUSDT`). Symbol map maps `hyperliquid:BTC` → `crypto:btc-usdt`.

---

## OKX (Swap Perpetual — USDT)

**Protocol:** WebSocket V5 public streams  
**MVP status:** 🔧 fixture — trades, funding-rate, mark-price parsers complete, live WS not connected

| Feed | Event type | Status | Notes |
|------|-----------|--------|-------|
| Trade (trades channel) | `trade` | 🔧 fixture | Side from `side` field (buy/sell) |
| Mark price (mark-price channel) | `mark_price` | 🔧 fixture | markPx field |
| Funding rate (funding-rate channel) | `funding_rate` | 🔧 fixture | interval_hours = 8 |
| Best bid/ask (tickers channel) | `price_tick` | ❌ not implemented | Separate tickers topic needed |
| Open interest | `open_interest` | ❌ not implemented | Available via REST API |
| Liquidation | `liquidation` | ❌ not implemented | liquidation-orders channel |
| Index price | `index_price` | ❌ not implemented | index-tickers channel |
| Orderbook | `orderbook_delta` | ❌ not implemented | books channel; out of P06 scope |

**Note:** OKX instrument IDs use `BTC-USDT-SWAP` format. Symbol map maps `okx:BTC-USDT-SWAP` → `crypto:btc-usdt`.

---

## Remaining work per venue (next phases)

### To promote Bybit/Hyperliquid/OKX to live:
1. Add live WebSocket connect/subscribe/reconnect logic (mirror Binance adapter pattern).
2. Wire exponential backoff (`BackoffState`) for reconnect.
3. Add stale-stream detection timeout.
4. Emit `inc_reconnects` / `inc_errors` metrics.

### Missing feed types across all venues (future scope):
- Orderbook deltas (`orderbook_delta`) — needed for feature engineering.
- Hyperliquid liquidations (via `is_liquidation` flag in trades).
- OKX price tick (via `tickers` channel).
- Bybit/OKX/Hyperliquid open interest.
- Index price for Bybit and OKX.
