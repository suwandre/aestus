"use client";

import { useState } from "react";
import { Panel } from "@aestus/ui";

export type NewsSourceType = "onchain" | "macro" | "deriv" | "inst" | "reg" | "social";
export type NewsTab = "all" | "news" | "onchain" | "social";

export interface NewsItem {
  id: string;
  relativeTime: string;
  headline: string;
  sourceType: NewsSourceType;
  assets?: string[];
}

export interface NewsData {
  items: NewsItem[];
}

interface Props {
  data: NewsData;
  focusedAssetId: string;
}

const SOURCE_STYLES: Record<NewsSourceType, { label: string; bg: string; color: string }> = {
  onchain: { label: "On-Chain", bg: "rgba(38,194,129,.13)", color: "var(--green)" },
  macro: { label: "Macro", bg: "rgba(79,141,247,.14)", color: "var(--blue)" },
  deriv: { label: "Derivatives", bg: "rgba(123,108,246,.15)", color: "var(--purple)" },
  inst: { label: "Institutions", bg: "rgba(227,104,168,.14)", color: "var(--pink)" },
  reg: { label: "Regulatory", bg: "rgba(123,108,246,.15)", color: "var(--purple)" },
  social: { label: "Social", bg: "rgba(224,161,62,.14)", color: "var(--orange)" },
};

const TAB_FILTERS: Record<NewsTab, NewsSourceType[] | null> = {
  all: null,
  news: ["macro", "inst", "reg", "deriv"],
  onchain: ["onchain"],
  social: ["social"],
};

const TABS: { key: NewsTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "news", label: "News" },
  { key: "onchain", label: "On-Chain" },
  { key: "social", label: "Social" },
];

export function NewsPanel({ data, focusedAssetId }: Props) {
  const [activeTab, setActiveTab] = useState<NewsTab>("all");

  const focusedBase = focusedAssetId.split("-")[0].toLowerCase();

  const filtered = data.items.filter((item) => {
    const tabFilter = TAB_FILTERS[activeTab];
    if (tabFilter && !tabFilter.includes(item.sourceType)) return false;
    if (item.assets && item.assets.length > 0) {
      return item.assets.some((a) => a.toLowerCase() === focusedBase);
    }
    return true;
  });

  return (
    <Panel
      title="Recent News & Narratives"
      headerRight={
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontSize: 10.5,
                color: activeTab === tab.key ? "var(--text-strong)" : "var(--text-dim)",
                padding: "3px 8px",
                borderRadius: 4,
                background: activeTab === tab.key ? "var(--panel-hl)" : "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--sans)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    >
      <div>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "14px 12px",
              color: "var(--text-faint)",
              fontSize: 11,
              textAlign: "center",
            }}
          >
            No items
          </div>
        ) : (
          filtered.map((item, i) => {
            const src = SOURCE_STYLES[item.sourceType];
            const isLast = i === filtered.length - 1;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderBottom: isLast ? "none" : "1px solid var(--border-soft)",
                  cursor: "default",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    color: "var(--text-faint)",
                    fontSize: 10,
                    width: 24,
                    flex: "0 0 24px",
                  }}
                >
                  {item.relativeTime}
                </span>
                <span style={{ flex: 1, fontSize: 11.5, color: "var(--text)", lineHeight: 1.35 }}>
                  {item.headline}
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 500,
                    borderRadius: 4,
                    padding: "2px 7px",
                    whiteSpace: "nowrap",
                    background: src.bg,
                    color: src.color,
                  }}
                >
                  {src.label}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div
        style={{
          marginTop: "auto",
          padding: "9px 14px",
          borderTop: "1px solid var(--border-soft)",
        }}
      >
        <span style={{ color: "var(--green)", fontSize: 10.5, fontWeight: 500, cursor: "pointer" }}>
          View All News →
        </span>
      </div>
    </Panel>
  );
}
