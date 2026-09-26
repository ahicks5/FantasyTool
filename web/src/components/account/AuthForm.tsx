"use client";
/**
 * The one sign-in form: sign in, create an account, or ask for a reset. The popup and the
 * /login and /register pages all mount this, so the fields, the errors and the words are
 * the same wherever the door is.
 */
import { useState } from "react";
import { forgotPassword, login, phoneComplete, phoneStart, phoneVerify, register } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Me } from "@/lib/types";
import { Button, ErrorBox } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { ACCOUNT } from "@/lib/vocab";
import { describeAuthError } from "@/lib/authError";
import { LEGAL } from "@/lib/legal";

export type AuthMode = "signin" | "register" | "forgot";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";

export function AuthForm({
  mode,
  onMode,
  onDone,
  autoFocus = true,
}: {
  mode: AuthMode;
  onMode: (m: AuthMode) => void;
  /** Called once the API has signed the account in. `created` is true for a brand-new account. */
  onDone: (me: Me, created?: boolean) => void;
  autoFocus?: boolean;
}) {
  const session = useSession();
  const [emailChosen, setEmailChosen] = useState(false);
  // With a text provider on the API, signing in and signing up both start with a phone
  // number; email and password stay one tap away for the accounts that have them.
  if (session.me?.phone_sign_in && !emailChosen && (mode === "signin" || mode === "register")) {
    return <PhoneFlow onDone={onDone} onEmail={() => setEmailChosen(true)} autoFocus={autoFocus} />;
  }
  return (
    <EmailForm
      mode={mode}
      onMode={onMode}
      onDone={onDone}
      autoFocus={autoFocus}
      onPhone={session.me?.phone_sign_in && mode !== "forgot" ? () => setEmailChosen(false) : undefined}
    />
  );
}

function EmailForm({
  mode,
  onMode,
  onDone,
  autoFocus,
  onPhone,
}: {
  mode: AuthMode;
  onMode: (m: AuthMode) => void;
  onDone: (me: Me, created?: boolean) => void;
  autoFocus: boolean;
  onPhone?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState<{ sent: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "forgot") {
        setSent(await forgotPassword(email.trim()));
      } else {
        const out = mode === "register" ? await register(email.trim(), password, name.trim()) : await login(email.trim(), password);
        onDone(out.me, mode === "register");
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (m: AuthMode) => {
    setError(null);
    setSent(null);
    onMode(m);
  };

  if (mode === "forgot" && sent) {
    return (
      <div className="grid gap-3" data-auth="sent">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-start-soft text-start">
          <IconCheck size={22} strokeWidth={2.6} />
        </span>
        <p className="text-[15px] leading-relaxed text-ink">{sent.sent ? ACCOUNT.reset.sent : ACCOUNT.reset.notSent}</p>
        {LEGAL.supportEmail && <p className="text-[13px] leading-relaxed text-muted">{ACCOUNT.reset.support(LEGAL.supportEmail)}</p>}
        <button type="button" onClick={() => switchTo("signin")} className="min-h-11 text-left text-[14px] font-bold text-lean underline underline-offset-4">
          {ACCOUNT.reset.back}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3" data-auth={mode} aria-busy={busy || undefined}>
      {mode === "register" && (
        <label className="grid gap-1.5">
          <span className="eyebrow">{ACCOUNT.name}</span>
          <input
            className={FIELD}
            autoComplete="name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoFocus={autoFocus}
          />
          <span className="text-[12px] text-muted">{ACCOUNT.nameHint}</span>
        </label>
      )}
      <label className="grid gap-1.5">
        <span className="eyebrow">{ACCOUNT.email}</span>
        <input
          className={FIELD}
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoFocus={autoFocus && mode !== "register"}
        />
      </label>
      {mode === "forgot" && <p className="text-[12px] leading-relaxed text-muted" data-testid="which-email">{ACCOUNT.reset.whichEmail}</p>}
      {mode !== "forgot" && (
        <label className="grid gap-1.5">
          <span className="eyebrow">{ACCOUNT.password}</span>
          <input
            className={FIELD}
            type="password"
            required
            minLength={8}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "register" && <span className="text-[12px] text-muted">{ACCOUNT.passwordHint}</span>}
        </label>
      )}
      <Button type="submit" variant="start" className="mt-1 w-full" busy={busy} disabled={!email || (mode !== "forgot" && !password)}>
        {busy
          ? mode === "register"
            ? ACCOUNT.busyRegister
            : ACCOUNT.busySignIn
          : mode === "register"
            ? ACCOUNT.register
            : mode === "forgot"
              ? ACCOUNT.reset.cta
              : ACCOUNT.signIn}
      </Button>
      {error ? <ErrorBox error={error} describe={describeAuthError} /> : null}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-muted">
        {mode === "signin" && (
          <>
            <span>
              {ACCOUNT.noAccount}{" "}
              <button type="button" onClick={() => switchTo("register")} className="min-h-11 font-bold text-ink underline underline-offset-4">
                {ACCOUNT.register}
              </button>
            </span>
            <button type="button" onClick={() => switchTo("forgot")} className="min-h-11 font-bold text-ink underline underline-offset-4">
              {ACCOUNT.forgot}
            </button>
          </>
        )}
        {mode === "register" && (
          <span>
            {ACCOUNT.haveAccount}{" "}
            <button type="button" onClick={() => switchTo("signin")} className="min-h-11 font-bold text-ink underline underline-offset-4">
              {ACCOUNT.signIn}
            </button>
          </span>
        )}
        {mode === "forgot" && (
          <button type="button" onClick={() => switchTo("signin")} className="min-h-11 font-bold text-ink underline underline-offset-4">
            {ACCOUNT.reset.back}
          </button>
        )}
        {onPhone && (
          <button type="button" onClick={onPhone} className="min-h-11 basis-full text-left font-bold text-ink underline underline-offset-4">
            {ACCOUNT.phone.usePhone}
          </button>
        )}
      </div>
    </form>
  );
}

type PhoneStep = { step: "number" } | { step: "code"; phone: string; display: string; devCode?: string } | { step: "profile"; ticket: string };

/** The phone door: a number, the texted code, then (for a new number) the name and an optional email. */
function PhoneFlow({ onDone, onEmail, autoFocus }: { onDone: (me: Me, created?: boolean) => void; onEmail: () => void; autoFocus: boolean }) {
  const [state, setState] = useState<PhoneStep>({ step: "number" });
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const send = (again = false) =>
    run(async () => {
      const out = await phoneStart(state.step === "code" ? state.phone : number.trim());
      setState({ step: "code", phone: out.phone, display: out.display, devCode: out.dev_code });
      setCode("");
      if (again) setNote(ACCOUNT.phone.resent);
    });

  const verify = () =>
    run(async () => {
      if (state.step !== "code") return;
      const out = await phoneVerify(state.phone, code.trim());
      if (out.new) setState({ step: "profile", ticket: out.ticket });
      else onDone(out.me, false);
    });

  const finish = () =>
    run(async () => {
      if (state.step !== "profile") return;
      const out = await phoneComplete(state.ticket, name.trim(), email.trim());
      onDone(out.me, true);
    });

  const link = "min-h-11 font-bold text-ink underline underline-offset-4";
  const errorBox = error ? <ErrorBox error={error} describe={describeAuthError} /> : null;

  if (state.step === "profile") {
    return (
      <form onSubmit={(e) => (e.preventDefault(), finish())} className="grid gap-3" data-auth="profile" aria-busy={busy || undefined}>
        <div>
          <p className="display text-[20px] leading-tight">{ACCOUNT.phone.profileTitle}</p>
          <p className="mt-1 text-[13px] leading-snug text-muted">{ACCOUNT.phone.profileLead}</p>
        </div>
        <label className="grid gap-1.5">
          <span className="eyebrow">{ACCOUNT.name}</span>
          <input className={FIELD} autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus={autoFocus} />
        </label>
        <label className="grid gap-1.5">
          <span className="eyebrow">{ACCOUNT.phone.emailOptional}</span>
          <input
            className={FIELD}
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <span className="text-[12px] text-muted">{ACCOUNT.phone.emailHint}</span>
        </label>
        <Button type="submit" variant="start" className="mt-1 w-full" busy={busy}>
          {busy ? ACCOUNT.phone.busyFinish : ACCOUNT.phone.finish}
        </Button>
        {errorBox}
      </form>
    );
  }

  if (state.step === "code") {
    return (
      <form onSubmit={(e) => (e.preventDefault(), verify())} className="grid gap-3" data-auth="code" aria-busy={busy || undefined}>
        <p className="text-[14px] leading-relaxed text-ink">{ACCOUNT.phone.codeLead(state.display)}</p>
        <label className="grid gap-1.5">
          <span className="eyebrow">{ACCOUNT.phone.codeLabel}</span>
          <input
            className={`${FIELD} tnum tracking-[0.3em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus={autoFocus}
          />
          {state.devCode && (
            <span className="text-[12px] text-muted" data-testid="dev-code">
              {ACCOUNT.phone.devCode(state.devCode)}
            </span>
          )}
        </label>
        <Button type="submit" variant="start" className="mt-1 w-full" busy={busy} disabled={code.length < 4}>
          {busy ? ACCOUNT.phone.busyVerify : ACCOUNT.phone.verify}
        </Button>
        {note && <p role="status" className="text-[13px] font-bold text-start">{note}</p>}
        {errorBox}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
          <button type="button" onClick={() => send(true)} className={link}>
            {ACCOUNT.phone.resend}
          </button>
          <button type="button" onClick={() => (setState({ step: "number" }), setError(null), setNote(null))} className={link}>
            {ACCOUNT.phone.change}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => (e.preventDefault(), send())} className="grid gap-3" data-auth="phone" aria-busy={busy || undefined}>
      <label className="grid gap-1.5">
        <span className="eyebrow">{ACCOUNT.phone.label}</span>
        <input
          className={FIELD}
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="(555) 234-5678"
          autoFocus={autoFocus}
        />
        <span className="text-[12px] text-muted">{ACCOUNT.phone.hint}</span>
      </label>
      <Button type="submit" variant="start" className="mt-1 w-full" busy={busy} disabled={!number.trim()}>
        {busy ? ACCOUNT.phone.busySend : ACCOUNT.phone.send}
      </Button>
      {errorBox}
      <div className="mt-1 text-[13px]">
        <button type="button" onClick={onEmail} className={link}>
          {ACCOUNT.phone.useEmail}
        </button>
      </div>
    </form>
  );
}
