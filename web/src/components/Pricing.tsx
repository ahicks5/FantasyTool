"use client";
import { useEffect, useState } from "react";
import { getProducts } from "@/lib/api";
import { formatCents } from "@/lib/format";
import type { Feature, Product } from "@/lib/types";
import { IconCheck } from "./icons";
import { Eyebrow, LinkButton, Skeleton } from "./ui";

/** What each entitlement actually buys, in the user's words rather than the API's. */
const UNLOCKS: Record<Feature, string> = {
  my_team: "Start/sit calls with confidence",
  waivers: "Waiver plan, FAAB bid and the drop",
  trade_lab: "Trade verdicts and counteroffers",
  full_report: "The full weekly report",
};

function Badge({ sku }: { sku: Product["sku"] }) {
  if (sku === "free") return null;
  if (sku === "full_report")
    return (
      <span className="inline-flex rounded-full bg-start px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
        Best value
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-muted">
      À la carte
    </span>
  );
}

export function Pricing() {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    getProducts()
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
  }, []);

  return (
    <section id="pricing" className="mt-12 scroll-mt-4">
      <Eyebrow>Pricing</Eyebrow>
      <h2 className="display mt-2 text-[30px] leading-[1.05]">Pay for the piece you need</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        One payment, rest of the season. No subscription, no auto-renew.
      </p>

      <ul className="mt-5 grid gap-3">
        {(products ?? []).map((p) => {
          const everything = p.sku === "full_report";
          return (
            <li
              key={p.sku}
              className={`card p-5 ${everything ? "border-start shadow-[var(--shadow-lift)] ring-1 ring-start" : ""}`}
            >
              <Badge sku={p.sku} />
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
                    <span>{UNLOCKS[f]}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2.5 text-[14px] leading-snug text-muted">
                  <IconCheck size={15} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                  <span>
                    <span className="tnum font-bold text-ink">{p.leagues}</span> league{p.leagues > 1 ? "s" : ""}
                  </span>
                </li>
              </ul>
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

      <div className="mt-6">
        <LinkButton href="/connect" variant="start" className="w-full">
          Connect your league
        </LinkButton>
        <p className="mt-2.5 text-center text-[12px] text-muted">
          Start free on one team. Pay only when you want the rest.
        </p>
      </div>
    </section>
  );
}
