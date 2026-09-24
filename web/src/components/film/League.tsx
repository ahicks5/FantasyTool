"use client";
/**
 * The film's league half (SPEC-FILM F-5 to F-7): everyone, compared.
 *
 * Superlatives of the newest finished week as tiles; who is strong where as a grade grid;
 * points against the projection as bars either side of zero; the gauntlet as bars from
 * zero; the ledger, so far, as a net bar per team then the trades and the best and worst
 * pickups; and the playoff picture with the line drawn where the league draws it.
 *
 * Every number is the engine's (`edge/engine/league_film.py`), every word `lib/vocab.ts`'s,
 * and the geometry `lib/leagueFilm.ts`'s. Charts are plain HTML bars: one axis each, values
 * printed on every row (twelve rows, touch first, nothing to hover), your team marked in
 * every section.
 */
import { diverging, magnitude, maxAbs, orderPositions, orderSupers, shade } from "@/lib/leagueFilm";
import type { FilmClaim, FilmTeamRef, FilmTrade, LeagueFilm } from "@/lib/types";
import { FILM } from "@/lib/vocab";
import { PlayerName } from "../Players";
import { Eyebrow, H2 } from "../ui";

const L = FILM.league;

/** A fantasy team's name. Not a player, so not a door: said as a string. */
function teamLabel(t: FilmTeamRef): string {
  return t.name;
}

function You({ show }: { show: boolean }) {
  return show ? <span className="lg-you">{L.you}</span> : null;
}

function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="grid min-w-0 gap-2" id={id}>
      <H2>{title}</H2>
      {hint && <p className="text-[12px] leading-snug text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function Supers({ f, me }: { f: LeagueFilm; me: string }) {
  if (!f.week || f.superlatives.length === 0) return null;
  return (
    <Section title={L.supers(f.week)}>
      <ul className="grid grid-cols-2 gap-2">
        {orderSupers(f.superlatives).map((s) => (
          <li key={s.kind} className={`card lg-super ${s.team.id === me ? "lg-mine" : ""}`}>
            <Eyebrow>{L.title[s.kind]}</Eyebrow>
            <p className="mt-1 truncate text-[14px] font-black">
              {teamLabel(s.team)} <You show={s.team.id === me} />
            </p>
            <p className="mt-1 text-[12px] leading-snug text-muted">{s.line}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Groups({ f, me }: { f: LeagueFilm; me: string }) {
  const positions = orderPositions(f.groups.positions);
  const size = f.groups.teams.length;
  if (!positions.length || !size) return null;
  return (
    <Section title={L.groups} hint={L.groupsHint}>
      <div className="lg-grid-wrap">
        <table className="lg-grid" style={{ ["--cols" as string]: positions.length }}>
          <thead>
            <tr>
              <th scope="col" className="lg-grid-team">{L.team}</th>
              {positions.map((p) => (
                <th key={p} scope="col">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.groups.teams.map((t) => (
              <tr key={t.team.id} className={t.team.id === me ? "lg-mine" : ""}>
                <th scope="row" className="lg-grid-team">
                  <span className="block truncate">{teamLabel(t.team)}</span>
                </th>
                {positions.map((p) => {
                  const g = t.positions[p];
                  return (
                    <td key={p} className={g ? `lg-s${shade(g.rank, size)}` : ""}>
                      {g ? g.grade : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** One row of bars either side of a zero line: blue above, amber below, the sign printed. */
function DivRow({ label, value, max, mine, sub }: { label: string; value: number; max: number; mine: boolean; sub?: string }) {
  const bar = diverging(value, max);
  return (
    <li className={`lg-row ${mine ? "lg-mine" : ""}`}>
      <span className="lg-row-name">
        <span className="block truncate">{label}</span>
        {sub && <span className="block text-[10px] font-semibold text-muted">{sub}</span>}
      </span>
      <span className="lg-div" aria-hidden>
        <span className="lg-div-half lg-div-below">
          {bar.side === "below" && <span className="lg-bar lg-bar-below" style={{ width: `${bar.width}%` }} />}
        </span>
        <span className="lg-div-half">
          {bar.side === "above" && <span className="lg-bar lg-bar-above" style={{ width: `${bar.width}%` }} />}
        </span>
      </span>
      <span className="lg-row-val tnum">{FILM.delta(value)}</span>
    </li>
  );
}

function Expectation({ f, me }: { f: LeagueFilm; me: string }) {
  const rows = f.expectation.filter((r) => r.season);
  if (!rows.length) return null;
  const weeks = Math.max(...rows.map((r) => r.season!.weeks));
  const max = maxAbs(rows.map((r) => r.season!.delta));
  return (
    <Section title={L.expect} hint={L.expectHint(weeks)}>
      <div className="lg-key" aria-hidden>
        <span><i className="lg-swatch lg-bar-below" />{L.below}</span>
        <span><i className="lg-swatch lg-bar-above" />{L.above}</span>
      </div>
      <ul className="card lg-rows">
        {rows.map((r) => (
          <DivRow key={r.team.id} label={teamLabel(r.team)} value={r.season!.delta} max={max} mine={r.team.id === me} />
        ))}
      </ul>
    </Section>
  );
}

function Gauntlet({ f, me }: { f: LeagueFilm; me: string }) {
  if (!f.gauntlet.length) return null;
  const top = Math.max(...f.gauntlet.map((r) => r.points_against));
  return (
    <Section title={L.gauntlet} hint={L.gauntletHint}>
      <ul className="card lg-rows">
        {f.gauntlet.map((r) => (
          <li key={r.team.id} className={`lg-row ${r.team.id === me ? "lg-mine" : ""}`}>
            <span className="lg-row-name">
              <span className="block truncate">{teamLabel(r.team)}</span>
              {r.per_game !== null && <span className="block text-[10px] font-semibold text-muted">{L.perGame(r.per_game)}</span>}
            </span>
            <span className="lg-track" aria-hidden>
              <span className="lg-bar lg-bar-mag" style={{ width: `${magnitude(r.points_against, top)}%` }} />
            </span>
            <span className="lg-row-val tnum">{r.points_against.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Trade({ t, me }: { t: FilmTrade; me: string }) {
  return (
    <li className="card lg-trade">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>{L.tradeWeek(t.week)}</Eyebrow>
        {!t.ranked && <span className="text-[10px] font-black uppercase tracking-wide text-muted">{L.tooNew}</span>}
      </div>
      <div className="mt-2 grid gap-2.5">
        {t.sides.map((s) => (
          <div key={s.team.id} className={s.team.id === me ? "lg-mine-side" : ""}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-black">
                {teamLabel(s.team)} <You show={s.team.id === me} />
              </span>
              <span className={`tnum shrink-0 text-[13px] font-black ${t.ranked ? (s.net >= 0 ? "lg-up" : "lg-down") : "text-muted"}`}>
                {FILM.delta(s.net)}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] leading-snug">
              <span className="text-muted">{L.got} </span>
              {s.players.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <PlayerName p={p} />
                </span>
              ))}
              {s.picks > 0 && <span className="text-muted">{s.players.length ? ", " : ""}{L.picks(s.picks)}</span>}
            </p>
            <p className="tnum mt-0.5 text-[11px] text-muted">
              {L.pts(s.points)} · {L.fromHere(s.ros_from_here)}
            </p>
          </div>
        ))}
      </div>
    </li>
  );
}

function Claims({ title, claims, me }: { title: string; claims: FilmClaim[]; me: string }) {
  if (!claims.length) return null;
  return (
    <div className="grid gap-1.5">
      <Eyebrow>{title}</Eyebrow>
      <ul className="card lg-rows">
        {claims.map((c, i) => (
          <li key={`${c.add.id}-${c.team.id}-${i}`} className={`lg-claim ${c.team.id === me ? "lg-mine" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-black">
                <PlayerName p={c.add} />
              </span>
              <span className={`tnum shrink-0 text-[13px] font-black ${c.net >= 0 ? "lg-up" : "lg-down"}`}>{FILM.delta(c.net)}</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              {teamLabel(c.team)} · {L.tradeWeek(c.week)}
              {c.drop.length > 0 && ` · ${L.cut(c.drop.map((d) => d.name).join(", "))}`}
            </p>
            <p className="tnum text-[11px] text-muted">{L.claimLine(c.points, c.dropped_points)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ledger({ f, me }: { f: LeagueFilm; me: string }) {
  const lg = f.ledger;
  if (!lg.through_week) return null;
  const max = maxAbs(lg.teams.map((t) => t.net));
  // A chart of twelve zeros is noise: the net bars wait until one move is old enough to judge.
  const judged = lg.trades.some((t) => t.ranked) || lg.best_claims.length > 0 || lg.worst_claims.length > 0;
  return (
    <Section title={L.ledger} hint={L.ledgerHint(lg.through_week)}>
      {judged ? (
        <>
          <Eyebrow>{L.net}</Eyebrow>
          <ul className="card lg-rows">
            {lg.teams.map((t) => (
              <DivRow key={t.team.id} label={teamLabel(t.team)} sub={L.moves(t.moves)} value={t.net} max={max} mine={t.team.id === me} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[13px] font-bold">{L.tooEarly}</p>
      )}
      <Eyebrow className="mt-2">{L.trades}</Eyebrow>
      {lg.trades.length === 0 ? (
        <p className="text-[13px] text-muted">{L.noTrades}</p>
      ) : (
        <ul className="grid gap-2">
          {lg.trades.map((t, i) => (
            <Trade key={`${t.week}-${i}`} t={t} me={me} />
          ))}
        </ul>
      )}
      <Claims title={L.bestClaims} claims={lg.best_claims} me={me} />
      <Claims title={L.worstClaims} claims={lg.worst_claims} me={me} />
    </Section>
  );
}

function Playoffs({ f, me }: { f: LeagueFilm; me: string }) {
  const po = f.playoffs;
  if (!po) return null;
  return (
    <Section title={L.playoffs} hint={L.playoffsHint}>
      {po.weeks_left !== null && <p className="text-[12px] font-bold">{L.weeksLeft(po.weeks_left)}</p>}
      <ol className="card lg-rows">
        {po.seeds.map((s) => (
          <li key={s.team.id} className={`lg-seed ${s.team.id === me ? "lg-mine" : ""} ${s.seed === po.teams ? "lg-seed-last" : ""}`}>
            <span className="tnum w-6 shrink-0 text-[12px] font-black text-muted">{s.seed}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
              {teamLabel(s.team)} <You show={s.team.id === me} />
            </span>
            <span className="tnum shrink-0 text-[12px] font-black">{L.record(s.wins, s.losses, s.ties)}</span>
            <span className={`tnum w-[64px] shrink-0 text-right text-[11px] font-bold ${s.in ? "lg-up" : "text-muted"}`}>
              {s.in ? L.clear(s.games) : L.back(s.games)}
            </span>
          </li>
        ))}
      </ol>
      <p className="lg-line-key" aria-hidden>
        <i />
        {L.line}
      </p>
    </Section>
  );
}

export function League({ f, me }: { f: LeagueFilm; me: string }) {
  if (!f.week) return <p className="text-[13px] text-muted">{L.empty}</p>;
  return (
    <div className="grid min-w-0 gap-7">
      <Supers f={f} me={me} />
      <Playoffs f={f} me={me} />
      <Groups f={f} me={me} />
      <Expectation f={f} me={me} />
      <Gauntlet f={f} me={me} />
      <Ledger f={f} me={me} />
    </div>
  );
}
