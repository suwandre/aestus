# Aestus — System Specification

> **Scope note.** This document describes *what the system is, the data it works with, and how it behaves*. It deliberately contains **no UI, layout, navigation, or visual-design decisions**. Presentation truth lives in `cockpit_ui_implementation.md` (written contract) and `cockpit.html` (pixel-level reference). Do not invent UI from this document alone.

> **Naming.** The product/brand is **Aestus**. "Cockpit" is retained as the name of the main dashboard tab and as the product concept ("cockpit, not autopilot"). See the naming note in `cockpit_ui_implementation.md`; do not global-rename in either direction.

---

## 1. Overview

A self-hosted, single-user **decision-support system for active trading** across crypto (primary), equities, ETFs, and FX. It continuously ingests market data, news, on-chain activity, macroeconomic events, and cross-asset relationships; detects when something is statistically or narratively unusual; and uses large language models to synthesize that context into concise, human-readable trade briefings.

It is **not an automated trading bot**. It does not place orders. Its entire purpose is to make a human trader faster and better-informed at the moment of decision. The human always makes and executes the trade.

Think of it as a private, crypto-native, LLM-augmented research terminal for one person — comparable in spirit to an institutional market terminal, but built for a solo trader and run for roughly €10–30/month.

---

## 2. Core Philosophy

- **Cockpit, not autopilot.** The system surfaces opportunities and explains them. The human decides and executes. Automated order execution is explicitly out of scope for the initial system (see §13).
- **Context over signals.** A raw alert ("funding spiked") is low value. The value is in the *assembled context* around it — what else is happening, what's correlated, what news preceded it, what macro event is imminent — and a synthesized interpretation of that context.
- **Honesty about edge.** The system is expected to frequently conclude "no trade." Talking the user out of a bad setup is as valuable as finding a good one.
- **A learning loop.** Every decision the user makes (act, skip, dismiss) is recorded with the context that informed it and the eventual outcome. Over time this reveals which kinds of signals actually produce profit *for this specific user*.
- **Earned automation.** Long-term, individual well-validated strategies may be automated in a narrow, bounded way — but only after months of manual use prove a given signal class is reliable. The system is designed so this is a later, optional evolution, not a starting assumption.

---

## 3. The User

A single, technically sophisticated, discretionary trader who:

- Trades primarily crypto perpetuals and spot, with secondary interest in equities, ETFs, and FX.
- Trades **discretionarily** — makes their own calls — but wants far more context, faster, than manual chart-watching provides.
- Often works at irregular and late hours, sometimes from a phone away from a desk.
- Cares about specific quantitative signals: funding rates, open interest, liquidation levels, cross-asset correlations (e.g., BTC vs. SPX / DXY / gold), cross-venue basis and arbitrage, volume and volatility anomalies, and early/abnormal activity.
- Wants speed, information density, and the ability to drill from "something is happening" down to "here is why and what to do about it" in seconds.

### The user's jobs-to-be-done

1. **Maintain situational awareness** of market state across many assets and venues in real time.
2. **Be notified quickly** when something unusual or potentially actionable happens — including when away from the primary application.
3. **Understand the context** behind an unusual event without manually gathering it from a dozen sources.
4. **Decide** whether to act, and **record** that decision along with its rationale.
5. **Ask ad-hoc questions** in natural language ("what's driving this move," "is this dislocation real or noise," "how does this asset usually behave after this kind of event").
6. **Review their own track record** — which setups, regimes, and conditions have actually made or lost them money.
7. **Configure** what to watch, what counts as an alert, which data sources are active, and how reasoning is performed.

---

## 4. What the System Does (Functional Capabilities)

1. **Aggregates and normalizes** heterogeneous market and contextual data into one consistent, queryable model.
2. **Continuously computes** rolling statistical features per asset (and across assets/venues).
3. **Detects anomalies** through three independent mechanisms: user-defined rules, statistical deviation, and narrative/news clustering.
4. **Assembles context packets** around each detected anomaly — the relevant correlated assets, recent news, upcoming macro events, on-chain activity, and historical analogues.
5. **Generates briefings** — LLM-written interpretations of context packets, including a concrete trade thesis with explicit invalidation conditions, or an explicit "no trade" with reasoning.
6. **Answers natural-language questions** by querying its own data and reasoning over it.
7. **Records decisions and outcomes** in a trade journal and computes performance analytics from it.
8. **Delivers real-time alerts** to the user, including when they are away from the primary application.
9. **Lets the user configure** watchlists, alert rules, active data feeds, and model routing.

---

## 5. Data Sources / Inputs

**Market data (real-time, primary):**
- Per-exchange order/price data, mark price, funding rates, open interest, and liquidation events across multiple crypto venues (e.g., Binance, Bybit, Hyperliquid, dYdX, OKX) via public WebSocket feeds.
- Options data (e.g., Deribit) where relevant.

**Cross-market / macro:**
- Equity indices and macro instruments (e.g., SPX, DXY, gold, oil, treasury yields, VIX) for correlation context.
- Economic calendar (FOMC, CPI, NFP, earnings, etc.) with event times and consensus expectations.

**On-chain:**
- Large wallet movements / whale flows, exchange inflows/outflows, token unlock schedules, stablecoin mint/burn, abnormal DEX activity.

**News / narrative:**
- Crypto and financial news via RSS and aggregators, with entity extraction (which assets/people/protocols are mentioned) and relevance scoring.
- Lower-cost social/sentiment sources (e.g., Reddit, Farcaster) where economical.

**User-generated:**
- Watchlist membership, alert rules, the trade journal (entries, exits, sizes, tags, outcomes), and configuration.

All external feeds are chosen to be free or low-cost. High-cost feeds (e.g., paid social firehoses, premium news) are deliberately avoided in favor of substitutes.

---

## 6. Processing Pipeline

The system is event-driven. Data flows through these stages:

1. **Ingestion.** Lightweight workers hold persistent connections to data sources, normalize each message into a unified schema (asset, venue, timestamp, value), and publish onto an internal event bus. They contain no business logic.
2. **Normalization & storage.** Normalized events are written to a tiered store: a hot in-memory layer for current state, a relational layer for structured/metadata and text (with vector search over news), and a columnar time-series layer for high-volume tick and feature history.
3. **Feature & anomaly computation.** A continuous stream processor maintains rolling per-asset features (z-scores, volatility regimes, rolling correlations, open-interest deltas, funding spikes, volume anomalies, cross-venue basis) and emits an anomaly event whenever something is statistically unusual or matches a user rule. This layer is purely deterministic — no LLM involved.
4. **Context assembly.** When an anomaly fires, a context packet is built: the anomaly itself plus correlated assets' current state, recent relevant news (semantic + keyword retrieval), upcoming macro events, on-chain context, and any historical analogues. The quality of this packet — not the model — determines the quality of the output.
5. **LLM reasoning.** The context packet is synthesized by an LLM into a briefing (see §8). Cheap/fast models handle high-volume narrow tasks (entity extraction, sentiment, relevance scoring); stronger models handle synthesis and on-demand questions.
6. **Delivery & persistence.** Briefings are stored and pushed to the user in real time. The user's resulting decision is recorded with the briefing attached.

---

## 7. System Outputs (Information Artifacts)

These are the artifacts the system produces. (How they are presented is intentionally unspecified.)

**Normalized live market state** — current price, % change, funding rate, open interest, and basic stats for every watched asset, across venues.

**Cross-asset relationships** — rolling correlations between assets and macro instruments, and a current market-regime classification (e.g., trending, mean-reverting, volatility spike, risk-on/off).

**Cross-venue views** — funding rates and basis for the same asset across multiple venues, surfacing divergences.

**Anomaly events** — time-stamped, typed (e.g., funding spike, OI surge, volume anomaly, correlation break, whale flow, basis dislocation, macro event approaching), each carrying a severity/magnitude (e.g., a sigma value), the asset(s) involved, and a short description.

**Briefings** — see §8.

**Natural-language answers** — free-form responses to user questions, grounded in the system's own data.

**Trade journal & analytics** — the user's logged trades with attached briefings and outcomes, plus aggregate performance metrics (see §9).

**Configuration state** — current watchlists, active rules, enabled feeds, and model routing.

**Real-time alerts** — notifications triggered by anomalies or briefings, deliverable to the user even when away from the primary application.

---

## 8. The Briefing (detailed)

A briefing is the system's central output. Each briefing is associated with one asset (or relationship) and one triggering context, and contains:

- **Direction / stance** — long bias, short bias, or explicitly *no trade*.
- **Thesis** — a few sentences of plain-language reasoning explaining what is happening and why it may matter.
- **Suggested entry zone** — a price range (when directional).
- **Invalidation level** — the price/condition at which the thesis is wrong (the basis for a stop).
- **Target(s)** — structurally derived price objectives.
- **Suggested size** — expressed relative to risk and adjusted for current volatility.
- **Timeframe** — expected horizon for the idea.
- **Confidence** — a calibrated confidence indicator.
- **Originating model** — which LLM produced the briefing.
- **Supporting context** — the underlying anomaly data, correlated-asset state, relevant news, and macro events that informed it.
- **Cost/observability metadata** — token usage, cache hit rate, number of feeds/signals consulted.

Important behavioral notes:
- Price levels (entry, invalidation, targets) are derived from deterministic logic (recent swing structure, ATR/volatility bands, liquidation clusters, support/resistance), **not** invented by the LLM. The LLM supplies narrative and judgment; the math supplies the numbers.
- Briefings are **proposals with reasoning**, never commands. The user can act, snooze, or dismiss; each action is recorded.
- The system may also watch an open position's invalidation conditions and notify the user if the thesis breaks, but it does not close positions.
- A "no trade" briefing is a first-class, valuable output, complete with reasoning and a re-check condition.

---

## 9. Trade Journal & Learning Loop

Every user decision is logged with the briefing/context that informed it and, later, the realized outcome. From this the system derives analytics such as:

- Per-setup-type edge (which kinds of setups are profitable for this user).
- Hit rate and expectancy by market regime, time of day, and asset.
- R-multiple distributions, win rate, drawdown, and rolling risk metrics.
- Which signal classes correlate with good vs. bad outcomes — feeding back into which anomalies are worth surfacing and, eventually, which are candidates for automation.

This loop is the long-term differentiator: it personalizes the system to the individual trader in a way no off-the-shelf product can.

---

## 10. Natural-Language Interface

The user can query the system conversationally and get answers grounded in its own data and reasoning — for example, asking what is driving a particular move, whether a dislocation is real or noise, what an asset typically does after a given event, or to summarize the current state of a name. The system answers by retrieving from its data layer and reasoning with an LLM. This is a core interaction mode, not an afterthought.

---

## 11. Technical Architecture (backend)

**Languages:** Rust for ingestion and the feature/anomaly engine (performance-critical, long-running); TypeScript (on the Bun runtime) for LLM orchestration and the API layer.

> **Deferred — native kernels (see backlog task D11).** Small native kernels in C and Zig for the hottest numerical inner loops (z-score, rolling correlation), called in-process via FFI, are an explicit **post-MVP learning indulgence, not an engineering need**: end-to-end latency is dominated by network round-trips and LLM calls (§12), so the speedup over pure Rust is invisible. Build the feature engine in pure Rust first; only once it is correct and benchmarked, extract the hottest loop into C and Zig kernels as an optimization pass measured against the Rust baseline. The system must remain fully functional without them.

**Messaging:** A lightweight event bus (NATS JetStream) carries the real-time stream of ticks and anomaly events between services with persistence and replay. A Redis-backed job queue (BullMQ) handles discrete, retryable background work such as generating a briefing, sending an alert, or running scheduled batch tasks.

**Storage:**
- Redis — hot cache and job-queue backend.
- PostgreSQL with a vector extension — metadata, the news corpus, embeddings for semantic retrieval, and the trade journal.
- ClickHouse — high-volume tick and feature time-series.

**LLM providers (network calls; provider-agnostic abstraction):**
- A top-tier reasoning provider for synthesis, briefings, and conversational queries.
- A lower-cost/open-model provider for high-volume narrow tasks and experimentation.

**Hosting & delivery:** A single modest cloud server runs all services via containers. A tunneling/CDN layer provides secure HTTPS access with no open inbound ports and hosts the user-facing application. Real-time alerts are delivered through a push channel (e.g., a messaging bot) so the user can be reached away from the primary application.

**Data exposure:** The backend exposes its state and outputs through a typed API, plus a real-time stream for live updates, which any presentation layer consumes.

---

## 12. Constraints & Operating Principles

- **Single user.** Built for one person; no multi-tenancy, no scale-out requirements at the outset.
- **Low cost.** Total monthly running cost targeted at roughly €10–30, including infrastructure and LLM usage. Free/low-cost data sources are strongly preferred.
- **Self-hosted.** Runs on hardware the user controls.
- **Latency expectations.** Decision-support timeframe (seconds to minutes), not high-frequency. End-to-end latency is dominated by network round-trips to data sources and LLM response time, both far larger than any internal processing.
- **Real-time feel.** Despite the modest latency budget, the experience should feel live — state updates continuously and alerts arrive promptly.
- **Information density.** The user values seeing a lot of accurate, current information at once and drilling down quickly.

---

## 13. Explicitly Out of Scope (initial system)

- **Automated order placement / execution.** The system never trades on its own initially. Any future automation is narrow, bounded, opt-in, and gated behind months of validated manual use of a specific strategy.
- **Acting as a money manager or signal-selling service.** It is a personal tool for one trader.
- **HFT / latency-arbitrage.** The system is not designed to compete on execution speed.

---

## 14. Summary

A personal, self-hosted, low-cost, multi-source, LLM-augmented trading research system. It watches everything a discretionary trader would want to watch, notices when something is unusual, explains the context in plain language with a concrete (and falsifiable) thesis, lets the human decide and records that decision, learns over time which signals actually work for that person, and can be asked questions in natural language — all while never taking a trade on its own.
