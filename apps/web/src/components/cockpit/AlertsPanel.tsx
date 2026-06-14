"use client";

import { useState } from "react";
import { Drawer, Panel } from "@aestus/ui";

export type AlertType = "funding" | "liq" | "onchain" | "vol" | "news";
export type AlertStatus = "active" | "resolved" | "snoozed";
export type AlertTab = "alerts" | "signals" | "system" | "journal";

export interface AlertItem {
  id: string;
  time: string;
  type: AlertType;
  asset: string;
  title: string;
  context: string;
  conviction: number;
  status: AlertStatus;
}

export interface AlertsData {
  alerts: AlertItem[];
}

interface Props {
  data: AlertsData;
}

const TYPE_META: Record<AlertType, { label: string; color: string; icon: React.ReactNode }> = {
  funding: {
    label: "Funding Spike",
    color: "var(--orange)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        width="13"
        height="13"
      >
        <path d="M13 2 3 14h7l-1 8 10-12h-7z" strokeLinejoin="round" />
      </svg>
    ),
  },
  liq: {
    label: "Liquidation Cluster",
    color: "var(--orange)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        width="13"
        height="13"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  onchain: {
    label: "On-Chain",
    color: "var(--green)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        width="13"
        height="13"
      >
        <path d="M12 2 2 7l10 5 10-5z" />
        <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  vol: {
    label: "Volatility",
    color: "var(--teal)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        width="13"
        height="13"
      >
        <path d="M2 12h3l3-8 4 16 3-10 2 2h5" />
      </svg>
    ),
  },
  news: {
    label: "News",
    color: "var(--red)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        width="13"
        height="13"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 8h10M7 12h10M7 16h6" />
      </svg>
    ),
  },
};

const STATUS_STYLES: Record<AlertStatus, { label: string; bg: string; color: string }> = {
  active: { label: "Active", bg: "rgba(38,194,129,.12)", color: "var(--green)" },
  resolved: { label: "Resolved", bg: "rgba(255,255,255,.06)", color: "var(--text-dim)" },
  snoozed: { label: "Snoozed", bg: "rgba(224,161,62,.12)", color: "var(--orange)" },
};

const ALERT_TABS: { key: AlertTab; label: string }[] = [
  { key: "alerts", label: "ALERTS" },
  { key: "signals", label: "SIGNALS" },
  { key: "system", label: "SYSTEM" },
  { key: "journal", label: "JOURNAL ACTIVITY" },
];

function convFillColor(score: number): string {
  if (score >= 66) return "var(--green)";
  if (score >= 40) return "var(--orange)";
  return "var(--red)";
}

const TH: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: ".6px",
  color: "var(--text-faint)",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "9px 14px",
  borderBottom: "1px solid var(--border-soft)",
};

const TD: React.CSSProperties = {
  padding: "9px 14px",
  fontSize: 11.5,
  borderBottom: "1px solid var(--border-soft)",
  verticalAlign: "middle",
};

export function AlertsPanel({ data }: Props) {
  const [activeTab, setActiveTab] = useState<AlertTab>("alerts");
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  const alertCount = data.alerts.filter((a) => a.status === "active").length;

  return (
    <>
      <Panel>
        {/* Tabs — override panel header area manually */}
        <div
          style={{
            display: "flex",
            gap: 18,
            height: 36,
            alignItems: "center",
            padding: "0 14px",
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          {ALERT_TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  fontSize: 11,
                  color: isActive ? "var(--text-strong)" : "var(--text-dim)",
                  letterSpacing: ".5px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 500,
                  height: 36,
                  position: "relative",
                  background: "none",
                  border: "none",
                  fontFamily: "var(--sans)",
                  padding: 0,
                  borderBottom: isActive ? "2px solid var(--purple)" : "2px solid transparent",
                }}
              >
                {tab.label}
                {tab.key === "alerts" && alertCount > 0 && (
                  <span
                    style={{
                      background: "rgba(123,108,246,.18)",
                      color: "var(--purple)",
                      fontSize: 9.5,
                      fontWeight: 600,
                      borderRadius: 9,
                      padding: "1px 6px",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === "alerts" ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Time", "Type", "Asset", "Title", "Context", "Conviction", "Status"].map((h) => (
                  <th key={h} style={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((alert) => {
                const meta = TYPE_META[alert.type];
                const st = STATUS_STYLES[alert.status];
                return (
                  <tr
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    style={{ cursor: "pointer" }}
                  >
                    <td
                      style={{
                        ...TD,
                        fontFamily: "var(--mono)",
                        color: "var(--text-dim)",
                        fontSize: 11,
                      }}
                    >
                      {alert.time}
                    </td>
                    <td style={TD}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span style={{ color: meta.color, display: "flex", width: 13, height: 13 }}>
                          {meta.icon}
                        </span>
                        {meta.label}
                      </div>
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: "var(--mono)",
                        color: "var(--text-strong)",
                        fontWeight: 500,
                      }}
                    >
                      {alert.asset}
                    </td>
                    <td style={TD}>{alert.title}</td>
                    <td style={{ ...TD, color: "var(--text-dim)", fontSize: 11 }}>
                      {alert.context}
                    </td>
                    <td style={TD}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 46,
                            height: 4,
                            borderRadius: 2,
                            background: "var(--border)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${alert.conviction}%`,
                              height: "100%",
                              borderRadius: 2,
                              background: convFillColor(alert.conviction),
                            }}
                          />
                        </div>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                          {alert.conviction}
                        </span>
                      </div>
                    </td>
                    <td style={TD}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: st.color,
                          background: st.bg,
                          borderRadius: 4,
                          padding: "2px 8px",
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div
            style={{
              padding: "14px",
              color: "var(--text-faint)",
              fontSize: 11,
              textAlign: "center",
            }}
          >
            No items
          </div>
        )}
      </Panel>

      <Drawer
        open={selectedAlert !== null}
        onClose={() => setSelectedAlert(null)}
        title={
          selectedAlert ? `${TYPE_META[selectedAlert.type].label} — ${selectedAlert.asset}` : ""
        }
      >
        {selectedAlert && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" }}>
            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: ".7px",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Title
              </div>
              <div style={{ fontSize: 13, color: "var(--text-strong)" }}>{selectedAlert.title}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: ".7px",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Context
              </div>
              <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
                {selectedAlert.context}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: ".7px",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Conviction
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: "var(--border)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${selectedAlert.conviction}%`,
                      height: "100%",
                      borderRadius: 2,
                      background: convFillColor(selectedAlert.conviction),
                    }}
                  />
                </div>
                <span
                  style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-strong)" }}
                >
                  {selectedAlert.conviction}/100
                </span>
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: ".7px",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Status
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: STATUS_STYLES[selectedAlert.status].color,
                  background: STATUS_STYLES[selectedAlert.status].bg,
                  borderRadius: 4,
                  padding: "3px 10px",
                }}
              >
                {STATUS_STYLES[selectedAlert.status].label}
              </span>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--mono)" }}>
              {selectedAlert.time}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
