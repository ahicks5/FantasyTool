"use client";
/** The offer: free, a week, the season, the first week free, the guarantee under the price, and the way in. */

import { useEffect, useState } from "react";
import { getHealth, getProducts } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { LEGAL } from "@/lib/legal";
import { offer } from "@/lib/offer";
import type { Product } from "@/lib/types";
import { IconCheck } from "./icons";
import { Eyebrow, LinkButton, Skeleton } from "./ui";
import { LINES, PRICING } from "@/lib/vocab";

function Badge({ p }: { p: Product }) {
  if (p.kind !== "pass") return null;
  const season = p.days == null;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
        season ? "bg-start-fill text-white" : "bg-soft text-muted"
      }`}
    >
      {season ? PRICING.badge.best : PRICING.badge.week}
    </span>
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

  const o = offer(products ?? []);
  // Free and the two passes. The free week is a line above them, not a tier to compare.
  const tiers = (products ?? []).filter((p) => p.kind === "free" || (p.kind === "pass" && p.price_cents > 0));

  return (
    <section id="pricing" className="mt-12 scroll-mt-4">
      <Eyebrow>{PRICING.eyebrow}</Eyebrow>
      <h2 className="display mt-2 text-[34px] leading-[1.02]">
        {o.season ? PRICING.title(formatCents(o.season.price_cents)) : <Skeleton className="inline-block h-8 w-56 align-middle" />}
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

      {o.trial?.days && (
        <div className="card mt-5 flex items-start gap-3 p-4" data-testid="free-week">
          <IconCheck size={16} strokeWidth={3} className="mt-1 shrink-0 text-start" />
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-start">{PRICING.trial.head}</div>
            <p className="mt-1 text-[14px] leading-snug text-ink-2">{PRICING.trial.body(o.trial.days)}</p>
          </div>
        </div>
      )}

      <ul className="mt-5 grid gap-3">
        {tiers.map((p) => {
          const everything = p.kind === "pass" && p.days == null;
          return (
            <li
              key={p.sku}
              className={`card p-5 ${everything ? "border-start shadow-[var(--shadow-lift)] ring-1 ring-start" : ""}`}
            >
              <Badge p={p} />
              {everything && <p className="mt-3 text-[13px] font-bold text-start">{LINES.paywallBundle}</p>}
              <div className={`flex items-baseline justify-between gap-3 ${p.kind === "free" ? "" : "mt-3"}`}>
                <h3 className="display min-w-0 text-[21px] leading-tight">{p.name}</h3>
                <div className="shrink-0 text-right">
                  <div className={`display tnum text-[34px] leading-none ${everything ? "text-start" : ""}`}>{formatCents(p.price_cents)}</div>
                  {p.kind === "pass" && (
                    <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted">{everything ? PRICING.per.season : PRICING.per.week}</div>
                  )}
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

              {everything && o.weeksToSeason > 1 && (
                <p className="mt-4 rounded-xl bg-soft p-3.5 text-[13px] font-bold leading-snug text-ink-2" data-testid="offer-anchor">
                  {PRICING.anchor(o.weeksToSeason)}
                </p>
              )}
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
