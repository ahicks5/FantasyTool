"use client";
/** Confirm an email address from the link we mailed (`?token=`), then carry on signed in. */
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DoorFrame } from "@/components/account/Door";
import { IconCheck } from "@/components/icons";
import { Eyebrow, LinkButton, Spinner } from "@/components/ui";
import { verifyEmail } from "@/lib/api";
import { ONBOARD } from "@/lib/vocab";

function Confirm() {
  const params = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "bad">("working");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get("token") ?? "";
    // The token comes off the address bar at once: it signs someone in, and a shared
    // screenshot of the bar must not.
    window.history.replaceState(null, "", "/verify");
    (token ? verifyEmail(token) : Promise.reject(new Error("no token")))
      .then(() => setState("done"))
      .catch(() => setState("bad"));
  }, [params]);

  return (
    <div className="pt-8 rise" data-testid={`verify-${state}`}>
      <Eyebrow>{ONBOARD.confirm.eyebrow}</Eyebrow>
      {state === "working" ? (
        <p className="mt-4 flex items-center gap-3 text-[15px] text-muted">
          <Spinner size={18} label={null} />
          {ONBOARD.confirm.working}
        </p>
      ) : state === "done" ? (
        <>
          <span className="mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-start-soft text-start">
            <IconCheck size={24} strokeWidth={2.6} />
          </span>
          <h1 className="display mt-3 text-[32px] leading-[1.05]">{ONBOARD.confirm.done}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{ONBOARD.confirm.doneLine}</p>
          <LinkButton href="/home" variant="start" className="mt-6 w-full">
            {ONBOARD.confirm.cta}
          </LinkButton>
        </>
      ) : (
        <>
          <p className="mt-4 text-[15px] leading-relaxed text-ink">{ONBOARD.confirm.bad}</p>
          <LinkButton href="/account" variant="secondary" className="mt-6 w-full">
            {ONBOARD.confirm.account}
          </LinkButton>
        </>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <DoorFrame>
      <Suspense fallback={null}>
        <Confirm />
      </Suspense>
    </DoorFrame>
  );
}
