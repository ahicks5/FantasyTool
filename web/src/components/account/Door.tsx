"use client";
/** The door: the frame, the where-to menu once you are in, and the sign-in page body that /login and /reset share. */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthForm, type AuthMode } from "./AuthForm";
import { WhereTo } from "./WhereTo";
import { hasToken } from "@/lib/auth";
import { enterLastLeague } from "@/lib/openLeague";
import { useSession } from "@/lib/session";
import { safeNext } from "@/lib/identity";
import { IconChevron } from "@/components/icons";
import { Eyebrow } from "@/components/ui";
import { ACCOUNT, LINES } from "@/lib/vocab";
import { HomeMark } from "@/components/HomeMark";

/**
 * The chrome the account pages share: wordmark and one column. Signed in, the wordmark
 * is the short "PHF" and the header carries the way back to the league, because the
 * account page is a side room and nobody should get stuck in it (Andrew, 2026-09-27).
 */
export function DoorFrame({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const inside = session.signedIn;
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between gap-3">
        <HomeMark className="text-[26px]" />
        {inside && (
          <Link
            href="/home"
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line-2 px-4 text-[13px] font-bold hover:bg-soft"
            data-testid="back-to-office"
          >
            {ACCOUNT.back}
            <IconChevron size={13} strokeWidth={2.8} />
          </Link>
        )}
      </header>
      {children}
    </main>
  );
}

/** Where a sign-in page sends you afterwards; the rule lives with the other sign-in rules. */
export { safeNext };

/**
 * What the door shows while it cannot yet say who you are: in the pre-built page (before the
 * app's code has run) and while `/api/me` answers for a browser holding a token. A cold API
 * can take a while to wake, so after a few seconds it says so instead of sitting silent.
 */
function DoorWait() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mt-6 rise rise-1" data-testid="door-checking" role="status" aria-live="polite">
      <div className="card flex items-center gap-3 p-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-start motion-safe:animate-pulse" aria-hidden />
        <span className="text-[15px] font-bold">{ACCOUNT.checking}</span>
      </div>
      {slow && <p className="mt-3 text-[13px] leading-relaxed text-muted">{ACCOUNT.checkingSlow}</p>}
    </div>
  );
}

export function DoorWaitPage() {
  return (
    <DoorFrame>
      <div className="pt-8 rise">
        <Eyebrow>{LINES.threshold}</Eyebrow>
      </div>
      <DoorWait />
    </DoorFrame>
  );
}

function LoginInner({ start }: { start: AuthMode }) {
  const router = useRouter();
  // A sign-in goes back upstairs; a new account (a new number signed up here) carries on
  // into the sign-up walk at its first gap, the league. `?next=` overrides both.
  const asked = useSearchParams().get("next");
  const next = safeNext(asked, start === "register" ? "/account" : "/home");
  const [mode, setModeRaw] = useState<AuthMode>(start);
  // Creating an account is the sign-up walk now (docs/SPEC-ONBOARDING.md), not this form.
  const setMode = (m: AuthMode) => (m === "register" ? router.push(asked ? `/register?next=${encodeURIComponent(asked)}` : "/register") : setModeRaw(m));
  const session = useSession();
  // A browser holding a token is probably signed in: say we are checking rather than flash
  // the sign-in form and then swap it for the account (Andrew, 2026-10-05: "that limbo").
  const checking = session.loading && hasToken();
  // Set the moment a sign-in succeeds: the form stays on screen (its button still turning)
  // until we are on the desk, instead of swapping to "Checking you in" and then the menu
  // (Andrew, 2026-10-05, W-010).
  const [leaving, setLeaving] = useState(false);
  const title = mode === "register" ? ACCOUNT.register : mode === "forgot" ? ACCOUNT.reset.title : ACCOUNT.signIn;
  // Fewest words at the door (Andrew, 2026-09-27): only the reset form keeps a line.
  const lead = mode === "forgot" ? ACCOUNT.reset.lead : null;

  if (checking && !leaving) return <DoorWaitPage />;
  // In: a short menu (your leagues, add one, the account), not the settings page. It is the
  // league switcher for someone who opens /login already signed in; a fresh sign-in goes
  // straight to the desk (W-011).
  if (session.signedIn && !leaving) {
    return (
      <DoorFrame>
        <WhereTo next={asked ? next : null} />
      </DoorFrame>
    );
  }
  return (
    <DoorFrame>
      <div className="pt-8 rise">
        <Eyebrow>{LINES.threshold}</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{title}</h1>
        {lead && <p className="mt-2 max-w-[24rem] text-[15px] leading-relaxed text-muted">{lead}</p>}
      </div>
      <div className="mt-6 rise rise-1">
        <div className="card p-5">
          {/* Done: a new number carries on into the walk; an asked-for page is honoured;
              otherwise this page turns into the menu once the session knows who you are. */}
          <AuthForm
            mode={mode}
            onMode={setMode}
            onDone={async (me, created) => {
              if (created && !asked) return router.push("/register");
              if (asked) return router.push(next);
              // No league yet: the menu is the way to add one.
              if (!me.leagues.length) return;
              setLeaving(true);
              if (await enterLastLeague(me)) router.replace("/home");
              else setLeaving(false); // it would not open here: the menu takes it from here
            }}
          />
        </div>
      </div>
    </DoorFrame>
  );
}

export function AuthDoor({ start }: { start: AuthMode }) {
  return (
    <Suspense fallback={<DoorWaitPage />}>
      <LoginInner start={start} />
    </Suspense>
  );
}
