"use client";

import { useState } from "react";

const styles = {
  container: (focused: boolean): React.CSSProperties => ({
    background: "#0a0e14",
    border: `1px solid ${focused ? "#7b6cf6" : "#1a212d"}`,
    borderRadius: 6,
    height: 30,
    padding: "0 10px",
    width: 235,
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s",
  }),
  input: {
    fontSize: 12,
    color: "#4a525d",
    background: "transparent",
    border: "none",
    outline: "none",
    flex: 1,
    fontFamily: "'IBM Plex Sans', sans-serif",
  } as React.CSSProperties,
  hint: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "#4a525d",
    border: "1px solid #1a212d",
    borderRadius: 3,
    padding: "1px 4px",
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
};

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke="#4a525d" strokeWidth="1.4" />
    <line
      x1="9.5"
      y1="9.5"
      x2="12.5"
      y2="12.5"
      stroke="#4a525d"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

export default function CommandSearch() {
  const [focused, setFocused] = useState(false);

  return (
    <div style={styles.container(focused)}>
      <SearchIcon />
      <input
        style={styles.input}
        placeholder="Search or command..."
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Search or command"
      />
      <span style={styles.hint}>⌘K</span>
    </div>
  );
}
