import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Archivo carries the scoreboard weight the app is going for, and its numerals are
// properly tabular at heavy weights — which Inter's are not.
// `optional`, not `swap`. Measured at 390px: with Archivo blocked the call-sheet h1 is
// 71px tall and with it 35px — the heading wraps to two lines in the fallback and snaps
// back to one when the webfont lands, which moved every screen on a cold load. `optional`
// gives the browser ~100ms to have the font ready and then commits to whatever it has,
// so a heading never re-shapes after paint. Next self-hosts and preloads these files, so
// in practice the font wins that race; on a connection slow enough to lose it, a heading
// set in the fallback is a better trade than the whole page jumping.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "optional",
  weight: ["600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "The Booth — three moves by Sunday",
  description: "Take the headset. The booth writes your fantasy football call sheet every week: who starts, who to claim, what to offer.",
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
const THEME_BOOT = `(()=>{try{var t=localStorage.getItem('booth.theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}})()`;

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
