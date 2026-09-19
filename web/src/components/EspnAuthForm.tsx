"use client";
import { useState } from "react";
import { clearEspnAuth, saveEspnAuth, useEspnAuth } from "@/lib/espnAuth";
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
      <h2 className="display text-[21px] leading-tight">
        {expired ? "ESPN needs you to sign in again" : "This league is private"}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        {expired
          ? "The cookies you gave us stopped working. ESPN rotates them every few weeks — paste fresh ones and you are back in."
          : "ESPN only shows a private league to someone signed in. Paste two values from your own browser and the booth can read it."}
      </p>

      <p className="mt-3 rounded-xl bg-soft px-4 py-3 text-[13px] leading-relaxed text-muted">
        These stay on this device. They go out with your requests and the server never saves
        them — so nothing to leak from our side, and you can wipe them here any time.
      </p>

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
          <li>Open fantasy.espn.com in a browser where you are signed in.</li>
          <li>
            Open developer tools (<span className="font-mono text-[13px]">F12</span>), then{" "}
            <b className="text-ink">Application</b> → <b className="text-ink">Cookies</b> →{" "}
            <span className="font-mono text-[13px]">espn.com</span>.
          </li>
          <li>
            Copy the values of <span className="font-mono text-[13px]">espn_s2</span> and{" "}
            <span className="font-mono text-[13px]">SWID</span>.
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
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          disabled={!ready || busy}
          onClick={() => {
            saveEspnAuth(s2, swid);
            setS2("");
            setSwid("");
            onSaved();
          }}
        >
          {busy ? "Checking…" : "Unlock this league"}
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
