"use client";
/** The offer: free, a week or the season, the season anchored against paying week to week, the guarantee under the price, and the way in. */

import { useEffect, useState } from "react";
import { getHealth, getProducts } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { LEGAL } from "@/lib/legal";
import { offerStack, productName } from "@/lib/offer";
import type { Product } from "@/lib/types";
import { IconCheck } from "./icons";
import { Eyebrow, LinkButton, Skeleton } from "./ui";
import { LINES, PRICING } from "@/lib/vocab";

function Badge({ sku }: { sku: Product["sku"] }) {
  if (sku === "full_report")
    return (
      <span className="inline-flex rounded-full bg-start-fill px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
        {PRICING.badge.best}
      </span>
    );
  if (sku === "week_pass")
    return (
      <span className="inline-flex rounded-full bg-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-muted">
        {PRICING.badge.flex}
      </span>
    );
  return null;
}

/**
 * The season against the week. The rest of the way bought week to week, struck through,
 * then the season's one price, then how many weeks that is. Every figure is the catalog's
 * (`lib/offer.ts`), so this cannot drift from `edge/products.py`.
 */
function Stack({ products }: { products: Product[] }) {
  const s = offerStack(products);
  if (!s) return null;
  const anchored = s.weeksLeft !== null && s.weeklyCents !== null && s.weeksLeft > 0 && s.weeklyCents > s.seasonCents;
  return (
    <div className="mt-4 rounded-xl bg-soft p-3.5" data-testid="offer-stack">
      <div className="eyebrow">{PRICING.stack.head}</div>
      {anchored && (
        <div className="mt-2 flex items-baseline justify-between gap-3 text-[13px]">
          <span className="min-w-0 font-bold text-muted">{PRICING.stack.weekly(s.weeksLeft!)}</span>
          <span className="tnum shrink-0 font-black text-muted line-through decoration-2">{formatCents(s.weeklyCents!)}</span>
        </div>
      )}
      <div className={`flex items-baseline justify-between gap-3 text-[15px] ${anchored ? "" : "mt-2"}`}>
        <span className="font-black text-ink">{PRICING.stack.season}</span>
        <span className="tnum font-black text-start">{formatCents(s.seasonCents)}</span>
      </div>
      <p className="mt-2.5 border-t border-line pt-2.5 text-[13px] leading-snug text-ink-2">{PRICING.stack.even(s.evenWeeks)}</p>
    </div>
  );
}

export function Pricing() {
  const [products, setProducts] = useState<Product[] | null>(null);
  // Null until the API answers, and false on any failure: a launch-week line that shows
  // because a request timed out would be a promise the upgrade sheet cannot keep.
  const [registerOpen, setRegisterOpen] = useState<boolean | null>(null);
  useEffect(() => {
    getProducts()
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
    getHealth()
      .then((h) => setRegisterOpen(h.stripe))
      .catch(() => setRegisterOpen(true));
  }, []);

  // The season pass: its price is the headline.
  const bundle = (products ?? []).find((p) => p.sku === "full_report");

  return (
    <section id="pricing" className="mt-12 scroll-mt-4">
      <Eyebrow>{PRICING.eyebrow}</Eyebrow>
      <h2 className="display mt-2 text-[34px] leading-[1.02]">
        {bundle ? PRICING.title(formatCents(bundle.price_cents)) : <Skeleton className="inline-block h-8 w-56 align-middle" />}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{PRICING.lead}</p>

      {/* Shown only while the API says there is no card reader. The upgrade sheet makes the
          same grant, so this is a fact about today rather than a promise about launch. */}
      {registerOpen === false && (
        <div className="card mt-5 flex items-start gap-3 border-start p-4 ring-1 ring-start" data-testid="launch-week">
          <span className="lamp mt-1.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-start">{PRICING.launch.head}</div>
            <p className="mt-1 text-[14px] leading-snug text-ink-2">{PRICING.launch.body}</p>
          </div>
        </div>
      )}

      <ul className="mt-5 grid gap-3">
        {/* Three choices: free, a week, the season. The league slot is an add-on sold where
            the cap is hit, not a tier to compare here. */}
        {(products ?? []).filter((p) => p.kind !== "add_on").map((p) => {
          const everything = p.sku === "full_report";
          const term = (PRICING.term as Record<string, string>)[p.sku];
          return (
            <li
              key={p.sku}
              className={`card p-5 ${everything ? "border-start shadow-[var(--shadow-lift)] ring-1 ring-start" : ""}`}
            >
              <Badge sku={p.sku} />
              {everything && <p className="mt-3 text-[13px] font-bold text-start">{LINES.paywallBundle}</p>}
              <div className={`flex items-baseline justify-between gap-3 ${p.sku === "free" ? "" : "mt-3"}`}>
                <h3 className="display min-w-0 text-[21px] leading-tight">{productName(p)}</h3>
                <div className={`display tnum shrink-0 text-[34px] leading-none ${everything ? "text-start" : ""}`} data-testid={`price-${p.sku}`}>
                  {formatCents(p.price_cents)}
                  {p.recurring && <span className="text-[15px] text-muted">{PRICING.per[p.recurring]}</span>}
                </div>
              </div>
              {term && <p className="mt-1 text-[13px] font-bold leading-snug text-ink-2">{term}</p>}
              <p className="mt-1.5 text-[13px] leading-snug text-muted">{p.blurb}</p>

              <ul className="mt-4 grid gap-2 border-t border-line pt-4">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] leading-snug">
                    <IconCheck size={15} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                    <span>{PRICING.unlocks[f]}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2.5 text-[14px] leading-snug text-muted">
                  <IconCheck size={15} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                  <span className="tnum">{PRICING.leagues(p.leagues)}</span>
                </li>
              </ul>

              {everything && products && <Stack products={products} />}
            </li>
          );
        })}

        {products === null &&
          [0, 1, 2].map((i) => (
            <li key={i} className="card p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-3 w-48" />
              <Skeleton className="mt-5 h-3 w-40" />
            </li>
          ))}
      </ul>

      {/* The guarantee goes directly under the price, said the way the terms say it. */}
      <div className="card mt-3 p-5" data-testid="guarantee">
        <Eyebrow>{PRICING.guarantee.head}</Eyebrow>
        <p className="display mt-2 text-[19px] leading-snug">{PRICING.guarantee.body(LEGAL.refundDays)}</p>
      </div>

      <div className="mt-6">
        <LinkButton href="/register" variant="start" className="w-full">
          {PRICING.cta}
        </LinkButton>
        <p className="mt-2.5 text-center text-[12px] text-muted">{PRICING.under}</p>
      </div>
    </section>
  );
}
