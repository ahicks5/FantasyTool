"use client";
/**
 * Premium teaser, not a wall: says what we found, then offers the pass or the bundle.
 * `teaser` should be a concrete, name-free sentence from the engine.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getProducts } from "@/lib/api";
import { useAccountGate } from "./account/AccountGate";
import { formatCents } from "@/lib/format";
import type { Product, Sku } from "@/lib/types";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { IconLock } from "./icons";
import { Button, Spinner } from "./ui";
import { LINES } from "@/lib/vocab";

const BTN =
  "btn inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-bold transition-[transform,background-color] duration-150 active:scale-[0.985] disabled:opacity-50 disabled:active:scale-100";

export function Locked({ sku, what, teaser, signedIn = true, onUnlocked }: { sku: Sku; what: string; teaser?: string | null; signedIn?: boolean; onUnlocked?: () => void }) {
  const gate = useAccountGate();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  useEffect(() => {
    getProducts().then((r) => r.products.length && setProducts(r.products)).catch(() => undefined);
  }, []);
  const product = products.find((p) => p.sku === sku);
  const full = products.find((p) => p.sku === "full_report");

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
    <div className="hero p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
          <IconLock size={18} strokeWidth={2} />
        </span>
        <span className="eyebrow">{what}</span>
      </div>

      <p className="display mt-4 text-[20px] leading-[1.3]">{teaser ?? product?.blurb}</p>
      {teaser && product?.blurb && <p className="mt-2 text-[14px] leading-relaxed text-white/60">{product.blurb}</p>}

      <div className="mt-6 grid gap-2.5">
        <Button variant="start" className="w-full" onClick={() => buy(sku)} busy={busy}>
          {busy ? (
            "Opening…"
          ) : (
            <>
              Unlock {product?.name ?? what}
              {product && (
                <>
                  <span aria-hidden className="opacity-50">·</span>
                  <span className="tnum">{formatCents(product.price_cents)}</span>
                </>
              )}
            </>
          )}
        </Button>
        {full && sku !== "full_report" && (
          <button
            onClick={() => buy("full_report")}
            disabled={busy}
            aria-busy={busy || undefined}
            className={`${BTN} border border-white/25 text-white hover:bg-white/10`}
          >
            {busy && <Spinner size={15} label={null} />}
            {LINES.paywallBundleCta}
            <span aria-hidden className="opacity-50">·</span>
            <span className="tnum">{formatCents(full.price_cents)}</span>
          </button>
        )}
      </div>

      <p className="mt-3.5 text-center text-[12px] leading-relaxed text-white/55">
        One payment for the rest of the season. No subscription.
        {!signedIn && " You'll sign in at checkout so your purchase follows you."}
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
