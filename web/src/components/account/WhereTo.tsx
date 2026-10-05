"use client";
/** Where to, once you are in: your leagues (one tap each), add a league, or the account. The door's signed-in face. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { openSavedLeague } from "@/lib/openLeague";
import { useSession } from "@/lib/session";
import type { MeLeague } from "@/lib/types";
import { IconChevron } from "@/components/icons";
import { Button, ErrorBox, Eyebrow, Spinner } from "@/components/ui";
import { ACCOUNT, YAHOO } from "@/lib/vocab";

const ROW =
  "card flex min-h-[64px] w-full items-center gap-3 p-4 text-left transition-colors hover:bg-soft disabled:opacity-60";

function platformName(p: MeLeague["platform"]): string {
  return p === "espn" ? "ESPN" : p === "yahoo" ? YAHOO.label : "Sleeper";
}

export function WhereTo({ next }: { next: string | null }) {
  const router = useRouter();
  const session = useSession();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const account = session.account;
  const leagues = session.me?.leagues ?? [];
  const first = account?.name?.trim().split(/\s+/)[0] ?? "";
  const current = session.connection;

  async function open(l: MeLeague) {
    const key = `${l.platform}:${l.league_id}`;
    setOpening(key);
    setError(null);
    try {
      const reading = current?.platform === l.platform && current.league_id === l.league_id && current.team_id === l.team_id;
      if (!reading) await openSavedLeague(l);
      router.push(next ?? "/home");
    } catch (e) {
      setError(e);
      setOpening(null);
    }
  }

  return (
    <div data-testid="where-to">
      <div className="pt-8 rise">
        <Eyebrow>{ACCOUNT.whereTo.eyebrow}</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{ACCOUNT.whereTo.title}</h1>
        {first && <p className="mt-2 text-[15px] text-muted">{ACCOUNT.whereTo.hello(first)}</p>}
      </div>

      {leagues.length > 0 && (
        <section className="mt-6 rise rise-1">
          <Eyebrow>{ACCOUNT.whereTo.leagues}</Eyebrow>
          <ul className="mt-2 grid gap-2">
            {leagues.map((l) => {
              const key = `${l.platform}:${l.league_id}`;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={ROW}
                    onClick={() => open(l)}
                    disabled={opening !== null}
                    aria-label={ACCOUNT.whereTo.openAria(l.name)}
                    data-testid="where-league"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="display block truncate text-[17px] leading-tight">{l.name}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted">
                        {l.team_name || `Team ${l.team_id}`} · {platformName(l.platform)}
                      </span>
                    </span>
                    {opening === key ? <Spinner size={16} label={null} /> : <IconChevron size={16} strokeWidth={2.4} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error ? (
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-2 rise rise-2">
        <Link href="/connect" className={ROW} data-testid="where-add">
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold">{ACCOUNT.whereTo.add}</span>
            <span className="mt-0.5 block text-[12px] text-muted">{ACCOUNT.whereTo.addLead}</span>
          </span>
          <IconChevron size={16} strokeWidth={2.4} />
        </Link>
        <Link href="/account" className={ROW} data-testid="where-settings">
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold">{ACCOUNT.whereTo.settings}</span>
            <span className="mt-0.5 block text-[12px] text-muted">{ACCOUNT.whereTo.settingsLead}</span>
          </span>
          <IconChevron size={16} strokeWidth={2.4} />
        </Link>
      </div>

      <div className="mt-6 rise rise-3">
        <Button variant="ghost" className="w-full" onClick={() => logout()}>
          {ACCOUNT.signOut}
        </Button>
      </div>
    </div>
  );
}
