import type { MetadataRoute } from "next";

// Written once at build time. Required explicitly for `output: "export"`, and
// correct for the server build too — neither file depends on a request.
export const dynamic = "force-static";
import { NOINDEX_PATHS, SITE_URL } from "@/lib/site";

/**
 * The app pages render an empty state until a league is connected, so letting a crawler
 * index them buries the landing page under a handful of near-identical thin pages.
 * Share pages stay crawlable on purpose: a verdict someone pasted is the point.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: NOINDEX_PATHS.map((p) => `${p}/`) }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
