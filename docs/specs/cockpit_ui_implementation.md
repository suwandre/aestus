# Cockpit UI Implementation

**Presentation-layer source of truth.** Companion to `cockpit_spec.md` (product/system) and `cockpit_agentic_build_todo.md` (backlog).

> **Canonical visual reference:** `docs/specs/reference/cockpit.html`. That static mock is the pixel-level truth. This document is the written contract derived from it. When the two disagree, the HTML wins for visuals; this doc wins for intent/semantics. Do not "improve" the palette, fonts, or spacing without an ADR.

The product is **Aestus**, a self-hosted, single-user crypto decision-support cockpit. The UI is a **high-density dark terminal**, not a generic SaaS dashboard and never an execution surface. No buy/sell/place-order affordances anywhere (see `docs/non_goals.md`).

> **Naming:** "Aestus" is the product/brand (top-bar wordmark, page title, README, app icon). "Cockpit" is retained as the name of the **main dashboard tab/view** and as the product *concept* ("cockpit, not autopilot"). Do not find-and-replace "cockpit" → "aestus" globally — it would rename the tab and break the P17 references. Rename brand-facing surfaces only.

### Brand identity

- **Mark:** an electric-purple chevron "A" with an upward trend-line + arrowhead piercing the apex (supplied as a transparent asset; store at `docs/specs/reference/aestus-logo.svg`). The mock recreates it as inline SVG; production should use the real asset.
- **Wordmark:** `AESTUS`, uppercase, wide letter-spacing (~0.22em), white, thin/geometric. In the top bar it renders as compact tracked text next to the mark; the full stylized logotype is for splash/login/marketing, not the dense terminal chrome.
- **Brand color ≠ functional accent.** The logo gradient (`--brand`/`--brand-2`, vivid) is reserved for the mark, avatar, and identity moments. The functional UI accent stays `--purple #7b6cf6` (active nav, count badges, focus) because the saturated brand magenta vibrates on 9–11px elements. Don't swap one for the other.
- **Clearspace / min size:** keep clearspace ≥ the chevron's stroke width around the lockup; mark min 18px, never below legibility in the 74px sidebar / 46px top bar.

---

## 1. Design language

- **Theme:** dark, near-black background; panels sit one step lighter inside thin cool-gray borders. No drop shadows, no glassmorphism, no gradients except the avatar and the brand mark.
- **Density:** information-dense. Small type (11–12px body), tight vertical rhythm, hairline `1px` dividers between rows.
- **Numbers are first-class.** Every price, percent, size, and timestamp renders in a monospace face with tabular figures so columns align. UI labels and prose render in the sans face.
- **Color is semantic, not decorative.** Green = up/bullish/bid. Red = down/bearish/ask/high-importance. Amber = neutral-watch / medium-importance / POC / mid-conviction. Violet = brand/identity and active-nav. Blue/pink/cyan = source-type tags only.
- **Restraint.** Accent color appears on data and state, never as filler. Most of the screen is grayscale; color draws the eye to what changed.

---

## 2. Design tokens

Extract verbatim into `packages/ui` (or equivalent). These are the exact values in the reference `:root`.

### 2.1 Color

```css
:root{
  /* surfaces */
  --bg:#070a0f;          /* app background, behind everything */
  --panel:#0d1119;       /* default panel fill */
  --panel-2:#0a0e15;     /* inset fills: top bar, sidebar, inputs, dropdowns */
  --panel-hl:#11161f;    /* row hover, active tab/timeframe background */

  /* borders */
  --border:#1a212d;      /* panel outline, control outline */
  --border-soft:#141a24; /* internal dividers, row separators */

  /* text scale (strong -> faint) */
  --text-strong:#e8edf3; /* primary values, headings */
  --text:#cdd4de;        /* body text */
  --text-dim:#69737f;    /* labels, secondary */
  --text-faint:#4a525d;  /* captions, timestamps, axis, dashes */

  /* semantic */
  --green:#26c281;  --green-d:#1f9c68;   /* up / bullish / bid / Active / buy */
  --red:#e35d5b;    --red-d:#c44b49;     /* down / bearish / ask / high importance */
  --orange:#e0a13e;                      /* amber: POC, medium importance, mid conviction, "High" funding tag */
  --purple:#7b6cf6;                      /* violet: brand, avatar, active nav, derivatives/regulatory tag */
  --blue:#4f8df7;                        /* macro source tag */
  --pink:#e368a8;                        /* institutions source tag */
  --teal:#3fb6c4;                        /* cyan: volume-anomaly icon */

  /* brand (identity only - logo, avatar, splash; NOT functional UI accent) */
  --brand:#a826ec;                       /* AESTUS logo gradient, top */
  --brand-2:#7a14d4;                     /* AESTUS logo gradient, bottom */

  /* type */
  --sans:'IBM Plex Sans',sans-serif;
  --mono:'IBM Plex Mono',monospace;
}
```

Tinted fills (badges, depth bars, conviction tracks) are the semantic color at low alpha over the panel, e.g. green badge `rgba(38,194,129,.12–.14)`, red badge `rgba(227,93,91,.12–.14)`, violet count `rgba(123,108,246,.18)`. Keep alphas in that 0.06–0.20 band.

### 2.2 Typography

- **Families:** IBM Plex Sans (UI/prose), IBM Plex Mono (all tabular data). Load weights Sans 400/500/600/700, Mono 400/500/600.
- **Tabular numbers are mandatory** on prices/sizes/percents/times: `font-feature-settings:"tnum"`.
- **Base size 12px.** Scale: section titles 10.5px uppercase `letter-spacing:.9px` `--text-dim`; table headers 9px uppercase `--text-faint`; body 11.5–12px; the one hero number (conviction "72", order-flow mid price) 18–21px.
- Panel titles are uppercase, weight 600, letter-spaced; card title (e.g. "BTC Perp: Long Setup") is 19px sans, weight 600, near-white.

### 2.3 Spacing, radius, lines

- **Grid gap / outer padding:** 9px.
- **Panel padding:** ~10–14px.
- **Radii:** panels 7px; controls (dropdown/search/input) 5–8px; badges/tags/chips 4–5px; depth/conviction bars 2px.
- **Borders:** 1px. Panel outline `--border`; every internal row divider `--border-soft`.
- **Motion:** minimal. Hover = background to `--panel-hl`, ~120ms. No entrance animation on data panels (it reads as lag in a terminal). A single staggered load reveal on first paint is acceptable; nothing looping.

---

## 3. Layout system

### 3.1 Shell

`Top bar (sticky, 46px)` over `[ Sidebar (74px, sticky) | Dashboard (fluid) ]`.

- **Top bar:** Aestus brand mark (purple chevron-A + trend arrow) + `AESTUS` wordmark · global search w/ ⌘K hint · ticker strip (BTC, ETH, SPX, DXY, GOLD, VIX) · clock (`UTC+offset`) · notifications (red dot) · settings · user avatar (brand gradient, initials).
- **Sidebar:** icon-over-label nav. Order: Cockpit, Markets, Alerts, Briefings, Research, Journal, Analytics, Playbooks, Data. Active item = violet icon/label + left rail bar + tinted icon chip. Bottom: System status (green dot, "All systems operational").

### 3.2 Cockpit grid

CSS Grid, 5 column tracks, 3 area rows:

```css
.dashboard{
  display:grid; gap:9px; padding:9px;
  grid-template-columns:262fr 380fr 400fr 196fr 224fr;
  grid-template-areas:
    "left opp   chart  chart   flow"
    "left news  events onchain onchain"
    "alerts alerts alerts ask ask";
}
```

- **left** (col 1, spans rows 1–2): Watchlist → Market State → Correlation Matrix, stacked.
- **opp** Top Opportunity card · **chart** Main Chart (spans 2 tracks) · **flow** Order Flow (tall, top-right).
- **news** Recent News · **events** Upcoming Events · **onchain** On-Chain Insights (spans 2 tracks).
- **alerts** Active Alerts table (spans 3 tracks) · **ask** Ask mini panel.

Responsive: this is desktop-first. Below ~1280px, collapse right column (flow/onchain/ask) beneath center; below ~960px, single column stack. Preserve density — do not balloon paddings on small screens.

---

## 4. Core primitives

Build these once (P16-T010) so panels compose them.

- **Panel** — `--panel` fill, 1px `--border`, 7px radius, column flex. Header strip 34px: uppercase 10.5px title left, optional controls/tabs right, `--border-soft` bottom rule.
- **Tag / Badge** — pill, 4px radius, 10px weight-600 label, semantic tint bg + semantic text (`green`/`red`/`normal`(gray)). Variants: state badge ("Active"), value tag ("High"), source tag (news types).
- **Chip** — bordered, 5px radius, 10px; default gray; `.g` = green-tinted (key-factor chips).
- **Table** — header row 9px uppercase `--text-faint` on `--border-soft` rule; body rows 11.5px, `--border-soft` divider, hover `--panel-hl`. Numeric cells mono + right-aligned; first/label cell sans + left.
- **Metric/Stat** — small uppercase label (`--text-faint`) over a large mono value; used in the opportunity stat strip.
- **Tabs** — inline text tabs; active = `--panel-hl` bg (pill style) or underline bar (`--purple`) for section tab rows. Count badge uses violet tint.
- **Dropdown / Select** — `--panel-2` fill, `--border`, 5px radius, 26–28px tall, caret `--text-dim`.
- **Conviction bar** — 46×4px track (`--border`), fill width = score%, color by band (≥66 green, 40–65 amber, <40 red), mono number beside.
- **Depth bar** — absolutely-positioned background bar inside an order-flow row, width = cumulative/maxSum, ask = red tint, bid = green tint, text layered above.
- **States** — skeleton, empty, error, **stale badge**, **degraded-source callout**. The mock shows only the happy path; every live component must add these (P16-T012). Stale = amber dot + "Xs ago"; degraded = amber/red strip naming the missing feed. Never hide a dead feed behind plausible-looking numbers.

---

## 5. Cockpit panel specs

Each maps to a P17 task; build to the reference markup/classes.

| Panel | Task | Contents |
|---|---|---|
| Watchlist | P17-T002 | Rows: coin glyph · symbol · mono price · 24h % (green/red) · alert-count badge (red tint) or `—`. Header dropdown ("Main Watchlist"). Selecting a row sets focused asset. |
| Market State | P17-T003 | Key/value rows: Risk Regime (▲ Risk-On green), Volatility Regime, BTC 30D Vol + Δ, Funding + "High" tag, Open Interest + Δ, Market Breadth + "Bullish" tag. |
| Correlation Matrix | P17-T004 | 6×6 grid (BTC/ETH/SPX/DXY/GOLD/Oil). Cell bg = green tint for +, red tint for −, alpha ∝ |value|; diagonal 1.00 strongest. Footer: source + updated time. |
| Top Opportunity | P17-T005 | "High Conviction" badge + timestamp. Title row w/ ↗. Stat strip: Conviction Score `72/100`, Time Horizon, Status (Active w/ green dot). Sections: Thesis, Key Factors (green chips), Invalidation, Entry Considerations. Footer: generated time + "View Full Briefing →". **Must support long / short / no-trade.** |
| Main Chart | P17-T006 | See §6. |
| Order Flow | P17-T007 | Venue + timeframe dropdowns. Ladder: PRICE / SIZE (BTC) / SUM, asks (red) above, mid price (large green) center, bids (green) below; depth bars by cumulative SUM. Footer: Imbalance % + buy/sell tag. |
| Recent News | P17-T008 | Tabs All/News/On-Chain/Social. Rows: relative time · headline · source-type tag (on-chain=green, macro=blue, derivatives/regulatory=violet, institutions=pink). Filters to focused asset. |
| Upcoming Events | P17-T009 | Rows: time-to-event · event · currency · clock time · importance (High=red 2 dots, Medium=amber 1 dot). High events visually prominent. |
| On-Chain Insights | P17-T010 | Rows: metric · mono value + direction arrow · signal tag (Bullish green / Neutral amber / High red). Mark source confidence + staleness. |
| Active Alerts | P17-T011 | Table: Time · Type (icon+label, color by type) · Asset · Title · Context · Conviction bar · Status badge. Row click → anomaly detail drawer. Tabs: Alerts(count)/Signals/System/Journal Activity. |
| Ask mini | P17-T012 | Recent question, bulleted answer (violet bullets), "View Full Analysis →", and an "Ask anything…" input with send button. Submit routes to Research. |

---

## 6. Chart specification

Port the reference SVG renderer (`#chart-svg` in `cockpit.html`). Keep **rendering** and **data** decoupled: the component takes candles + a list of levels and draws them; it must never compute or invent levels — those come from the level engine (deterministic).

- **Frame:** SVG viewBox `600×300`, right gutter ~62px for the price axis, bottom band ~58px for volume.
- **Price axis:** horizontal gridlines + right-edge mono labels (`--text-faint`). Reference range 64,000–72,000 at 2k steps.
- **Candles:** body width ≈ 62% of slot; wick = thin line hi→lo. Up (`close≥open`) = `--green`, down = `--red`. Solid fills, no borders.
- **Volume:** translucent bars under the price area, colored by candle direction, ~0.45 alpha.
- **Levels (supplied, drawn here):**
  - Liquidation clusters: solid lines with right-edge boxed labels — upper = red, lower = green.
  - POC: dashed `--orange` line, right-edge "POC" label.
  - Current price: solid green line + boxed green tag (price over time, e.g. `68,432.1 / 09:45`) and a small instrument tag.
- **X axis:** date ticks, mono, `--text-faint`.
- **OHLC strip** above the chart: O/H/L/C mono values + signed change/percent (green/red).
- **Overlay toggles** (chart footer): Volume, OI, Funding, Liq Levels, VPVR — pill toggles, active = filled dot.
- **Header:** symbol + venue, timeframe row (1m/5m/15m/1h/4h/[1D]), tool icons.
- Advanced interactions (drawing, heatmaps, multi-asset compare) are **D09**, deferred.

---

## 7. Semantic color map (quick reference)

| Meaning | Token |
|---|---|
| Up / bullish / bid / Active / buy | `--green` |
| Down / bearish / ask / high importance | `--red` |
| Neutral-watch / medium importance / POC / mid conviction / "High" funding | `--orange` |
| Brand / avatar / active nav / derivatives + regulatory source | `--purple` |
| Macro source tag | `--blue` |
| Institutions source tag | `--pink` |
| Volume-anomaly icon | `--teal` |
| Missing / stale feed | amber dot or strip (never silent) |

---

## 8. Implementation guardrails

- Pixel parity with `cockpit.html` is a review gate for P17. Diff rendered panels against the mock; token-level drift (wrong hex, wrong radius, generic font) is a bug, not a style choice.
- No color hardcoded outside the token system (P16-T002 done-when).
- IBM Plex Sans/Mono are non-negotiable for MVP; a font swap requires an ADR.
- Brand mark/wordmark use `--brand`/`--brand-2`; do not repurpose those for functional UI, and keep `--purple` as the interaction accent. The wordmark says "Aestus"; the main tab stays "Cockpit".
- Every data panel renders loading/stale/error/degraded — the mock's happy path is not sufficient.
- No execution affordances. If a button could be read as "place/close a trade," rename or remove it (P29-T001).
