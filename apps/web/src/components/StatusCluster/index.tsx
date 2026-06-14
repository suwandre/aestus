"use client";

import { useState } from "react";

interface StatusClusterProps {
  connected?: boolean;
  hasNotification?: boolean;
}

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path
      d="M9 2a5 5 0 0 1 5 5v3l1.5 2.5H2.5L4 10V7a5 5 0 0 1 5-5z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path d="M7 14.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

function IconButton({
  children,
  hasNotification,
  ariaLabel,
}: {
  children: React.ReactNode;
  hasNotification?: boolean;
  ariaLabel: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        color: hovered ? "#cdd4de" : "#69737f",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.15s",
      }}
    >
      {children}
      {hasNotification && (
        <span
          style={{
            position: "absolute",
            top: -1,
            right: -1,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#e35d5b",
          }}
        />
      )}
    </button>
  );
}

export default function StatusCluster({ hasNotification }: StatusClusterProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        marginLeft: "auto",
      }}
    >
      <IconButton ariaLabel="Notifications" hasNotification={hasNotification}>
        <BellIcon />
      </IconButton>

      <IconButton ariaLabel="Settings">
        <GearIcon />
      </IconButton>

      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: "linear-gradient(150deg, #a826ec, #7a14d4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 11,
            color: "white",
            letterSpacing: "0.5px",
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          S
        </span>
      </div>
    </div>
  );
}
