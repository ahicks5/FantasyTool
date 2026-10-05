"use client";
/** The door: the frame, the signed-in card, and the sign-in page body that /login, /register and /reset share. */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthForm, type AuthMode } from "./AuthForm";
import { logout } from "@/lib/api";
import { useSession } from "@/lib/session";
import { accountContact, accountLabel } from "@/lib/account";
import { safeNext } from "@/lib/identity";
import { IconChevron } from "@/components/icons";
import { Button, Card, Eyebrow, LinkButton, Wordmark } from "@/components/ui";
import { ACCOUNT, LINES } from "@/lib/vocab";

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
        <Link href={inside ? "/home" : "/"} aria-label="Owner's Suite home" className="flex min-h-11 items-center">
          <Wordmark className="text-[26px]" short={inside} />
        </Link>
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

export function SignedInCard({ next }: { next: string }) {
  const session = useSession();
  const account = session.account;
  if (!account) return null;
  return (
    <Card>
      <Eyebrow>{ACCOUNT.plan.current}</Eyebrow>
      <p className="mt-1.5 text-[17px] font-bold break-words">{accountLabel(account)}</p>
      {accountContact(account) && <p className="text-[13px] text-muted break-words">{accountContact(account)}</p>}
      <p className="mt-2 text-[13px] font-bold text-ink-2">
        {account.plan.tier === "premium" ? `${ACCOUNT.plan.premium} · ${account.plan.name}` : ACCOUNT.plan.free}
        {account.is_admin && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-paper">{ACCOUNT.plan.admin}</span>}
      </p>
      <div className="mt-5 grid gap-2.5">
        <LinkButton href={next} className="w-full">
          {ACCOUNT.back}
        </LinkButton>
        <LinkButton href="/account" variant="secondary" className="w-full">
          {ACCOUNT.title}
        </LinkButton>
        <Button variant="ghost" className="w-full" onClick={() => logout()}>
          {ACCOUNT.signOut}
        </Button>
      </div>
    </Card>
  );
}

function LoginInner({ start }: { start: AuthMode }) {
  const router = useRouter();
  // A sign-in goes back upstairs; a new account lands on its own page first, where the
  // one thing left is to link a league. `?next=` overrides both (the connect gate uses it).
  const asked = useSearchParams().get("next");
  const next = safeNext(asked, start === "register" ? "/account" : "/home");
  const [mode, setMode] = useState<AuthMode>(start);
  const session = useSession();
  const title = mode === "register" ? ACCOUNT.register : mode === "forgot" ? ACCOUNT.reset.title : ACCOUNT.signIn;
  // Fewest words at the door (Andrew, 2026-09-27): only the reset form keeps a line.
  const lead = mode === "forgot" ? ACCOUNT.reset.lead : null;

  return (
    <DoorFrame>
      <div className="pt-8 rise">
        <Eyebrow>{LINES.threshold}</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{session.signedIn ? "Signed in" : title}</h1>
        {!session.signedIn && lead && <p className="mt-2 max-w-[24rem] text-[15px] leading-relaxed text-muted">{lead}</p>}
      </div>
      <div className="mt-6 rise rise-1">
        {session.signedIn ? (
          <SignedInCard next={next} />
        ) : (
          <div className="card p-5">
            <AuthForm mode={mode} onMode={setMode} onDone={(_, created) => router.push(created && !asked ? "/account" : next)} />
          </div>
        )}
      </div>
    </DoorFrame>
  );
}

export function AuthDoor({ start }: { start: AuthMode }) {
  return (
    <Suspense fallback={null}>
      <LoginInner start={start} />
    </Suspense>
  );
}
