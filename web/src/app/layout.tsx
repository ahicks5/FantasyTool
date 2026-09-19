/** The root layout: the two type families, every metadata tag, and the theme boot script. */
import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

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

// The name is one word. The descriptor "fantasy football call sheet" rides beside it
// wherever context is missing and never fuses into it: "Penthouse Fantasy" as a bare
// string reads as something else entirely in search. See docs/BRAND.md section 2.
// The separator is the middot the rest of the app uses, not an em dash.
const TITLE = "Penthouse · own the week";
const OG_TITLE = "Penthouse · fantasy football call sheet";
const DESCRIPTION =
  "Take the top floor. Penthouse writes your fantasy football call sheet every week: three moves before kickoff, who starts, who to claim, what to offer.";
const OG_DESCRIPTION = "Three moves before kickoff: who starts, who to claim, what to offer. Own the week.";

export const metadata: Metadata = {
  // Without this, Next resolves every Open Graph image against localhost and share
  // links unfurl as nothing. A pasted trade verdict is the distribution plan, so this
  // is load-bearing rather than housekeeping. SITE_URL prefers an explicit setting over
  // Vercel's per-deployment hostname.
  metadataBase: new URL(SITE_URL),
  // `template: "%s"` is a deliberate passthrough. Every section page is a client
  // component and cannot export metadata, so the only page that reaches a template is
  // /s/[id], which builds its own absolute title — anything but "%s" would suffix it
  // with the site name it already carries.
  title: { default: TITLE, template: "%s" },
  description: DESCRIPTION,
  applicationName: "Penthouse",
  // No explicit `images` here on purpose: the card is rendered by
  // `scripts/render_brand_assets.py` into `opengraph-image.png`, which Next picks up by
  // file convention and resolves against metadataBase. Naming one here would override it
  // with a stale card.
  openGraph: {
    type: "website",
    siteName: "Penthouse",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // One value, not a media pair: the app is dark unless the user throws the
  // switch, and the OS has no say in that. `ThemeToggle` rewrites this tag when
  // they do, which is the only way a phone's status bar can follow the toggle.
  themeColor: "#08090b",
};

/**
 * Applies a saved theme before paint, so someone who switched to light never sees
 * the black room flash first. The status-bar colour is patched on DOMContentLoaded
 * rather than here, because the <meta> tag Next renders may not exist yet.
 */
const THEME_BOOT = `(()=>{try{var t=localStorage.getItem('booth.theme');if(!t)return;document.documentElement.dataset.theme=t;document.addEventListener('DOMContentLoaded',function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f6f5f2':'#08090b');});}catch(e){}})()`;

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
