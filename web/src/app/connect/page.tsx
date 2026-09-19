"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EspnAuthError, connect, getLeague, getSleeperLeagues } from "@/lib/api";
import { saveConnection } from "@/lib/storage";
import { EspnAuthForm } from "@/components/EspnAuthForm";
import type { LeagueSummary, Platform, SleeperLeagueRef } from "@/lib/types";
import { IconCheck } from "@/components/icons";
import { Button, ErrorBox, Eyebrow, ThemeToggle, Wordmark } from "@/components/ui";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";

/** The selected/unselected mark on every pickable row — a shape, not just a colour. */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${
        on ? "border-start bg-start text-white" : "border-line-2 text-transparent"
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
  const [platform, setPlatform] = useState<Platform>("sleeper");
  const [username, setUsername] = useState("");
  const [leagueIdInput, setLeagueIdInput] = useState("");
  const [leagues, setLeagues] = useState<SleeperLeagueRef[] | null>(null);
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // null = no ESPN sign-in problem. Otherwise, whether we are asking for cookies for the
  // first time or telling them the ones they gave have expired.
  const [espnAuthNeeded, setEspnAuthNeeded] = useState<{ expired: boolean } | null>(null);
  const [lastLeagueId, setLastLeagueId] = useState("");

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      const out = await fn();
      setEspnAuthNeeded(null);
      return out;
    } catch (e) {
      // A private league is not an error to apologise for — it is a form to fill in.
      if (e instanceof EspnAuthError) setEspnAuthNeeded({ expired: !e.needsAuth });
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function lookup() {
    if (!username.trim()) return;
    const ls = await run(() => getSleeperLeagues(username.trim()));
    if (ls) {
      setLeagues(ls);
      setLeague(null);
      setTeamId("");
    }
  }

  async function pickLeague(id: string) {
    if (!id.trim()) return;
    setLastLeagueId(id.trim());
    const l = await run(() => getLeague(platform, id.trim()));
    if (l) {
      setLeague(l);
      setTeamId("");
    }
  }

  async function submit() {
    if (!league || !teamId) return;
    const team = league.teams.find((t) => t.id === teamId);
    const ok = await run(async () => {
      await connect({ platform, league_id: league.id, team_id: teamId });
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
        <Link href="/" aria-label="The Booth home">
          <Wordmark className="text-[26px]" />
        </Link>
        <ThemeToggle />
      </header>

      {/* Two steps, and the bar says which one you are on without reading anything. */}
      <div className="mt-2 flex items-center gap-2">
        {[1, 2].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-start" : "bg-line"}`} aria-hidden />
        ))}
      </div>

      <div className="mt-4 rise">
        <Eyebrow>
          Step <span className="tnum">1</span> of <span className="tnum">2</span> · Your league
        </Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">Connect your league</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Sleeper, or ESPN public and private. No account needed to see your first moves.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Platform">
        {(["sleeper", "espn"] as Platform[]).map((p) => {
          const on = platform === p;
          return (
            <button
              key={p}
              role="radio"
              aria-checked={on}
              onClick={() => {
                setPlatform(p);
                setLeagues(null);
                setLeague(null);
                setTeamId("");
              }}
              className={`rounded-[var(--radius-card)] border px-4 py-4 text-left transition-colors ${
                on ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper text-ink hover:bg-soft"
              }`}
            >
              <span className="display block text-[17px] leading-tight">{p === "sleeper" ? "Sleeper" : "ESPN"}</span>
              <span className={`mt-0.5 block text-[12px] leading-snug ${on ? "text-paper/65" : "text-muted"}`}>
                {p === "sleeper" ? "Username or ID" : "League ID"}
              </span>
            </button>
          );
        })}
      </div>

      {platform === "sleeper" && (
        <section className="mt-7">
          <label className="eyebrow block" htmlFor="username">
            Sleeper username
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="username"
              className={FIELD}
              placeholder="e.g. HusH"
              value={username}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            <Button onClick={lookup} disabled={busy || !username.trim()} className="shrink-0">
              Find
            </Button>
          </div>

          {leagues && (
            <ul className="mt-3 grid gap-2">
              {leagues.length === 0 && (
                <li className="rounded-xl bg-soft px-4 py-3 text-[14px] text-muted">
                  No leagues found for that username.
                </li>
              )}
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

          <div className="mt-6 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="eyebrow">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </section>
      )}

      <section className="mt-5">
        <label className="eyebrow block" htmlFor="league-id">
          Paste a league ID
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="league-id"
            className={FIELD}
            inputMode="numeric"
            placeholder={platform === "sleeper" ? "1403186749361901568" : "ESPN league id"}
            value={leagueIdInput}
            onChange={(e) => setLeagueIdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pickLeague(leagueIdInput)}
          />
          <Button variant="secondary" onClick={() => pickLeague(leagueIdInput)} disabled={busy || !leagueIdInput.trim()} className="shrink-0">
            Load
          </Button>
        </div>
      </section>

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}

      {espnAuthNeeded && (
        <EspnAuthForm
          expired={espnAuthNeeded.expired}
          busy={busy}
          onSaved={() => pickLeague(lastLeagueId || leagueIdInput)}
        />
      )}

      {league && (
        <section className="mt-9 rise">
          <Eyebrow>
            Step <span className="tnum">2</span> of <span className="tnum">2</span> · {league.name} · week{" "}
            <span className="tnum">{league.week}</span>
          </Eyebrow>
          <h2 className="display mt-2 text-[28px] leading-[1.06]">Which team is yours?</h2>
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
            <Button variant="start" className="w-full" onClick={submit} disabled={busy || !teamId}>
              {busy ? "Connecting…" : teamId ? "Connect and see my moves" : "Pick your team"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
