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
      <h2 className="text-2xl font-black tracking-tight">Pay for the week you need</h2>
      <p className="mt-1 text-muted">No subscription. Buy the piece you want for the rest of the season.</p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {(products ?? []).map((p) => {
          const everything = p.sku === "full_report";
          return (
            <li
              key={p.sku}
              className={`flex flex-col rounded-xl border p-4 ${everything ? "border-2 border-start bg-start-soft" : "border-line"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold">{p.name}</span>
                <span className="text-2xl font-black">{formatCents(p.price_cents)}</span>
              </div>
              <span className={`mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-bold uppercase ${everything ? "bg-start text-white" : "bg-soft text-muted"}`}>
                {p.sku === "free" ? "free" : everything ? "everything" : "à la carte"}
              </span>
              <p className="mt-2 flex-1 text-sm">{p.blurb}</p>
              <p className="mt-2 text-xs text-muted">
                {p.leagues} league{p.leagues > 1 ? "s" : ""} · {p.features.join(", ").replaceAll("_", " ")}
              </p>
            </li>
          );
        })}
        {products === null && <li className="text-muted">Loading prices…</li>}
      </ul>
      <div className="mt-6">
        <LinkButton href="/connect" className="w-full">
          Connect your league
        </LinkButton>
      </div>
    </section>
  );
}
