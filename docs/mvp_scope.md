# Aestus — MVP Scope Boundary

This document states unambiguously what is in the P00–P30 build scope and what is deferred. Tasks that appear to require anything in the Deferred section must be marked `[!]` and escalated before proceeding.

---

## In scope for MVP (P00–P30)

### Exchanges and data sources

| Source                 | Status                       | Data types                                                                  |
| ---------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| Binance (perp)         | **Live MVP**                 | Price ticks, trades, mark price, funding rate, open interest, liquidations  |
| Bybit (perp)           | **Placeholder/fixture only** | Full adapter deferred to post-MVP; fixture normalization in P06             |
| Hyperliquid            | **Placeholder/fixture only** | Adapter skeleton; fixture normalization in P06                              |
| OKX (perp/spot)        | **Placeholder/fixture only** | Adapter skeleton; fixture normalization in P06                              |
| Free economic calendar | **Fixture → live in P07**    | CPI, FOMC, NFP, PPI, jobless claims                                         |
| Free RSS news feeds    | **Live MVP**                 | Crypto/financial headlines, entity-tagged, relevance-scored                 |
| Free on-chain proxies  | **Fixture → limited live**   | Exchange netflow, whale transfers, stablecoin mint/burn (source TBD at P07) |
| Macro index proxies    | **Fixture → limited live**   | SPX, DXY, GOLD, VIX, OIL (low-frequency; source TBD at P06/P07)             |

### Assets tracked at MVP launch

| Asset              | Class           | Notes                                                      |
| ------------------ | --------------- | ---------------------------------------------------------- |
| BTC (BTCUSDT perp) | Crypto perp     | Primary; full Binance live feed                            |
| ETH (ETHUSDT perp) | Crypto perp     | Primary; full Binance live feed                            |
| SOL, BNB, others   | Crypto perp     | Watchlist-configurable; Binance perp where available       |
| SPX                | Macro index     | Proxy feed (free source); used for correlation and context |
| DXY                | Macro index     | Proxy feed; dollar strength context                        |
| GOLD               | Macro           | Proxy feed; risk-off context                               |
| VIX                | Macro index     | Proxy feed; volatility context                             |
| OIL                | Macro commodity | Proxy feed; macro risk context                             |

Canonical asset list is defined in seed data (P04-T017) and configurable via watchlist settings.

### Application tabs

All ten tabs ship in MVP:

| Tab             | Phase | Purpose                                                       |
| --------------- | ----- | ------------------------------------------------------------- |
| Cockpit         | P17   | High-density decision dashboard — primary working view        |
| Markets         | P18   | Asset universe, venue comparison, feature stack, correlations |
| Alerts          | P19   | Anomaly inbox, triage, rule builder                           |
| Briefings       | P20   | LLM proposals with context, levels, and decision logging      |
| Research        | P21   | Natural-language queries over system data                     |
| Journal         | P22   | Trade and decision recording with outcome tracking            |
| Analytics       | P23   | Performance stats, R-curve, setup edge, regime breakdown      |
| Playbooks       | P24   | Named setup definitions; content is fixture/stub at MVP       |
| Data            | P24   | Feed health, normalized data explorer, operational debugging  |
| Settings/System | P24   | Watchlist config, alert rules, model routing, preferences     |

### Infrastructure

- NATS JetStream (message bus)
- Redis (hot cache + BullMQ job queue)
- PostgreSQL + pgvector (relational store)
- ClickHouse (time-series / event store)
- Single VPS, Docker Compose deployment
- Bun / TypeScript API + LLM orchestration
- Rust ingestion + feature engine

### LLM usage

Runtime LLMs via Ollama Cloud subscription (provider-agnostic abstraction):

- Briefings and synthesis: Kimi K2.6 (or current top-tier Ollama Cloud model)
- Entity extraction, relevance, sentiment: MiniMax M3 (or current efficient model)
- No execution logic, no order placement, no invented price levels

---

## Deferred (not in P00–P30)

### Data sources and providers

| Item                                                     | Reason for deferral                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Deribit / options feeds                                  | Options analytics (greeks, vol surface, skew) is post-MVP              |
| Premium news terminals (Bloomberg, Reuters subscription) | Incompatible with €10–30/month cost target                             |
| Social firehose (Twitter/X, Reddit, Farcaster)           | Low priority vs RSS; full sentiment pipelines are expensive            |
| Institutional on-chain data vendors                      | Cost; free proxies sufficient for MVP                                  |
| Full Bybit / Hyperliquid / OKX live feeds                | Placeholder only at MVP; live connections added incrementally post-P30 |

### Features and capabilities

| Item                                                                       | Reason for deferral                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Automated order execution of any kind                                      | Absolute non-goal — see `docs/non_goals.md`                                |
| Earned automation / auto-execution candidates                              | Requires months of manual validation first                                 |
| Full backtesting engine                                                    | Out of scope; journal provides forward performance tracking                |
| Native C/Zig FFI performance kernels                                       | Deferred to D11 post-MVP; pure-Rust baseline covers MVP volumes            |
| Multi-tenant / multi-user support                                          | Single-user only; no user accounts or tenant isolation                     |
| Mobile-native app (iOS/Android)                                            | Web app with responsive fallback is sufficient                             |
| Social / collaborative playbooks                                           | Personal only; no marketplace or third-party import                        |
| Multi-exchange API key management for execution                            | No write-permission exchange credentials ever stored                       |
| Advanced chart interactions (drawing tools, heatmaps, multi-asset compare) | Deferred to D09 post-MVP                                                   |
| Vector similarity search for news/briefings                                | pgvector schema placeholder in P03–P04; embedding pipeline optional at MVP |

---

## Cost envelope

MVP must remain operable within €10–30/month total, including:

- VPS (1 server, all services)
- Ollama Cloud LLM subscription
- Any paid data source additions

Tasks that would push costs above this envelope must be marked `[!]` before implementation.
