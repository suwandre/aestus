"use client";

import React from "react";
import { formatAge } from "./format";
import { Button } from "./primitives";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  lines?: number;
}

const skeletonStyle = `
@keyframes aestus-pulse { 0%,100%{background:var(--panel)} 50%{background:var(--panel-hl)} }
.aestus-skeleton { animation: aestus-pulse 1.5s ease-in-out infinite; border-radius: 4px; }
`;

export function Skeleton({ width = "100%", height = 14, lines }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <>
        <style>{skeletonStyle}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Array.from({ length: lines }).map((_, i) => (
            <span key={i} className="aestus-skeleton" style={{ display: "block", width, height }} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{skeletonStyle}</style>
      <span className="aestus-skeleton" style={{ display: "block", width, height }} />
    </>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  message?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ message = "No data", icon }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 24,
        color: "var(--text-faint)",
        fontSize: 12,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      {icon && <div>{icon}</div>}
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Something went wrong.", onRetry }: ErrorStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 24,
      }}
    >
      <span
        style={{
          color: "var(--red)",
          fontSize: 12,
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        {message}
      </span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StaleBadge
// ---------------------------------------------------------------------------

interface StaleBadgeProps {
  ageSeconds: number;
}

export function StaleBadge({ ageSeconds }: StaleBadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        color: "var(--orange)",
      }}
    >
      <span style={{ color: "var(--orange)" }}>•</span>
      {formatAge(ageSeconds)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DegradedSource
// ---------------------------------------------------------------------------

interface DegradedSourceProps {
  sources: string[];
  severity?: "warning" | "error";
}

export function DegradedSource({ sources, severity = "warning" }: DegradedSourceProps) {
  const isError = severity === "error";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 5,
        background: isError ? "rgba(227,93,91,0.12)" : "rgba(224,161,62,0.12)",
        fontSize: 11,
        fontFamily: "'IBM Plex Sans', sans-serif",
        color: isError ? "var(--red)" : "var(--orange)",
      }}
    >
      <span style={{ fontWeight: 600 }}>{isError ? "Error" : "Degraded"}:</span>
      <span>{sources.join(", ")}</span>
    </div>
  );
}
