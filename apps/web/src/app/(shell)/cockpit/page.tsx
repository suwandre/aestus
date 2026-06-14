"use client";

import { useState } from "react";
import { Panel } from "@aestus/ui";
import { WatchlistPanel, type WatchlistItem } from "@/components/cockpit/WatchlistPanel";
import { MarketStatePanel, type MarketState } from "@/components/cockpit/MarketStatePanel";
import {
  CorrelationMatrixPanel,
  type CorrelationMatrix,
} from "@/components/cockpit/CorrelationMatrixPanel";
import { OrderFlowPanel, type OrderFlowData } from "@/components/cockpit/OrderFlowPanel";
import { NewsPanel, type NewsData } from "@/components/cockpit/NewsPanel";

const NEWS: NewsData = {
  items: [
    {
      id: "n1",
      relativeTime: "11m",
      headline: "Whale accumulates 4,200 BTC ($286M) across 3 exchanges",
      sourceType: "onchain",
      assets: ["btc"],
    },
    {
      id: "n2",
      relativeTime: "27m",
      headline: "US CPI data comes in slightly below expectations",
      sourceType: "macro",
    },
    {
      id: "n3",
      relativeTime: "1h",
      headline: "Binance funding rate for BTCUSDT jumps to 0.010%",
      sourceType: "deriv",
      assets: ["btc"],
    },
    {
      id: "n4",
      relativeTime: "2h",
      headline: "BlackRock IBIT sees $215M inflows",
      sourceType: "inst",
      assets: ["btc"],
    },
    {
      id: "n5",
      relativeTime: "3h",
      headline: "SEC delays decision on spot Ethereum ETF options",
      sourceType: "reg",
      assets: ["eth"],
    },
  ],
};

const ORDER_FLOW: OrderFlowData = {
  symbol: "BTCUSDT",
  venue: "Binance Perp",
  timeframe: "24H",
  midPrice: 68432.1,
  asks: [
    { price: 68440, size: 152.3, sum: 468.3 },
    { price: 68439, size: 98.6, sum: 316.0 },
    { price: 68438, size: 75.1, sum: 217.7 },
    { price: 68437, size: 62.4, sum: 142.3 },
    { price: 68436, size: 48.7, sum: 79.9 },
    { price: 68435, size: 31.2, sum: 31.2 },
  ],
  bids: [
    { price: 68432, size: 42.1, sum: 42.1 },
    { price: 68431, size: 56.3, sum: 98.4 },
    { price: 68430, size: 81.7, sum: 180.1 },
    { price: 68429, size: 103.2, sum: 283.3 },
    { price: 68428, size: 136.4, sum: 419.7 },
    { price: 68427, size: 198.7, sum: 618.4 },
  ],
  maxSum: 618.4,
  imbalancePct: 1.35,
};

const CORRELATION: CorrelationMatrix = {
  matrix: [
    [1.0, 0.82, 0.41, -0.28, 0.36, 0.22],
    [0.82, 1.0, 0.48, -0.32, 0.25, 0.21],
    [0.41, 0.48, 1.0, -0.62, -0.15, 0.33],
    [-0.28, -0.32, -0.62, 1.0, 0.31, -0.27],
    [0.36, 0.25, -0.15, 0.31, 1.0, 0.42],
    [0.22, 0.21, 0.33, -0.27, 0.42, 1.0],
  ],
  updatedAt: "11:24:11",
};

const MARKET_STATE: MarketState = {
  risk_regime: "risk_on",
  volatility_regime: "normal",
  btc_vol_30d: 42.1,
  btc_vol_30d_delta: -2.1,
  funding_btc: 0.0001,
  oi_btc_notional: 31.2e9,
  oi_btc_delta: 1.8,
  market_breadth_pct: 62,
};

const WATCHLIST_ITEMS: WatchlistItem[] = [
  {
    asset_id: "btc-usd",
    symbol: "BTCUSDT",
    price: 68432.1,
    change_pct_24h: 1.24,
    alert_count: 3,
    icon_char: "₿",
    icon_color: "#f7931a",
  },
  {
    asset_id: "eth-usd",
    symbol: "ETHUSDT",
    price: 3242.7,
    change_pct_24h: 1.01,
    alert_count: 2,
    icon_char: "Ξ",
    icon_color: "#627eea",
    icon_text_color: "#fff",
  },
  {
    asset_id: "sol-usd",
    symbol: "SOLUSDT",
    price: 152.18,
    change_pct_24h: 2.31,
    alert_count: 2,
    icon_char: "◎",
    icon_color: "#14f195",
  },
  {
    asset_id: "bnb-usd",
    symbol: "BNBUSDT",
    price: 593.43,
    change_pct_24h: -0.28,
    alert_count: 1,
    icon_char: "B",
    icon_color: "#f0b90b",
  },
  {
    asset_id: "btc-d",
    symbol: "BTC.D",
    price: 54.21,
    change_pct_24h: 0.35,
    alert_count: 0,
    icon_char: "D",
    icon_color: "#f7931a",
  },
  {
    asset_id: "eth-btc",
    symbol: "ETHBTC",
    price: 0.04735,
    change_pct_24h: -0.23,
    alert_count: 0,
    icon_char: "Ξ",
    icon_color: "#627eea",
    icon_text_color: "#fff",
  },
  {
    asset_id: "es1",
    symbol: "ES1!",
    price: 5321.5,
    change_pct_24h: -0.18,
    alert_count: 1,
    icon_char: "E",
    icon_color: "#4f8df7",
    icon_text_color: "#fff",
  },
  {
    asset_id: "nq1",
    symbol: "NQ1!",
    price: 18677.25,
    change_pct_24h: -0.32,
    alert_count: 0,
    icon_char: "N",
    icon_color: "#4f8df7",
    icon_text_color: "#fff",
  },
  {
    asset_id: "dxy",
    symbol: "DXY",
    price: 104.28,
    change_pct_24h: -0.21,
    alert_count: 0,
    icon_char: "$",
    icon_color: "#5a6573",
    icon_text_color: "#fff",
  },
  {
    asset_id: "gold",
    symbol: "GOLD",
    price: 2343.9,
    change_pct_24h: 0.35,
    alert_count: 0,
    icon_char: "Au",
    icon_color: "#e0a13e",
  },
  {
    asset_id: "us10y",
    symbol: "US10Y",
    price: 4.45,
    change_pct_24h: -0.03,
    alert_count: 0,
    icon_char: "%",
    icon_color: "#3fb6c4",
    icon_text_color: "#fff",
  },
];

export default function CockpitPage() {
  const [focusedAssetId, setFocusedAssetId] = useState("btc-usd");

  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        gap: 9,
        padding: 9,
        gridTemplateColumns: "262fr 380fr 400fr 196fr 224fr",
        gridTemplateAreas: [
          '"left opp chart chart flow"',
          '"left news events onchain onchain"',
          '"alerts alerts alerts ask ask"',
        ].join(" "),
        alignItems: "start",
      }}
    >
      {/* Left column: Watchlist + Market State + Correlation (spans rows 1-2) */}
      <div
        style={{
          gridArea: "left",
          display: "flex",
          flexDirection: "column",
          gap: 9,
        }}
      >
        <WatchlistPanel
          items={WATCHLIST_ITEMS}
          focusedAssetId={focusedAssetId}
          onSelectAsset={setFocusedAssetId}
        />
        <MarketStatePanel state={MARKET_STATE} />
        <CorrelationMatrixPanel data={CORRELATION} />
      </div>

      {/* Top Opportunity — P17-T005 (Opus worker) */}
      <Panel title="Top Opportunity" style={{ gridArea: "opp" }}>
        <div style={{ padding: "10px 14px", color: "var(--text-dim)", fontSize: 11 }}>
          — pending Opus worker (T005) —
        </div>
      </Panel>

      {/* Chart — P17-T006 (Opus worker) */}
      <Panel title="Chart" style={{ gridArea: "chart" }}>
        <div style={{ padding: "10px 14px", color: "var(--text-dim)", fontSize: 11 }}>
          — pending Opus worker (T006) —
        </div>
      </Panel>

      {/* Order Flow — T007 */}
      <div style={{ gridArea: "flow" }}>
        <OrderFlowPanel
          data={{
            ...ORDER_FLOW,
            symbol: focusedAssetId.split("-")[0].toUpperCase() + "USDT",
          }}
        />
      </div>

      {/* Recent News & Narratives — T008 */}
      <div style={{ gridArea: "news" }}>
        <NewsPanel data={NEWS} focusedAssetId={focusedAssetId} />
      </div>

      {/* Upcoming Events — T009 */}
      <Panel title="Upcoming Events" style={{ gridArea: "events" }}>
        <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>— T009 —</div>
      </Panel>

      {/* On-Chain Insights — T010 */}
      <Panel title="On-Chain Insights" style={{ gridArea: "onchain" }}>
        <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>— T010 —</div>
      </Panel>

      {/* Active Alerts — T011 */}
      <Panel title="Active Alerts" style={{ gridArea: "alerts" }}>
        <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>— T011 —</div>
      </Panel>

      {/* Ask — T012 */}
      <Panel title="Ask" style={{ gridArea: "ask" }}>
        <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>— T012 —</div>
      </Panel>
    </div>
  );
}
