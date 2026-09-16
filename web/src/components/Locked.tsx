"use client";
import { useState } from "react";
import { checkout } from "@/lib/api";
import { formatCents } from "@/lib/format";
import type { Product, Sku } from "@/lib/types";
import { PRODUCTS } from "@/lib/mocks";
import { Button } from "./ui";

/** Locked state for a paid feature. Buy button calls POST /api/checkout. */
export function Locked({ sku, what, onUnlocked }: { sku: Sku; what: string; onUnlocked?: () => void }) {
  const [busy, setBusy] = useState(false);
  const product: Product | undefined = PRODUCTS.find((p) => p.sku === sku);
  const full = PRODUCTS.find((p) => p.sku === "full_report");

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
    <div className="rounded-xl border-2 border-dashed border-line p-5 text-center">
      <div className="mb-1 text-3xl" aria-hidden>
        🔒
      </div>
      <h2 className="text-lg font-bold">{what} is locked</h2>
      <p className="mx-auto mb-5 mt-1 max-w-xs text-sm text-muted">{product?.blurb}</p>
      <div className="flex flex-col gap-2">
        <Button onClick={() => buy(sku)} disabled={busy}>
          Unlock {product?.name} · {product ? formatCents(product.price_cents) : ""}
        </Button>
        {full && sku !== "full_report" && (
          <Button variant="secondary" onClick={() => buy("full_report")} disabled={busy}>
            Or get everything · {formatCents(full.price_cents)}
          </Button>
        )}
      </div>
    </div>
  );
}
