"use client";
/**
 * Premium teaser, not a wall: says what we found, then offers the way in. Any pass opens
 * every room, so the offer is the same wherever the wall stands: the free week when the
 * account can still take it, else the passes from the week's price.
 * `teaser` should be a concrete, name-free sentence from the engine.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getProducts } from "@/lib/api";
import { useAccountGate } from "./account/AccountGate";
import { formatCents } from "@/lib/format";
import { offer } from "@/lib/offer";
import { useSession } from "@/lib/session";
import type { Feature, Product } from "@/lib/types";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { IconLock } from "./icons";
import { Button } from "./ui";
import { LINES, PRICING } from "@/lib/vocab";

export function Locked({ feature, what, teaser, signedIn = true, onUnlocked }: { feature: Feature; what: string; teaser?: string | null; signedIn?: boolean; onUnlocked?: () => void }) {
  const gate = useAccountGate();
  const session = useSession();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  useEffect(() => {
    getProducts().then((r) => r.products.length && setProducts(r.products)).catch(() => undefined);
  }, []);
  const o = offer(products);
  // A signed-out visitor has never had a free week, so the offer leads with it.
  const trial = !!o.trial?.days && (!signedIn || !!session.me?.trial_eligible);
  const blurb = o.season?.blurb ?? products.find((p) => p.features.includes(feature) && p.price_cents > 0)?.blurb;

  async function unlock() {
    // The sheet signs the visitor in first if it has to (payment is the first moment an
    // account is genuinely needed), then offers the free week and both passes, and either
    // grants or hands off to Stripe, coming back to the page they were on.
    setBusy(true);
    try {
      if (await gate.upgrade({ what, returnTo: pathname })) onUnlocked?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
          <IconLock size={18} strokeWidth={2} />
        </span>
        <span className="eyebrow">{what}</span>
      </div>

      <p className="display mt-4 text-[20px] leading-[1.3]">{teaser ?? blurb}</p>
      {teaser && blurb && <p className="mt-2 text-[14px] leading-relaxed text-white/60">{blurb}</p>}

      <div className="mt-6 grid gap-2.5">
        <Button variant="start" className="w-full" onClick={unlock} busy={busy}>
          {busy ? (
            "Opening…"
          ) : trial ? (
            LINES.paywallTrial
          ) : (
            <>
              Unlock {what}
              {o.week && (
                <>
                  <span aria-hidden className="opacity-50">·</span>
                  <span className="tnum">
                    {formatCents(o.week.price_cents)} {PRICING.per.week}
                  </span>
                </>
              )}
            </>
          )}
        </Button>
      </div>

      <p className="mt-3.5 text-center text-[12px] leading-relaxed text-white/55">
        {LINES.paywallTerms}
        {o.season && ` ${o.season.name} ${formatCents(o.season.price_cents)}.`}
        {!signedIn && " You'll sign in first so your pass follows you."}
      </p>
      {/* Stripe's review expects these reachable from the point of purchase, not just the footer. */}
      <p className="mt-2 text-center text-[12px] text-white/45">
        <Link href="/terms" className="inline-flex min-h-11 items-center px-2 underline hover:text-white/70">
          Terms
        </Link>
        <span aria-hidden className="px-1.5">·</span>
        <Link href="/privacy" className="inline-flex min-h-11 items-center px-2 underline hover:text-white/70">
          Privacy
        </Link>
      </p>
    </div>
  );
}
