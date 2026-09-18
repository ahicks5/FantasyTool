import type { NextConfig } from "next";

/**
 * EDGE_DEMO_EXPORT=1 builds a self-contained static demo (`npm run demo`):
 * every page pre-rendered, no API, mock data from src/lib/mocks.ts. It exists so
 * the app can be handed to someone as a link — a phone, a group chat, a landing
 * page — without deploying the API first. Normal dev and the real Vercel build
 * are unaffected: with the flag unset this is the stock config.
 */
const demoExport = process.env.EDGE_DEMO_EXPORT === "1";

const nextConfig: NextConfig = demoExport
  ? {
      output: "export",
      // Static hosts resolve /waivers/ -> waivers/index.html; without this the
      // export emits waivers.html and a hard reload of a deep link 404s.
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
