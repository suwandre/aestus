# Low-Cost Context Provider Candidates

Decision-support document for future provider selection. All candidates chosen
against the €10–30/month cost target (CLAUDE.md hard rule #7).

---

## Economic Calendar

### Fixture (built-in, free)
- **What it covers**: CPI, FOMC, NFP, PPI, jobless claims.
- **Limitations**: Static; requires manual refresh. No actuals push.
- **Rate limits**: N/A.
- **Status**: `services/feeds/src/calendar/fixture.rs` — fully wired.

### TradingEconomics Free Tier
- **What it covers**: 300+ indicators globally, scheduled events + actuals.
- **Limitations**: 5 requests/day on free tier; paid plans from ~$10/month.
- **Rate limits**: 5 req/day (free), 500/day ($10/mo), unlimited ($20/mo).
- **Notes**: JSON API with authentication header. Provides `actual`, `consensus`, `previous` fields.
  Implement as `TradingEconomicsProvider` behind `CALENDAR_PROVIDER=tradingeconomics`.

### ForexFactory (scrape, free)
- **What it covers**: Forex/macro calendar; CPI, FOMC, NFP, GDP, etc.
- **Limitations**: No official API; HTML scraping required; fragile.
- **Rate limits**: Unofficial; respect robots.txt and stay under ~1 req/min.
- **Notes**: Fallback option if TradingEconomics is too expensive. HTML table parsing only.

---

## News / RSS

### Public RSS Feeds (free)
- **CoinDesk**: `https://www.coindesk.com/arc/outboundfeeds/rss/`
- **The Block**: `https://www.theblock.co/rss.xml`
- **Decrypt**: `https://decrypt.co/feed`
- **CoinTelegraph**: `https://cointelegraph.com/rss`
- **Limitations**: No realtime push; polling only. Quality varies.
- **Rate limits**: Respect standard HTTP etiquette; poll no faster than every 5 min.
- **Status**: `RssFetcher` in `services/feeds/src/news/rss.rs` — configure via `RSS_SOURCES` env var.

### CryptoPanic (freemium)
- **What it covers**: Curated crypto news + social mentions; relevance tags.
- **Limitations**: Free tier: 50 requests/hour, no entity tags; $30/month for bulk.
- **Rate limits**: 50 req/hr free, 1000 req/hr paid.
- **Notes**: API returns `title`, `url`, `source`, `votes`, `currencies` (entity-like field).
  Worth wiring as a secondary news source; `currencies` field maps directly to `entities`.

### Alpaca Market News API
- **What it covers**: Financial news and press releases from 50+ sources.
- **Limitations**: Free tier: 200 articles/month; $9/month for 5000/month.
- **Rate limits**: 200/month free.
- **Notes**: Useful for equities-adjacent news (ETF flows, index moves).

---

## On-Chain Data

### Fixture (built-in, free)
- **What it covers**: Exchange netflow, whale transfer, stablecoin mint/burn.
- **Limitations**: Static; no live data.
- **Status**: `services/feeds/src/onchain/fixture.rs` — fully wired.

### Glassnode Studio Free Tier
- **What it covers**: On-chain indicators: active addresses, MVRV, realized cap,
  exchange net flows (aggregated), SOPR.
- **Limitations**: Free tier: 1 week lag on most metrics; limited to 10 metrics.
  Paid starts at ~$29/month.
- **Rate limits**: 1 request/second (free), burst allowed.
- **Notes**: REST API with API key in header. Best free option for BTC/ETH on-chain health metrics.
  Implement as `GlassnodeProvider`; map to `exchange_flow` / `whale_transfer` variants.

### Dune Analytics (free queries)
- **What it covers**: Custom SQL over Ethereum/L2 on-chain data.
- **Limitations**: Free tier: 3 query executions/hour; result freshness ~1h behind.
- **Rate limits**: 3 executions/hr free; 10/hr ($25/month).
- **Notes**: Best for DEX activity, stablecoin mint/burn, token unlocks. Requires pre-built query IDs.
  Implement as `DuneProvider`; query IDs stored in config.

### Nansen Free (community)
- **What it covers**: Smart money wallet labels; token flows.
- **Limitations**: No free API; data only accessible via their UI.
- **Notes**: Defer to paid tier; not viable for MVP.

### Etherscan / BSCScan API (free)
- **What it covers**: ERC-20 transfers, contract events, token supply.
- **Limitations**: 5 calls/second (free); no native whale detection.
- **Rate limits**: 5 req/sec, 100k/day.
- **Notes**: Useful for stablecoin mint/burn detection via USDT/USDC contract events.
  Map `Transfer(address(0), ...)` → `stablecoin_mint_burn` with `action=mint`.

---

## Macro Proxy (Equities / Cross-Asset)

### Yahoo Finance Unofficial API (free)
- **What it covers**: SPX, DXY, GOLD, VIX, US10Y closing prices.
- **Limitations**: Unofficial; no SLA; can break without notice.
- **Rate limits**: ~2000 req/hour before throttling.
- **Notes**: `yf.Ticker("^GSPC")` style calls. Use closing price + daily % change as proxy.
  Sufficient for correlation context in briefings; not suitable for intraday alerts.

### Federal Reserve FRED API (free)
- **What it covers**: US macro time series: DXY index, fed funds rate, CPI history, unemployment.
- **Limitations**: Daily data only; not real-time.
- **Rate limits**: 500 req/day (free) with API key; 1000/day with registration.
- **Notes**: Authoritative macro data source. Good for historical CPI / unemployment trend context.
  Implement as `FredProvider`.

---

## Summary Matrix

| Provider              | Category   | Free Tier  | Cost Ceiling | Priority |
|-----------------------|------------|------------|--------------|----------|
| Fixture (built-in)    | All        | ∞          | €0           | Done ✓   |
| Public RSS            | News       | ∞          | €0           | High     |
| CryptoPanic           | News       | 50 req/hr  | €0–30/mo     | Medium   |
| TradingEconomics      | Calendar   | 5 req/day  | €10–20/mo    | High     |
| ForexFactory scrape   | Calendar   | ∞ (fragile)| €0           | Low      |
| Glassnode             | On-chain   | 1w lag     | €29/mo       | Medium   |
| Dune Analytics        | On-chain   | 3 exec/hr  | €25/mo       | Medium   |
| Etherscan             | On-chain   | 5 req/sec  | €0           | Medium   |
| FRED API              | Macro proxy| 500 req/day| €0           | Medium   |
| Yahoo Finance (unoff.)| Macro proxy| ~2k req/hr | €0           | Low      |

All provider implementations go behind a trait (`CalendarProvider` / `RssFetcher` /
`OnChainProvider`) and are selected via environment variable so the service never
hard-codes a vendor dependency.
