"use client";
/**
 * The paywall as a haze, not a wall (Andrew, 2026-09-28): the room's content sits under a
 * blur, the reader sees the shape of what they are missing, and one card over it says
 * what it costs and opens the payment sheet.
 *
 * What sits under the haze is whatever the page hands in as `children`: placeholder rows,
 * or a name-free sketch of the real thing. **Never the real content.** The server does not
 * send a free account the paid payload, so nothing under the blur can be read out of the
 * DOM; the haze is decoration over a sketch, the same rule `PlayerBoard` keeps. With no
 * children, a generic stack of ghost rows stands in.
 *
 * `teaser` should be a concrete, name-free sentence from the engine. The price line reads
 * off the catalog, never typed here.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getProducts } from "@/lib/api";
import { useAccountGate } from "./account/AccountGate";
import type { Feature, Product, Sku } from "@/lib/types";
import { priceLabel } from "@/lib/offer";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { IconChevron, IconLock } from "./icons";
import { Button } from "./ui";
import { ACCOUNT, LINES } from "@/lib/vocab";

/** A stack of ghost rows: the shape of a list, with nothing in it. */
export function GhostRows({ n = 4, faces = true }: { n?: number; faces?: boolean }) {
  return (
    <ul className="ghost-rows">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="ghost-row">
          {faces && <span className="ghost-face" />}
          <span className="ghost-lines">
            <span className="ghost-bar" style={{ width: `${58 - (i % 3) * 9}%` }} />
            <span className="ghost-bar ghost-bar-thin" style={{ width: `${34 + (i % 2) * 12}%` }} />
          </span>
          <span className="ghost-num" />
        </li>
      ))}
    </ul>
  );
}

/** `sku` names the room that is locked (a feature); what is offered is always the season and the week. */
export function Locked({
  sku,
  what,
  teaser,
  signedIn = true,
  onUnlocked,
  children,
  compact = false,
}: {
  sku: Feature;
  what: string;
  teaser?: string | null;
  signedIn?: boolean;
  onUnlocked?: () => void;
  /** The sketch under the haze. Placeholder shapes only, never the paid payload. */
  children?: ReactNode;
  /** A shorter card, for a haze that sits inside a section rather than standing as the page. */
  compact?: boolean;
}) {
  const gate = useAccountGate();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  useEffect(() => {
    getProducts().then((r) => r.products.length && setProducts(r.products)).catch(() => undefined);
  }, []);
  const full = products.find((p) => p.sku === "full_report");
  const week = products.find((p) => p.sku === "week_pass");
  // The cheapest way in is the line on the card (Andrew, 2026-09-28: "as low as $4.99 is fine").
  const from = week ? priceLabel(week) : null;

  async function buy(s: Sku) {
    // The sheet signs the visitor in first if it has to (payment is the first moment an
    // account is genuinely needed), then either grants or hands off to Stripe, coming back
    // to the page they were on rather than whatever the API defaults to.
    setBusy(true);
    try {
      if (await gate.upgrade(s, { what, returnTo: pathname })) onUnlocked?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`haze ${compact ? "haze-compact" : ""}`} data-locked={sku}>
      <div className="haze-ghost" aria-hidden>
        {children ?? <GhostRows n={compact ? 3 : 5} />}
      </div>
      <div className="haze-veil" aria-hidden />
      <div className="haze-card" role="region" aria-label={ACCOUNT.upgrade.for(what)}>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
            <IconLock size={16} strokeWidth={2} />
          </span>
          <span className="eyebrow">{what}</span>
        </div>
        <p className="display mt-3 text-[18px] leading-[1.3]">{teaser ?? full?.blurb}</p>
        {from && (
          <p className="mt-2 text-[14px] font-bold text-white/80">
            {LINES.paywallFrom(from)}
          </p>
        )}
        <div className="mt-4 grid gap-2">
          {full && (
            <Button variant="start" className="w-full" onClick={() => buy("full_report")} busy={busy} data-testid="locked-season">
              {busy ? ACCOUNT.upgrade.busy : LINES.paywallGo}
              {!busy && <IconChevron size={13} strokeWidth={2.8} />}
            </Button>
          )}
          {week && (
            <button
              type="button"
              onClick={() => buy("week_pass")}
              disabled={busy}
              className="min-h-11 text-center text-[13px] font-semibold text-white/70 underline underline-offset-4 hover:text-white"
              data-testid="locked-week"
            >
              {LINES.paywallWeekCta}
              <span aria-hidden className="px-1 opacity-50">·</span>
              <span className="tnum">{priceLabel(week)}</span>
            </button>
          )}
        </div>
        {!compact && (
          <>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-white/50">
              {ACCOUNT.upgrade.terms}
              {!signedIn && ` ${ACCOUNT.upgrade.signInNote}`}
            </p>
            {/* Stripe's review expects these reachable from the point of purchase, not just the footer. */}
            <p className="text-center text-[11px] text-white/45">
              <Link href="/terms" className="inline-flex min-h-9 items-center px-2 underline hover:text-white/70">
                Terms
              </Link>
              <span aria-hidden className="px-1">·</span>
              <Link href="/privacy" className="inline-flex min-h-9 items-center px-2 underline hover:text-white/70">
                Privacy
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
