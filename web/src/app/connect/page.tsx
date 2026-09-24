"use client";
/** Connect a league: pick a platform, then one box. Sleeper takes a username or an id; ESPN takes an id plus, if the league is private, two cookies. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EspnAuthError, PaywallError, connect, getLeague, getSleeperLeagues } from "@/lib/api";
import { useAccountGate } from "@/components/account/AccountGate";
import { HttpError } from "@/lib/errors";
import { useSession } from "@/lib/session";
import { resolveSleeperInput } from "@/lib/leagueInput";
import { saveConnection } from "@/lib/storage";
import { EspnAuthForm } from "@/components/EspnAuthForm";
import { clearEspnAuth, useEspnAuth } from "@/lib/espnAuth";
import type { LeagueSummary, Platform, SleeperLeagueRef } from "@/lib/types";
import { IconCheck } from "@/components/icons";
import { Button, Countdown, ErrorBox, Eyebrow, LinkButton, ThemeToggle, Wordmark } from "@/components/ui";
import { ACCOUNT, CONNECT, LINES } from "@/lib/vocab";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";

/** The selected/unselected mark on every pickable row — a shape, not just a colour. */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${
        on ? "border-start-fill bg-start-fill text-white" : "border-line-2 text-transparent"
      }`}
    >
      <IconCheck size={12} strokeWidth={3.4} />
    </span>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9' .-]/g, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

export default function ConnectPage() {
  const router = useRouter();
  const session = useSession();
  const gate = useAccountGate();
  // The account comes first (Andrew, 2026-09-24): a visitor with no account gets the
  // door to one in place of the league form, and comes back here once it exists. The
  // sheet at the save is only a safety net for a token that dies mid-form.
  // Nothing is chosen on arrival. The page is a question, not a filled-in form, and every
  // field below is the answer to the platform button rather than something to scroll past.
  const [platform, setPlatform] = useState<Platform | null>(null);
  // One box per platform, so switching platform cannot carry a Sleeper username into ESPN.
  const [input, setInput] = useState("");
  const [leagues, setLeagues] = useState<SleeperLeagueRef[] | null>(null);
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // null = no ESPN sign-in problem. Otherwise, whether we are asking for cookies for the
  // first time or telling them the ones they gave have expired.
  const [espnAuthNeeded, setEspnAuthNeeded] = useState<{ expired: boolean } | null>(null);
  const [lastLeagueId, setLastLeagueId] = useState("");
  // Only to offer the wipe below. The cookies themselves ride on requests from
  // `espnAuthHeaders`, which reads storage directly and never comes through here.
  const storedEspn = useEspnAuth();

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      const out = await fn();
      setEspnAuthNeeded(null);
      return out;
    } catch (e) {
      // A private league is not an error to apologise for — it is a form to fill in.
      if (e instanceof EspnAuthError) setEspnAuthNeeded({ expired: !e.needsAuth });
      else setError(e);
    } finally {
      setBusy(false);
    }
  }

  /**
   * The single Sleeper box. `resolveSleeperInput` guesses username or id and, when it
   * guesses wrong, tries the other reading before anything reaches the error box — that
   * fallback is the only reason one box is safe where two used to be.
   */
  async function findSleeper() {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const found = await resolveSleeperInput(input, {
        byLeagueId: (id) => getLeague("sleeper", id),
        byUsername: (username) => getSleeperLeagues(username),
      });
      if (found.league) {
        setLastLeagueId(found.value);
        setLeagues(null);
        setLeague(found.league);
        setTeamId("");
      } else if (found.leagues) {
        setLeagues(found.leagues);
        setLeague(null);
        setTeamId("");
        if (found.leagues.length === 1) {
          // One league under that username: a list of one is a tap that asks nothing.
          const only = found.leagues[0];
          try {
            const l = await getLeague("sleeper", only.league_id);
            setLastLeagueId(only.league_id);
            setLeague(l);
          } catch {
            /* Leave the one-row list standing: tapping it runs the same call and shows why. */
          }
        }
      }
      setEspnAuthNeeded(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function pickLeague(id: string) {
    if (!platform || !id.trim()) return;
    setLastLeagueId(id.trim());
    const l = await run(() => getLeague(platform, id.trim()));
    if (l) {
      setLeague(l);
      setTeamId("");
    }
  }

  async function submit() {
    if (!platform || !league || !teamId) return;
    const team = league.teams.find((t) => t.id === teamId);
    if (!(await gate.signIn("connect"))) return;
    const ok = await run(async () => {
      try {
        await connect({ platform, league_id: league.id, team_id: teamId });
      } catch (e) {
        // Over the cap: the slot sheet, then the same save again once it has landed.
        if (e instanceof PaywallError && e.feature === "leagues") {
          if (!(await gate.upgrade("league_slot", { what: ACCOUNT.upgrade.limit, returnTo: "/connect" }))) return false;
          await connect({ platform, league_id: league.id, team_id: teamId });
          return true;
        }
        // A token that died between the sheet and the save: ask again, then save again.
        if (e instanceof HttpError && e.status === 401) {
          if (!(await gate.signIn("connect"))) return false;
          await connect({ platform, league_id: league.id, team_id: teamId });
          return true;
        }
        throw e;
      }
      return true;
    });
    if (ok) {
      saveConnection({
        platform,
        league_id: league.id,
        team_id: teamId,
        league_name: league.name,
        team_name: team?.name ?? `Team ${teamId}`,
        week: league.week,
      });
      router.push("/home");
    }
  }

  const step = league ? 2 : 1;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="Penthouse home" className="flex min-h-11 items-center">
          <Wordmark className="text-[26px]" />
        </Link>
        <ThemeToggle />
      </header>

      <main id="content">

      {/* No account yet: the door to one, and nothing about a league until it exists. */}
      {!session.loading && !session.signedIn ? (
        <div className="mt-4 rise" data-testid="connect-gate">
          <Eyebrow>{ACCOUNT.gate.eyebrow}</Eyebrow>
          <h1 className="display mt-2 text-[34px] leading-[1.04]">{ACCOUNT.gate.title}</h1>
          <p className="mt-2 max-w-[22rem] text-[15px] leading-relaxed text-muted">{ACCOUNT.gate.body}</p>
          <div className="mt-6 grid gap-2.5">
            <LinkButton href="/register?next=%2Fconnect" variant="start" className="w-full">
              {ACCOUNT.gate.register}
            </LinkButton>
            <LinkButton href="/login?next=%2Fconnect" variant="secondary" className="w-full">
              {ACCOUNT.gate.signIn}
            </LinkButton>
          </div>
        </div>
      ) : session.loading ? null : (
      <>

      {/* Two steps, and the bar says which one you are on without reading anything. */}
      <div className="mt-2 flex items-center gap-2">
        {[1, 2].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-start" : "bg-line"}`} aria-hidden />
        ))}
      </div>

      <div className="mt-4 rise">
        <Eyebrow>
          Step <span className="tnum">1</span> of <span className="tnum">2</span> · Connect
        </Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{LINES.connect}</h1>
        {/* The on-ramp is only urgent if it says how long there is. Its own row, so a long
            clock never crowds the wordmark on a small phone.

            It waits for a league. A clock counting down over an empty form is pressure to
            do something the page has not asked for yet, and on the one screen where a
            first-time visitor is deciding whether to hand us anything at all, that reads
            as a sales timer. Once a league is loaded the deadline is theirs and it is the
            reason to finish. */}
        {league && (
          <div className="mt-3">
            <Countdown />
          </div>
        )}
      </div>

      {/* Two words, no sublabels. Whatever a platform needs is asked for after it is picked,
          which is why the page opens with nothing selected.

          Three across would leave ~98px a button at 320px, which truncates the 19px display
          type, so the two live platforms keep the two-column row and Yahoo sits under them. */}
      <div className="mt-6">
        <div className="eyebrow" id="platform-label">
          Select your league
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2.5" role="radiogroup" aria-labelledby="platform-label">
          {(["sleeper", "espn"] as Platform[]).map((p) => {
            const on = platform === p;
            return (
              <button
                key={p}
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (on) return;
                  setPlatform(p);
                  setInput("");
                  setLeagues(null);
                  setLeague(null);
                  setTeamId("");
                  setError(null);
                  setEspnAuthNeeded(null);
                  setLastLeagueId("");
                }}
                className={`min-h-11 rounded-[var(--radius-card)] border px-4 py-4 text-left transition-colors ${
                  on ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper text-ink hover:bg-soft"
                }`}
              >
                <span className="display block text-[19px] leading-tight">{p === "sleeper" ? "Sleeper" : "ESPN"}</span>
              </button>
            );
          })}
        </div>

        {/* There is no Yahoo connector in edge/, so this is a roadmap marker and has to be
            impossible to pick: disabled, outside the radio group so a screen reader never
            offers it as a third choice, and drawn dashed and unfilled so it does not read
            as a live button that ignores the tap. */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="mt-2.5 flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-[var(--radius-card)] border border-dashed border-line-2 bg-transparent px-4 py-3 text-muted"
        >
          <span className="display text-[17px] leading-tight">Yahoo</span>
          <span className="eyebrow rounded-full border border-line-2 px-2 py-0.5">Soon</span>
        </button>
      </div>

      {platform === "sleeper" && (
        <section className="mt-7">
          <label className="eyebrow block" htmlFor="sleeper-input">
            Paste a username or ID
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="sleeper-input"
              className={FIELD}
              placeholder="Username or league ID"
              value={input}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findSleeper()}
            />
            <Button onClick={findSleeper} busy={busy} disabled={!input.trim()} className="shrink-0">
              Find
            </Button>
          </div>

          {leagues && leagues.length > 0 && (
            <ul className="mt-3 grid gap-2">
              {leagues.map((l) => {
                const on = league?.id === l.league_id;
                return (
                  <li key={l.league_id}>
                    <button
                      onClick={() => pickLeague(l.league_id)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3.5 text-left transition-colors ${
                        on ? "border-start bg-start-soft" : "border-line-2 bg-paper hover:bg-soft"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="display block text-[16px] leading-tight">{l.name}</span>
                        <span className="mt-0.5 block text-[12px] text-muted">
                          <span className="tnum">{l.total_rosters}</span> teams · {l.status.replaceAll("_", " ")}
                        </span>
                      </span>
                      <Tick on={on} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {platform === "espn" && (
        <section className="mt-7">
          <label className="eyebrow block" htmlFor="league-id">
            Paste a league ID
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="league-id"
              className={FIELD}
              inputMode="numeric"
              placeholder="ESPN league ID"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pickLeague(input)}
            />
            <Button
              variant="secondary"
              onClick={() => pickLeague(input)}
              busy={busy}
              disabled={!input.trim()}
              className="shrink-0"
            >
              Load
            </Button>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            The number after leagueId= in your ESPN league URL.
          </p>
        </section>
      )}

      {error ? (
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
      ) : null}

      {/* Only once a request has come back saying the league is private. Showing two cookie
          fields to someone whose league is public is a wall in front of the one case that
          needs nothing, so a public ID loads straight through and this never appears. */}
      {platform === "espn" && espnAuthNeeded && (
        <EspnAuthForm status={espnAuthNeeded} busy={busy} onSaved={() => pickLeague(lastLeagueId || input)} />
      )}

      {/* The one way back out, and it has to live here rather than in the form.
          "Forget these" is a button inside `EspnAuthForm`, and the form now only mounts
          when a request has failed — so once the cookies work, the control to delete them
          disappears with it and does not return until they expire. These are a read session
          for someone's whole ESPN account, on what may be a shared phone, so "you can wipe
          them any time" has to stay true on the screen where they were handed over.
          Nothing shows for the public-league case, which never stored anything. */}
      {platform === "espn" && storedEspn && !espnAuthNeeded && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          ESPN sign-in saved on this device.
          <button
            type="button"
            onClick={() => clearEspnAuth()}
            className="min-h-11 font-semibold text-ink underline underline-offset-4"
          >
            Forget it
          </button>
        </p>
      )}

      {league && (
        <section className="mt-9 rise">
          <Eyebrow>
            Step <span className="tnum">2</span> of <span className="tnum">2</span> · {league.name} · week{" "}
            <span className="tnum">{league.week}</span>
          </Eyebrow>
          <h2 className="display mt-2 text-[28px] leading-[1.06]">Select your team</h2>
          <ul className="mt-4 grid gap-2">
            {league.teams.map((t) => {
              const on = teamId === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setTeamId(t.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-left transition-colors ${
                      on ? "border-start bg-start-soft" : "border-line-2 bg-paper hover:bg-soft"
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft text-[13px] font-black uppercase text-muted">
                      {initials(t.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="display block text-[16px] leading-tight break-words">{t.name}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                        {t.owner_name} · <span className="tnum">{t.record}</span> ·{" "}
                        <span className="tnum">{t.points_for.toFixed(1)}</span> PF
                      </span>
                    </span>
                    <Tick on={on} />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="sticky bottom-0 -mx-4 mt-5 border-t border-line bg-[color-mix(in_srgb,var(--color-plane)_92%,transparent)] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-md">
            <Button variant="start" className="w-full" onClick={submit} busy={busy} disabled={!teamId}>
              {busy ? CONNECT.busy : teamId ? CONNECT.submit : CONNECT.pick}
            </Button>
          </div>
        </section>
      )}
      </>
      )}
      </main>
    </div>
  );
}
