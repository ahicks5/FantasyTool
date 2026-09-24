"use client";
/**
 * The two popups every room can raise: sign in, and upgrade. One provider in the root
 * layout; any page calls `useAccountGate().signIn()` or `.upgrade(sku)` and gets a promise
 * that says whether the visitor went through with it. The sign-in check asks the API, not
 * the browser, so a dead token reads as signed out.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProducts, upgrade as upgradeCall } from "@/lib/api";
import { offersFor } from "@/lib/account";
import { formatCents } from "@/lib/format";
import { currentMe, useSession } from "@/lib/session";
import type { Me, Product, Sku } from "@/lib/types";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { IconCheck, IconLock, IconX } from "@/components/icons";
import { Button } from "@/components/ui";
import { ACCOUNT } from "@/lib/vocab";
import { AuthForm, type AuthMode } from "./AuthForm";

type Reason = keyof typeof ACCOUNT.reason;

export interface UpgradeOptions {
  /** The room this is for, e.g. "Wire Pass": becomes the sheet's eyebrow. */
  what?: string;
  /** Where a Stripe checkout should return to. Defaults to the current page. */
  returnTo?: string;
}

export interface GateApi {
  /** Resolves true once signed in (already, or just now); false if the sheet was dismissed. */
  signIn: (reason?: Reason) => Promise<boolean>;
  /** Signs in first if needed, then offers the pass. Resolves true once the grant has landed. */
  upgrade: (sku: Sku, options?: UpgradeOptions) => Promise<boolean>;
}

type State = { kind: "signin"; reason: Reason } | { kind: "upgrade"; sku: Sku; what?: string; returnTo?: string } | null;

const Ctx = createContext<GateApi | null>(null);

/** Without a provider (a page outside the root layout, a test), the door is the /login page. */
export function useAccountGate(): GateApi {
  const api = useContext(Ctx);
  const router = useRouter();
  return useMemo(
    () =>
      api ?? {
        signIn: async () => {
          const me = await currentMe();
          if (me?.signed_in) return true;
          router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return false;
        },
        upgrade: async () => {
          router.push("/account");
          return false;
        },
      },
    [api, router],
  );
}

export function AccountGateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null);
  // The caller's promise, kept outside render: it is written when a sheet opens (an event)
  // and read when it closes (another event), never while painting.
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const close = useCallback((ok: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setState(null);
    resolve?.(ok);
  }, []);

  const open = useCallback((next: NonNullable<State>) => {
    // A second ask while one sheet is up closes the first as declined.
    pending.current?.(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setState(next);
    });
  }, []);

  const signIn = useCallback(
    async (reason: Reason = "account") => {
      const me = await currentMe();
      if (me?.signed_in) return true;
      return open({ kind: "signin", reason });
    },
    [open],
  );

  const upgrade = useCallback(
    async (sku: Sku, options: UpgradeOptions = {}) => {
      const ok = await signIn("upgrade");
      if (!ok) return false;
      return open({ kind: "upgrade", sku, what: options.what, returnTo: options.returnTo });
    },
    [signIn, open],
  );

  const api = useMemo(() => ({ signIn, upgrade }), [signIn, upgrade]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {state?.kind === "signin" && <SignInSheet reason={state.reason} onClose={() => close(false)} onDone={() => close(true)} />}
      {state?.kind === "upgrade" && (
        <UpgradeSheet sku={state.sku} what={state.what} returnTo={state.returnTo} onClose={() => close(false)} onDone={() => close(true)} />
      )}
    </Ctx.Provider>
  );
}

/**
 * The popup itself: a bottom sheet on a phone, a centred card above it. Solid from the
 * first frame; the page under it is dimmed and blurred. Escape and the backdrop close it.
 */
export function Popup({ title, eyebrow, onClose, children, testId }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode; testId?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
      <button aria-label={ACCOUNT.upgrade.close} onClick={onClose} className="absolute inset-0 min-h-0 bg-black/55 backdrop-blur-[3px]" />
      <div className="popup rise relative w-full max-w-md overflow-hidden rounded-t-[28px] bg-paper shadow-[var(--shadow-lift)] sm:rounded-[28px]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-2 sm:hidden" />
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 className="display mt-1 text-[24px] leading-tight">{title}</h2>
          </div>
          <button onClick={onClose} aria-label={ACCOUNT.upgrade.close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink">
            <IconX size={18} strokeWidth={2.4} />
          </button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-2">{children}</div>
      </div>
    </div>
  );
}

function SignInSheet({ reason, onClose, onDone }: { reason: Reason; onClose: () => void; onDone: (me: Me) => void }) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const title = mode === "register" ? ACCOUNT.register : mode === "forgot" ? ACCOUNT.reset.title : ACCOUNT.signIn;
  return (
    <Popup title={title} eyebrow={ACCOUNT.eyebrow} onClose={onClose} testId="signin-sheet">
      <p className="mb-4 text-[14px] leading-relaxed text-muted">{mode === "forgot" ? ACCOUNT.reset.lead : ACCOUNT.reason[reason]}</p>
      <AuthForm mode={mode} onMode={setMode} onDone={onDone} />
    </Popup>
  );
}

function UpgradeSheet({ sku, what, returnTo, onClose, onDone }: { sku: Sku; what?: string; returnTo?: string; onClose: () => void; onDone: () => void }) {
  const session = useSession();
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  const [busy, setBusy] = useState<Sku | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getProducts().then((r) => r.products.length && setProducts(r.products)).catch(() => undefined);
  }, []);
  const offers = offersFor(products, sku);
  const checkout = !!session.me?.checkout;

  async function buy(offer: Product) {
    setBusy(offer.sku);
    setError(null);
    try {
      const out = await upgradeCall(offer.sku, returnTo ?? (typeof window === "undefined" ? undefined : window.location.pathname));
      if (out.url) {
        // Stripe: the page leaves; the app shell waits for the grant when the buyer returns.
        window.location.assign(out.url);
        return;
      }
      session.refresh();
      setDone(offer.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Popup title={done ? ACCOUNT.upgrade.done : ACCOUNT.upgrade.title} eyebrow={what ? ACCOUNT.upgrade.for(what) : ACCOUNT.eyebrow} onClose={done ? onDone : onClose} testId="upgrade-sheet">
      {done ? (
        <div className="grid gap-4" data-upgrade="done">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-start-soft text-start">
            <IconCheck size={24} strokeWidth={2.6} />
          </span>
          <p className="text-[15px] leading-relaxed text-ink">
            <span className="font-bold">{done}</span> is on your account.
          </p>
          <Button variant="start" className="w-full" onClick={onDone}>
            {ACCOUNT.upgrade.close}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-[14px] leading-relaxed text-muted">{sku === "league_slot" ? ACCOUNT.upgrade.slotLead : ACCOUNT.upgrade.lead}</p>
          {!checkout && <p className="rounded-xl bg-start-soft px-3.5 py-2.5 text-[13px] font-bold leading-snug text-start">{ACCOUNT.upgrade.comp}</p>}
          <ul className="grid gap-2.5">
            {offers.map((o, i) => (
              <li key={o.sku} className={`card p-4 ${i === 0 ? "border-start ring-1 ring-start" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="display text-[19px] leading-tight">{o.name}</span>
                  <span className="display tnum text-[24px] leading-none">{formatCents(o.price_cents)}</span>
                </div>
                <p className="mt-1 text-[13px] leading-snug text-muted">{o.blurb}</p>
                <Button variant={i === 0 ? "start" : "secondary"} className="mt-3 w-full" busy={busy === o.sku} disabled={!!busy && busy !== o.sku} onClick={() => buy(o)}>
                  {busy === o.sku ? ACCOUNT.upgrade.busy : ACCOUNT.upgrade.get(o.name)}
                </Button>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="rounded-xl bg-sit-soft px-3.5 py-2.5 text-[13px] text-sit">
              {error}
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
            <IconLock size={12} strokeWidth={2.4} />
            {checkout ? "Paid through Stripe. One payment, no subscription." : "Nothing is charged today."}
          </p>
        </div>
      )}
    </Popup>
  );
}
