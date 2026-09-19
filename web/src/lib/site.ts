/**
 * Where this build thinks it lives.
 *
 * Next resolves Open Graph and Twitter image URLs against `metadataBase`. With it unset
 * it falls back to http://localhost:3000 and says so in the build log — which means every
 * share card points at localhost and unfurls as nothing in a league chat, a subreddit or
 * a Discord. Since the whole distribution plan is "a trade verdict becomes a link someone
 * pastes", that is the marketing loop quietly not working.
 */

/** Strip a trailing slash and add a scheme if the host came in bare (Vercel's does). */
export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * In order: an explicit setting, then the deployment URL Vercel injects at build time,
 * then localhost for `next dev`. The explicit one wins because VERCEL_URL is the
 * per-deployment hostname, not the custom domain people actually visit.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  return (
    normalizeSiteUrl(env.NEXT_PUBLIC_SITE_URL ?? "") ||
    normalizeSiteUrl(env.VERCEL_PROJECT_PRODUCTION_URL ?? "") ||
    normalizeSiteUrl(env.VERCEL_URL ?? "") ||
    "http://localhost:3000"
  );
}

export const SITE_URL = resolveSiteUrl();

/** Pages worth putting in a sitemap: public, and meaningful without a league connected. */
export const INDEXABLE_PATHS = ["/", "/connect", "/terms", "/privacy"] as const;

/**
 * Pages to keep out of search results. They render an empty state until a league is
 * connected, so indexing them buries the landing page under near-identical thin pages.
 */
export const NOINDEX_PATHS = ["/home", "/team", "/waivers", "/trade", "/report", "/login"] as const;
