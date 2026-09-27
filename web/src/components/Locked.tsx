"use client";
/**
 * Premium teaser, not a wall: says what we found, then offers the season or a week.
 * `teaser` should be a concrete, name-free sentence from the engine.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getProducts } from "@/lib/api";
import { useAccountGate } from "./account/AccountGate";
import { formatCents } from "@/lib/format";
import type { Feature, Product, Sku } from "@/lib/types";
import { priceLabel, productName } from "@/lib/offer";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { IconLock } from "./icons";
import { Button, Spinner } from "./ui";
import { ACCOUNT, LINES } from "@/lib/vocab";

const BTN =
  "btn inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-bold transition-[transform,background-color] duration-150 active:scale-[0.985] disabled:opacity-50 disabled:active:scale-100";

/** `sku` names the room that is locked (a feature); what is offered is always the season and the week. */
export function Locked({ sku, what, teaser, signedIn = true, onUnlocked }: { sku: Feature; what: string; teaser?: string | null; signedIn?: boolean; onUnlocked?: () => void }) {
  const gate = useAccountGate();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  useEffect(() => {
    getProducts().then((r) => r.products.length && setProducts(r.products)).catch(() => undefined);
  }, []);
  const full = products.find((p) => p.sku === "full_report");
  const week = products.find((p) => p.sku === "week_pass");

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
    <div className="hero p-6" data-locked={sku}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
          <IconLock size={18} strokeWidth={2} />
        </span>
        <span className="eyebrow">{what}</span>
      </div>

      <p className="display mt-4 text-[20px] leading-[1.3]">{teaser ?? full?.blurb}</p>
      {teaser && full?.blurb && <p className="mt-2 text-[14px] leading-relaxed text-white/60">{full.blurb}</p>}

      <div className="mt-6 grid gap-2.5">
        {full && (
          <Button variant="start" className="w-full" onClick={() => buy("full_report")} busy={busy} data-testid="locked-season">
            {busy ? (
              ACCOUNT.upgrade.busy
            ) : (
              <>
                {LINES.paywallBundleCta}
                <span aria-hidden className="opacity-50">·</span>
                <span className="tnum">{formatCents(full.price_cents)}</span>
              </>
            )}
          </Button>
        )}
        {week && (
          <button
            onClick={() => buy("week_pass")}
            disabled={busy}
            aria-busy={busy || undefined}
            className={`${BTN} border border-white/25 text-white hover:bg-white/10`}
            data-testid="locked-week"
            aria-label={`${LINES.paywallWeekCta}: ${productName(week)}, ${priceLabel(week)}`}
          >
            {busy && <Spinner size={15} label={null} />}
            {LINES.paywallWeekCta}
            <span aria-hidden className="opacity-50">·</span>
            <span className="tnum">{priceLabel(week)}</span>
          </button>
        )}
      </div>

      <p className="mt-3.5 text-center text-[12px] leading-relaxed text-white/55">
        {ACCOUNT.upgrade.terms}
        {!signedIn && ` ${ACCOUNT.upgrade.signInNote}`}
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
