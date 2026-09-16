import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", weight: ["600", "700", "800", "900"] });

export const metadata: Metadata = {
  title: "Edge — this week's moves",
  description: "Your league. This week's moves. Start/sit, waivers and trade verdicts for your fantasy football team.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${interTight.variable}`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
