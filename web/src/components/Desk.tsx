"use client";
/** The owner's desk: the front page. Three stories, this week's matchup, and the staff's notebooks. */
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "./Avatar";
import { IconArrowUp, IconChevron, IconMark } from "./icons";
import { PlayerName } from "./Players";
import type { Connection } from "@/lib/storage";
import { newsHeadline } from "@/lib/ticker.ts";
import type { Binder, Desk, DeskStanding, Film, Matchup, NewsItem, NewsSeverity, Player } from "@/lib/types";
import { DESK, SECTIONS } from "@/lib/vocab";

/* ---------------------------------------------------------------- the desk ---
   The elevator's last frame, as a page: the desk top seen from the owner's chair, the
   nameplate at the far edge, and the things to dig into laid out on the blotter. Less
   information, more doors (Andrew, 2026-09-21): the desk shows *what there is to open*
   and a badge for how much is inside, and the rooms behind the doors do the reading.

   Order is his brief: the nameplate with the record, the place and the points a game;
   news, cut to three stories and sorted by how hard each lands, with a face, a team badge,
   a severity meter and an arrow into the action plan on every row; this week's matchup
   where the call sheet's stack used to sit; then four spiral notebooks, one per member of
   staff and one for the film, each saying who it is from. The numbers are the engine's
   (`edge/api/desk.py`); every word around them is in `vocab.ts`.                       */

/** The letterhead in the corner of every paper: the mark and two letters. */
function Letterhead() {
  return (
    <span className="desk-letterhead" aria-hidden>
      <IconMark size={9} />
      <span className="chrome-type">{DESK.letterhead}</span>
    </span>
  );
}

const last = (name: string) => name.trim().split(/\s+/).pop() ?? name;

/** Why this story is on your desk, in a few words: the player of yours it lands on, and how. */
function tagFor(it: NewsItem): string {
  const p = it.player;
  const t = DESK.news.tag;
  const base =
    it.kind === "own"
      ? t.own(p.position, p.starter)
      : it.kind === "qb"
        ? t.qb(p.position, last(p.name))
        : it.kind === "target"
          ? t.target(p.position, last(p.name))
          : it.kind === "backfield"
            ? t.backfield(p.position, last(p.name))
            : t.line(p.position, last(p.name));
  const also = it.also?.length ? ` ${DESK.news.also(it.also.length)}` : "";
  return base + also;
}

/** The room off the desk for one story. The story is named in the query string, never the
 *  path: the static demo export cannot pre-render a path it has not seen. */
export function planHref(it: NewsItem): string {
  const q = new URLSearchParams({ kind: it.kind, for: it.player.id, about: it.about.id });
  return `${SECTIONS.plan.href}?${q}`;
}

/**
 * How hard a story lands: four pips, filled up to the engine's severity, and the word.
 * Colour never carries it alone. Exported for the plan page, which opens on the same meter.
 */
export function Severity({ n, up = false, className = "" }: { n: NewsSeverity; up?: boolean; className?: string }) {
  // A role opening for a player of yours is good news: the meter goes green and says so.
  const word = up ? DESK.news.upside : DESK.news.severity[n];
  return (
    <span className={`desk-sev desk-sev-${n} ${up ? "desk-sev-up" : ""} ${className}`} role="img" aria-label={word}>
      <span className="desk-sev-pips" aria-hidden>
        {[1, 2, 3, 4].map((k) => (
          <i key={k} className={k <= n ? "on" : ""} />
        ))}
      </span>
      <span className="desk-sev-word">{word}</span>
    </span>
  );
}

/** The face on a story: the mark on it when the story lands hard, a green check when it
 *  is a role opening for a player of yours. */
export function NewsFace({ it, size = "sm" }: { it: NewsItem; size?: "sm" | "md" }) {
  const a = it.about;
  const up = it.level === "upside";
  return (
    <span className="relative shrink-0">
      <Avatar name={a.name} photo={a.photo} teamLogo={a.team_logo} size={size} />
      {up ? (
        <span className="desk-mark desk-mark-up" aria-hidden>
          {DESK.news.markUp}
        </span>
      ) : (
        it.severity >= 3 && (
          <span className={`desk-mark desk-mark-${it.severity}`} aria-hidden>
            {DESK.news.mark}
          </span>
        )
      )}
    </span>
  );
}

/**
 * One story, one line and a half: the face, the headline, then the meter and the tag, and
 * the arrow on the right into the action plan. Tap the row itself for the platform's own
 * note and the other players of yours it touches.
 */
function NewsRow({ it, index }: { it: NewsItem; index: number }) {
  const [open, setOpen] = useState(false);
  const a = it.about;
  const others = it.others ?? [];
  const alsoNames = it.also ?? [];
  return (
    <li className={`desk-news-row desk-news-row-${it.severity} print print-${Math.min(index + 1, 5)}`}>
      <div className="flex items-center gap-2.5">
        <NewsFace it={it} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="display line-clamp-2 text-[13.5px] leading-tight text-ink">{newsHeadline(it)}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5">
            <Severity n={it.severity} up={it.level === "upside"} />
            <span className="min-w-0 truncate text-[11px] font-bold text-ink-2">{tagFor(it)}</span>
          </span>
        </button>
        {/* The right column: the plan on top, the clock under it. */}
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Link href={planHref(it)} className="desk-plan-link" aria-label={DESK.news.planAria(a.name)}>
            <span>{DESK.news.plan}</span>
            <IconArrowUp size={11} strokeWidth={2.8} className="rotate-90" />
          </Link>
          <span className="tnum text-[10px] font-bold uppercase text-muted">{DESK.news.ago(it.age_hours)}</span>
        </span>
      </div>
      {open && (
        <div className="mt-2 pl-[46px] text-[12px] leading-snug text-ink-2">
          {/* The name here is the door to his report; the headline above stays a plain
              tap target for the disclosure. */}
          {it.kind !== "line" && (
            <PlayerName p={{ id: a.id, name: a.name, position: a.position, nfl_team: a.nfl_team, photo: a.photo }} className="font-bold" />
          )}
          {it.kind !== "line" && " · "}
          {it.detail}
          {others.length > 0 && <> {others.map((o) => `${o.name} is ${o.status ?? ""}`).join(", ")}.</>}
          {alsoNames.length > 0 && (
            <span className="mt-1 block text-muted">
              {alsoNames.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <PlayerName p={{ id: p.id, name: p.name, position: p.position, nfl_team: p.nfl_team, photo: p.photo }} />
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/** The top paper: what just happened in the NFL that touches this roster. Three stories,
 *  hardest-landing first, the rest behind "more". */
function NewsPaper({ desk, animate }: { desk: Desk; animate: boolean }) {
  const { news } = desk;
  const [all, setAll] = useState(false);
  const items = all ? news.items : news.items.slice(0, DESK.news.shown);
  const hidden = news.items.length - items.length;
  return (
    <article className={`desk-paper desk-paper-news ${animate ? "rise" : ""}`} aria-labelledby="desk-news-title">
      <Letterhead />
      <h2 id="desk-news-title" className="eyebrow">
        {DESK.news.eyebrow} <span aria-hidden>·</span> {DESK.news.window(news.window_hours)}
        {news.count > 0 && (
          <>
            {" "}
            <span aria-hidden>·</span> <span className="tnum">{news.count}</span>
          </>
        )}
      </h2>
      {news.items.length === 0 ? (
        <p className="mt-2 text-[12.5px] leading-snug text-muted">{DESK.news.quiet}</p>
      ) : (
        <ol className="mt-1.5 divide-y divide-line">
          {items.map((it, i) => (
            <NewsRow key={it.id} it={it} index={i} />
          ))}
        </ol>
      )}
      {(hidden > 0 || all) && news.items.length > DESK.news.shown && (
        <button type="button" className="desk-more" onClick={() => setAll((v) => !v)}>
          {all ? DESK.news.less : DESK.news.more(hidden)}
          <IconChevron size={11} strokeWidth={2.8} className={all ? "-rotate-90" : "rotate-90"} />
        </button>
      )}
    </article>
  );
}

/**
 * This week's game, as a paper on the desk: who, the projected score, the odds, their
 * record and place, and the arrow into the full read. The numbers are the call sheet's
 * own (`report.matchup`) and the standings table's; nothing is computed here.
 */
function MatchupPaper({ m, week, standing, animate }: { m: Matchup | null | undefined; week: number; standing?: DeskStanding | null; animate: boolean }) {
  const cls = `desk-paper desk-matchup ${animate ? "rise rise-1" : ""}`;
  if (!m || !m.opponent || m.their_proj === null) {
    return (
      <article className={cls}>
        <Letterhead />
        <span className="eyebrow">
          {DESK.matchup.eyebrow} <span aria-hidden>·</span> {DESK.week(week)}
        </span>
        <p className="mt-2 text-[12.5px] leading-snug text-muted">{DESK.matchup.none}</p>
      </article>
    );
  }
  const ahead = m.my_proj >= m.their_proj;
  const theirs =
    m.opponent_record && m.opponent_rank && m.teams ? DESK.matchup.standing(m.opponent_record, m.opponent_rank, m.teams) : null;
  // Your own record and place again, under your score: the same two numbers the
  // nameplate carries, so the two sides of the paper read alike.
  const mine = standing ? DESK.matchup.standing(standing.record, standing.rank, standing.teams) : null;
  const odds = m.win_prob !== null ? DESK.matchup.odds(m.win_prob) : null;
  return (
    <Link
      href={SECTIONS.matchup.href}
      className={cls}
      aria-label={`${DESK.matchup.eyebrow}, ${DESK.week(week)}: ${DESK.matchup.vs} ${m.opponent}${theirs ? `, ${theirs}` : ""}. ${DESK.matchup.you} ${m.my_proj.toFixed(1)}, ${DESK.matchup.them} ${m.their_proj.toFixed(1)}${odds ? `. ${odds}` : ""}. ${DESK.matchup.go}.`}
    >
      <Letterhead />
      {/* Who, when, and whose read it is, on one line at the top (Andrew). */}
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 pr-8">
        <span className="eyebrow shrink-0">
          {DESK.matchup.eyebrow} <span aria-hidden>·</span> {DESK.week(week)}
        </span>
        <span className="desk-from !mt-0 min-w-0 truncate">{DESK.matchup.from}</span>
      </span>
      <span className="mt-1.5 flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-muted">{DESK.matchup.you}</span>
          <span className={`display tnum block text-[26px] leading-none ${ahead ? "text-ink" : "text-ink-2"}`}>{m.my_proj.toFixed(1)}</span>
          {mine && <span className="tnum mt-1 block text-[10.5px] font-bold text-muted">{mine}</span>}
        </span>
        <span className="display pb-1 text-[12px] text-muted" aria-hidden>
          {DESK.matchup.vs}
        </span>
        <span className="min-w-0 flex-1 text-right">
          <span className="block truncate text-[10px] font-black uppercase tracking-[0.12em] text-muted">{m.opponent}</span>
          <span className={`display tnum block text-[26px] leading-none ${ahead ? "text-ink-2" : "text-ink"}`}>{m.their_proj.toFixed(1)}</span>
          {theirs && <span className="tnum mt-1 block text-[10.5px] font-bold text-muted">{theirs}</span>}
        </span>
      </span>
      {m.win_prob !== null && (
        <span className="desk-odds" aria-hidden>
          <span className="desk-odds-bar">
            <i style={{ width: `${Math.round(m.win_prob * 100)}%` }} />
          </span>
          <span className="tnum desk-odds-word">{odds}</span>
        </span>
      )}
      <span className="mt-2 flex items-center justify-end gap-2">
        <span className="desk-go">
          {DESK.matchup.go}
          <IconChevron size={11} strokeWidth={2.8} />
        </span>
      </span>
    </Link>
  );
}

/**
 * A spiral notebook: rings along the top, a title on the cover, who it is from
 * underneath. When there is something inside, the cover's edge takes the signal colour
 * and a count beats inside the cell, right-aligned: not a phone's red dot on a corner but
 * the staff saying we have to look at this. A locked notebook still shows its count,
 * name-free, the same rule the paid teasers follow.
 *
 * Under the title, one line off the cover: the top item inside with the face on it, the
 * best move's gain when the binder is locked, or the film's scoreline. Filler is never a
 * placeholder here: it is the engine's own top line (Andrew, 2026-09-21).
 */
function Notebook({
  href,
  title,
  from,
  count = 0,
  locked = false,
  line,
  face,
  animate,
  delay,
}: {
  href: string;
  title: string;
  from: string;
  count?: number;
  locked?: boolean;
  line: string;
  face?: Player | null;
  animate: boolean;
  delay: number;
}) {
  const label = [title, from, line, count > 0 ? DESK.notebooks.lit(count) : null, locked ? DESK.notebooks.locked : null].filter(Boolean).join(". ");
  return (
    <Link href={href} className={`notebook ${count > 0 ? "notebook-lit" : ""} ${locked ? "notebook-locked" : ""} ${animate ? `rise rise-${delay}` : ""}`} aria-label={label}>
      <span className="notebook-rings" aria-hidden />
      <span className="flex items-start justify-between gap-2">
        <span className="display min-w-0 block truncate text-[16px] leading-tight text-ink">{title}</span>
        {count > 0 && (
          <span className="notebook-badge tnum" aria-hidden>
            {count}
          </span>
        )}
      </span>
      <span className="desk-from">{from}</span>
      <span className="notebook-line" aria-hidden>
        {face && <Avatar name={face.name} photo={face.photo} teamLogo={face.team_logo} size="xs" className="notebook-face" />}
        <span className="min-w-0 truncate">{line}</span>
      </span>
      {locked && <span className="notebook-lock">{DESK.notebooks.locked}</span>}
    </Link>
  );
}

/** The cover line of a staff notebook: the top item's title, or its gain when locked. */
function coverLine(b: Binder | undefined): string {
  if (!b || b.count === 0) return DESK.notebooks.quiet;
  if (b.top?.title) return b.top.title;
  return b.top_benefit ? DESK.notebooks.best(b.top_benefit) : DESK.notebooks.lit(b.count);
}

/** The film's cover line: last week's result and how the calls landed. */
function filmLine(f: Film | null | undefined): string {
  return f ? DESK.notebooks.film(f.result, f.score, f.opp_score, f.hits, f.total) : DESK.notebooks.filmNone;
}

export function DeskView({ desk, c, animate }: { desk: Desk; c: Connection; animate: boolean }) {
  const byKey = Object.fromEntries(desk.binders.map((b) => [b.key, b])) as Record<Binder["key"], Binder>;
  const staff = (["team", "waivers", "trade"] as const).map((k) => ({ key: k, b: byKey[k] }));
  return (
    <section className="desk" aria-label={DESK.aria}>
      {/* The nameplate on the far edge, read from the chair, and under it the three
          numbers an owner knows without looking: the record, the place, the points a
          game. The standings' own numbers (`edge/api/desk.py`); nothing computed here. */}
      <div className={`desk-nameplate ${animate ? "rise" : ""}`}>
        <span className="display truncate text-[15px] leading-none">{c.team_name}</span>
        <span className="desk-nameplate-title">
          {DESK.owner} · {DESK.week(desk.week)}
        </span>
      </div>
      {desk.standing && (
        <dl className={`desk-stats ${animate ? "rise" : ""}`}>
          <div>
            <dt>{DESK.standing.record}</dt>
            <dd className="tnum">{desk.standing.record}</dd>
          </div>
          <div>
            <dt>{DESK.standing.rank}</dt>
            <dd className="tnum">{DESK.standing.place(desk.standing.rank, desk.standing.teams)}</dd>
          </div>
          <div>
            <dt>{DESK.standing.ppg}</dt>
            <dd className="tnum">{desk.standing.ppg === null ? DESK.standing.none : desk.standing.ppg.toFixed(1)}</dd>
          </div>
        </dl>
      )}

      <NewsPaper desk={desk} animate={animate} />

      <div className="mt-3">
        <MatchupPaper m={desk.matchup} week={desk.week} standing={desk.standing} animate={animate} />
      </div>

      {/* A thin rule with the eyebrow in it: whose work the four notebooks are. */}
      <div className={`desk-office-head ${animate ? "rise rise-2" : ""}`} aria-hidden>
        <span>{DESK.notebooks.eyebrow}</span>
      </div>
      <ul className="mt-2 grid grid-cols-2 auto-rows-fr gap-2.5" role="list" aria-label={DESK.notebooks.eyebrow}>
        {staff.map(({ key, b }, i) => (
          <li key={key} className="min-w-0">
            <Notebook
              href={SECTIONS[key].href}
              title={DESK.notebooks[key].title}
              from={DESK.notebooks[key].from}
              count={b?.count ?? 0}
              locked={b?.locked ?? false}
              line={coverLine(b)}
              face={b?.top?.player}
              animate={animate}
              delay={i + 2}
            />
          </li>
        ))}
        <li className="min-w-0">
          <Notebook
            href={SECTIONS.report.href}
            title={DESK.notebooks.report.title}
            from={DESK.notebooks.report.from}
            line={filmLine(desk.film)}
            animate={animate}
            delay={5}
          />
        </li>
      </ul>
    </section>
  );
}
