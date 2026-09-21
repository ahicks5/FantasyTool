"use client";
/**
 * The weekly-email opt-in: one checkbox, on /login, under the signed-in block.
 *
 * Off is the only safe default, so this never pre-ticks itself and never treats a
 * failed read as a "no" it can act on — an address we are unsure about is one we do
 * not put on a send list (see `edge/delivery/send.recipients`).
 *
 * The preference lives on the account, not in this browser, because the send is a
 * server job that has to know who asked. The one exception is the mock build
 * (`NEXT_PUBLIC_API_URL` unset), which has no backend to ask and keeps the tick local
 * so the demo can be clicked through.
 */
import { useCallback, useEffect, useState } from "react";
import { IconCheck } from "@/components/icons";
import { getEmailOptIn as readOptIn, setEmailOptIn as writeOptIn } from "@/lib/api";
import { EMAIL } from "@/lib/vocab";

type State = "loading" | "unavailable" | "idle" | "saving" | "saved" | "failed";

export default function EmailOptIn() {
  const [on, setOn] = useState(false);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let live = true;
    readOptIn()
      .then((value) => {
        if (!live) return;
        setOn(value);
        setState("idle");
      })
      .catch(() => {
        // We do not know what they chose, so we do not draw a box that claims to.
        if (live) setState("unavailable");
      });
    return () => {
      live = false;
    };
  }, []);

  const toggle = useCallback(
    async (next: boolean) => {
      setOn(next);
      setState("saving");
      try {
        await writeOptIn(next);
        setState("saved");
      } catch {
        setOn(!next); // the box shows what we actually hold, not what was attempted
        setState("failed");
      }
    },
    [],
  );

  const busy = state === "loading" || state === "saving";
  const disabled = busy || state === "unavailable";

  // Status is words, never colour alone: the same line reads on a monochrome screen.
  const status =
    state === "saving"
      ? EMAIL.saving
      : state === "saved"
        ? on
          ? EMAIL.savedOn
          : EMAIL.savedOff
        : state === "failed"
          ? EMAIL.failed
          : state === "unavailable"
            ? EMAIL.unavailable
            : "";

  return (
    <div className="card mt-2.5 p-5">
      <div className="eyebrow">{EMAIL.eyebrow}</div>
      <label
        className={`mt-2 flex min-h-11 items-start gap-3 ${disabled ? "cursor-default" : "cursor-pointer"}`}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={on}
          disabled={disabled}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span
          aria-hidden
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--color-paper)] ${
            on ? "border-ink bg-ink text-paper" : "border-line-2 bg-soft text-transparent"
          } ${disabled ? "opacity-60" : ""}`}
        >
          <IconCheck size={16} strokeWidth={3} />
        </span>
        <span className="text-[15px] leading-snug text-ink">{EMAIL.label}</span>
      </label>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{EMAIL.note}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{EMAIL.pending}</p>
      <p aria-live="polite" className="mt-1.5 min-h-[1.1rem] text-[13px] leading-relaxed text-ink-2">
        {status}
      </p>
    </div>
  );
}
