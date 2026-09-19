"use client";
import { useState } from "react";
import { createShare } from "@/lib/api";
import type { LockCall } from "@/lib/types";
import { Button, ErrorBox } from "./ui";

/**
 * Turns a start/sit call into a public link — free, no account, no purchase.
 *
 * This is the growth loop. A paying user posts a handful of trade verdicts a season; every
 * user, paying or not, has one or three of these every single week. Sharing used to sit
 * behind the $5 Trade Lab, which meant almost nobody could post anything at all.
 *
 * It sits on its own line under the card's controls rather than joining them: that row is
 * already tuned to pair up at 320px, and a fifth control will not fit a 211px line.
 */
export function ShareLock({ call, leagueName, week }: { call: LockCall; leagueName: string; week: number }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const r = await createShare({ kind: "lock", call, league_name: leagueName, week });
      setUrl(r.url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the link and copy it by hand.");
    }
  }

  if (!url)
    return (
      <div className="mt-2">
        <Button variant="secondary" size="sm" onClick={make} busy={busy} className="w-full">
          {busy ? "Making the link…" : "Share this call"}
        </Button>
        {error ? <div className="mt-2"><ErrorBox error={error} /></div> : null}
      </div>
    );

  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl border border-line-2 bg-soft p-2">
      <code className="min-w-0 flex-1 truncate px-1 text-[13px]">{url}</code>
      <Button size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
