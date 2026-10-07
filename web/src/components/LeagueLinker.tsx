"use client";
/** The league link itself, shared by /connect and the sign-up walk: pick a platform, find the league, pick the team, save it to the account. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  EspnAuthError,
  PaywallError,
  YahooAuthError,
  connect,
  getLeague,
  getProducts,
  getSleeperLeagues,
  getYahooAuthorizeUrl,
  getYahooLeagues,
  getYahooStatus,
} from "@/lib/api";
import { Popup, useAccountGate } from "@/components/account/AccountGate";
import { formatCents } from "@/lib/format";
import { HttpError } from "@/lib/errors";
import { currentMe, useSession } from "@/lib/session";
import { resolveSleeperInput } from "@/lib/leagueInput";
import { saveConnection, type Connection } from "@/lib/storage";
import { clearWalkReturn, markWalkReturn, walkStore } from "@/lib/onboarding";
import { EspnAuthForm } from "@/components/EspnAuthForm";
import { clearEspnAuth, useEspnAuth } from "@/lib/espnAuth";
import { useLocation } from "@/lib/href";
import { clearYahooAuth, loadYahooAuth, newYahooState, useYahooAuth, YAHOO_OFFERED } from "@/lib/yahooAuth";
import type { LeagueSummary, Platform, SleeperLeagueRef } from "@/lib/types";
import { IconCheck, IconChevron } from "@/components/icons";
import { Button, ErrorBox, Eyebrow, LinkButton, Spinner, Wordmark } from "@/components/ui";
import { ACCOUNT, CONNECT, ESPN_KEY, LINES, YAHOO } from "@/lib/vocab";

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

const PLATFORM_NAME: Record<Platform, string> = { sleeper: "Sleeper", espn: "ESPN", yahoo: YAHOO.label };

/** One platform in the picker. Two words, no sublabels: what a platform needs is asked after. */
function PlatformChoice({ p, on, onPick }: { p: Platform; on: boolean; onPick: (p: Platform) => void }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={() => onPick(p)}
      className={`min-h-11 w-full rounded-[var(--radius-card)] border px-4 py-4 text-left transition-colors ${
        on ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper text-ink hover:bg-soft"
      }`}
    >
      <span className="display block text-[19px] leading-tight">{PLATFORM_NAME[p]}</span>
    </button>
  );
}

/**
 * `page` is `/connect` exactly as it always was: its own header, the account gate, the
 * two-step bar, and the desk afterwards. `walk` is the same brain inside the sign-up walk:
 * no chrome of its own (the walk draws it), no slot warning on the first league (it is
 * written for the second and third), and `onLinked` instead of the trip to the desk. While
 * it is open, the ESPN key and Yahoo's sign-in come back to the walk (`lib/onboarding`).
 */
export function LeagueLinker({ variant = "page", onLinked }: { variant?: "page" | "walk"; onLinked?: (c: Connection) => void }) {
  const router = useRouter();
  const walk = variant === "walk";
  useEffect(() => {
    if (walk) markWalkReturn(walkStore());
    else clearWalkReturn(walkStore());
  }, [walk]);
  const session = useSession();
  const gate = useAccountGate();
  // The account comes first (Andrew, 2026-09-24): a visitor with no account gets the
  // door to one in place of the league form, and comes back here once it exists. The
  // sheet at the save is only a safety net for a token that dies mid-form.
  // Nothing is chosen on arrival. The page is a question, not a filled-in form, and every
  // field below is the answer to the platform button rather than something to scroll past.
  //
  // The deep link: `/connect?platform=espn&id=123` picks ESPN and loads that league. It is
  // how the key's walk (`/connect/espn`) hands back the league it was asked for, so the
  // bookmark's return is one motion: land, key saved, league loading. `?paste=1` opens the
  // two fields at once. Read off the address (lib/href) rather than `useSearchParams`, which
  // would make the route dynamic for one optional parameter. A tap on a platform button
  // outranks it from then on.
  const here = useLocation();
  const deep = useMemo(() => {
    const p = here?.searchParams.get("platform");
    if (p !== "espn" && p !== "sleeper") return null;
    return {
      platform: p as Platform,
      id: here?.searchParams.get("id")?.trim() ?? "",
      // The team the bookmark read off ESPN's page, picked once the league has loaded.
      team: here?.searchParams.get("team")?.trim() ?? "",
      paste: here?.searchParams.get("paste") === "1",
    };
  }, [here]);
  const [pickedPlatform, setPlatform] = useState<Platform | null>(null);
  const platform = pickedPlatform ?? deep?.platform ?? null;
  // One box per platform, so switching platform cannot carry a Sleeper username into ESPN.
  const [typed, setInput] = useState<string | null>(null);
  const input = typed ?? deep?.id ?? "";
  // The ESPN ID box is behind a link (Andrew, 2026-09-28: one option). It opens on its own
  // when an id came in on the link, or once the owner has typed one.
  const [askedIdBox, setShowIdBox] = useState(false);
  const showIdBox = askedIdBox || input.trim().length > 0;
  const [leagues, setLeagues] = useState<SleeperLeagueRef[] | null>(null);
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  // The Sleeper username a league list came from, so that user's own team can be marked (W-044).
  const [searchedUser, setSearchedUser] = useState("");
  const [error, setError] = useState<unknown>(null);
  // null = no ESPN sign-in problem. Otherwise, whether we are asking for cookies for the
  // first time or telling them the ones they gave have expired.
  const [espnAuthNeeded, setEspnAuthNeeded] = useState<{ expired: boolean } | null>(null);
  const [lastLeagueId, setLastLeagueId] = useState("");
  // Yahoo is not offered at all until it ships (`YAHOO_OFFERED`, walkthrough W-006). With the
  // flag on, it is a live choice only once the API says its sign-in is switched on; until then
  // it is the dashed "Soon" marker. `yahooAuthNeeded` is a sign-in that failed or ran out.
  const [yahooEnabled, setYahooEnabled] = useState(false);
  const [yahooAuthNeeded, setYahooAuthNeeded] = useState(false);
  const storedYahoo = useYahooAuth();
  const hasYahoo = !!storedYahoo;
  const [confirming, setConfirming] = useState<{ allowed: number; used: number } | null>(null);
  const [slotPrice, setSlotPrice] = useState<string | null>(null);
  useEffect(() => {
    getProducts()
      .then((r) => {
        const slot = r.products.find((p) => p.sku === "league_slot");
        if (slot) setSlotPrice(formatCents(slot.price_cents));
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!YAHOO_OFFERED) return;
    getYahooStatus()
      .then((r) => {
        setYahooEnabled(r.enabled);
        // Back from Yahoo's sign-in (`/connect/yahoo` sends ?platform=yahoo): pick up there.
        if (r.enabled && new URLSearchParams(window.location.search).get("platform") === "yahoo") {
          setPlatform("yahoo");
          window.history.replaceState(null, "", window.location.pathname);
          if (loadYahooAuth()) return getYahooLeagues().then(setLeagues);
        }
      })
      .catch((e) => {
        if (e instanceof YahooAuthError) setYahooAuthNeeded(true);
      });
  }, []);
  /** Signed in with Yahoo: their own leagues are the whole form. */
  async function loadYahooLeagues() {
    const ls = await run(() => getYahooLeagues());
    if (ls) {
      setLeagues(ls);
      setYahooAuthNeeded(false);
    }
  }

  async function signInWithYahoo() {
    await run(async () => {
      window.location.assign(await getYahooAuthorizeUrl(newYahooState()));
    });
  }

  // Only to offer the wipe below. The cookies themselves ride on requests from
  // `espnAuthHeaders`, which reads storage directly and never comes through here.
  const storedEspn = useEspnAuth();

  // A deep-linked league loads itself once the owner is known to be signed in. Once per id,
  // so a re-render after the load (or its failure) does not ask ESPN again.
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    const id = deep?.id;
    if (!id || session.loading || !session.signedIn || loaded.current === id) return;
    loaded.current = id;
    queueMicrotask(() => pickLeague(id, deep?.team));
  });

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
      else if (e instanceof YahooAuthError) setYahooAuthNeeded(true);
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
        setSearchedUser("");
        setLastLeagueId(found.value);
        setLeagues(null);
        setLeague(found.league);
        setTeamId("");
      } else if (found.leagues) {
        setSearchedUser(input.trim());
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

  async function pickLeague(id: string, team?: string) {
    if (!platform || !id.trim()) return;
    setLastLeagueId(id.trim());
    const l = await run(() => getLeague(platform, id.trim()));
    if (l) {
      setLeague(l);
      // A team named on the way in (the ESPN bookmark read it off the page) is picked for them.
      setTeamId(team && l.teams.some((t) => t.id === team) ? team : "");
    }
  }

  /**
   * Before a new league takes a slot, say so once (Andrew, 2026-09-27): the account's
   * leagues are a season's allowance, and forgetting one later does not give it back.
   * A league already on file (or forgotten this season) takes no new slot, so it skips this.
   */
  async function submit() {
    if (!platform || !league || !teamId) return;
    if (!(await gate.signIn("connect"))) return;
    const me = await currentMe();
    const onFile = me?.leagues.some((l) => l.platform === platform && l.league_id === league.id);
    if (me && !onFile) {
      const used = me.leagues_used ?? me.leagues.length;
      // The walk's first league takes the first slot of three: nothing to warn about.
      if (used < me.leagues_allowed && !(walk && used === 0)) {
        setConfirming({ allowed: me.leagues_allowed, used });
        return;
      }
    }
    await link();
  }

  async function link() {
    setConfirming(null);
    if (!platform || !league || !teamId) return;
    const team = league.teams.find((t) => t.id === teamId);
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
      const saved: Connection = {
        platform,
        league_id: league.id,
        team_id: teamId,
        league_name: league.name,
        team_name: team?.name ?? `Team ${teamId}`,
        week: league.week,
      };
      saveConnection(saved);
      // The account is remembered for the session and only re-read on a sign-in, so
      // without this the account page kept listing the leagues from before this save
      // (Andrew, 2026-09-28: "the league isn't attached to my account").
      session.refresh();
      if (walk) {
        clearWalkReturn(walkStore());
        onLinked?.(saved);
      } else router.push("/home");
    }
  }

  function pickPlatform(p: Platform) {
    if (p === platform) return;
    setPlatform(p);
    setInput("");
    setLeagues(null);
    setLeague(null);
    setTeamId("");
    setError(null);
    setEspnAuthNeeded(null);
    setYahooAuthNeeded(false);
    setLastLeagueId("");
    if (p === "yahoo" && hasYahoo) void loadYahooLeagues();
  }

  // Three steps, said in order (Andrew, 2026-10-06, W-042): pick the platform, find the
  // league (and watch it load), pick the team.
  const step = league ? 3 : platform ? 2 : 1;
  // The team this owner most likely is: the searched username's own (W-044), and any team
  // already on the account. Marked, and the likely one goes first.
  const isYou = (t: { owner_name: string }) => !!searchedUser && t.owner_name.trim().toLowerCase() === searchedUser.toLowerCase();
  const isLinked = (t: { id: string }) =>
    !!league && (session.me?.leagues ?? []).some((l) => l.platform === platform && l.league_id === league.id && String(l.team_id) === String(t.id));
  const teams = league ? [...league.teams].sort((a, b) => Number(isYou(b)) - Number(isYou(a))) : [];

  const Outer = walk ? "div" : "main";
  return (
    <div className={walk ? "" : "mx-auto w-full max-w-lg px-4 pb-16"}>
      {!walk && (
      <header className="flex h-16 items-center justify-between gap-3">
        <Wordmark className="text-[26px]" />
        {/* The way back out, for an owner who came here from their account (Andrew, 2026-09-28). */}
        {session.signedIn && (
          <Link
            href="/account"
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line-2 px-4 text-[13px] font-bold hover:bg-soft"
            data-testid="back-to-account"
          >
            {ACCOUNT.backAccount}
            <IconChevron size={13} strokeWidth={2.8} />
          </Link>
        )}
      </header>
      )}

      <Outer id={walk ? undefined : "content"}>

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

      {/* Two steps, and the bar says which one you are on without reading anything.
          The walk draws its own bar and title, so these are the page's alone. */}
      {!walk && (
      <>
      <div className="mt-2 flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-start" : "bg-line"}`} aria-hidden />
        ))}
      </div>

      <div className="mt-4 rise">
        <Eyebrow>
          {CONNECT.stepOf(step, 3)}
        </Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{LINES.connect}</h1>
        {/* No kickoff clock here: it mounted once a league loaded and pushed the whole form
            down under the reader's thumb (W-043). The rooms carry the clock. */}
      </div>
      </>
      )}

      {/* Two words, no sublabels. Whatever a platform needs is asked for after it is picked,
          which is why the page opens with nothing selected.

          Three across would leave ~98px a button at 320px, which truncates the 19px display
          type, so the two live platforms keep the two-column row and Yahoo sits under them. */}
      <div className={walk ? "" : "mt-6"}>
        <div className="eyebrow" id="platform-label">
          <StepNo n={1} on /> {CONNECT.steps.platform}
        </div>
        <div role="radiogroup" aria-labelledby="platform-label">
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {(["sleeper", "espn"] as Platform[]).map((p) => (
              <PlatformChoice key={p} p={p} on={platform === p} onPick={pickPlatform} />
            ))}
          </div>
          {YAHOO_OFFERED && yahooEnabled && (
            <div className="mt-2.5">
              <PlatformChoice p="yahoo" on={platform === "yahoo"} onPick={pickPlatform} />
            </div>
          )}
        </div>

        {/* Until the API says Yahoo sign-in is switched on (YAHOO_* set on Render), Yahoo is a
            roadmap marker and has to be impossible to pick: disabled, outside the radio group
            so a screen reader never offers it as a third choice, and drawn dashed and unfilled
            so it does not read as a live button that ignores the tap. */}
        {YAHOO_OFFERED && !yahooEnabled && (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="mt-2.5 flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-[var(--radius-card)] border border-dashed border-line-2 bg-transparent px-4 py-3 text-muted"
          >
            <span className="display text-[17px] leading-tight">{YAHOO.label}</span>
            <span className="eyebrow rounded-full border border-line-2 px-2 py-0.5">{YAHOO.soon}</span>
          </button>
        )}
      </div>

      {platform === "sleeper" && (
        <section className="mt-7">
          <label className="eyebrow block" htmlFor="sleeper-input">
            <StepNo n={2} on /> {CONNECT.steps.sleeper}
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

        </section>
      )}

      {platform === "yahoo" && (!hasYahoo || yahooAuthNeeded) && (
        <section className="mt-7">
          <p className="text-[14px] leading-relaxed text-muted">{yahooAuthNeeded ? YAHOO.expired : YAHOO.why}</p>
          <Button variant="start" onClick={signInWithYahoo} busy={busy} className="mt-3 w-full">
            {YAHOO.signIn}
          </Button>
        </section>
      )}

      {platform === "yahoo" && hasYahoo && !yahooAuthNeeded && leagues && (
        <section className="mt-7">
          <div className="eyebrow">{YAHOO.pick}</div>
          {leagues.length === 0 && <p className="mt-2 text-[14px] text-muted">{YAHOO.none}</p>}
        </section>
      )}

      {/* One list for both: a Sleeper username's leagues, or the signed-in Yahoo owner's.
          A Yahoo list is only shown while that sign-in still works. */}
      {(platform === "sleeper" || (platform === "yahoo" && hasYahoo && !yahooAuthNeeded)) && (
        <>
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
        </>
      )}

      {platform === "espn" && (
        <section className="mt-7">
          {/* The phone way first, for any ESPN league: the bookmark reads the league, the
              team and, if it is private, the key off ESPN's own page (Andrew, 2026-09-28:
              "do you still need to put in your league id? that's still hard"). */}
          <div data-testid="espn-entry">
            <div className="eyebrow">
              <StepNo n={2} on /> {CONNECT.steps.espn}
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-ink">{ESPN_KEY.entry.title}</p>
            <div className="mt-3">
              <LinkButton
                href={input.trim() ? `/connect/espn?id=${encodeURIComponent(input.trim())}` : "/connect/espn"}
                variant="start"
                className="w-full"
              >
                {ESPN_KEY.entry.button}
                <IconChevron size={14} strokeWidth={2.8} />
              </LinkButton>
            </div>
            {!showIdBox && (
              // A real second choice, not a grey underline under the green button (W-045).
              <Button variant="secondary" className="mt-2.5 w-full" onClick={() => setShowIdBox(true)}>
                {ESPN_KEY.entry.haveId}
              </Button>
            )}
          </div>
          {showIdBox && (
          <>
          <label className="eyebrow mt-6 block" htmlFor="league-id">
            {ESPN_KEY.entry.or}
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
          </>
          )}
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
        <EspnAuthForm
          status={espnAuthNeeded}
          leagueId={lastLeagueId || input}
          busy={busy}
          openPaste={deep?.paste ?? false}
          onSaved={() => pickLeague(lastLeagueId || input)}
        />
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
          {ESPN_KEY.form.stored}
          <button
            type="button"
            onClick={() => clearEspnAuth()}
            className="min-h-11 font-semibold text-ink underline underline-offset-4"
          >
            {ESPN_KEY.form.forget}
          </button>
        </p>
      )}

      {platform === "yahoo" && hasYahoo && !yahooAuthNeeded && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {YAHOO.saved}
          <button
            type="button"
            onClick={() => {
              clearYahooAuth();
              setLeagues(null);
              setLeague(null);
              setTeamId("");
            }}
            className="min-h-11 font-semibold text-ink underline underline-offset-4"
          >
            {YAHOO.forget}
          </button>
        </p>
      )}

      {/* Yahoo's terms require this credit, linked back to Yahoo Fantasy, wherever its data shows. */}
      {platform === "yahoo" && (
        <p className="mt-3 text-[12px] text-muted">
          <a href="https://football.fantasysports.yahoo.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
            {YAHOO.attribution}
          </a>
        </p>
      )}

      {/* The wait, said out loud where the team list is about to land: never a blank gap
          between "Find" and the teams (W-042). */}
      {busy && !league && platform && (
        <div className="card mt-6 flex items-center gap-3 p-4" role="status" aria-live="polite" data-testid="connect-loading">
          <Spinner size={18} />
          <span className="text-[14px] font-bold text-ink-2">{CONNECT.loading}</span>
        </div>
      )}

      {league && (
        <section className="mt-9 rise">
          <Eyebrow>
            <StepNo n={3} on /> {league.name} · week <span className="tnum">{league.week}</span>
          </Eyebrow>
          <h2 className="display mt-2 text-[28px] leading-[1.06]">{CONNECT.steps.team}</h2>
          <ul className="mt-4 grid gap-2">
            {teams.map((t) => {
              const on = teamId === t.id;
              const you = isYou(t);
              const linked = isLinked(t);
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
                      <span className="display block text-[16px] leading-tight break-words">
                        {t.name}
                        {you && <span className="ml-2 rounded-full bg-start-soft px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-wider text-start">{CONNECT.you}</span>}
                        {linked && <span className="ml-2 rounded-full bg-soft px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-wider text-muted">{CONNECT.linked}</span>}
                      </span>
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
      </Outer>

      {confirming && (
        <Popup title={ACCOUNT.confirmLink.title} onClose={() => setConfirming(null)} testId="confirm-link">
          <p className="text-[15px] leading-relaxed text-ink">{ACCOUNT.confirmLink.body(confirming.allowed, confirming.used)}</p>
          {slotPrice && <p className="mt-2 text-[15px] font-bold text-ink">{ACCOUNT.confirmLink.more(slotPrice)}</p>}
          <div className="mt-5 grid gap-2">
            <Button variant="start" className="w-full" onClick={link}>
              {ACCOUNT.confirmLink.yes}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setConfirming(null)}>
              {ACCOUNT.confirmLink.no}
            </Button>
          </div>
        </Popup>
      )}
    </div>
  );
}

/** A step's number in its own small disc (W-042). */
function StepNo({ n, on }: { n: number; on: boolean }) {
  return (
    <span
      className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full align-middle text-[11px] font-black tabular-nums ${on ? "bg-start-fill text-white" : "bg-soft text-muted"}`}
      aria-hidden
    >
      {n}
    </span>
  );
}
