"use client";
/**
 * A private ESPN league, met on /connect: the key first, the two other doors folded under it.
 *
 * It only mounts once a request has come back saying the league is private, so a public
 * league never meets it. That is also why `status` is required rather than nullable: there
 * is always a failure to name above the button, either we need the key or the one we have
 * stopped working. Same card either way.
 *
 * The order is Andrew's (2026-09-28): the phone way leads. "Get my key" opens the walk at
 * /connect/espn for this league; the bookmark it builds comes back with the key saved and
 * this page loads the league on its own. Under it, folded, the two fields for anyone who
 * already has the values. One option (Andrew, 2026-09-28), so no commissioner note here.
 *
 * The honesty line below the fields is a disclosure, not copy. Both halves of it are true of
 * what the code does and neither can be cut: the values never leave this browser, and they
 * are a session for the whole ESPN account.
 */

import { useState } from "react";
import { clearEspnAuth, saveEspnAuth, useEspnAuth } from "@/lib/espnAuth";
import { IconChevron, IconLock } from "@/components/icons";
import { Button, LinkButton } from "@/components/ui";
import { ESPN_KEY } from "@/lib/vocab";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 font-mono text-[13px] text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";


export function EspnAuthForm({
  status,
  leagueId,
  onSaved,
  busy = false,
  openPaste = false,
}: {
  /** The failure that opened this card. `expired` picks which one sentence to show. */
  status: { expired: boolean };
  /** The league the key is for, so the walk's bookmark comes back to it. */
  leagueId: string;
  onSaved: () => void;
  busy?: boolean;
  /** Arrived from the walk's "paste them yourself" door: open the fields at once. */
  openPaste?: boolean;
}) {
  const stored = useEspnAuth();
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  // The fields open on the walk's say-so until the reader touches the fold themselves.
  const [pasteToggle, setPasteToggle] = useState<boolean | null>(null);
  const showPaste = pasteToggle ?? openPaste;
  const ready = s2.trim().length > 0 && swid.trim().length > 0;
  const walk = `/connect/espn?id=${encodeURIComponent(leagueId)}`;

  return (
    <section className="mt-7 rounded-[var(--radius-card)] border border-line-2 bg-paper p-4" data-testid="espn-auth">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-soft text-ink-2"
        >
          <IconLock size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="display text-[18px] leading-tight">{ESPN_KEY.form.title}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{ESPN_KEY.form.sub}</p>
        </div>
      </div>

      <p
        role="status"
        className="mt-3 rounded-xl bg-sit-soft px-3.5 py-2.5 text-[13px] font-semibold leading-snug text-sit"
      >
        {status.expired ? ESPN_KEY.form.expired : ESPN_KEY.form.needed}
      </p>

      <div className="mt-4">
        <LinkButton href={walk} variant="start" className="w-full">
          {ESPN_KEY.form.get}
          <IconChevron size={14} strokeWidth={2.8} />
        </LinkButton>
      </div>

      <button
        type="button"
        onClick={() => setPasteToggle(!showPaste)}
        className="mt-3 min-h-11 text-[13px] font-semibold text-muted underline underline-offset-4"
        aria-expanded={showPaste}
      >
        {showPaste ? ESPN_KEY.form.pasteClose : ESPN_KEY.form.pasteOpen}
      </button>

      {showPaste && (
        <div className="mt-3 space-y-3" data-testid="espn-paste">
          <label className="block">
            <span className="text-[13px] font-semibold text-ink">{ESPN_KEY.form.s2}</span>
            <input
              className={`${FIELD} mt-1.5`}
              value={s2}
              onChange={(e) => setS2(e.target.value)}
              placeholder="AEB1x..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-ink">{ESPN_KEY.form.swid}</span>
            <input
              className={`${FIELD} mt-1.5`}
              value={swid}
              onChange={(e) => setSwid(e.target.value)}
              placeholder="{XXXXXXXX-XXXX-…}"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="mt-1.5 block text-[12px] leading-relaxed text-muted">{ESPN_KEY.form.swidHint}</span>
          </label>
          <p className="text-[12px] leading-relaxed text-muted">{ESPN_KEY.form.handling}</p>
          <Button
            busy={busy}
            disabled={!ready}
            onClick={() => {
              saveEspnAuth(s2, swid);
              setS2("");
              setSwid("");
              onSaved();
            }}
          >
            {busy ? ESPN_KEY.form.checking : ESPN_KEY.form.save}
          </Button>
        </div>
      )}

      {stored && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {ESPN_KEY.form.stored}
          <button
            type="button"
            className="min-h-11 text-[13px] font-semibold text-ink underline underline-offset-4"
            onClick={() => clearEspnAuth()}
          >
            {ESPN_KEY.form.forget}
          </button>
        </p>
      )}
    </section>
  );
}
