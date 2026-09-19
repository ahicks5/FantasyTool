"use client";
import { useState } from "react";
import { clearEspnAuth, saveEspnAuth, useEspnAuth } from "@/lib/espnAuth";
import { IconLock } from "@/components/icons";
import { Button } from "@/components/ui";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 font-mono text-[13px] text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";

/**
 * Asks for the two ESPN cookies a private league needs, and says plainly what happens to them.
 *
 * `expired` switches the copy: the first time we are asking for something they have not given
 * us, the second time we are telling them what they gave us has stopped working. Same form,
 * different sentence, and the difference is the whole of the user's problem.
 */
export function EspnAuthForm({
  expired = false,
  onSaved,
  busy = false,
}: {
  expired?: boolean;
  onSaved: () => void;
  busy?: boolean;
}) {
  const stored = useEspnAuth();
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  const [open, setOpen] = useState(false);
  const ready = s2.trim().length > 0 && swid.trim().length > 0;

  return (
    <div className="card mt-5 p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-soft text-ink-2">
          <IconLock size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="display text-[21px] leading-tight">
            {expired ? "ESPN wants a fresh sign-in" : "That league is private"}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {expired
              ? "The two values you gave us stopped working — ESPN rotates them every few weeks. Grab fresh ones from your browser and you are straight back in."
              : "ESPN only opens a private league to someone signed in. Paste two values from your own browser and we can read it — we only ever read with them, and never post, join or change anything in your league."}
          </p>
        </div>
      </div>

      {/* The trust moment. Every sentence here is literally true of what the code does —
          the cookies never leave the browser except as headers on the user's own requests,
          and nothing about them can be softened without making it a lie. */}
      <div className="mt-4 rounded-xl bg-soft px-4 py-3.5">
        <div className="eyebrow">What happens to these</div>
        <ul className="mt-2 grid gap-2 text-[13px] leading-relaxed text-muted">
          <li>
            <b className="text-ink">They stay in this browser.</b> They ride along as headers on your own league
            requests and the server never writes them down — nothing of yours is sitting on our side to leak.
          </li>
          <li>
            <b className="text-ink">They are a read session for your whole ESPN account.</b> ESPN gives no way to
            limit them to one league, and we cannot revoke them — which is exactly why they live with you and not
            with us.
          </li>
          <li>
            <b className="text-ink">Yours to wipe, any time.</b> &ldquo;Forget these&rdquo; clears them from this
            device. Never paste them into a chat, an email or a bug report — pull fresh ones from your browser
            instead.
          </li>
          <li>
            The honest trade-off: because we keep nothing, the weekly email cannot read a private league.
          </li>
        </ul>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 text-[14px] font-semibold text-ink underline underline-offset-4"
        aria-expanded={open}
      >
        {open ? "Hide" : "Where do I find these?"}
      </button>
      {open && (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-muted">
          <li>On a computer, open fantasy.espn.com in the browser where you are already signed in.</li>
          <li>
            Open developer tools (<span className="font-mono text-[13px]">F12</span>), then{" "}
            <b className="text-ink">Application</b> (<b className="text-ink">Storage</b> in Firefox) →{" "}
            <b className="text-ink">Cookies</b> → <span className="font-mono text-[13px]">espn.com</span>.
          </li>
          <li>
            Copy the values of <span className="font-mono text-[13px]">espn_s2</span> and{" "}
            <span className="font-mono text-[13px]">SWID</span>, and paste them below. Takes about a minute.
          </li>
        </ol>
      )}

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
            With the curly braces or without them — we tidy it up either way.
          </span>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
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
          {busy ? "Checking with ESPN…" : "Open this league"}
        </Button>
        {stored && (
          <button
            type="button"
            className="text-[14px] font-semibold text-muted underline underline-offset-4"
            onClick={() => clearEspnAuth()}
          >
            Forget these
          </button>
        )}
      </div>
    </div>
  );
}
