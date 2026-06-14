"use client";

import { Panel } from "@aestus/ui";

export type EventImportance = "high" | "medium" | "low";

export interface MacroEvent {
  id: string;
  timeToEvent: string;
  name: string;
  currency: string;
  clockTime: string;
  importance: EventImportance;
}

export interface EventsData {
  events: MacroEvent[];
}

interface Props {
  data: EventsData;
}

function ImportanceIndicator({ importance }: { importance: EventImportance }) {
  const isHigh = importance === "high";
  const color = isHigh ? "var(--red)" : importance === "medium" ? "var(--orange)" : "var(--border)";
  const label = isHigh ? "High" : importance === "medium" ? "Medium" : "Low";
  const dotCount = isHigh ? 2 : 1;

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        width: 70,
        justifyContent: "flex-end",
        fontSize: 10,
      }}
    >
      <span style={{ fontWeight: 500, color }}>{label}</span>
      <span style={{ display: "flex", gap: 2 }}>
        {[0, 1].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: i < dotCount ? color : "var(--border)",
            }}
          />
        ))}
      </span>
    </span>
  );
}

export function EventsPanel({ data }: Props) {
  return (
    <Panel title="Upcoming Events">
      <div>
        {data.events.map((ev, i) => {
          const isLast = i === data.events.length - 1;
          const isHigh = ev.importance === "high";
          return (
            <div
              key={ev.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "9px 12px",
                borderBottom: isLast ? "none" : "1px solid var(--border-soft)",
                background: isHigh ? "rgba(227,93,91,.03)" : undefined,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--mono)",
                  color: "var(--text-dim)",
                  fontSize: 10.5,
                  width: 42,
                  flex: "0 0 42px",
                }}
              >
                {ev.timeToEvent}
              </span>
              <span style={{ flex: 1, fontSize: 11.5, color: "var(--text-strong)" }}>
                {ev.name}
              </span>
              <span
                style={{ fontFamily: "var(--mono)", color: "var(--text-faint)", fontSize: 10.5 }}
              >
                {ev.currency}
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  color: "var(--text-dim)",
                  fontSize: 10.5,
                  width: 38,
                  textAlign: "right",
                }}
              >
                {ev.clockTime}
              </span>
              <ImportanceIndicator importance={ev.importance} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
