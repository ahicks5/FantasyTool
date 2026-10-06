"use client";
/** The door: the frame, the where-to menu once you are in, and the sign-in page body that /login and /reset share. */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthForm, type AuthMode } from "./AuthForm";
import { WhereTo } from "./WhereTo";
import { hasToken } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { safeNext } from "@/lib/identity";
import { enterAfterSignIn } from "@/lib/openLeague";
import { IconChevron } from "@/components/icons";
import { Eyebrow, Wordmark } from "@/components/ui";
import type { Me } from "@/lib/types";
import { ACCOUNT, LINES } from "@/lib/vocab";

/**
 * The chrome the account pages share: wordmark and one column. Signed in, the header
 * carries the way back to the league, because the account page is a side room and nobody
 * should get stuck in it (Andrew, 2026-09-27). `back={false}` keeps it off while a sign-in
 * is still on its way upstairs, so the header does not change under the spinning button.
 */
export function DoorFrame({ children, back = true }: { children: React.ReactNode; back?: boolean }) {
  const session = useSession();
  const inside = session.signedIn && back;
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between gap-3">
        <Wordmark className="text-[26px]" />
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

/** A check this quick never shows the card at all, so a fast answer never flashes it (W-010). */
const CHECKING_AFTER_MS = 300;

/**
 * What the door shows while it cannot yet say who you are: in the pre-built page (before the
 * app's code has run) and while `/api/me` answers for a browser holding a token. Only past
 * ~300ms, so a quick check goes straight to the page. A cold API can take a while to wake,
 * so after a few seconds it says so instead of sitting silent.
 */
function DoorWait() {
  const [shown, setShown] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const show = setTimeout(() => setShown(true), CHECKING_AFTER_MS);
    const t = setTimeout(() => setSlow(true), 4000);
    return () => {
      clearTimeout(show);
      clearTimeout(t);
    };
  }, []);
  if (!shown) return <div className="mt-6" aria-busy />;
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
  // A sign-in goes straight upstairs, to the call sheet on the last league (W-011); a new
  // account (a new number signed up here) carries on into the sign-up walk. `?next=`
  // overrides both.
  const asked = useSearchParams().get("next");
  const next = safeNext(asked, start === "register" ? "/account" : "/home");
  const [mode, setModeRaw] = useState<AuthMode>(start);
  // Creating an account is the sign-up walk now (docs/SPEC-ONBOARDING.md), not this form.
  const register = asked ? `/register?next=${encodeURIComponent(asked)}` : "/register";
  const setMode = (m: AuthMode) => (m === "register" ? router.push(register) : setModeRaw(m));
  const session = useSession();
  // A sign-in on this page, on its way in: the form and its spinning button stay on screen
  // until the league is open and the page has moved on (W-010). No checking card, no menu.
  const [entering, setEntering] = useState(false);
  // A browser holding a token on a cold load is probably signed in: say we are checking
  // rather than flash the sign-in form and then swap it (Andrew, 2026-10-05: "that limbo").
  const checking = session.loading && hasToken();
  const title = mode === "register" ? ACCOUNT.register : mode === "forgot" ? ACCOUNT.reset.title : ACCOUNT.signIn;
  // Fewest words at the door (Andrew, 2026-09-27): only the reset form keeps a line.
  const lead = mode === "forgot" ? ACCOUNT.reset.lead : null;

  /** Signed in here: a new number to the walk, anyone else upstairs. Holds the form until gone. */
  async function signedIn(me: Me, created?: boolean): Promise<void> {
    setEntering(true);
    const to = created && !asked ? "/register" : await enterAfterSignIn(me, asked ? next : null);
    // No league on the account yet: "Where to?" is the next page, and it is just "Add a
    // league" and the settings.
    if (!to) return setEntering(false);
    router.push(to);
    // The page is leaving: keep the button spinning until it has.
    return new Promise<void>(() => undefined);
  }

  if (!entering) {
    if (checking) return <DoorWaitPage />;
    // Opened already signed in: the switcher (your leagues, add one, the account).
    if (session.signedIn) {
      return (
        <DoorFrame>
          <WhereTo next={asked ? next : null} />
        </DoorFrame>
      );
    }
  }
  return (
    <DoorFrame back={!entering}>
      <div className="pt-8 rise">
        <Eyebrow>{LINES.threshold}</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{title}</h1>
        {lead && <p className="mt-2 max-w-[24rem] text-[15px] leading-relaxed text-muted">{lead}</p>}
      </div>
      <div className="mt-6 rise rise-1">
        <div className="card p-5">
          <AuthForm mode={mode} onMode={setMode} onDone={signedIn} />
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
