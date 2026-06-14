"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@aestus/ui";

export interface AskAnswer {
  question: string;
  lead: string;
  bullets: { text: string; bold?: string }[];
}

export interface AskData {
  recent?: AskAnswer;
}

interface Props {
  data: AskData;
}

type AskTab = "ask" | "research" | "playbooks";

const TABS: { key: AskTab; label: string }[] = [
  { key: "ask", label: "ASK" },
  { key: "research", label: "RESEARCH" },
  { key: "playbooks", label: "PLAYBOOKS" },
];

export function AskPanel({ data }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AskTab>("ask");
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const q = input.trim();
    if (!q) return;
    router.push(`/research?q=${encodeURIComponent(q)}`);
  }

  return (
    <Panel>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 20,
          height: 36,
          alignItems: "center",
          padding: "0 14px",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        {TABS.map((tab) => {
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
                fontWeight: 500,
                height: 36,
                background: "none",
                border: "none",
                fontFamily: "var(--sans)",
                padding: 0,
                borderBottom: isActive ? "2px solid var(--purple)" : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "ask" && data.recent ? (
        <>
          {/* Recent question */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: 11,
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--text)",
            }}
          >
            {data.recent.question}
          </div>

          {/* Answer body */}
          <div style={{ padding: "0 14px 4px" }}>
            <div style={{ fontSize: 11.5, color: "var(--text)", marginBottom: 9 }}>
              {data.recent.lead}
            </div>
            <ul
              style={{
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 7,
                padding: 0,
                margin: 0,
              }}
            >
              {data.recent.bullets.map((b, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--text-dim)",
                    lineHeight: 1.4,
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "var(--purple)",
                      marginTop: 6,
                      flex: "0 0 4px",
                    }}
                  />
                  <span>
                    {b.bold ? (
                      <>
                        <strong style={{ color: "var(--text)", fontWeight: 500 }}>{b.bold}</strong>{" "}
                        {b.text}
                      </>
                    ) : (
                      b.text
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* View full analysis link */}
          <div style={{ padding: "11px 14px 0" }}>
            <span
              onClick={() => router.push("/research")}
              style={{ color: "var(--green)", fontSize: 10.5, fontWeight: 500, cursor: "pointer" }}
            >
              View Full Analysis →
            </span>
          </div>
        </>
      ) : (
        <div
          style={{
            padding: "14px",
            color: "var(--text-faint)",
            fontSize: 11,
            textAlign: "center",
          }}
        >
          No recent analysis
        </div>
      )}

      {/* Input bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: 11,
          marginTop: "auto",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          height: 38,
          padding: "0 6px 0 12px",
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Ask anything..."
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: "var(--text)",
            fontFamily: "var(--sans)",
            fontSize: 12,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-faint)" }}>
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m21.4 11.1-9.2 9.2a5 5 0 0 1-7-7l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5" />
          </svg>
        </div>
        <button
          onClick={submit}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: "var(--purple)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            cursor: "pointer",
            border: "none",
            flexShrink: 0,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </Panel>
  );
}
