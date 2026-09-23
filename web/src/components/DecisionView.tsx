"use client";
/**
 * One role, the whole question: who is the best man for TE this week?
 *
 * Laid out as a comparison, not a paragraph (Andrew, 2026-09-23). The call comes first in
 * one line: start him, how sure, and his chance against the closest man. Then the grid.
 * Every option is a column with his face, the pick first. Every read is a row: projection,
 * rank, his chance to outscore the pick, then matchup, stack, health, form, swing, rest and
 * role. Each cell is a word and a fact, tinted by whether it helps this week
 * (`engine/decisions.card`). A mark on a cell says that column wins the head-to-head read
 * on it. A man the projection has ahead of the pick is called out under the call, with
 * what tips it back, so "54%" beside a benched man never reads as a mistake. The engine's
 * sentences sit folded at the bottom for anyone who wants the working. "Handled" takes the
 * role off the lineup page until next week.
 *
 * Every number is the engine's. Every word is `lib/vocab.ts`'s. This file lays it out.
 */

import { useEffect, useState } from "react";
import { edges, hasEdge, himChance, lastName, overruled, pct, readRows, type ReadKey } from "@/lib/decide";
import type { DecisionFactor, Lineup, LineupRole, Player, ReadCard } from "@/lib/types";
import { LINEUP, SECTIONS } from "@/lib/vocab";
import { Avatar } from "./Avatar";
import { PlayerTarget } from "./Players";
import { skipNextBoom, useHandled } from "./LineupView";
import { IconCheck, IconChevron } from "./icons";
import { Button, ConfidenceStamp, H2, InjuryTag, LinkButton, Stamp } from "./ui";

/** The reads in the engine's order (`decisions.KEYS`), for the folded notes. */
const FACTOR_ORDER = Object.keys(LINEUP.factor);
const byOrder = (a: DecisionFactor, b: DecisionFactor) => FACTOR_ORDER.indexOf(a.key) - FACTOR_ORDER.indexOf(b.key);

function Factor({ f }: { f: DecisionFactor }) {
  const side = f.favors === "start" ? "factor-start" : f.favors === "sit" ? "factor-sit" : "";
  return (
    <li className={`factor ${side}`}>
      <span className="factor-dot" aria-hidden />
      <span className="factor-key">{LINEUP.factor[f.key]}</span>
      {/* The engine writes one man per clause; each gets his own line so the two read side by side. */}
      <span className="factor-line">
        {f.line.split("; ").map((part, i) => (
          <span key={i}>{part}</span>
        ))}
      </span>
    </li>
  );
}

/** A column head: his face (the door to his page), his name, where he plays. The pick's wears the band. */
function Head({ p, opp, pick }: { p: Player; opp: string | null; pick: boolean }) {
  return (
    <th scope="col" className={`dg-head ${pick ? "dg-pick" : ""}`}>
      {/* Every head keeps the band's height, so the faces line up; only the pick's says it. */}
      {pick ? <span className="dg-band">{LINEUP.role.band}</span> : <span className="dg-band invisible" aria-hidden>{"\u00a0"}</span>}
      <PlayerTarget p={p} face>
        <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size="md" ring={pick ? "start" : undefined} />
      </PlayerTarget>
      <span className="dg-name">
        {lastName(p.name)}
        <InjuryTag status={p.injury_status} />
      </span>
      <span className="dg-meta">
        {p.position} · {p.nfl_team ?? "FA"}
        {opp ? <span className="block">{opp}</span> : null}
      </span>
    </th>
  );
}

/** One read for one man: the word, the fact, tinted by how it sits this week. */
function ReadTd({ card, k, edge, pick }: { card: ReadCard | undefined; k: ReadKey; edge: boolean; pick: boolean }) {
  const cell = card?.[k];
  const tone = cell?.tone === "good" ? "dg-good" : cell?.tone === "bad" ? "dg-bad" : "";
  return (
    <td className={`dg-cell ${tone} ${pick ? "dg-pick" : ""}`}>
      {cell ? (
        <>
          <span className="dg-text">{cell.text}</span>
          {cell.sub && <span className="dg-sub">{cell.sub}</span>}
        </>
      ) : (
        <span className="dg-none">{LINEUP.role.empty}</span>
      )}
      {edge && (
        <span className="dg-edge" role="img" aria-label={LINEUP.role.legend.edge}>
          ▲
        </span>
      )}
    </td>
  );
}

function Blank() {
  return (
    <td className="dg-cell dg-pick">
      <span className="dg-none">{LINEUP.role.empty}</span>
    </td>
  );
}

function Grid({ role }: { role: LineupRole }) {
  const pick = role.pick!;
  const cands = role.candidates;
  const men = [pick, ...cands.map((c) => c.player)];
  const rows = readRows(role);
  const top = Math.max(...men.map((p) => p.projected), 1);
  return (
    <div className="dg-wrap">
      <table className="dg" aria-label={LINEUP.role.gridAria(role.label)} style={{ ["--cols" as string]: men.length }}>
        <thead>
          <tr>
            <td className="dg-label" />
            <Head p={pick} opp={role.opp} pick />
            {cands.map((c) => (
              <Head key={c.player.id} p={c.player} opp={c.opp} pick={false} />
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="dg-label">{LINEUP.role.rows.proj}</th>
            {men.map((p, i) => (
              <td key={p.id} className={`dg-cell ${i === 0 ? "dg-pick" : ""}`}>
                <span className="dg-num">{p.projected.toFixed(1)}</span>
                <span className="dg-track">
                  <span className="dg-bar" style={{ width: `${Math.max(6, (p.projected / top) * 100)}%` }} />
                </span>
              </td>
            ))}
          </tr>
          {men.some((p) => p.pos_rank) && (
            <tr>
              <th scope="row" className="dg-label">{LINEUP.role.rows.rank}</th>
              {men.map((p, i) => (
                <td key={p.id} className={`dg-cell ${i === 0 ? "dg-pick" : ""}`}>
                  <span className="dg-text tnum">{p.pos_rank ? `${p.position}${p.pos_rank.rank}` : LINEUP.role.empty}</span>
                </td>
              ))}
            </tr>
          )}
          {cands.length > 0 && (
            <tr>
              <th scope="row" className="dg-label">{LINEUP.role.rows.chance(lastName(pick.name))}</th>
              <Blank />
              {cands.map((c) => {
                const chance = himChance(c);
                return (
                  <td key={c.player.id} className={`dg-cell ${chance >= 50 ? "dg-flag" : ""}`}>
                    <span className="dg-num">{chance}%</span>
                  </td>
                );
              })}
            </tr>
          )}
          {rows.map((k) => (
            <tr key={k}>
              <th scope="row" className="dg-label">{LINEUP.factor[k]}</th>
              <ReadTd card={role.card} k={k} edge={hasEdge(role, k, -1)} pick />
              {cands.map((c, i) => (
                <ReadTd key={c.player.id} card={c.card} k={k} edge={hasEdge(role, k, i)} pick={false} />
              ))}
            </tr>
          ))}
          {cands.length > 0 && (
            <tr>
              <th scope="row" className="dg-label">{LINEUP.role.rows.edge}</th>
              <Blank />
              {cands.map((c) => {
                const e = edges(c);
                const net = e.pick - e.him;
                return (
                  <td key={c.player.id} className="dg-cell">
                    <span className={`dg-text ${net > 0 ? "text-start" : net < 0 ? "text-lean" : "text-muted"}`}>{net > 0 ? LINEUP.role.edge.pick(net) : net < 0 ? LINEUP.role.edge.him(-net) : LINEUP.role.edge.even}</span>
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Legend() {
  return (
    <div className="dg-legend" aria-hidden>
      <span>
        <i className="dg-swatch dg-good" />
        {LINEUP.role.legend.good}
      </span>
      <span>
        <i className="dg-swatch dg-bad" />
        {LINEUP.role.legend.bad}
      </span>
      <span>
        <b className="dg-edge-key">▲</b>
        {LINEUP.role.legend.edge}
      </span>
    </div>
  );
}

/** The engine's own sentences on each pair, folded: for the reader who wants the working. */
function Notes({ role }: { role: LineupRole }) {
  const [open, setOpen] = useState(false);
  const pick = role.pick!;
  if (role.candidates.length === 0) return null;
  return (
    <section className="min-w-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-lean">
        {open ? LINEUP.role.fullHide : LINEUP.role.full}
        <IconChevron size={13} className={open ? "-rotate-90" : "rotate-90"} />
      </button>
      {open && (
        <ul className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-2.5">
          {role.candidates.map((c) => (
            <li key={c.player.id} className="card min-w-0 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[13px] font-black">{LINEUP.role.vs(pick.name, c.player.name)}</span>
                <ConfidenceStamp value={c.confidence} />
              </div>
              <p className="tnum mt-1 text-[12px] font-bold text-ink-2">{LINEUP.role.odds(pct(c.p), lastName(pick.name), lastName(c.player.name))}</p>
              {c.factors.length > 0 ? (
                <ul className="mt-1">
                  {[...c.factors].sort(byOrder).map((f, j) => (
                    <Factor key={j} f={f} />
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[12px] text-muted">{LINEUP.role.none}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DecisionView({ lineup, label }: { lineup: Lineup; label: string }) {
  const role: LineupRole | undefined = (lineup.roles ?? []).find((r) => r.label === label);
  const [handled, setHandled] = useHandled(lineup.week);
  // Leaving this page for the lineup is not an arrival there: keep the stamp down.
  useEffect(() => {
    skipNextBoom();
  }, []);
  const back = (
    <LinkButton href={SECTIONS.team.href} variant="secondary" size="sm" className="justify-self-start">
      <IconChevron size={12} strokeWidth={3} className="rotate-180" />
      {LINEUP.role.back}
    </LinkButton>
  );
  if (!role || !role.pick) {
    return (
      <div className="grid gap-4">
        {back}
        <p className="text-[13px] text-muted">{LINEUP.role.missing}</p>
      </div>
    );
  }
  const done = handled.has(role.label);
  const pickLast = lastName(role.pick.name);
  return (
    <div className="grid min-w-0 gap-5">
      {back}
      <header>
        <h1 className="display text-[28px] leading-none">{LINEUP.role.question(role.label)}</h1>
        {role.game && <p className="decision-game mt-2">{role.game.line}</p>}
      </header>

      {/* The call, in one line, so it can be followed blind. */}
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="display text-[22px] leading-none text-start">{LINEUP.role.start(role.pick.name)}</span>
          <ConfidenceStamp value={role.confidence} />
          {role.change && <span className="text-[11px] font-bold uppercase tracking-wide text-start">{role.tipped ? LINEUP.role.tipped : LINEUP.role.change}</span>}
        </div>
        {role.candidates[0] && role.p >= 0.5 && (
          <p className="tnum text-[13px] font-bold text-ink-2">{LINEUP.role.odds(pct(role.p), pickLast, lastName(role.candidates[0].player.name))}</p>
        )}
        {overruled(role).map(({ c, chance, tips }) => (
          <p key={c.player.id} className="decide-flag">
            {LINEUP.role.flag(lastName(c.player.name), chance, pickLast)}{" "}
            {tips.length > 0 ? LINEUP.role.tips(pickLast, tips.map((k) => LINEUP.factor[k]).join(", ")) : role.reason}
          </p>
        ))}
      </section>

      <section className="grid min-w-0 gap-2">
        <H2>{LINEUP.role.grid}</H2>
        <Legend />
        <Grid role={role} />
      </section>

      <Notes role={role} />

      {/* What the button does is written under it: the word alone did not say. */}
      <section className="card grid gap-2.5 p-3.5">
        {done ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Stamp ink="text-start" size="md">
                <IconCheck size={11} strokeWidth={3.4} />
                {LINEUP.role.handled}
              </Stamp>
              <Button variant="ghost" size="sm" onClick={() => setHandled(role.label, false)}>
                {LINEUP.role.unhandle}
              </Button>
            </div>
            <p className="text-[12px] leading-snug text-muted">{LINEUP.role.handledLine(role.label)}</p>
          </>
        ) : (
          <>
            <Button variant="start" onClick={() => setHandled(role.label, true)}>
              <IconCheck size={14} strokeWidth={3} />
              {LINEUP.role.handle}
            </Button>
            <p className="text-center text-[12px] leading-snug text-muted">{LINEUP.role.handleLine(role.label)}</p>
          </>
        )}
      </section>
      {back}
    </div>
  );
}

