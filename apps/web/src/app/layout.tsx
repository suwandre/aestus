import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AESTUS",
  description: "Self-hosted crypto decision-support cockpit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
