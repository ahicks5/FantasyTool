"use client";
import { useEffect, useState } from "react";
import { checkout, getProducts } from "@/lib/api";
import { formatCents } from "@/lib/format";
import type { Product, Sku } from "@/lib/types";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { Button, Eyebrow } from "./ui";

/**
 * Premium teaser, not a wall: says what Edge found, then offers the pass or the bundle.
 * `teaser` should be a concrete, name-free sentence from the engine.
 */
export function Locked({ sku, what, teaser, onUnlocked }: { sku: Sku; what: string; teaser?: string | null; onUnlocked?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  useEffect(() => {
    getProducts().then((r) => r.products.length && setProducts(r.products)).catch(() => undefined);
  }, []);
  const product = products.find((p) => p.sku === sku);
  const full = products.find((p) => p.sku === "full_report");

  async function buy(s: Sku) {
    setBusy(true);
    try {
      const { url } = await checkout(s);
      if (url) window.location.href = url;
      else onUnlocked?.();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="bg-ink p-5 text-white">
        <Eyebrow className="text-white/60">{what}</Eyebrow>
        <p className="display mt-1 text-xl font-extrabold leading-snug">{teaser ?? product?.blurb}</p>
      </div>
      <div className="grid gap-2 p-4">
        <Button variant="start" onClick={() => buy(sku)} disabled={busy}>
          Unlock {product?.name} · {product ? formatCents(product.price_cents) : ""}
        </Button>
        {full && sku !== "full_report" && (
          <Button variant="secondary" onClick={() => buy("full_report")} disabled={busy}>
            Or get everything · {formatCents(full.price_cents)}
          </Button>
        )}
        <p className="text-center text-xs text-muted">One payment for the rest of the season. No subscription.</p>
      </div>
    </div>
  );
}
