"use client";
/**
 * The replay: one finished week told as a story, card by card (SPEC-FILM F-4).
 *
 * The cover leads and is free: the result, the score, and the one kind and true line the
 * engine picked. Under it the story, a column of cards in the spec's order (the game, what
 * decided it, your lineup, the man who carried you, the man who let you down, the injuries,
 * every starter, then one thing to do before Thursday), with a rail on the right that
 * lights the card you are on and jumps to any other.
 *
 * Every number and every sentence about a player is the engine's (`edge/engine/film.py`).
 * Which cards a week earns is `lib/film.ts`. Every other word is `lib/vocab.ts`'s. This file
 * lays it out.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { dud, hasPlatformSource, historyLine, lineupBars, standout, starters, storyCards, verdictTone, type CardKey } from "@/lib/film";
import type { FilmAttribution, FilmCover, FilmReason, WeekFilm } from "@/lib/types";
import { FILM } from "@/lib/vocab";
import { Avatar } from "../Avatar";
import { PlayerName } from "../Players";
import { IconChevron } from "../icons";
import { Eyebrow, LinkButton, Stamp } from "../ui";

/* ------------------------------------------------------------------ the cover --- */

/** The free half: result, score, opponent and the cover line. Drawn over the paywall too. */
export function Cover({ cover, week }: { cover: FilmCover; week: number }) {
  const ink = cover.result === "W" ? "text-start" : cover.result === "L" ? "text-sit" : "text-ink";
  return (
    <section className="hero film-cover p-5" aria-label={`${FILM.eyebrow}, ${FILM.week(week)}`}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>{FILM.eyebrow}</Eyebrow>
        <span className="text-[11px] font-bold uppercase tracking-wide text-white/55">{FILM.week(week)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {cover.result && (
          <Stamp size="lg" ink={ink} slam>
            {FILM.result[cover.result]}
          </Stamp>
        )}
        <span className="display tnum text-[38px] leading-none text-white">{FILM.score(cover.my_points, cover.their_points)}</span>
      </div>
      <p className="mt-2 text-[13px] font-bold text-white/70">{cover.opponent ? FILM.vs(cover.opponent) : FILM.bye}</p>
      {cover.line && <p className="film-cover-line mt-4">{cover.line}</p>}
    </section>
  );
}

/** The weeks on tape, newest first. Only drawn when there is more than one. */
export function WeekPicker({ weeks, value, onPick }: { weeks: number[]; value: number; onPick: (w: number) => void }) {
  if (weeks.length < 2) return null;
  return (
    <div className="film-weeks" role="group" aria-label={FILM.weeks}>
      {weeks.map((w) => (
        <button key={w} type="button" aria-pressed={w === value} onClick={() => onPick(w)} className="film-week">
          {FILM.weekChip(w)}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces --- */

function Reasons({ reasons }: { reasons: FilmReason[] }) {
  if (reasons.length === 0) return <p className="mt-1.5 text-[12px] text-muted">{FILM.quiet}</p>;
  return (
    <ul className="mt-1.5 grid gap-1">
      {reasons.map((r, i) => (
        <li key={i} className={`film-reason ${r.sign > 0 ? "film-good" : "film-bad"}`}>
          <span className="film-reason-dot" aria-hidden />
          <span>{r.line}</span>
        </li>
      ))}
    </ul>
  );
}

function HadWent({ a, big = false, delta = true }: { a: FilmAttribution; big?: boolean; delta?: boolean }) {
  const tone = verdictTone(a.verdict);
  return (
    <span className={`tnum inline-flex items-baseline gap-1.5 ${big ? "text-[22px]" : "text-[13px]"} font-black`}>
      <span className="text-muted">
        {a.had === null ? FILM.noHad : a.had.toFixed(1)}
        {a.source === "platform" && (
          <sup className="film-mark" role="img" aria-label={FILM.platformMark}>
            *
          </sup>
        )}
      </span>
      <span aria-hidden className="text-muted">→</span>
      <span className={tone === "good" ? "text-start" : tone === "bad" ? "text-sit" : ""}>{a.went.toFixed(1)}</span>
      {delta && a.delta !== null && (
        <span className={`text-[11px] ${a.delta >= 0 ? "text-start" : "text-sit"}`}>{FILM.delta(a.delta)}</span>
      )}
    </span>
  );
}

function VerdictTag({ a }: { a: FilmAttribution }) {
  if (!a.verdict) return null;
  const tone = verdictTone(a.verdict);
  return <span className={`film-verdict ${tone ? `film-verdict-${tone}` : ""}`}>{FILM.verdict[a.verdict]}</span>;
}

/** One man, the way the standout and the dud cards tell him. */
function Man({ a }: { a: FilmAttribution }) {
  const history = historyLine(a.history);
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={a.player.name} size="md" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-black">
            <PlayerName p={a.player} />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
            {a.slot === a.player.position ? "" : `${a.slot} · `}
            {a.player.position} · {a.player.nfl_team ?? "FA"}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <HadWent a={a} big />
        <VerdictTag a={a} />
      </div>
      <Reasons reasons={a.reasons} />
      {history && <p className="mt-2 text-[12px] font-bold text-lean">{history}</p>}
    </div>
  );
}

/** Every starter, one row each; the row opens his reasons, his season and his next move. */
function StarterRows({ w }: { w: WeekFilm }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <ul className="film-rows">
        {starters(w).map((a) => {
          const isOpen = open === a.player.id;
          const history = historyLine(a.history);
          return (
            <li key={a.player.id} className="film-row">
              <div className="film-row-head">
                <span className="film-slot">{a.slot}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                  <PlayerName p={a.player} />
                </span>
                <button
                  type="button"
                  className="film-row-open"
                  aria-expanded={isOpen}
                  aria-label={FILM.whyAria(a.player.name)}
                  onClick={() => setOpen(isOpen ? null : a.player.id)}
                >
                  <HadWent a={a} delta={false} />
                  <IconChevron size={12} strokeWidth={3} className={isOpen ? "-rotate-90" : "rotate-90"} />
                </button>
              </div>
              {isOpen && (
                <div className="film-row-body">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.delta !== null && (
                      <span className={`tnum text-[12px] font-black ${a.delta >= 0 ? "text-start" : "text-sit"}`}>
                        {FILM.delta(a.delta)}
                      </span>
                    )}
                    <VerdictTag a={a} />
                  </div>
                  <Reasons reasons={a.reasons} />
                  {history && <p className="mt-2 text-[12px] font-bold text-lean">{history}</p>}
                  {a.source && <p className="mt-1 text-[11px] text-muted">{FILM.source[a.source]}</p>}
                  {a.next && (
                    <p className="mt-2 text-[12px] font-bold">
                      {FILM.next[a.next.kind]}: {a.next.line}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hasPlatformSource(w) && <p className="mt-3 text-[11px] leading-snug text-muted">{FILM.sourceNote}</p>}
    </>
  );
}

/* ------------------------------------------------------------------ the cards --- */

function CardBody({ k, w }: { k: CardKey; w: WeekFilm }) {
  switch (k) {
    case "game":
      return (
        <>
          <p className="display text-[24px] leading-tight">
            {w.their_points === null || !w.result ? FILM.bye : FILM.margin(w.result, Math.abs(w.my_points - w.their_points))}
          </p>
          {w.opponent && <p className="mt-1 text-[13px] font-bold text-muted">{FILM.vs(w.opponent)}</p>}
          {w.facts.length > 0 && (
            <ul className="mt-3 grid gap-1.5">
              {w.facts.map((f) => (
                <li key={f.kind} className="film-fact">{f.line}</li>
              ))}
            </ul>
          )}
          {!w.line_by_line && <p className="mt-3 text-[12px] leading-snug text-muted">{FILM.lineByLine}</p>}
        </>
      );
    case "swing": {
      const s = w.swing!;
      return (
        <>
          {s.control && (
            <span className={`film-control film-control-${s.control}`}>{FILM.control[s.control]}</span>
          )}
          <p className="mt-2 text-[17px] font-black leading-snug">{s.line}</p>
        </>
      );
    }
    case "lineup": {
      const l = w.lineup!;
      const bars = lineupBars(l);
      return (
        <>
          <div className="grid gap-2">
            <Bar label={FILM.lineup.scored} value={bars.scored} note={l.points.toFixed(1)} tone="film-bar-scored" />
            <Bar label={FILM.lineup.best} value={bars.best} note={l.best_possible.toFixed(1)} tone="film-bar-best" />
          </div>
          <p className="mt-3 text-[14px] font-bold">{l.perfect ? FILM.lineup.perfect : FILM.lineup.left(l.left)}</p>
        </>
      );
    }
    case "standout":
      return <Man a={standout(w)!} />;
    case "dud":
      return <Man a={dud(w)!} />;
    case "injuries":
      return (
        <ul className="grid gap-2.5">
          {w.injuries.map((i) => (
            <li key={i.player.id}>
              <div className="flex flex-wrap items-baseline gap-2 text-[14px] font-black">
                <PlayerName p={i.player} />
                <span className="film-verdict film-verdict-bad">{FILM.verdict[i.verdict]}</span>
              </div>
              {i.line && <p className="mt-0.5 text-[12px] text-muted">{i.line}</p>}
            </li>
          ))}
        </ul>
      );
    case "starters":
      return <StarterRows w={w} />;
    case "takeaway": {
      const t = w.takeaway;
      if (!t) return <p className="text-[14px] font-bold">{FILM.takeawayNone}</p>;
      return (
        <>
          <p className="text-[11px] font-black uppercase tracking-wide text-lean">{FILM.next[t.kind]}</p>
          <p className="mt-1 text-[16px] font-black leading-snug">
            <PlayerName p={t.player} />: {t.line}
          </p>
          {t.href && (
            <LinkButton href={t.href} size="sm" className="mt-3">
              {FILM.go}
              <IconChevron size={12} strokeWidth={3} />
            </LinkButton>
          )}
        </>
      );
    }
  }
}

function Bar({ label, value, note, tone }: { label: string; value: number; note: string; tone: string }) {
  const width = Math.max(3, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[84px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="film-track" aria-hidden>
        <span className={`film-bar ${tone}`} style={{ width: `${width}%` }} />
      </span>
      <span className="tnum w-[44px] shrink-0 text-right text-[12px] font-black">{note}</span>
    </div>
  );
}

/** The story under the cover, with the rail that says where you are in it. */
export function Story({ w }: { w: WeekFilm }) {
  const cards = useMemo(() => storyCards(w), [w]);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [cards]);

  return (
    <section className="film-story" aria-label={FILM.story}>
      <ol className="film-cards">
        {cards.map((k, i) => (
          <li
            key={k}
            data-i={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="card film-card"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="film-card-head">{FILM.card[k]}</h3>
              <span className="tnum text-[11px] font-bold text-muted">
                {i + 1}/{cards.length}
              </span>
            </div>
            <div className="mt-2.5 min-w-0">
              <CardBody k={k} w={w} />
            </div>
          </li>
        ))}
      </ol>
      <nav className="film-rail" aria-label={FILM.story}>
        {cards.map((k, i) => (
          <button
            key={k}
            type="button"
            className="film-dot"
            aria-label={FILM.railAria(i + 1, cards.length)}
            aria-current={i === active ? "step" : undefined}
            onClick={() => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        ))}
      </nav>
    </section>
  );
}
