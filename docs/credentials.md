# Credentials & LLM Providers

> Binding decisions for what secrets Aestus needs at runtime, and which LLM
> providers sit behind the spec's provider-agnostic abstraction (spec §182–184).
> The **build loop** (`scripts/loop.ps1`) is unrelated to this file — it runs on
> Claude Code (Opus 4.8 / Sonnet 4.6) per the routing table in the todo.

## LLM providers (runtime — Aestus app, P13)

Provider for both tiers: **Ollama Cloud** (subscription-billed API key, OpenAI- and
Anthropic-compatible endpoints). Chosen over Anthropic's API because the spend model
is a flat subscription, not per-token — matches the €10–30/month target. Claude
consumer/Team subscriptions do **not** issue API keys for embedding in an app, so they
are not an option for the runtime; Ollama Cloud's key is a real, usable API key.

Both tiers go behind the §182 provider-agnostic abstraction — model strings are config,
swappable in one line. Confirm exact `:cloud` model tags against the Ollama Cloud catalog
when P13 is implemented (the names below are the intended choices, not verified tags).

| Tier                 | Spec | Use                                                                  | Model (intended)                        |
| -------------------- | ---- | -------------------------------------------------------------------- | --------------------------------------- |
| Top-tier reasoning   | §183 | Briefing synthesis, trade-thesis generation, NL chat                 | **Kimi K2.6** (`kimi-k2.6:cloud`)       |
| High-volume / narrow | §184 | News entity extraction, relevance scoring, sentiment, classification | **MiniMax M3** (`minimax-m3:cloud`) |

Rationale: K2.6 leads the candidates (Kimi K2.6 / MiniMax M3 / GLM 5.1) on long-context
synthesis and instruction-following, which is what briefing assembly demands. M3 is the
cheap/fast tier for the constant background grind, preserving K2.6 quota for briefings.

### Required env (runtime)

- `OLLAMA_API_KEY` — Ollama Cloud subscription key. Never committed; lives only in the
  VPS `.env` (and local `.env` for dev). `.env*` is gitignored and `Read`-denied.
- `OLLAMA_BASE_URL` — Ollama Cloud endpoint (or `http://localhost:11434` for a local
  Ollama dev instance).

Per spec rule #5 (fixture-first): the app must run against recorded fixtures with **no**
LLM key present. The key is only needed for live briefing generation.

## Other runtime credentials

| Key                                                 | For                           | Required? | Notes                                    |
| --------------------------------------------------- | ----------------------------- | --------- | ---------------------------------------- |
| Crypto market feeds (Binance/Bybit/Hyperliquid/OKX) | price/funding/OI/liquidations | none      | public WebSocket — no key                |
| RSS news feeds                                      | news ingestion                | none      | no key                                   |
| On-chain (Etherscan / Glassnode / Arkham)           | whale flows, exchange netflow | optional  | fixtures cover it; mark `[!]` if absent  |
| Deribit                                             | options data                  | optional  | deferrable                               |
| Push (ntfy / Telegram bot)                          | away-from-desk alerts (P25)   | optional  | ntfy = no key; Telegram = free bot token |

## Deploy (post-P28, manual — human action)

- Netcup VPS: SSH host + key path. Drop into `.env` before the loop reaches P28
  deployment artifacts. Never goes to the agent's hands beyond writing deploy scripts
  against it. Netcup panel login: never to the agent.
- Tunnel: Tailscale (free, no key — spec's MVP pick) or Cloudflare.
