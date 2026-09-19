"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconCheck } from "@/components/icons";
import { Button, Card, ErrorBox, Eyebrow, LinkButton, ThemeToggle, Wordmark } from "@/components/ui";
import { getUserEmail, sendMagicLink, signOut, supabaseConfigured } from "@/lib/supabase";

function LoginInner() {
  const next = useSearchParams().get("next") || "/home";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const configured = supabaseConfigured();
  const dev = process.env.NEXT_PUBLIC_DEV_USER;

  useEffect(() => {
    getUserEmail().then(setCurrent).catch(() => setCurrent(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await sendMagicLink(email.trim(), next);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="The Booth home">
          <Wordmark className="text-[26px]" />
        </Link>
        <ThemeToggle />
      </header>

      <div className="pt-8 rise">
        <Eyebrow>Booth pass</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">Sign in</h1>
        <p className="mt-2 max-w-[22rem] text-[15px] leading-relaxed text-muted">
          No password to remember. One link in your inbox signs you in and brings every pass you&rsquo;ve bought with
          it.
        </p>
      </div>

      <div className="mt-6 rise rise-1">
        {current ? (
          <Card>
            <Eyebrow>Signed in</Eyebrow>
            <p className="mt-1.5 text-[17px] font-bold break-words">
              {current}
              {dev ? <span className="ml-1.5 text-[13px] font-bold text-muted">dev user</span> : null}
            </p>
            <div className="mt-5 grid gap-2.5">
              <LinkButton href={next} className="w-full">
                Back to the booth
              </LinkButton>
              {!dev && (
                <Button variant="secondary" className="w-full" onClick={() => signOut().then(() => setCurrent(null))}>
                  Sign out
                </Button>
              )}
            </div>
          </Card>
        ) : !configured ? (
          <Card>
            <Eyebrow>Not configured</Eyebrow>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
              Sign-in isn&rsquo;t wired up on this deployment. Set{" "}
              <code className="rounded bg-soft px-1 py-0.5 text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-soft px-1 py-0.5 text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, or{" "}
              <code className="rounded bg-soft px-1 py-0.5 text-[12px]">NEXT_PUBLIC_DEV_USER</code> for local dev.
            </p>
          </Card>
        ) : sent ? (
          <Card>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-start-soft text-start">
              <IconCheck size={22} strokeWidth={2.6} />
            </span>
            <p className="display mt-4 text-[21px] leading-tight">Link&rsquo;s on its way</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              Sent to <span className="font-bold text-ink break-words">{email}</span>. Open it on this device and
              you&rsquo;re in. Check spam if it is slow.
            </p>
          </Card>
        ) : (
          <form onSubmit={submit} className="card grid gap-3 p-5">
            <label htmlFor="email" className="eyebrow">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line-2 bg-soft px-4 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none"
              placeholder="you@example.com"
            />
            <Button type="submit" className="w-full" busy={busy} disabled={!email}>
              {busy ? "Sending…" : "Email me a sign-in link"}
            </Button>
            {error && <ErrorBox message={error} />}
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-muted">
        You only need an account to buy a pass or keep a league on file. Looking is always free.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
