"use client";

import React, { useState } from "react";

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface PanelProps {
  title?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Panel({ title, headerRight, children, style }: PanelProps) {
  return (
    <div
      style={{
        background: "#0d1119",
        border: "1px solid #1a212d",
        borderRadius: 7,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            height: 34,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            borderBottom: "1px solid #141a24",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 600,
              color: "#69737f",
              letterSpacing: "0.9px",
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            {title}
          </span>
          {headerRight && <div style={{ marginLeft: "auto" }}>{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeVariant = "green" | "red" | "amber" | "purple" | "blue" | "pink" | "teal" | "gray";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const badgeColors: Record<BadgeVariant, { color: string; bg: string }> = {
  green: { color: "#26c281", bg: "rgba(38,194,129,0.13)" },
  red: { color: "#e35d5b", bg: "rgba(227,93,91,0.13)" },
  amber: { color: "#e0a13e", bg: "rgba(224,161,62,0.13)" },
  purple: { color: "#7b6cf6", bg: "rgba(123,108,246,0.13)" },
  blue: { color: "#4f8df7", bg: "rgba(79,141,247,0.13)" },
  pink: { color: "#e368a8", bg: "rgba(227,104,168,0.13)" },
  teal: { color: "#3fb6c4", bg: "rgba(63,182,196,0.13)" },
  gray: { color: "#69737f", bg: "rgba(105,115,127,0.12)" },
};

export function Badge({ label, variant = "gray" }: BadgeProps) {
  const { color, bg } = badgeColors[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: bg,
        color,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 6px",
        fontFamily: "'IBM Plex Sans', sans-serif",
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MetricStat
// ---------------------------------------------------------------------------

interface MetricStatProps {
  label: string;
  value: string;
  valueColor?: string;
}

export function MetricStat({ label, value, valueColor = "#e8edf3" }: MetricStatProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        style={{
          textTransform: "uppercase",
          fontSize: 9.5,
          color: "#4a525d",
          fontFamily: "'IBM Plex Sans', sans-serif",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 14,
          color: valueColor,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConvictionBar
// ---------------------------------------------------------------------------

interface ConvictionBarProps {
  score: number;
  showLabel?: boolean;
}

export function ConvictionBar({ score, showLabel = false }: ConvictionBarProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = clampedScore >= 66 ? "#26c281" : clampedScore >= 40 ? "#e0a13e" : "#e35d5b";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 46,
          height: 4,
          background: "#1a212d",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clampedScore}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.3s",
          }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {clampedScore}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: "#7b6cf6", border: "none", color: "white" },
  ghost: { background: "transparent", border: "1px solid #1a212d", color: "#cdd4de" },
  danger: { background: "#e35d5b", border: "none", color: "white" },
};

const buttonSizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { height: 24, fontSize: 11, padding: "0 10px" },
  md: { height: 30, fontSize: 12, padding: "0 14px" },
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 5,
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontWeight: 500,
        cursor: "pointer",
        lineHeight: 1,
        transition: "opacity 0.15s",
        ...buttonVariantStyles[variant],
        ...buttonSizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ style, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <input
      style={{
        background: "#0a0e15",
        border: `1px solid ${focused ? "#7b6cf6" : "#1a212d"}`,
        borderRadius: 5,
        height: 28,
        padding: "0 8px",
        color: "#cdd4de",
        fontSize: 12,
        outline: "none",
        fontFamily: "'IBM Plex Sans', sans-serif",
        boxSizing: "border-box",
        transition: "border-color 0.15s",
        ...style,
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 2 }}>
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            style={{
              background: isActive ? "#11161f" : "transparent",
              color: isActive ? "#e8edf3" : "#69737f",
              border: "none",
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: isActive ? 500 : 400,
              fontFamily: "'IBM Plex Sans', sans-serif",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps {
  children: React.ReactNode;
  padding?: number | string;
  style?: React.CSSProperties;
}

export function Card({ children, padding = 12, style }: CardProps) {
  return (
    <div
      style={{
        background: "#0d1119",
        border: "1px solid #1a212d",
        borderRadius: 7,
        overflow: "hidden",
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
}

export function Select({ options, style, ...props }: SelectProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        background: "#0a0e15",
        border: "1px solid #1a212d",
        borderRadius: 5,
      }}
    >
      <select
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          color: "#cdd4de",
          fontSize: 12,
          fontFamily: "'IBM Plex Sans', sans-serif",
          padding: "0 28px 0 10px",
          height: 28,
          outline: "none",
          cursor: "pointer",
          width: "100%",
          ...style,
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: "#0d1119" }}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        style={{
          position: "absolute",
          right: 8,
          color: "#69737f",
          fontSize: 9,
          pointerEvents: "none",
        }}
      >
        ▾
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline (placeholder — full SVG chart in P17)
// ---------------------------------------------------------------------------

interface SparklineProps {
  data?: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({ color = "#26c281", width = 80, height = 28 }: SparklineProps) {
  return (
    <div
      style={{
        width,
        height,
        background: "rgba(26,33,45,0.5)",
        borderRadius: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={width - 8} height={height - 8} viewBox={`0 0 ${width - 8} ${height - 8}`}>
        <polyline
          points={`0,${height - 12} ${(width - 8) / 2},4 ${width - 8},${(height - 8) / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.4}
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return <div title={content}>{children}</div>;
}
