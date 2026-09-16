"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { connect, getLeague, getSleeperLeagues } from "@/lib/api";
import { saveConnection } from "@/lib/storage";
import type { LeagueSummary, Platform, SleeperLeagueRef } from "@/lib/types";
import { Button, ErrorBox, Wordmark } from "@/components/ui";

const FIELD = "w-full rounded-xl border-2 border-line px-4 py-3 text-base focus:border-ink focus:outline-none";

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

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
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

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-14 items-center justify-between">
        <Link href="/">
          <Wordmark className="text-2xl" />
        </Link>
      </header>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Step 1 of 2</p>
      <h1 className="mt-1 text-3xl font-black">Connect your league</h1>
      <p className="mt-1 text-muted">Public leagues only for now. No password, no account needed to see your first moves.</p>

      <div className="mt-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Platform">
        {(["sleeper", "espn"] as Platform[]).map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={platform === p}
            onClick={() => {
              setPlatform(p);
              setLeagues(null);
              setLeague(null);
              setTeamId("");
            }}
            className={`rounded-xl border-2 px-4 py-3 font-bold ${platform === p ? "border-ink bg-ink text-white" : "border-line"}`}
          >
            {p === "sleeper" ? "Sleeper" : "ESPN (public)"}
          </button>
        ))}
      </div>

      {platform === "sleeper" && (
        <section className="mt-6">
          <label className="block text-sm font-bold" htmlFor="username">
            Sleeper username
          </label>
          <div className="mt-1 flex gap-2">
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
              {leagues.length === 0 && <li className="text-muted">No leagues found for that username.</li>}
              {leagues.map((l) => (
                <li key={l.league_id}>
                  <button
                    onClick={() => pickLeague(l.league_id)}
                    className={`w-full rounded-xl border-2 px-4 py-3 text-left ${league?.id === l.league_id ? "border-start bg-start-soft" : "border-line"}`}
                  >
                    <span className="display font-extrabold">{l.name}</span>
                    <span className="block text-xs text-muted">
                      {l.total_rosters} teams · {l.status.replaceAll("_", " ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-center text-xs font-bold uppercase text-muted">or</p>
        </section>
      )}

      <section className="mt-3">
        <label className="block text-sm font-bold" htmlFor="league-id">
          Paste a league ID
        </label>
        <div className="mt-1 flex gap-2">
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

      {league && (
        <section className="mt-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Step 2 of 2 · {league.name} · week {league.week}</p>
          <h2 className="mt-1 text-2xl font-black">Which team is yours?</h2>
          <ul className="mt-2 grid gap-2">
            {league.teams.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setTeamId(t.id)}
                  className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left ${teamId === t.id ? "border-start bg-start-soft" : "border-line"}`}
                  aria-pressed={teamId === t.id}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-black uppercase text-muted">{t.name.slice(0, 2)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold">{t.name}</span>
                      <span className="block text-xs text-muted">{t.owner_name}</span>
                    </span>
                  </span>
                  <span className="text-sm text-muted">
                    {t.record} · {t.points_for.toFixed(1)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-0 mt-4 bg-paper py-3">
            <Button variant="start" className="w-full" onClick={submit} disabled={busy || !teamId}>
              {busy ? "Connecting…" : "Connect and see my moves"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
