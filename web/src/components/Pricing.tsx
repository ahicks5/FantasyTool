"use client";
/** The offer: every tier, the bundle itemised as a stack, the guarantee under the price, and the way in. */

import { useEffect, useState } from "react";
import { getHealth, getProducts } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { LEGAL } from "@/lib/legal";
import { offerStack } from "@/lib/offer";
import type { Product } from "@/lib/types";
import { IconCheck } from "./icons";
import { Eyebrow, LinkButton, Skeleton } from "./ui";
import { LINES, PRICING } from "@/lib/vocab";

function Badge({ sku }: { sku: Product["sku"] }) {
  if (sku === "free") return null;
  if (sku === "full_report")
    return (
      <span className="inline-flex rounded-full bg-start-fill px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
        {PRICING.badge.best}
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-muted">
      {PRICING.badge.alaCarte}
    </span>
  );
}

/**
 * The bundle, itemised. Each line named and priced, the parts added up, then the price:
 * the reader sees what the seven dollars would cost bought one floor at a time. Every
 * figure is the catalog's (`lib/offer.ts`), so this cannot drift from `edge/products.py`.
 */
function Stack({ products }: { products: Product[] }) {
  const s = offerStack(products);
  if (!s || s.apartCents <= s.togetherCents) return null;
  const rows: { name: string; price: string; muted?: boolean }[] = [
    ...s.lines.map((l) => ({ name: l.name, price: formatCents(l.cents) })),
    ...s.onlyHere.map((f) => ({ name: PRICING.unlocks[f], price: PRICING.stack.filmPrice, muted: true })),
  ];
  const slot = products.find((p) => p.kind === "add_on");
  if (s.extraLeagues > 0 && slot) {
    rows.push({ name: PRICING.stack.slots(s.extraLeagues), price: formatCents(s.extraLeagues * slot.price_cents) });
  }
  return (
    <div className="mt-4 rounded-xl bg-soft p-3.5" data-testid="offer-stack">
      <div className="eyebrow">{PRICING.stack.head}</div>
      <ul className="mt-2 grid gap-1.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-baseline justify-between gap-3 text-[13px] leading-snug">
            <span className="min-w-0 text-ink-2">{r.name}</span>
            <span className={`tnum shrink-0 font-bold ${r.muted ? "text-muted" : "text-ink"}`}>{r.price}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-line pt-2.5 text-[13px]">
        <span className="font-bold text-muted">{PRICING.stack.apart}</span>
        <span className="tnum font-black text-muted line-through decoration-2">{formatCents(s.apartCents)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[15px]">
        <span className="font-black text-ink">{PRICING.stack.together}</span>
        <span className="tnum font-black text-start">{formatCents(s.togetherCents)}</span>
      </div>
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

  const bundle = (products ?? []).find((p) => p.kind === "bundle" || p.sku === "full_report");

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
        {/* The league slot is an add-on sold from the account page, not a tier to compare here. */}
        {(products ?? []).filter((p) => p.kind !== "add_on").map((p) => {
          const everything = p.sku === "full_report";
          return (
            <li
              key={p.sku}
              className={`card p-5 ${everything ? "border-start shadow-[var(--shadow-lift)] ring-1 ring-start" : ""}`}
            >
              <Badge sku={p.sku} />
              {everything && <p className="mt-3 text-[13px] font-bold text-start">{LINES.paywallBundle}</p>}
              <div className={`flex items-baseline justify-between gap-3 ${p.sku === "free" ? "" : "mt-3"}`}>
                <h3 className="display min-w-0 text-[21px] leading-tight">{p.name}</h3>
                <div className={`display tnum shrink-0 text-[34px] leading-none ${everything ? "text-start" : ""}`}>
                  {formatCents(p.price_cents)}
                </div>
              </div>
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
          [0, 1, 2, 3].map((i) => (
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
