"use client";
/**
 * The two ESPN cookies a private league needs, asked for in the shape of a form rather than
 * a lecture.
 *
 * It only mounts once a request has come back saying the league is private, so a public
 * league never meets it. That is also why `status` is required rather than nullable: there
 * is always a failure to name above the fields — either we need the two values, or the ones
 * we have stopped working. Same form either way.
 *
 * The honesty line below the fields is a disclosure, not copy. Both halves of it are true of
 * what the code does and neither can be cut: the values never leave this browser, and they
 * are a session for the whole ESPN account. Everything else is behind a click.
 */

import { useState } from "react";
import { clearEspnAuth, saveEspnAuth, useEspnAuth } from "@/lib/espnAuth";
import { IconLock } from "@/components/icons";
import { Button } from "@/components/ui";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 font-mono text-[13px] text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";

const DISCLOSURE = "min-h-11 text-left text-[14px] font-semibold text-ink underline underline-offset-4";

const CODE = "font-mono text-[13px] text-ink";

export function EspnAuthForm({
  status,
  onSaved,
  busy = false,
}: {
  /** The failure that opened this form. `expired` picks which one sentence to show. */
  status: { expired: boolean };
  onSaved: () => void;
  busy?: boolean;
}) {
  const stored = useEspnAuth();
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  const [showFind, setShowFind] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const ready = s2.trim().length > 0 && swid.trim().length > 0;

  return (
    <section className="mt-7 rounded-[var(--radius-card)] border border-line-2 bg-paper p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-soft text-ink-2"
        >
          <IconLock size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="display text-[18px] leading-tight">Private league only</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">A public league needs nothing here.</p>
        </div>
      </div>

      <p
        role="status"
        className="mt-3 rounded-xl bg-sit-soft px-3.5 py-2.5 text-[13px] font-semibold leading-snug text-sit"
      >
        {status.expired
          ? "Those two stopped working. ESPN rotates them every few weeks. Paste fresh ones."
          : "That league is private. Paste the two values below."}
      </p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-[13px] font-semibold text-ink">espn_s2</span>
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
          <span className="text-[13px] font-semibold text-ink">SWID</span>
          <input
            className={`${FIELD} mt-1.5`}
            value={swid}
            onChange={(e) => setSwid(e.target.value)}
            placeholder="{XXXXXXXX-XXXX-…}"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="mt-1.5 block text-[12px] leading-relaxed text-muted">
            Braces or no braces. We tidy it either way.
          </span>
        </label>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        These stay in this browser and the server never writes them down. They are a read session for your whole ESPN
        account, not just this league.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <button type="button" onClick={() => setShowFind((v) => !v)} className={DISCLOSURE} aria-expanded={showFind}>
          {showFind ? "Hide" : "Where do I find these?"}
        </button>
        <button
          type="button"
          onClick={() => setShowTrust((v) => !v)}
          className={`${DISCLOSURE} font-normal text-muted`}
          aria-expanded={showTrust}
        >
          {showTrust ? "Hide" : "Handling rules"}
        </button>
      </div>

      {showFind && (
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[14px] leading-snug text-muted">
          <li>
            On a computer, open <span className={CODE}>fantasy.espn.com</span>, signed in.
          </li>
          <li>
            Press <span className={CODE}>F12</span> → <b className="text-ink">Application</b> →{" "}
            <b className="text-ink">Cookies</b> → <span className={CODE}>espn.com</span>. Firefox calls it{" "}
            <b className="text-ink">Storage</b>.
          </li>
          <li>
            Copy <span className={CODE}>espn_s2</span> and <span className={CODE}>SWID</span>. Paste them above.
          </li>
        </ol>
      )}

      {showTrust && (
        <ul className="mt-2 grid gap-1.5 text-[13px] leading-relaxed text-muted">
          <li>ESPN cannot scope them to one league, and we cannot revoke them. That is why they live with you.</li>
          <li>Never paste them into a chat, an email or a bug report. Pull fresh ones instead.</li>
          <li>&ldquo;Forget these&rdquo; wipes them from this device.</li>
          <li>The trade-off: because we keep nothing, the weekly email cannot read a private league.</li>
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
          {busy ? "Checking with ESPN…" : "Save these"}
        </Button>
        {stored && (
          <button
            type="button"
            className="min-h-11 text-[14px] font-semibold text-muted underline underline-offset-4"
            onClick={() => clearEspnAuth()}
          >
            Forget these
          </button>
        )}
      </div>
      {stored && <p className="mt-1 text-[12px] text-muted">Saved on this device.</p>}
    </section>
  );
}
