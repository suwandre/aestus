"use client";

import { useState, useEffect } from "react";

interface ClockProps {
  timezone?: string;
}

function formatTime(timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  })
    .format(new Date())
    .replace(",", "");
}

export default function Clock({ timezone = "Europe/Berlin" }: ClockProps) {
  const [time, setTime] = useState(() => formatTime(timezone));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(timezone)), 1000);
    return () => clearInterval(id);
  }, [timezone]);

  return (
    <span
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        color: "var(--text-dim)",
        letterSpacing: "0.3px",
        whiteSpace: "nowrap",
        fontFeatureSettings: '"tnum"',
      }}
    >
      {time}
    </span>
  );
}
