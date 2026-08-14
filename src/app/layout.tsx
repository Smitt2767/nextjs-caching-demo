import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { NavClock } from "@/app/_components/nav-clock";

// Developer-tool pairing: IBM Plex Sans for prose, JetBrains Mono for the
// timings, tags and code that carry most of this demo's meaning.
// Loaded via next/font so they self-host with no layout shift.
const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Cache Components demo",
  description:
    "Static shell vs. request-time streaming, with country slots that show the difference between caching data and caching a component.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-surface text-ink">
        {/* Stamps when each client navigation begins, so the arrival badges
            measure from the click rather than from the original page load. */}
        <NavClock />
        {children}
      </body>
    </html>
  );
}
