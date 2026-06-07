# Aestus — Non-Goals

This document lists what Aestus is explicitly **not** building, especially for MVP. These are not temporary omissions — they are deliberate design boundaries. Any task that appears to require crossing one of these lines must be marked `[!]` and escalated to a human decision before proceeding.

---

## Absolute non-goals (never in scope)

### No automated order execution

Aestus does not place, modify, or cancel orders on any exchange. It does not hold exchange API keys with write permissions. It does not contain position-sizing logic that results in an order being sent. The human always makes and executes the trade.

### No high-frequency trading (HFT)

The system is built for discretionary decision support, not latency-sensitive execution. Sub-millisecond data paths, co-location, FPGA pipelines, and market-making strategies are out of scope entirely.

### No multi-tenant SaaS

Aestus is single-user and self-hosted. There is no user registration, no account management, no billing system, no tenant isolation, no shared database schemas designed for multiple users. If a multi-user abstraction would add complexity without being trivially free, it is not built.

### No signal-selling or social features

Aestus does not publish briefings to external users, sell signals, or build any kind of subscription service. There are no social features, copy-trading capabilities, or API endpoints intended for third-party consumers.

### No premium feed dependency for MVP

The system must work at the €10–30/month target using free or low-cost data sources. Paid social firehoses, premium news terminals, institutional data vendors, and options analytics platforms that require significant monthly fees are not required for MVP. They may be plugged in later via the provider abstraction.

---

## Deferred features (out of MVP scope, may be added later)

### Native C/Zig FFI performance kernels

Pure-Rust implementations cover all MVP performance needs. C/Zig FFI optimization is deferred to post-MVP learning optimization (D11 in the deferred backlog). Do not introduce FFI bindings in any P00–P30 task.

### Options analytics

Deribit and other options feeds are noted in the spec as secondary. Options greeks, vol surface, and skew analysis are deferred to post-MVP.

### Social sentiment firehose

Reddit/Farcaster/Twitter/X social data is lower priority than RSS news and free APIs. A low-cost social source may be added if free, but full sentiment pipelines are deferred.

### Mobile-native app

The frontend is a web app with responsive support for narrow screens. A native iOS or Android app is not in scope.

### Earned automation / auto-execution candidates

Even after a strategy proves reliable in manual mode, the automated execution pathway is deliberately deferred. It requires a separate, explicit architectural decision, a separate risk framework, and months of manual validation first.

### Multi-exchange API key management for execution

No exchange credentials for trading are stored, managed, or used. Read-only public feeds only.

### Backtesting engine

Historical strategy backtesting is deferred. The journal and analytics provide forward-looking performance tracking from live decisions. A full backtesting framework would require significant additional scope.

### Social/collaborative playbooks

Playbooks are personal, not shared. A marketplace or import/export of third-party playbooks is not in scope.
