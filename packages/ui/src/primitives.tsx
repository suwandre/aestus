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
        background: "var(--panel)",
        border: "1px solid var(--border)",
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
            borderBottom: "1px solid var(--border-soft)",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--text-dim)",
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
  green: { color: "var(--green)", bg: "rgba(38,194,129,0.13)" },
  red: { color: "var(--red)", bg: "rgba(227,93,91,0.13)" },
  amber: { color: "var(--orange)", bg: "rgba(224,161,62,0.13)" },
  purple: { color: "var(--purple)", bg: "rgba(123,108,246,0.13)" },
  blue: { color: "var(--blue)", bg: "rgba(79,141,247,0.13)" },
  pink: { color: "var(--pink)", bg: "rgba(227,104,168,0.13)" },
  teal: { color: "var(--teal)", bg: "rgba(63,182,196,0.13)" },
  gray: { color: "var(--text-dim)", bg: "rgba(105,115,127,0.12)" },
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

export function MetricStat({ label, value, valueColor = "var(--text-strong)" }: MetricStatProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        style={{
          textTransform: "uppercase",
          fontSize: 9.5,
          color: "var(--text-faint)",
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
  const color =
    clampedScore >= 66 ? "var(--green)" : clampedScore >= 40 ? "var(--orange)" : "var(--red)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 46,
          height: 4,
          background: "var(--border)",
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
  primary: { background: "var(--purple)", border: "none", color: "white" },
  ghost: { background: "transparent", border: "1px solid var(--border)", color: "var(--text)" },
  danger: { background: "var(--red)", border: "none", color: "white" },
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
        background: "var(--panel-2)",
        border: `1px solid ${focused ? "var(--purple)" : "var(--border)"}`,
        borderRadius: 5,
        height: 28,
        padding: "0 8px",
        color: "var(--text)",
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
              background: isActive ? "var(--panel-hl)" : "transparent",
              color: isActive ? "var(--text-strong)" : "var(--text-dim)",
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
        background: "var(--panel)",
        border: "1px solid var(--border)",
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
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 5,
      }}
    >
      <select
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          color: "var(--text)",
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
          <option key={opt.value} value={opt.value} style={{ background: "var(--panel)" }}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        style={{
          position: "absolute",
          right: 8,
          color: "var(--text-dim)",
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

export function Sparkline({ color = "var(--green)", width = 80, height = 28 }: SparklineProps) {
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

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface TableColumn<T> {
  key: keyof T & string;
  header: string;
  align?: "left" | "right";
  mono?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}

export function Table<T>({ columns, rows, rowKey }: TableProps<T>) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                textAlign: col.align ?? "left",
                textTransform: "uppercase",
                fontSize: 9.5,
                fontWeight: 600,
                color: "var(--text-faint)",
                letterSpacing: "0.5px",
                padding: "6px 10px",
                borderBottom: "1px solid var(--border)",
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((col) => (
              <td
                key={col.key}
                style={{
                  textAlign: col.align ?? "left",
                  padding: "7px 10px",
                  color: "var(--text)",
                  borderBottom: "1px solid var(--border-soft)",
                  fontFamily: col.mono
                    ? "'IBM Plex Mono', monospace"
                    : "'IBM Plex Sans', sans-serif",
                  fontFeatureSettings: col.mono ? '"tnum"' : undefined,
                }}
              >
                {col.render ? col.render(row) : String(row[col.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Overlay (shared backdrop for Modal/Drawer)
// ---------------------------------------------------------------------------

function Overlay({
  onClose,
  children,
  justify,
}: {
  onClose: () => void;
  children: React.ReactNode;
  justify: React.CSSProperties["justifyContent"];
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: justify,
        alignItems: justify === "center" ? "center" : "stretch",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", flexDirection: "column" }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 440 }: ModalProps) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose} justify="center">
      <div
        style={{
          width,
          maxWidth: "90vw",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          overflow: "hidden",
        }}
      >
        {title && <ModalHeader title={title} onClose={onClose} />}
        <div style={{ padding: 14, color: "var(--text)", fontSize: 13 }}>{children}</div>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Drawer (slides in from the right)
// ---------------------------------------------------------------------------

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: number;
}

export function Drawer({ open, onClose, title, children, width = 360 }: DrawerProps) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose} justify="flex-end">
      <div
        style={{
          width,
          maxWidth: "90vw",
          height: "100%",
          background: "var(--panel)",
          borderLeft: "1px solid var(--border)",
          overflow: "auto",
        }}
      >
        {title && <ModalHeader title={title} onClose={onClose} />}
        <div style={{ padding: 14, color: "var(--text)", fontSize: 13 }}>{children}</div>
      </div>
    </Overlay>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <span
        style={{
          textTransform: "uppercase",
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--text-dim)",
          letterSpacing: "0.9px",
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        {title}
      </span>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-dim)",
          fontSize: 16,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
