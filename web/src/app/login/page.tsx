"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, ErrorBox, Wordmark } from "@/components/ui";
import { getUserEmail, sendMagicLink, signOut, supabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
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
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <Link href="/" aria-label="Edge home">
        <Wordmark className="text-2xl" />
      </Link>
      <h1 className="mb-3 mt-6 text-2xl font-black tracking-tight">Sign in</h1>
      {current ? (
        <Card>
          <p>
            Signed in as <b>{current}</b>
            {dev ? " (dev user)" : ""}.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/home" className="rounded-xl bg-ink px-4 py-3 font-bold text-white">
              Go to my team
            </Link>
            {!dev && (
              <Button variant="secondary" onClick={() => signOut().then(() => setCurrent(null))}>
                Sign out
              </Button>
            )}
          </div>
        </Card>
      ) : !configured ? (
        <Card>
          <p className="text-muted">
            Login isn&rsquo;t configured on this deployment. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, or <code>NEXT_PUBLIC_DEV_USER</code> for local dev.
          </p>
        </Card>
      ) : sent ? (
        <Card>
          <p>
            Check your email. We sent a sign-in link to <b>{email}</b>. Open it on this device.
          </p>
        </Card>
      ) : (
        <form onSubmit={submit} className="grid gap-3">
          <label htmlFor="email" className="text-sm font-bold">
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
            className="w-full rounded-xl border-2 border-line bg-paper px-4 py-3 text-base"
            placeholder="you@example.com"
          />
          <Button type="submit" disabled={busy || !email}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </Button>
          <p className="text-sm text-muted">No password. The link signs you in and unlocks anything you&rsquo;ve bought.</p>
          {error && <ErrorBox message={error} />}
        </form>
      )}
    </main>
  );
}
