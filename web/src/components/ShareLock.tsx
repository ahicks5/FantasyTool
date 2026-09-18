"use client";
import { useState } from "react";
import { createShare } from "@/lib/api";
import type { LockCall } from "@/lib/types";
import { LockShareCard } from "./ShareCard";
import { Button } from "./ui";

/**
 * Turns a start/sit call into a public link — free, no account, no purchase.
 *
 * This is the growth loop. A paying user posts a handful of trade verdicts a season; every
 * user, paying or not, has one or three of these every single week. Sharing used to sit
 * behind the $5 Trade Lab, which meant almost nobody could post anything at all.
 */
export function ShareLock({ call, leagueName, week }: { call: LockCall; leagueName: string; week: number }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function make() {
    setBusy(true);
    setError("");
    try {
      const r = await createShare({ kind: "lock", call, league_name: leagueName, week });
      setUrl(r.url);
    } catch (e) {
      setError((e as Error).message);
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
      <div className="mt-3">
        <Button variant="secondary" size="sm" onClick={make} disabled={busy}>
          {busy ? "Creating link…" : "Share this call"}
        </Button>
        {error && <p className="mt-2 text-sm text-sit">{error}</p>}
      </div>
    );

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-paper p-2">
        <code className="min-w-0 flex-1 truncate px-1 text-[13px]">{url}</code>
        <Button size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-muted">Long-press the card to save the image.</p>
      <div className="mt-2">
        <LockShareCard call={call} leagueName={leagueName} week={week} />
      </div>
    </div>
  );
}
