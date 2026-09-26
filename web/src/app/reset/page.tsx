"use client";
/** Set a new password from a reset link (`?token=`), then land upstairs signed in. */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/api";
import { Button, ErrorBox, Eyebrow, LinkButton } from "@/components/ui";
import { ACCOUNT, LINES } from "@/lib/vocab";
import { describeAuthError } from "@/lib/authError";
import { DoorFrame } from "@/components/account/Door";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";

function ResetInner() {
  const router = useRouter();
  // Held in state, then taken off the address bar: a reset token in the URL would sit in
  // the history and ride out in a Referer to anything this page loads.
  const params = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  useEffect(() => {
    if (token && typeof window !== "undefined") window.history.replaceState(null, "", "/reset");
  }, [token]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      router.push("/home");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DoorFrame>
      <div className="pt-8 rise">
        <Eyebrow>{LINES.threshold}</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{ACCOUNT.reset.newTitle}</h1>
      </div>
      <div className="mt-6 rise rise-1">
        {token ? (
          <form onSubmit={submit} className="card grid gap-3 p-5">
            <label className="grid gap-1.5">
              <span className="eyebrow">{ACCOUNT.newPassword}</span>
              <input className={FIELD} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              <span className="text-[12px] text-muted">{ACCOUNT.passwordHint}</span>
            </label>
            <Button type="submit" variant="start" className="w-full" busy={busy} disabled={!password}>
              {ACCOUNT.reset.save}
            </Button>
            {error ? <ErrorBox error={error} describe={describeAuthError} /> : null}
            {error ? (
              <LinkButton href="/login" variant="ghost" className="w-full">
                {ACCOUNT.reset.back}
              </LinkButton>
            ) : null}
          </form>
        ) : (
          <div className="card grid gap-4 p-5">
            <p className="text-[15px] leading-relaxed text-ink">{ACCOUNT.reset.missing}</p>
            <LinkButton href="/login" variant="secondary" className="w-full">
              {ACCOUNT.reset.back}
            </LinkButton>
          </div>
        )}
      </div>
    </DoorFrame>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
