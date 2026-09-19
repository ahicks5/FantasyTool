/** The sitemap, built from the indexable paths in lib/site.ts. */
import type { MetadataRoute } from "next";

// Written once at build time. Required explicitly for `output: "export"`, and
// correct for the server build too — neither file depends on a request.
export const dynamic = "force-static";
import { INDEXABLE_PATHS, SITE_URL } from "@/lib/site";

/** Only the public pages. Share links are minted at runtime and have no stable list. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return INDEXABLE_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? ("weekly" as const) : ("yearly" as const),
    priority: path === "/" ? 1 : 0.5,
  }));
}
