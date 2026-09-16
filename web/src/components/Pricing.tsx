"use client";
import { useEffect, useState } from "react";
import { getProducts } from "@/lib/api";
import { formatCents } from "@/lib/format";
import type { Product } from "@/lib/types";
import { LinkButton } from "./ui";

export function Pricing() {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    getProducts().then((r) => setProducts(r.products)).catch(() => setProducts([]));
  }, []);

  return (
    <section id="pricing" className="mt-12">
      <h2 className="text-2xl font-black">Pay for the piece you need</h2>
      <p className="mt-1 text-muted">One payment, rest of the season. No subscription.</p>
      <ul className="mt-5 grid gap-3">
        {(products ?? []).map((p) => {
          const everything = p.sku === "full_report";
          return (
            <li key={p.sku} className={`card flex items-center gap-4 p-4 ${everything ? "border-2 border-start bg-start-soft" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="display text-lg font-extrabold">{p.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${everything ? "bg-start text-white" : "bg-soft text-muted"}`}>
                    {p.sku === "free" ? "free" : everything ? "best value" : "à la carte"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted">{p.blurb}</p>
                <p className="mt-1 text-xs text-muted">
                  {p.leagues} league{p.leagues > 1 ? "s" : ""}
                </p>
              </div>
              <span className="display shrink-0 text-3xl font-black tabular-nums">{formatCents(p.price_cents)}</span>
            </li>
          );
        })}
        {products === null && <li className="skeleton h-20" />}
      </ul>
      <div className="mt-6">
        <LinkButton href="/connect" variant="start" className="w-full">
          Connect your league
        </LinkButton>
      </div>
    </section>
  );
}
