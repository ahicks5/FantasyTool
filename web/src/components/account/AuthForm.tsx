"use client";
/**
 * The one sign-in form: sign in, create an account, or ask for a reset. The popup and the
 * /login and /register pages all mount this, so the fields, the errors and the words are
 * the same wherever the door is.
 */
import { useState } from "react";
import { forgotPassword, login, register } from "@/lib/api";
import type { Me } from "@/lib/types";
import { Button, ErrorBox } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { ACCOUNT } from "@/lib/vocab";

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
  /** Called once the API has signed the account in. */
  onDone: (me: Me) => void;
  autoFocus?: boolean;
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
        onDone(out.me);
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
      {error ? <ErrorBox error={error} /> : null}
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
      </div>
    </form>
  );
}
