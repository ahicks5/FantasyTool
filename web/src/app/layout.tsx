import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Archivo carries the scoreboard weight the app is going for, and its numerals are
// properly tabular at heavy weights — which Inter's are not.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  weight: ["600", "700", "800", "900"],
});

const TITLE = "Edge — this week's moves";
const DESCRIPTION =
  "Your league. This week's moves. Start/sit, waivers and trade verdicts for your fantasy football team.";

export const metadata: Metadata = {
  // Without this, Next resolves every Open Graph image against localhost and share
  // links unfurl as nothing. A pasted trade verdict is the distribution plan, so this
  // is load-bearing rather than housekeeping.
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s" },
  description: DESCRIPTION,
  applicationName: "Edge",
  openGraph: {
    type: "website",
    siteName: "Edge",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Edge — your league, this week's moves" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
  ],
};

/** Applies a saved theme before paint, so a dark-mode user never sees a white flash. */
const THEME_BOOT = `(()=>{try{var t=localStorage.getItem('edge.theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${archivo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
