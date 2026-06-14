"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// --- SVG icons ---

const GridIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="10" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="2" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="10" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const ChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="10" width="3" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="7.5" y="6" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="13" y="2" width="3" height="14" rx="1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

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

const DocIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" />
    <line
      x1="6"
      y1="6"
      x2="12"
      y2="6"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <line
      x1="6"
      y1="9"
      x2="12"
      y2="9"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <line
      x1="6"
      y1="12"
      x2="10"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" />
    <line
      x1="12"
      y1="12"
      x2="15.5"
      y2="15.5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const BookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path
      d="M3 3h5a3 3 0 0 1 3 3v9a2 2 0 0 0-2-2H3V3z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path
      d="M15 3h-5a3 3 0 0 0-3 3v9a2 2 0 0 1 2-2h6V3z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const BarChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <line
      x1="2"
      y1="16"
      x2="16"
      y2="16"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <rect x="3" y="8" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
    <rect x="7.5" y="4" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
    <rect x="12" y="6" width="3" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <line
      x1="3"
      y1="5"
      x2="15"
      y2="5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <line
      x1="3"
      y1="9"
      x2="15"
      y2="9"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <line
      x1="3"
      y1="13"
      x2="9"
      y2="13"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <polygon points="12,11 16,13 12,15" fill="currentColor" />
  </svg>
);

const DatabaseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <ellipse cx="9" cy="5" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M3 5v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M3 9v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V9" stroke="currentColor" strokeWidth="1.3" />
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

// --- Nav items config ---

const mainNav: NavItem[] = [
  { href: "/cockpit", label: "Cockpit", icon: <GridIcon /> },
  { href: "/markets", label: "Markets", icon: <ChartIcon /> },
  { href: "/alerts", label: "Alerts", icon: <BellIcon /> },
  { href: "/briefings", label: "Briefings", icon: <DocIcon /> },
  { href: "/research", label: "Research", icon: <SearchIcon /> },
  { href: "/journal", label: "Journal", icon: <BookIcon /> },
  { href: "/analytics", label: "Analytics", icon: <BarChartIcon /> },
  { href: "/playbooks", label: "Playbooks", icon: <PlayIcon /> },
  { href: "/data", label: "Data", icon: <DatabaseIcon /> },
];

function NavItemButton({ item, active }: { item: NavItem; active: boolean }) {
  const [hovered, setHovered] = useState(false);

  const color = active ? "#7b6cf6" : hovered ? "#69737f" : "#4a525d";

  return (
    <Link
      href={item.href}
      style={{ textDecoration: "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 9,
          paddingBottom: 9,
          gap: 4,
          cursor: "pointer",
        }}
      >
        {/* Active rail */}
        {active && (
          <span
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              width: 2.5,
              height: 20,
              background: "#7b6cf6",
              borderRadius: "0 2px 2px 0",
            }}
          />
        )}

        {/* Icon chip */}
        <div
          style={{
            width: 36,
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            background: active ? "rgba(123,108,246,0.12)" : "transparent",
            color,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {item.icon}
        </div>

        <span
          style={{
            fontSize: 9.5,
            fontWeight: 500,
            color,
            fontFamily: "'IBM Plex Sans', sans-serif",
            letterSpacing: "0.3px",
            transition: "color 0.15s",
          }}
        >
          {item.label}
        </span>
      </div>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 74,
        background: "#0a0e15",
        borderRight: "1px solid #1a212d",
        minHeight: "calc(100vh - 46px)",
        top: 46,
        position: "sticky",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 6,
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      {/* Main nav items */}
      <nav style={{ width: "100%", display: "flex", flexDirection: "column" }}>
        {mainNav.map((item) => (
          <NavItemButton
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* System status */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          padding: "10px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#26c281",
              boxShadow: "0 0 6px #26c281",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              color: "#26c281",
              fontFamily: "'IBM Plex Sans', sans-serif",
              letterSpacing: "0.5px",
            }}
          >
            LIVE
          </span>
        </div>
        <span
          style={{
            fontSize: 8.5,
            color: "#4a525d",
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          All systems
        </span>
      </div>

      {/* Settings nav item */}
      <NavItemButton
        item={{ href: "/settings", label: "Settings", icon: <GearIcon /> }}
        active={pathname === "/settings"}
      />
    </aside>
  );
}
