import { Panel } from "@aestus/ui";

export default function CockpitPage() {
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
        <Panel title="Watchlists">
          <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 11 }}>
            — T002 —
          </div>
        </Panel>
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
