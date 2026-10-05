"use client";
/**
 * Where Yahoo sends the owner back after they sign in (`?code=&state=`). Check the state is
 * the one this tab sent, trade the one-time code for tokens through the API, then return to
 * the connect page with Yahoo picked. The code is taken off the address bar at once, like the
 * reset token, so it never sits in history or rides out in a Referer.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { leagueHome, walkStore } from "@/lib/onboarding";
import { finishYahooSignIn } from "@/lib/api";
import { takeYahooState } from "@/lib/yahooAuth";
import { ErrorBox, Eyebrow, LinkButton } from "@/components/ui";
import { DoorFrame } from "@/components/account/Door";
import { YAHOO } from "@/lib/vocab";

function YahooReturnInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  // Effects run twice in development; the state nonce can only be taken once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");
    window.history.replaceState(null, "", "/connect/yahoo");
    (async () => {
      if (!code || !takeYahooState(state)) throw new Error(denied ? YAHOO.expired : YAHOO.badState);
      await finishYahooSignIn(code);
      // Opened from the sign-up walk, the league list opens back in the walk (`leagueHome`).
      router.replace(`${leagueHome(walkStore())}?platform=yahoo`);
    })().catch(setError);
  }, [params, router]);

  return (
    <DoorFrame>
      <div className="pt-8 rise">
        <Eyebrow>{YAHOO.label}</Eyebrow>
        <h1 className="display mt-2 text-[28px] leading-[1.06]">{error ? YAHOO.signIn : YAHOO.returning}</h1>
      </div>
      {error ? (
        <div className="mt-6 grid gap-3 rise rise-1">
          <ErrorBox error={error} />
          <LinkButton href="/connect?platform=yahoo" variant="secondary" className="w-full">
            {YAHOO.back}
          </LinkButton>
        </div>
      ) : null}
    </DoorFrame>
  );
}

export default function YahooReturnPage() {
  return (
    <Suspense fallback={null}>
      <YahooReturnInner />
    </Suspense>
  );
}
