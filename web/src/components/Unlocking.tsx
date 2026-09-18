"use client";
import { useEffect, useRef, useState } from "react";
import { getMe, getProducts } from "@/lib/api";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { featuresForSku, paidSkuFromSearch, urlWithoutPurchaseParams, waitForFeatures } from "@/lib/unlock";
import type { Product, Sku } from "@/lib/types";
import { IconCheck, IconLock } from "./icons";

const SKUS: readonly string[] = ["waivers", "trade_lab", "full_report"];

/** Where to send someone whose payment cleared but whose unlock did not arrive. */
const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";

type Phase =
  | { phase: "idle" }
  | { phase: "waiting"; sku: Sku }
  | { phase: "done"; sku: Sku; name: string }
  | { phase: "failed"; sku: Sku; reason: "timeout" | "error" };

/**
 * Handles the moment Stripe sends a buyer back.
 *
 * The entitlement is written by the webhook, which is a different request than the
 * redirect and regularly loses the race to it, so arriving on a locked page is the
 * normal case rather than the exception. This waits for the grant and says so, then
 * refreshes the session that gates the page.
 */
export function useUnlockOnReturn(onUnlocked: () => void): Phase {
  const [state, setState] = useState<Phase>({ phase: "idle" });
  // Kept in a ref so a new callback identity each render cannot restart the wait.
  const refresh = useRef(onUnlocked);
  useEffect(() => {
    refresh.current = onUnlocked;
  }, [onUnlocked]);

  useEffect(() => {
    const sku = paidSkuFromSearch(window.location.search, SKUS);
    if (!sku) return;
    // Drop the params before waiting: a refresh mid-wait should not start a second one,
    // and the buyer should not be able to share a URL that fakes a purchase screen.
    window.history.replaceState({}, "", urlWithoutPurchaseParams(window.location.href));

    let alive = true;
    void (async () => {
      setState({ phase: "waiting", sku });
      let products: Product[] = FALLBACK;
      try {
        const r = await getProducts();
        if (r.products.length) products = r.products;
      } catch {
        /* the fallback list is enough to know what this sku grants */
      }
      const outcome = await waitForFeatures(getMe, featuresForSku(products, sku));
      if (!alive) return;
      if (outcome.ok) {
        setState({ phase: "done", sku, name: products.find((p) => p.sku === sku)?.name ?? "Your pass" });
        refresh.current();
      } else {
        setState({ phase: "failed", sku, reason: outcome.reason });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The confirmation is a receipt, not a permanent fixture.
  useEffect(() => {
    if (state.phase !== "done") return;
    const t = setTimeout(() => setState({ phase: "idle" }), 6000);
    return () => clearTimeout(t);
  }, [state.phase]);

  return state;
}

export function UnlockingBanner({ state }: { state: Phase }) {
  if (state.phase === "idle") return null;

  if (state.phase === "waiting") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-soft px-4 py-3"
      >
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line-2 border-t-ink"
        />
        <span className="text-[14px] font-bold">Payment received. Unlocking your pass…</span>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 flex items-center gap-3 rounded-xl border border-start bg-start-soft px-4 py-3"
      >
        <span aria-hidden className="text-start">
          <IconCheck size={18} strokeWidth={2.4} />
        </span>
        <span className="text-[14px] font-bold">{state.name} unlocked. It is yours for the rest of the season.</span>
      </div>
    );
  }

  return (
    <div role="alert" className="mb-4 rounded-xl border border-line bg-soft px-4 py-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-muted">
          <IconLock size={18} strokeWidth={2.2} />
        </span>
        <span className="text-[14px] font-bold">Your payment went through, but the unlock has not landed yet.</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        It usually arrives within a minute. Reload the page to check again
        {SUPPORT ? (
          <>
            , or email <a className="underline" href={`mailto:${SUPPORT}`}>{SUPPORT}</a> and we will sort it out
          </>
        ) : null}
        . You have not been charged twice.
      </p>
    </div>
  );
}
