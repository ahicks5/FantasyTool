"use client";
/** The owner's desk: the front page. Three stories, the call sheet, and the staff's notebooks. */
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "./Avatar";
import { IconChevron, IconMark } from "./icons";
import { PlayerName } from "./Players";
import type { Connection } from "@/lib/storage";
import { newsHeadline } from "@/lib/ticker.ts";
import type { Binder, Desk, NewsItem, NewsLevel } from "@/lib/types";
import { DESK, SECTIONS } from "@/lib/vocab";

/* ---------------------------------------------------------------- the desk ---
   The elevator's last frame, as a page: the desk top seen from the owner's chair, the
   nameplate at the far edge, and the things to dig into laid out on the blotter. Less
   information, more doors (Andrew, 2026-09-21): the desk shows *what there is to open*
   and a badge for how much is inside, and the rooms behind the doors do the reading.

   Order is his brief: news first and cut to three stories, tight, with a face and a
   team badge on each and a few words for why it is on your desk; then the call sheet
   as a stack of papers under a cover; then four spiral notebooks, one per member of
   staff and one for the next opponent, each saying who it is from. The numbers are the
   engine's (`edge/api/desk.py`); every word around them is in `vocab.ts`.           */

/** The four levels, each with its ink and a soft fill. Colour is never the only channel:
 *  the chip says the word too. `critical` is status red because it is a starter of yours
 *  who may not play, which is exactly the thing that colour means everywhere else. */
const LEVEL_TONE: Record<NewsLevel, string> = {
  critical: "text-sit bg-sit-soft",
  warning: "text-flip bg-flip-soft",
  upside: "text-start bg-start-soft",
  note: "text-muted bg-soft",
};

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

/**
 * One story, one line and a half: the face, the headline, then the level and the tag.
 * Tap the row for the platform's own note and the other players of yours it touches.
 * The name opens his report, because the desk says what happened and the report says
 * how much it matters.
 */
function NewsRow({ it, index }: { it: NewsItem; index: number }) {
  const [open, setOpen] = useState(false);
  const a = it.about;
  const others = it.others ?? [];
  const alsoNames = it.also ?? [];
  return (
    <li className={`desk-news-row print print-${Math.min(index + 1, 5)}`}>
      <div className="flex items-center gap-2.5">
        <Avatar name={a.name} photo={a.photo} teamLogo={a.team_logo} size="sm" />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="display line-clamp-2 text-[13.5px] leading-tight text-ink">
            {newsHeadline(it)}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5">
            <span className={`desk-level ${LEVEL_TONE[it.level]}`}>{DESK.news.levels[it.level]}</span>
            <span className="min-w-0 truncate text-[11px] font-bold text-ink-2">{tagFor(it)}</span>
            <span className="tnum ml-auto shrink-0 text-[10px] font-bold uppercase text-muted">{DESK.news.ago(it.age_hours)}</span>
          </span>
        </button>
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
 *  the rest behind "more". */
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

/** A red count on a corner. */
function Badge({ n }: { n: number }) {
  return (
    <span className="desk-badge tnum" aria-hidden>
      {n}
    </span>
  );
}

/** The call sheet: a stack of papers under a cover, the week on it and the moves on the badge. */
function SheetStack({ desk, animate }: { desk: Desk; animate: boolean }) {
  const n = desk.sheet.moves;
  return (
    <Link
      href={SECTIONS.sheet.href}
      className={`desk-stack ${animate ? "rise rise-1" : ""}`}
      aria-label={`${DESK.sheet.title}, ${DESK.sheet.week(desk.week)}: ${desk.sheet.summary}`}
    >
      <span className="desk-stack-sheet desk-stack-sheet-2" aria-hidden />
      <span className="desk-stack-sheet desk-stack-sheet-1" aria-hidden />
      <span className="desk-stack-cover">
        <Letterhead />
        {n > 0 && <Badge n={n} />}
        <span className="eyebrow">{DESK.sheet.week(desk.week)}</span>
        <span className="display mt-0.5 block text-[20px] leading-none text-ink">{DESK.sheet.title}</span>
        <span className="mt-1.5 block text-[11px] font-bold text-muted">{desk.sheet.summary}</span>
        <span className="desk-from">{DESK.sheet.from}</span>
      </span>
    </Link>
  );
}

/**
 * A spiral notebook: rings along the top, a title on the cover, who it is from
 * underneath, and a badge on the corner when there is something inside. A locked
 * notebook still shows its count, name-free, the same rule the call sheet's teasers follow.
 */
function Notebook({
  href,
  title,
  from,
  count = 0,
  locked = false,
  label,
  animate,
  delay,
}: {
  href: string;
  title: string;
  from: string;
  count?: number;
  locked?: boolean;
  label: string;
  animate: boolean;
  delay: number;
}) {
  return (
    <Link href={href} className={`notebook ${count > 0 ? "notebook-lit" : ""} ${animate ? `rise rise-${delay}` : ""}`} aria-label={label}>
      <span className="notebook-rings" aria-hidden />
      {count > 0 && <Badge n={count} />}
      <span className="display block truncate text-[16px] leading-tight text-ink">{title}</span>
      <span className="desk-from">{from}</span>
      {locked && <span className="notebook-lock">{DESK.notebooks.locked}</span>}
    </Link>
  );
}

export function DeskView({ desk, c, animate }: { desk: Desk; c: Connection; animate: boolean }) {
  const m = desk.matchup;
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
          {DESK.owner} · {DESK.sheet.week(desk.week)}
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
        <SheetStack desk={desk} animate={animate} />
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-2.5" role="list">
        {staff.map(({ key, b }, i) => (
          <li key={key} className="min-w-0">
            <Notebook
              href={SECTIONS[key].href}
              title={DESK.notebooks[key].title}
              from={DESK.notebooks[key].from}
              count={b?.count ?? 0}
              locked={b?.locked ?? false}
              label={`${DESK.notebooks[key].title}. ${DESK.notebooks[key].from}${b?.count ? `. ${b.count}` : ""}${b?.locked ? `. ${DESK.notebooks.locked}` : ""}`}
              animate={animate}
              delay={i + 2}
            />
          </li>
        ))}
        <li className="min-w-0">
          <Notebook
            href={SECTIONS.matchup.href}
            title={m?.opponent ?? DESK.notebooks.none}
            from={`${DESK.notebooks.matchup.from} · ${DESK.notebooks.matchup.title}`}
            label={`${DESK.notebooks.matchup.title}. ${DESK.notebooks.matchup.from}: ${m?.opponent ?? DESK.notebooks.none}`}
            animate={animate}
            delay={5}
          />
        </li>
      </ul>
    </section>
  );
}
