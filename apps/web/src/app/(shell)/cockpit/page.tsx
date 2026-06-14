"use client";

import { useState } from "react";
import { Panel } from "@aestus/ui";
import { WatchlistPanel, type WatchlistItem } from "@/components/cockpit/WatchlistPanel";

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
        <Panel title="Market State">
          <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>
            — T003 —
          </div>
        </Panel>
        <Panel title="Correlation Matrix (24H)" style={{ flex: 1 }}>
          <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>
            — T004 —
          </div>
        </Panel>
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
      <Panel title="Order Flow" style={{ gridArea: "flow" }}>
        <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>— T007 —</div>
      </Panel>

      {/* Recent News & Narratives — T008 */}
      <Panel title="Recent News & Narratives" style={{ gridArea: "news" }}>
        <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>— T008 —</div>
      </Panel>

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
