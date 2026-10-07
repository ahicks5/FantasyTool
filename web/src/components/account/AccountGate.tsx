"use client";
/**
 * The two popups every room can raise: sign in, and upgrade. One provider in the root
 * layout; any page calls `useAccountGate().signIn()` or `.upgrade(sku)` and gets a promise
 * that says whether the visitor went through with it. The sign-in check asks the API, not
 * the browser, so a dead token reads as signed out.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkPromo, getProducts, upgrade as upgradeCall } from "@/lib/api";
import { offersFor } from "@/lib/account";
import { offerStack, priceLabel, productName } from "@/lib/offer";
import { formatCents } from "@/lib/format";
import { currentMe, useSession } from "@/lib/session";
import { onAuthChange } from "@/lib/auth";
import type { Me, Product, Sku } from "@/lib/types";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { IconCheck, IconLock, IconX } from "@/components/icons";
import { Button } from "@/components/ui";
import { ACCOUNT, ONBOARD } from "@/lib/vocab";
import { chargeDate, dayLabel } from "@/lib/onboarding";
import { AuthForm, type AuthMode } from "./AuthForm";

type Reason = keyof typeof ACCOUNT.reason;

export interface UpgradeOptions {
  /** The room this is for, e.g. "Trade Lab": becomes the sheet's eyebrow. */
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

  // Signed in from another tab while this one had the sheet up: the sheet has done its job.
  const asking = state?.kind === "signin";
  useEffect(() => {
    if (!asking) return;
    // Cancelled once this sheet closes, so a late answer can never shut the sheet after it
    // (the sheet's own sign-in closes it first and may open the upgrade straight away).
    let live = true;
    const off = onAuthChange(() => {
      void currentMe().then((me) => {
        if (live && me?.signed_in) close(true);
      });
    });
    return () => {
      live = false;
      off();
    };
  }, [asking, close]);

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
  const router = useRouter();
  const [mode, setModeRaw] = useState<AuthMode>("signin");
  // "Create account" leaves the sheet for the sign-up walk, and comes back here after it.
  const setMode = (m: AuthMode) => {
    if (m !== "register") return setModeRaw(m);
    onClose();
    router.push(`/register?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  };
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
  // The pass choice is a pitch, not a list: the season is the headline and carries the
  // deal, the week is the smaller way in underneath (Andrew, 2026-09-27).
  const season = offers.find((o) => o.sku === "full_report");
  const week = offers.find((o) => o.sku === "week_pass");
  const stack = season && week ? offerStack(products) : null;
  // The API prices the season per account: a live paid week brings it down. The page only
  // shows that number; the checkout charges what the server computes, never this.
  // A promo code, once the API has said it works: the price it makes, and the code to send.
  const [promo, setPromo] = useState<{ code: string; pct: number; cents: number } | null>(null);
  const accountCents = season ? (session.me?.season_price_cents ?? season.price_cents) : 0;
  const seasonCents = promo ? Math.min(promo.cents, accountCents) : accountCents;
  const credited = !promo && !!season && seasonCents < season.price_cents;
  const saving = !promo && !credited && stack?.weeklyCents != null && stack.weeklyCents > stack.seasonCents;
  // The free first week, while this account still has it: applied for them, on either pass,
  // and it takes nothing off a price, so it gives way to a discount code (they never stack).
  const [trialOff, setTrialOff] = useState(false);
  const trial = !!session.me?.trial_eligible && !trialOff && !promo;
  const trialDate = dayLabel(chargeDate(new Date(), session.me?.trial_days ?? 7));

  async function buy(offer: Product) {
    setBusy(offer.sku);
    setError(null);
    try {
      const code = trial ? "FREEWEEK" : offer.sku === "full_report" ? promo?.code : undefined;
      const out = await upgradeCall(offer.sku, returnTo ?? (typeof window === "undefined" ? undefined : window.location.pathname), code);
      if (out.url) {
        // Stripe: the page leaves; the app shell waits for the grant when the buyer returns.
        window.location.assign(out.url);
        return;
      }
      session.refresh();
      setDone(productName(offer));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Popup title={done ? ACCOUNT.upgrade.done : season ? ACCOUNT.upgrade.passTitle : sku === "league_slot" ? ACCOUNT.leagues.addSlot : ACCOUNT.upgrade.title} eyebrow={what ? ACCOUNT.upgrade.for(what) : ACCOUNT.eyebrow} onClose={done ? onDone : onClose} testId="upgrade-sheet">
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
      ) : season ? (
        <div className="grid gap-3" data-upgrade="passes">
          {!checkout && <p className="rounded-xl bg-start-soft px-3.5 py-2.5 text-[13px] font-bold leading-snug text-start">{ACCOUNT.upgrade.comp}</p>}
          {trial && (
            <div className="flex items-center justify-between gap-3" data-testid="sheet-freeweek">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-start-fill px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white">
                <IconCheck size={12} strokeWidth={3.4} />
                {ONBOARD.offer.applied("FREEWEEK")}
              </span>
              <button type="button" onClick={() => setTrialOff(true)} className="min-h-11 text-[12px] font-bold text-muted underline underline-offset-4">
                {ONBOARD.offer.remove}
              </button>
            </div>
          )}
          <div className="hero p-5" data-testid="season-offer">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">{ACCOUNT.upgrade.seasonHead}</span>
              {(promo || credited || saving) && (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-start-fill px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white">
                  {promo
                    ? ACCOUNT.upgrade.promo.badge(promo.code)
                    : credited
                      ? ACCOUNT.upgrade.weekCounts
                      : ACCOUNT.upgrade.save(formatCents((stack?.weeklyCents ?? 0) - (stack?.seasonCents ?? 0)))}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-end gap-3">
              <span className="display tnum text-[52px] leading-none" data-testid="season-price">{formatCents(seasonCents)}</span>
              {(promo || credited || saving) && (
                <span className="tnum mb-1.5 text-[20px] font-bold text-white/45 line-through">
                  {formatCents(promo || credited ? season.price_cents : (stack?.weeklyCents ?? 0))}
                </span>
              )}
            </div>
            {promo ? (
              <p className="mt-1.5 text-[13px] text-white/60">{ACCOUNT.upgrade.promo.line(promo.code, formatCents(season.price_cents - seasonCents))}</p>
            ) : credited ? (
              <p className="mt-1.5 text-[13px] text-white/60">{ACCOUNT.upgrade.weekCountsLine}</p>
            ) : (
              saving &&
              stack?.weeksLeft != null && (
                <p className="mt-1.5 text-[13px] text-white/60">{ACCOUNT.upgrade.vsWeekly(stack.weeksLeft, formatCents(stack.weeklyCents ?? 0))}</p>
              )
            )}
            {trial && <p className="tnum mt-1.5 text-[13px] font-bold text-white/80">{ONBOARD.offer.season.line(formatCents(seasonCents), trialDate)}</p>}
            <p className="mt-3 text-[15px] leading-snug text-white/85">{ACCOUNT.upgrade.seasonSub}</p>
            <Button variant="start" className="mt-4 w-full" busy={busy === season.sku} disabled={!!busy && busy !== season.sku} onClick={() => buy(season)}>
              {busy === season.sku ? ACCOUNT.upgrade.busy : ACCOUNT.upgrade.takeSeason}
            </Button>
            <PromoField applied={promo?.code ?? null} onApplied={setPromo} />
          </div>
          {/* A live week holder is buying the season from their week; offering the week again is noise. */}
          {week && !credited && (
            <>
              <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                {ACCOUNT.upgrade.or}
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="card flex items-center gap-3 p-4" data-testid="week-offer">
                <span className="min-w-0 flex-1">
                  <span className="display block text-[16px] leading-tight">{ACCOUNT.upgrade.weekHead}</span>
                  <span className="tnum mt-0.5 block text-[14px] font-bold text-ink-2">{trial ? ONBOARD.offer.week.line(formatCents(week.price_cents), trialDate) : priceLabel(week)}</span>
                  <span className="mt-0.5 block text-[12px] text-muted">{ACCOUNT.upgrade.weekSub}</span>
                </span>
                <Button size="sm" variant="secondary" busy={busy === week.sku} disabled={!!busy && busy !== week.sku} onClick={() => buy(week)}>
                  {busy === week.sku ? ACCOUNT.upgrade.busy : ACCOUNT.upgrade.takeWeek}
                </Button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-sit-soft px-3.5 py-2.5 text-[13px] text-sit">
              {error}
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
            <IconLock size={12} strokeWidth={2.4} />
            {checkout ? ACCOUNT.upgrade.stripe : ACCOUNT.upgrade.noCharge}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {/* A slot's own card already says what it is; a lead line over it said it twice (W-051). */}
          {sku !== "league_slot" && <p className="text-[14px] leading-relaxed text-muted">{ACCOUNT.upgrade.lead}</p>}
          {!checkout && <p className="rounded-xl bg-start-soft px-3.5 py-2.5 text-[13px] font-bold leading-snug text-start">{ACCOUNT.upgrade.comp}</p>}
          <ul className="grid gap-2.5">
            {offers.map((o, i) => (
              <li key={o.sku} className={`card p-4 ${i === 0 ? "border-start ring-1 ring-start" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="display text-[19px] leading-tight">{productName(o)}</span>
                  <span className="display tnum text-[24px] leading-none">{priceLabel(o)}</span>
                </div>
                <p className="mt-1 text-[13px] leading-snug text-muted">{o.blurb}</p>
                <Button variant={i === 0 ? "start" : "secondary"} className="mt-3 w-full" busy={busy === o.sku} disabled={!!busy && busy !== o.sku} onClick={() => buy(o)}>
                  {busy === o.sku ? ACCOUNT.upgrade.busy : o.sku === "league_slot" ? ACCOUNT.upgrade.getSlot(priceLabel(o)) : ACCOUNT.upgrade.get(productName(o))}
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
            {checkout ? (sku === "league_slot" ? ACCOUNT.upgrade.stripeSlot : ACCOUNT.upgrade.stripe) : ACCOUNT.upgrade.noCharge}
          </p>
        </div>
      )}
    </Popup>
  );
}

/** "Have a code?" under the season offer. The API checks the code and prices it for this
 * account; the checkout prices it again, so nothing typed here can set what is charged. */
function PromoField({ applied, onApplied }: { applied: string | null; onApplied: (p: { code: string; pct: number; cents: number } | null) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [bad, setBad] = useState(false);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setBad(false);
    try {
      const r = await checkPromo(code.trim(), "full_report");
      if (r.ok && r.code && r.price_cents != null) onApplied({ code: r.code, pct: r.percent_off, cents: r.price_cents });
      else setBad(true);
    } catch {
      setBad(true);
    } finally {
      setChecking(false);
    }
  }

  if (applied) {
    return (
      <button type="button" className="mt-3 w-full text-center text-[12px] font-bold text-white/60 underline underline-offset-2 hover:text-white" onClick={() => { onApplied(null); setCode(""); }}>
        {ACCOUNT.upgrade.promo.remove} {applied}
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" data-testid="promo-open" className="mt-3 w-full text-center text-[12px] font-bold text-white/60 underline underline-offset-2 hover:text-white" onClick={() => setOpen(true)}>
        {ACCOUNT.upgrade.promo.open}
      </button>
    );
  }
  return (
    <form className="mt-3 grid gap-1.5" onSubmit={apply} data-testid="promo-form">
      <div className="flex gap-2">
        <input
          aria-label={ACCOUNT.upgrade.promo.label}
          placeholder={ACCOUNT.upgrade.promo.placeholder}
          value={code}
          onChange={(e) => { setCode(e.target.value); setBad(false); }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 text-[15px] font-bold uppercase tracking-wider text-white placeholder:normal-case placeholder:tracking-normal placeholder:text-white/40 focus:border-white/50 focus:outline-none"
        />
        <Button type="submit" size="sm" variant="secondary" busy={checking} disabled={checking || !code.trim()}>
          {checking ? ACCOUNT.upgrade.promo.checking : ACCOUNT.upgrade.promo.apply}
        </Button>
      </div>
      {bad && <p role="alert" className="text-[12px] font-bold text-white/70">{ACCOUNT.upgrade.promo.bad}</p>}
    </form>
  );
}
