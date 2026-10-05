"use client";
/**
 * The sign-up walk (docs/SPEC-ONBOARDING.md): phone first, one question a screen, a league
 * linked on the way in, the owner's first real call, then the free week with a card on file.
 *
 * Which screen shows is worked out from the account (`lib/onboarding.firstStep`), so a
 * refresh, a trip to Stripe, or a trip to ESPN for the key lands back where it should.
 * The screens before the account exists (the number, the code, the name and mailbox for a
 * new phone, the email door) are held here until the API creates it.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  checkPromo,
  getActions,
  getMe,
  getProducts,
  phoneComplete,
  phoneStart,
  phoneVerify,
  register,
  setAccountEmail,
  setOnboarding,
  startEmailVerify,
  upgrade,
} from "@/lib/api";
import { describeAuthError } from "@/lib/authError";
import { HttpError } from "@/lib/errors";
import { formatCents } from "@/lib/format";
import { LEGAL } from "@/lib/legal";
import { offerStack } from "@/lib/offer";
import {
  backOf,
  chargeDate,
  cleanCode,
  codeComplete,
  dayFromSeconds,
  dayLabel,
  firstStep,
  formatPhoneAsTyped,
  PATHS,
  phoneReady,
  progress,
  walkExit,
  type Local,
  type Path,
  type Step,
} from "@/lib/onboarding";
import { useSession } from "@/lib/session";
import type { ActionFeed, Me, OnboardStep, Product, VerifyStartResponse } from "@/lib/types";
import { featuresForSku, waitForFeatures } from "@/lib/unlock";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { IconCheck, IconLock } from "@/components/icons";
import { LeagueLinker } from "@/components/LeagueLinker";
import { Button, ConfidenceStamp, ErrorBox, Spinner } from "@/components/ui";
import { ACCOUNT, ONBOARD, PRICING } from "@/lib/vocab";
import { FIELD, Frame, Screen, Skip } from "./Frame";

/** The free-week code the walk applies for the owner. The server checks it again. */
const FREE_WEEK = "FREEWEEK";

/** What the screens before the account hold. Nothing here is sent until the API asks for it. */
interface Draft {
  number: string;
  phone: string;
  display: string;
  devCode?: string;
  sentAt: number;
  ticket: string;
  name: string;
  email: string;
  password: string;
  sms: boolean;
}

const EMPTY: Draft = { number: "", phone: "", display: "", sentAt: 0, ticket: "", name: "", email: "", password: "", sms: false };

export function Onboarding() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center">
          <Spinner size={22} />
        </div>
      }
    >
      <Walk />
    </Suspense>
  );
}

function Walk() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const next = params.get("next");
  // Read once: the screen drops them from the address bar, and the walk must not lose them.
  const [paidSku] = useState(() => params.get("paid"));
  const [canceled] = useState(() => params.get("canceled") === "1");

  // The account as this walk last heard it. A screen that changes the account hands back
  // the new one, so the next screen is derived without waiting on a re-read.
  const [fresh, setFresh] = useState<Me | null>(null);
  const me = fresh ?? session.me;
  const [chosenPath, setChosenPath] = useState<Path>("phone");
  const path: Path = me?.phone_sign_in === false ? "email" : chosenPath;
  const [local, setLocal] = useState<Omit<Local, "path">>({});
  // A screen chosen by hand (before the account exists, or the inbox check); null means
  // "whatever the account says comes next".
  const [held, setHeld] = useState<Step | null>(null);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [verify, setVerify] = useState<VerifyStartResponse | null>(null);
  // Set by the first move made here, so somebody who has already walked it is sent upstairs
  // rather than shown the last screen again.
  const [walked, setWalked] = useState(false);

  const derived: Step | null = session.loading && !fresh ? null : paidSku && !local.offerDone ? "done" : firstStep(me, { path, ...local });
  const step = held ?? derived;

  // Somebody who has already walked it (and is not back from Stripe) goes straight upstairs.
  useEffect(() => {
    if (step === "done" && !walked && !paidSku) router.replace(walkExit(next));
  }, [step, walked, paidSku, next, router]);

  // Back from Stripe, or from a cancel: take the marks off the address so a refresh is clean.
  useEffect(() => {
    if (paidSku || canceled) window.history.replaceState(null, "", window.location.pathname);
  }, [paidSku, canceled]);

  // The admin's funnel: each screen reached, once per account (the API dedupes).
  const signedIn = !!me?.signed_in;
  useEffect(() => {
    const counted: Partial<Record<Step, OnboardStep>> = { league: "league", offer: "offer", done: "done" };
    const s = step ? counted[step] : undefined;
    if (signedIn && s) void setOnboarding({ step: s }).catch(() => undefined);
  }, [step, signedIn]);

  function go(to: Step | null, d: "fwd" | "back" = "fwd") {
    setWalked(true);
    setDir(d);
    setHeld(to);
  }

  /** The account changed: take the new one, and let it say what comes next. */
  function landed(m: Me | null, then: Step | null = null) {
    setWalked(true);
    if (m) setFresh(m);
    setDir("fwd");
    setHeld(then);
  }

  if (!step || (step === "done" && !walked && !paidSku)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size={22} />
      </div>
    );
  }

  const steps = PATHS[path];
  const index = Math.max(0, steps.indexOf(step));
  const back = backOf(step, path, signedIn);
  const onBack = back ? () => go(back === derived ? null : back, "back") : null;

  return (
    <Frame progress={progress(step, path)} stepIndex={index + 1} stepCount={steps.length} onBack={onBack}>
      <div key={step} className="flex flex-1 flex-col">
        {step === "phone" && (
          <PhoneScreen
            dir={dir}
            draft={draft}
            onDraft={setDraft}
            next={next}
            onSent={() => go("code")}
            onEmail={() => {
              setChosenPath("email");
              go(null);
            }}
          />
        )}
        {step === "code" && (
          <CodeScreen
            dir={dir}
            draft={draft}
            onDraft={setDraft}
            onChange={() => go("phone", "back")}
            onNew={(ticket) => {
              setDraft((d) => ({ ...d, ticket }));
              go("name");
            }}
            onIn={(m) => {
              // A number already on file: signed in. Straight on to whatever is unfinished.
              if (firstStep(m, { path, ...local }) === "done") router.replace(walkExit(next));
              else landed(m);
            }}
          />
        )}
        {step === "name" && (
          <NameScreen
            dir={dir}
            draft={draft}
            onDraft={setDraft}
            me={me}
            path={path}
            onNext={() => go("mailbox")}
            onLanded={async (m) => {
              // Email path: the account exists now. Confirm the address if mail can go out.
              if (path === "email" && m.email_sending) {
                const v = await startEmailVerify().catch(() => null);
                setVerify(v);
                landed(m, "verify");
              } else landed(m);
            }}
          />
        )}
        {step === "mailbox" && <MailboxScreen dir={dir} draft={draft} onDraft={setDraft} me={me} next={next} onLanded={(m) => landed(m)} />}
        {step === "email" && (
          <EmailScreen
            dir={dir}
            draft={draft}
            onDraft={setDraft}
            canUsePhone={me?.phone_sign_in !== false}
            onNext={() => go("password")}
            onPhone={() => {
              setChosenPath("phone");
              go(null, "back");
            }}
          />
        )}
        {step === "password" && <PasswordScreen dir={dir} draft={draft} onDraft={setDraft} onNext={() => go("name")} />}
        {step === "verify" && <VerifyScreen dir={dir} email={me?.account?.email ?? draft.email} result={verify} onNext={() => go(null)} />}
        {step === "league" && (
          <LeagueScreen
            dir={dir}
            onLinked={async () => {
              const m = await getMe().catch(() => null);
              landed(m);
            }}
            onNone={() => {
              setLocal((l) => ({ ...l, noLeague: true }));
              go(null);
            }}
          />
        )}
        {step === "reveal" && (
          <RevealScreen
            dir={dir}
            onNext={async () => {
              // Awaited: the offer screen records itself the moment it shows, and the API's
              // read-modify-write of the walk's state would let that write drop this one.
              const m = await setOnboarding({ step: "reveal" }).catch(() => null);
              setLocal((l) => ({ ...l, revealSeen: true }));
              landed(m);
            }}
          />
        )}
        {step === "offer" && (
          <OfferScreen
            dir={dir}
            me={me}
            canceled={canceled}
            onGranted={(m) => {
              setLocal((l) => ({ ...l, offerDone: true }));
              landed(m, "done");
            }}
            onSkip={async () => {
              setLocal((l) => ({ ...l, offerDone: true }));
              const m = await setOnboarding({ skip: "offer" }).catch(() => null);
              landed(m, "done");
            }}
          />
        )}
        {step === "done" && (
          <DoneScreen
            dir={dir}
            me={me}
            paidSku={paidSku}
            onGranted={(m) => setFresh(m)}
            onExit={() => {
              session.refresh();
              router.push(walkExit(next));
            }}
          />
        )}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------- screens --- */

type Dir = "fwd" | "back";

function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function PhoneScreen({
  dir,
  draft,
  onDraft,
  next,
  onSent,
  onEmail,
}: {
  dir: Dir;
  draft: Draft;
  onDraft: (f: (d: Draft) => Draft) => void;
  next: string | null;
  onSent: () => void;
  onEmail: () => void;
}) {
  const { busy, error, run } = useRun();
  const ready = phoneReady(draft.number);
  const send = () =>
    run(async () => {
      const out = await phoneStart(draft.number.trim());
      onDraft((d) => ({ ...d, phone: out.phone, display: out.display, devCode: out.dev_code, sentAt: Date.now() }));
      onSent();
    });
  return (
    <form className="flex flex-1 flex-col" onSubmit={(e) => (e.preventDefault(), ready && send())} aria-busy={busy || undefined}>
      <Screen
        dir={dir}
        testId="phone"
        eyebrow={ONBOARD.phone.eyebrow}
        title={ONBOARD.phone.title}
        line={ONBOARD.phone.line}
        footer={
          <>
            <Button type="submit" variant="start" className="w-full" busy={busy} disabled={!ready}>
              {busy ? ONBOARD.phone.busy : ONBOARD.phone.send}
            </Button>
            <p className="mt-2 text-center text-[12px] text-muted">{ONBOARD.phone.trust}</p>
          </>
        }
      >
        <label className="grid gap-1.5">
          <span className="eyebrow">{ONBOARD.phone.label}</span>
          <input
            className={`${FIELD} tnum`}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={ONBOARD.phone.placeholder}
            value={draft.number}
            onChange={(e) => {
              const v = formatPhoneAsTyped(e.target.value);
              onDraft((d) => ({ ...d, number: v }));
            }}
            autoFocus
          />
        </label>
        {error ? (
          <div className="mt-3">
            <ErrorBox error={error} describe={describeAuthError} />
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
          <button type="button" onClick={onEmail} className="min-h-11 font-bold text-ink underline underline-offset-4" data-testid="walk-use-email">
            {ONBOARD.phone.useEmail}
          </button>
          <span className="text-muted">
            {ONBOARD.phone.haveAccount}{" "}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="min-h-11 font-bold text-ink underline underline-offset-4">
              {ONBOARD.phone.signIn}
            </Link>
          </span>
        </div>
      </Screen>
    </form>
  );
}

const RESEND_S = 30;

function CodeScreen({
  dir,
  draft,
  onDraft,
  onChange,
  onNew,
  onIn,
}: {
  dir: Dir;
  draft: Draft;
  onDraft: (f: (d: Draft) => Draft) => void;
  onChange: () => void;
  onNew: (ticket: string) => void;
  onIn: (me: Me) => void;
}) {
  const { busy, error, run } = useRun();
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const wait = Math.max(0, RESEND_S - Math.floor((now - draft.sentAt) / 1000));

  const check = (value: string) =>
    run(async () => {
      const out = await phoneVerify(draft.phone, value);
      if (out.new) onNew(out.ticket);
      else onIn(out.me);
    });
  const resend = () =>
    run(async () => {
      const out = await phoneStart(draft.phone);
      onDraft((d) => ({ ...d, devCode: out.dev_code, sentAt: Date.now() }));
      setCode("");
      setNote(ONBOARD.code.resent);
    });

  return (
    <form className="flex flex-1 flex-col" onSubmit={(e) => (e.preventDefault(), codeComplete(code) && check(code))} aria-busy={busy || undefined}>
      <Screen
        dir={dir}
        testId="code"
        eyebrow={ONBOARD.code.eyebrow}
        title={ONBOARD.code.title}
        line={ONBOARD.code.line(draft.display || draft.number)}
        footer={
          <Button type="submit" variant="start" className="w-full" busy={busy} disabled={!codeComplete(code)}>
            {busy ? ONBOARD.code.busy : ONBOARD.code.verify}
          </Button>
        }
      >
        <label className="grid gap-1.5">
          <span className="eyebrow">{ONBOARD.code.label}</span>
          <input
            className={`${FIELD} tnum text-center text-[26px] tracking-[0.45em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const v = cleanCode(e.target.value);
              setCode(v);
              // The sixth digit is the tap: nobody should have to find the button.
              if (codeComplete(v) && !busy) void check(v);
            }}
            autoFocus
          />
          {draft.devCode && (
            <span className="text-[12px] text-muted" data-testid="dev-code">
              {ONBOARD.code.dev(draft.devCode)}
            </span>
          )}
        </label>
        {note && (
          <p role="status" className="mt-3 text-[13px] font-bold text-start">
            {note}
          </p>
        )}
        {error ? (
          <div className="mt-3">
            <ErrorBox error={error} describe={describeAuthError} />
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
          <button type="button" onClick={resend} disabled={wait > 0 || busy} className="min-h-11 font-bold text-ink underline underline-offset-4 disabled:text-muted disabled:no-underline">
            {wait > 0 ? ONBOARD.code.resendIn(wait) : ONBOARD.code.resend}
          </button>
          <button type="button" onClick={onChange} className="min-h-11 font-bold text-ink underline underline-offset-4">
            {ONBOARD.code.change}
          </button>
        </div>
      </Screen>
    </form>
  );
}

/** The marketing-text box, with the exact consented words. Never pre-ticked, never required. */
function SmsBox({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3" data-auth="sms-opt-in">
      <input type="checkbox" className="peer sr-only" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink ${
          value ? "border-ink bg-ink text-paper" : "border-line-2 bg-soft text-transparent"
        }`}
      >
        <IconCheck size={16} strokeWidth={3} />
      </span>
      <span className="grid gap-1">
        <span className="text-[15px] leading-snug text-ink">{ACCOUNT.phone.smsOptIn}</span>
        <span className="text-[12px] leading-relaxed text-muted">{ACCOUNT.phone.smsTerms}</span>
      </span>
    </label>
  );
}

function NameScreen({
  dir,
  draft,
  onDraft,
  me,
  path,
  onNext,
  onLanded,
}: {
  dir: Dir;
  draft: Draft;
  onDraft: (f: (d: Draft) => Draft) => void;
  me: Me | null;
  path: Path;
  onNext: () => void;
  onLanded: (me: Me) => void | Promise<void>;
}) {
  const { busy, error, run } = useRun();
  const signedIn = !!me?.signed_in;
  // A new phone holds the name until the mailbox screen creates the account with both.
  const preAccountPhone = !signedIn && path === "phone";

  const submit = (name: string) =>
    run(async () => {
      if (preAccountPhone) {
        onDraft((d) => ({ ...d, name }));
        onNext();
        return;
      }
      if (!signedIn) {
        // The email door: email, password, then this creates the account.
        const out = await register(draft.email.trim(), draft.password, name);
        const m = name ? await setOnboarding({ step: "named" }).catch(() => null) : await setOnboarding({ skip: "name" }).catch(() => null);
        await onLanded(m ?? out.me);
        return;
      }
      // Signed in already and the nameplate is blank: fill it, or mark it skipped.
      const m = name ? await setOnboarding({ name, step: "named" }) : await setOnboarding({ skip: "name" });
      if (m) await onLanded(m);
    });

  return (
    <form className="flex flex-1 flex-col" onSubmit={(e) => (e.preventDefault(), submit(draft.name.trim()))} aria-busy={busy || undefined}>
      <Screen
        dir={dir}
        testId="name"
        eyebrow={ONBOARD.name.eyebrow}
        title={ONBOARD.name.title}
        line={ONBOARD.name.line}
        footer={
          <>
            <Button type="submit" variant="start" className="w-full" busy={busy} disabled={!draft.name.trim()}>
              {ONBOARD.name.cta}
            </Button>
            <Skip onClick={() => submit("")} testId="walk-skip-name">
              {ONBOARD.name.skip}
            </Skip>
          </>
        }
      >
        <label className="grid gap-1.5">
          <span className="eyebrow">{ONBOARD.name.label}</span>
          <input
            className={FIELD}
            autoComplete="name"
            maxLength={80}
            placeholder={ONBOARD.name.placeholder}
            value={draft.name}
            onChange={(e) => onDraft((d) => ({ ...d, name: e.target.value }))}
            autoFocus
          />
        </label>
        {preAccountPhone && <SmsBox value={draft.sms} onChange={(sms) => onDraft((d) => ({ ...d, sms }))} />}
        {error ? (
          <div className="mt-3">
            <ErrorBox error={error} describe={describeAuthError} />
          </div>
        ) : null}
      </Screen>
    </form>
  );
}

function MailboxScreen({
  dir,
  draft,
  onDraft,
  me,
  next,
  onLanded,
}: {
  dir: Dir;
  draft: Draft;
  onDraft: (f: (d: Draft) => Draft) => void;
  me: Me | null;
  next: string | null;
  onLanded: (me: Me) => void;
}) {
  const { busy, error, run } = useRun();
  const signedIn = !!me?.signed_in;
  const taken = error instanceof HttpError && error.status === 409;

  const submit = (email: string) =>
    run(async () => {
      if (!signedIn) {
        // A new phone: the account is made here, with the name and the box from the screen before.
        await phoneComplete(draft.ticket, draft.name.trim(), email, draft.sms);
        if (!draft.name.trim()) await setOnboarding({ skip: "name" }).catch(() => null);
        else await setOnboarding({ step: "named" }).catch(() => null);
        const m = await setOnboarding(email ? { step: "email" } : { skip: "email" }).catch(() => null);
        onLanded(m ?? (await getMe()));
        return;
      }
      if (email) await setAccountEmail(email);
      const m = await setOnboarding(email ? { step: "email" } : { skip: "email" });
      if (m) onLanded(m);
    });

  return (
    <form className="flex flex-1 flex-col" onSubmit={(e) => (e.preventDefault(), submit(draft.email.trim()))} aria-busy={busy || undefined}>
      <Screen
        dir={dir}
        testId="mailbox"
        eyebrow={ONBOARD.mailbox.eyebrow}
        title={ONBOARD.mailbox.title}
        line={ONBOARD.mailbox.line}
        footer={
          <>
            <Button type="submit" variant="start" className="w-full" busy={busy} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())}>
              {busy ? ONBOARD.mailbox.busy : ONBOARD.mailbox.cta}
            </Button>
            <Skip onClick={() => submit("")} testId="walk-skip-email">
              {ONBOARD.mailbox.skip}
            </Skip>
          </>
        }
      >
        <label className="grid gap-1.5">
          <span className="eyebrow">{ONBOARD.mailbox.label}</span>
          <input
            className={FIELD}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@example.com"
            value={draft.email}
            onChange={(e) => onDraft((d) => ({ ...d, email: e.target.value }))}
            autoFocus
          />
        </label>
        {taken ? (
          <div role="alert" className="mt-3 rounded-[var(--radius-card)] border border-sit bg-sit-soft p-4 text-sit">
            <p className="text-sm">{ONBOARD.mailbox.taken}</p>
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold underline">
              {ONBOARD.mailbox.signIn}
            </Link>
          </div>
        ) : error ? (
          <div className="mt-3">
            <ErrorBox error={error} describe={describeAuthError} />
          </div>
        ) : null}
      </Screen>
    </form>
  );
}

function EmailScreen({
  dir,
  draft,
  onDraft,
  canUsePhone,
  onNext,
  onPhone,
}: {
  dir: Dir;
  draft: Draft;
  onDraft: (f: (d: Draft) => Draft) => void;
  canUsePhone: boolean;
  onNext: () => void;
  onPhone: () => void;
}) {
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim());
  return (
    <form className="flex flex-1 flex-col" onSubmit={(e) => (e.preventDefault(), ok && onNext())}>
      <Screen
        dir={dir}
        testId="email"
        eyebrow={ONBOARD.email.eyebrow}
        title={ONBOARD.email.title}
        line={ONBOARD.email.line}
        footer={
          <Button type="submit" variant="start" className="w-full" disabled={!ok}>
            {ONBOARD.email.cta}
          </Button>
        }
      >
        <label className="grid gap-1.5">
          <span className="eyebrow">{ONBOARD.email.label}</span>
          <input
            className={FIELD}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@example.com"
            value={draft.email}
            onChange={(e) => onDraft((d) => ({ ...d, email: e.target.value }))}
            autoFocus
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
          {canUsePhone && (
            <button type="button" onClick={onPhone} className="min-h-11 font-bold text-ink underline underline-offset-4" data-testid="walk-use-phone">
              {ONBOARD.email.usePhone}
            </button>
          )}
          <span className="text-muted">
            {ONBOARD.phone.haveAccount}{" "}
            <Link href="/login" className="min-h-11 font-bold text-ink underline underline-offset-4">
              {ONBOARD.phone.signIn}
            </Link>
          </span>
        </div>
      </Screen>
    </form>
  );
}

function PasswordScreen({ dir, draft, onDraft, onNext }: { dir: Dir; draft: Draft; onDraft: (f: (d: Draft) => Draft) => void; onNext: () => void }) {
  const [show, setShow] = useState(false);
  const ok = draft.password.length >= 8;
  return (
    <form className="flex flex-1 flex-col" onSubmit={(e) => (e.preventDefault(), ok && onNext())}>
      {/* The address rides along hidden so a password manager files the pair together. */}
      <input type="email" autoComplete="username" value={draft.email} readOnly hidden />
      <Screen
        dir={dir}
        testId="password"
        eyebrow={ONBOARD.password.eyebrow}
        title={ONBOARD.password.title}
        line={ONBOARD.password.line}
        footer={
          <Button type="submit" variant="start" className="w-full" disabled={!ok}>
            {ONBOARD.password.cta}
          </Button>
        }
      >
        <label className="grid gap-1.5">
          <span className="eyebrow">{ONBOARD.password.label}</span>
          <span className="relative block">
            <input
              className={`${FIELD} pr-20`}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              value={draft.password}
              onChange={(e) => onDraft((d) => ({ ...d, password: e.target.value }))}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-1.5 top-1/2 min-h-11 -translate-y-1/2 rounded-lg px-3 text-[13px] font-bold text-ink-2 hover:bg-line"
            >
              {show ? ONBOARD.password.hide : ONBOARD.password.show}
            </button>
          </span>
        </label>
      </Screen>
    </form>
  );
}

function VerifyScreen({ dir, email, result, onNext }: { dir: Dir; email: string; result: VerifyStartResponse | null; onNext: () => void }) {
  const sent = !!result?.sent;
  return (
    <Screen
      dir={dir}
      testId="verify"
      eyebrow={ONBOARD.verify.eyebrow}
      title={ONBOARD.verify.title}
      line={sent ? ONBOARD.verify.line(email) : ONBOARD.verify.notSent}
      footer={
        <>
          <Button variant="start" className="w-full" onClick={onNext}>
            {ONBOARD.verify.cta}
          </Button>
          {sent && <Skip onClick={onNext}>{ONBOARD.verify.later}</Skip>}
        </>
      }
    >
      {result?.dev_link && (
        <p className="break-all text-[12px] text-muted" data-testid="dev-link">
          {ONBOARD.verify.dev} <a href={result.dev_link} className="underline">{result.dev_link}</a>
        </p>
      )}
    </Screen>
  );
}

function LeagueScreen({ dir, onLinked, onNone }: { dir: Dir; onLinked: () => void; onNone: () => void }) {
  return (
    <Screen dir={dir} testId="league" eyebrow={ONBOARD.league.eyebrow} title={ONBOARD.league.title} line={ONBOARD.league.line}>
      <LeagueLinker variant="walk" onLinked={() => onLinked()} />
      <Skip onClick={onNone} testId="walk-no-league">
        {ONBOARD.league.none}
      </Skip>
    </Screen>
  );
}

/**
 * The aha: the owner's first real call, on their own roster, with its stamp and its one
 * line. Under it, the paid rooms' moves for this week as the engine wrote them for a free
 * reader: name-free, numbers intact. That is the credibility for the next screen, and the
 * only kind the house allows: specific, about them, and checkable the moment they are in.
 */
function RevealScreen({ dir, onNext }: { dir: Dir; onNext: () => void }) {
  const session = useSession();
  const c = session.connection;
  const [feed, setFeed] = useState<ActionFeed | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!c) return;
    let alive = true;
    getActions(c.platform, c.league_id, c.team_id)
      .then((f) => alive && setFeed(f))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [c]);

  const call = feed?.actions.find((a) => !a.locked && a.confidence);
  const locked = (feed?.actions ?? []).filter((a) => a.locked && a.feature !== "my_team").slice(0, 2);
  const title = c ? ONBOARD.reveal.title(c.team_name, feed?.week ?? c.week) : ONBOARD.reveal.eyebrow;

  return (
    <Screen
      dir={dir}
      testId="reveal"
      eyebrow={ONBOARD.reveal.eyebrow}
      title={title}
      footer={
        <Button variant="start" className="w-full" onClick={onNext} disabled={!feed && !failed && !!c}>
          {ONBOARD.reveal.cta}
        </Button>
      }
    >
      {!feed && !failed && (
        <div className="flex items-center gap-3 text-[14px] text-muted" role="status">
          <Spinner size={18} label={null} />
          {ONBOARD.reveal.loading}
        </div>
      )}
      {failed && <p className="text-[14px] text-muted">{ONBOARD.reveal.error}</p>}
      {feed && (
        <div className="grid gap-3">
          <div className="hero p-5" data-testid="reveal-call">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">{ONBOARD.reveal.call}</span>
              {call?.confidence && <ConfidenceStamp value={call.confidence} slam />}
            </div>
            {call ? (
              <>
                <p className="display mt-3 text-[22px] leading-tight text-white">{call.title}</p>
                {call.subtitle && <p className="mt-1 text-[14px] text-white/70">{call.subtitle}</p>}
                {call.reason && <p className="mt-3 text-[15px] leading-snug text-white/85">{call.reason}</p>}
              </>
            ) : (
              <p className="display mt-3 text-[20px] leading-tight text-white">{ONBOARD.reveal.clear}</p>
            )}
          </div>
          {locked.length > 0 ? (
            <>
              <div className="eyebrow mt-2">{ONBOARD.reveal.upstairs}</div>
              <ul className="grid gap-2">
                {locked.map((a) => (
                  <li key={a.id} className="card flex items-start gap-3 p-4" data-testid="reveal-locked">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-soft text-muted">
                      <IconLock size={15} strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="eyebrow block">{ONBOARD.reveal.rooms[a.feature] ?? a.feature}</span>
                      <span className="mt-0.5 block text-[15px] font-bold leading-snug text-ink">{a.title}</span>
                      {a.subtitle && <span className="mt-0.5 block text-[13px] text-muted">{a.subtitle}</span>}
                      <span className="walk-haze mt-1.5 block text-[13px] text-ink-2" aria-hidden>
                        {ONBOARD.reveal.haze}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[14px] text-muted">{ONBOARD.reveal.quiet}</p>
          )}
        </div>
      )}
    </Screen>
  );
}

type Applied = { code: string; trialDays: number; seasonCents: number | null } | null;

/**
 * The card ask. The free week is applied before they arrive (they can see it, and take it
 * off). Both passes read "$0 today" and name the day and the amount of the first charge,
 * the week is the default (the smallest number on day eight is the easiest yes), and the
 * season carries its saving. Under the button, the three things that make a card safe to
 * hand over. Under those, the way past it, small and never hidden.
 */
function OfferScreen({
  dir,
  me,
  canceled,
  onGranted,
  onSkip,
}: {
  dir: Dir;
  me: Me | null;
  canceled: boolean;
  onGranted: (me: Me) => void;
  onSkip: () => void;
}) {
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  useEffect(() => {
    getProducts()
      .then((r) => r.products.length && setProducts(r.products))
      .catch(() => undefined);
  }, []);
  const eligible = me?.trial_eligible !== false;
  const [applied, setApplied] = useState<Applied>(() => (eligible ? { code: FREE_WEEK, trialDays: me?.trial_days ?? 7, seasonCents: null } : null));
  const [sku, setSku] = useState<"week_pass" | "full_report">("week_pass");
  const { busy, error, run } = useRun();
  const [codeOpen, setCodeOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);

  const week = products.find((p) => p.sku === "week_pass");
  const season = products.find((p) => p.sku === "full_report");
  const stack = offerStack(products);
  const trialDays = applied?.trialDays ?? 0;
  const date = dayLabel(chargeDate(new Date(), trialDays || 7));
  const seasonCents = applied?.seasonCents ?? me?.season_price_cents ?? season?.price_cents ?? 0;
  const save = stack?.weeklyCents != null && stack.weeklyCents > seasonCents ? formatCents(stack.weeklyCents - seasonCents) : null;
  const checkout = !!me?.checkout;

  async function applyCode(e: React.FormEvent) {
    e.preventDefault();
    setBad(false);
    try {
      const r = await checkPromo(typed.trim(), "full_report");
      if (!r.ok || !r.code) return setBad(true);
      if (r.trial_days) setApplied({ code: r.code, trialDays: r.trial_days, seasonCents: null });
      else {
        // A discount code is for the season, and it replaces the free week: they never stack.
        setApplied({ code: r.code, trialDays: 0, seasonCents: r.price_cents });
        setSku("full_report");
      }
      setCodeOpen(false);
      setTyped("");
    } catch {
      setBad(true);
    }
  }

  const take = () =>
    run(async () => {
      const code = applied && (applied.trialDays || sku === "full_report") ? applied.code : undefined;
      const out = await upgrade(sku, "/register", code);
      if (out.url) {
        window.location.assign(out.url);
        return;
      }
      onGranted(out.me ?? (await getMe()));
    });

  const option = (p: Product | undefined, which: "week_pass" | "full_report") => {
    if (!p) return null;
    const on = sku === which;
    const cents = which === "full_report" ? seasonCents : p.price_cents;
    const price = formatCents(cents);
    const words = which === "week_pass" ? ONBOARD.offer.week : ONBOARD.offer.season;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => setSku(which)}
        data-testid={`offer-${which}`}
        className={`flex w-full items-start gap-3 rounded-[var(--radius-card)] border px-4 py-4 text-left transition-colors ${
          on ? "border-start bg-start-soft ring-1 ring-start" : "border-line-2 bg-paper hover:bg-soft"
        }`}
      >
        <span
          aria-hidden
          className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${
            on ? "border-start-fill bg-start-fill text-white" : "border-line-2 text-transparent"
          }`}
        >
          <IconCheck size={12} strokeWidth={3.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="display text-[18px] leading-tight">{words.name}</span>
            {which === "full_report" && save && (
              <span className="shrink-0 rounded-full bg-start-fill px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">{ONBOARD.offer.season.save(save)}</span>
            )}
          </span>
          <span className="tnum mt-1 block text-[13px] font-bold text-ink-2">{trialDays ? words.line(price, date) : words.now(price)}</span>
        </span>
      </button>
    );
  };

  return (
    <Screen
      dir={dir}
      testId="offer"
      eyebrow={trialDays ? ONBOARD.offer.eyebrow : PRICING.eyebrow}
      title={trialDays ? ONBOARD.offer.title(date) : ONBOARD.offer.titleNoTrial}
      footer={
        <>
          <Button variant="start" className="w-full" busy={busy} onClick={take} data-testid="offer-take">
            {busy
              ? ONBOARD.offer.busy
              : trialDays
                ? checkout
                  ? ONBOARD.offer.cta
                  : ONBOARD.offer.ctaComp
                : sku === "week_pass"
                  ? ONBOARD.offer.takeWeek
                  : ONBOARD.offer.takeSeason}
          </Button>
          <Skip onClick={onSkip} testId="offer-skip">
            {ONBOARD.offer.skip}
          </Skip>
        </>
      }
    >
      {canceled && <p className="mb-3 rounded-xl bg-soft px-3.5 py-2.5 text-[13px] font-bold text-ink-2">{ONBOARD.offer.canceled}</p>}
      {!checkout && <p className="mb-3 rounded-xl bg-start-soft px-3.5 py-2.5 text-[13px] font-bold leading-snug text-start">{ONBOARD.offer.comp}</p>}
      {applied && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-start-fill px-3 py-1.5 text-[12px] font-black uppercase tracking-wider text-white" data-testid="offer-code">
            <IconCheck size={12} strokeWidth={3.4} />
            {ONBOARD.offer.applied(applied.code)}
          </span>
          <button type="button" onClick={() => setApplied(null)} className="min-h-11 text-[13px] font-bold text-muted underline underline-offset-4">
            {ONBOARD.offer.remove}
          </button>
        </div>
      )}
      <div role="radiogroup" aria-label={ONBOARD.offer.pickAria} className="grid gap-2.5">
        {option(week, "week_pass")}
        {option(season, "full_report")}
      </div>
      <ul className="mt-4 grid gap-2 text-[13px] leading-snug text-ink-2">
        <li className="flex items-start gap-2">
          <IconLock size={14} strokeWidth={2.4} className="mt-0.5 shrink-0" />
          {!checkout ? ACCOUNT.upgrade.noCharge : trialDays ? ONBOARD.offer.stripe : ACCOUNT.upgrade.stripe}
        </li>
        {trialDays > 0 && checkout && (
          <li className="flex items-start gap-2">
            <IconCheck size={14} strokeWidth={2.6} className="mt-0.5 shrink-0" />
            {ONBOARD.offer.reminder}
          </li>
        )}
        <li className="flex items-start gap-2">
          <IconCheck size={14} strokeWidth={2.6} className="mt-0.5 shrink-0" />
          {PRICING.guarantee.body(LEGAL.refundDays)}
        </li>
      </ul>
      {error ? (
        <div className="mt-3">
          <ErrorBox error={error} describe={describeAuthError} />
        </div>
      ) : null}
      {!codeOpen ? (
        <button type="button" onClick={() => setCodeOpen(true)} className="mt-3 min-h-11 text-[13px] font-bold text-muted underline underline-offset-4">
          {ONBOARD.offer.otherCode}
        </button>
      ) : (
        <form className="mt-3 grid gap-1.5" onSubmit={applyCode}>
          <div className="flex gap-2">
            <input
              aria-label={ONBOARD.offer.codeLabel}
              placeholder={ONBOARD.offer.codeLabel}
              value={typed}
              onChange={(e) => (setTyped(e.target.value), setBad(false))}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              className={`${FIELD} uppercase`}
            />
            <Button type="submit" variant="secondary" disabled={!typed.trim()}>
              {ONBOARD.offer.codeApply}
            </Button>
          </div>
          {bad && <p role="alert" className="text-[12px] font-bold text-sit">{ONBOARD.offer.codeBad}</p>}
        </form>
      )}
    </Screen>
  );
}

function DoneScreen({
  dir,
  me,
  paidSku,
  onGranted,
  onExit,
}: {
  dir: Dir;
  me: Me | null;
  paidSku: string | null;
  onGranted: (me: Me) => void;
  onExit: () => void;
}) {
  const premium = me?.account?.plan.tier === "premium";
  const [waiting, setWaiting] = useState<"wait" | "slow" | null>(() => (paidSku && !premium ? "wait" : null));
  const started = useRef(false);
  useEffect(() => {
    if (!paidSku || premium || started.current) return;
    started.current = true;
    // The webhook writes the free week a moment after Stripe sends them back.
    void (async () => {
      let products: Product[] = FALLBACK;
      try {
        const r = await getProducts();
        if (r.products.length) products = r.products;
      } catch {
        /* the fallback is enough to know what a week opens */
      }
      const out = await waitForFeatures(getMe, featuresForSku(products, "week_pass"));
      if (out.ok) {
        onGranted(out.me);
        setWaiting(null);
      } else setWaiting("slow");
    })();
  }, [paidSku, premium, onGranted]);

  const t = me?.trial;
  const charge = t?.next_charge_at && t.next_charge_cents != null ? { date: dayFromSeconds(t.next_charge_at), price: formatCents(t.next_charge_cents) } : null;
  const paid = premium || !!t;
  const line = waiting === "wait"
    ? ONBOARD.done.waiting
    : waiting === "slow"
      ? ONBOARD.done.slow
      : charge
        ? me?.checkout === false
          ? ONBOARD.done.compLine(dayFromSeconds(t?.until ?? null))
          : t?.sku === "full_report"
            ? ONBOARD.done.seasonLine(charge.price, charge.date)
            : ONBOARD.done.weekLine(charge.price, charge.date)
        : paid
          ? ACCOUNT.plan.premiumLine
          : ONBOARD.done.freeLine;

  const title = paid || waiting ? ONBOARD.done.paidTitle : ONBOARD.done.freeTitle;
  return (
    <Screen
      dir={dir}
      testId="done"
      eyebrow={ONBOARD.done.eyebrow}
      title={title}
      line={line}
      footer={
        <Button variant="start" className="w-full" onClick={onExit} data-testid="walk-exit">
          {ONBOARD.done.cta}
        </Button>
      }
    >
      {waiting === "wait" ? (
        <Spinner size={22} />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-start-soft text-start">
          <IconCheck size={28} strokeWidth={2.6} />
        </span>
      )}
    </Screen>
  );
}
