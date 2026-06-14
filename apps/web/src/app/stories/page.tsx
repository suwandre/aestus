"use client";

import {
  Panel,
  Badge,
  MetricStat,
  ConvictionBar,
  Button,
  Input,
  Tabs,
  Skeleton,
  EmptyState,
  ErrorState,
  StaleBadge,
  DegradedSource,
} from "@aestus/ui";
import { useState } from "react";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 32 }}>
    <h2
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.9px",
        color: "#69737f",
        marginBottom: 12,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      {title}
    </h2>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{children}</div>
  </section>
);

export default function StoriesPage() {
  const [activeTab, setActiveTab] = useState("Overview");

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1100,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#e8edf3",
          marginBottom: 4,
        }}
      >
        Component Gallery
      </h1>
      <p style={{ color: "#69737f", fontSize: 12, marginBottom: 28 }}>
        Visual regression reference — P16-T016. Primitives and state components for design review
        without live data.
      </p>

      {/* Badges */}
      <Section title="Badges">
        {(["green", "red", "amber", "purple", "blue", "pink", "teal", "gray"] as const).map((v) => (
          <Badge key={v} label={v.toUpperCase()} variant={v} />
        ))}
      </Section>

      {/* MetricStat */}
      <Section title="Metric / Stat">
        <MetricStat label="Conviction" value="72" />
        <MetricStat label="24h Change" value="+1.24%" valueColor="#26c281" />
        <MetricStat label="VIX" value="18.4" valueColor="#e0a13e" />
        <MetricStat label="Funding" value="+0.0124%" />
      </Section>

      {/* ConvictionBar */}
      <Section title="Conviction Bar">
        <ConvictionBar score={78} showLabel />
        <ConvictionBar score={52} showLabel />
        <ConvictionBar score={28} showLabel />
      </Section>

      {/* Buttons */}
      <Section title="Buttons">
        <Button variant="primary" size="md">
          Primary
        </Button>
        <Button variant="ghost" size="md">
          Ghost
        </Button>
        <Button variant="danger" size="md">
          Danger
        </Button>
        <Button variant="primary" size="sm">
          Small
        </Button>
        <Button variant="ghost" size="sm">
          Ghost SM
        </Button>
      </Section>

      {/* Input */}
      <Section title="Input">
        <Input placeholder="Enter value..." style={{ width: 220 }} />
      </Section>

      {/* Tabs */}
      <Section title="Tabs">
        <Tabs
          tabs={["Overview", "Details", "History"]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </Section>

      {/* Panel */}
      <Section title="Panel">
        <Panel
          title="Sample Panel"
          headerRight={<Badge label="LIVE" variant="green" />}
          style={{ width: 280 }}
        >
          <div style={{ padding: "10px 12px", color: "#cdd4de", fontSize: 12 }}>
            Panel content area
          </div>
        </Panel>
      </Section>

      {/* State components */}
      <Section title="States">
        <div style={{ width: 200 }}>
          <Skeleton width="100%" height={14} lines={3} />
        </div>
        <div style={{ width: 200, border: "1px solid #1a212d", borderRadius: 7 }}>
          <EmptyState message="No alerts" />
        </div>
        <div style={{ width: 200, border: "1px solid #1a212d", borderRadius: 7 }}>
          <ErrorState message="Feed unavailable" />
        </div>
        <StaleBadge ageSeconds={135} />
        <DegradedSource sources={["feed:binance", "nats"]} severity="warning" />
        <DegradedSource sources={["feed:kraken"]} severity="error" />
      </Section>
    </div>
  );
}
