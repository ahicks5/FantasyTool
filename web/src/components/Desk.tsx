"use client";
/** The owner's desk: the front page. What landed, who is next, and the staff's binders. */
import Link from "next/link";
import { PlayerName } from "./Players";
import { IconChevron, IconMark } from "./icons";
import { Eyebrow } from "./ui";
import type { Connection } from "@/lib/storage";
import { DESK, SECTIONS } from "@/lib/vocab";
import type { Binder, Desk, NewsItem, NewsLevel } from "@/lib/types";

/* ---------------------------------------------------------------- the desk ---
   The elevator's last frame, as a page: the desk top seen from the owner's chair, the
   nameplate at the far edge, the papers laid on the blotter, the binders along the
   bottom. It is the same room the ride lands in (`Elevator.tsx`), so when the papers
   fade there is a desk underneath them — the ride never reveals a different screen.

   Order on the desk is Andrew's brief: news first, because a QB1 ruled out at 4pm
   changes every other paper; then who is next; then the binders, one per member of
   staff, each carrying how many items inside it are worth pursuing. The numbers are
   the engine's (`edge/api/desk.py`); every word around them is in `vocab.ts`.     */

/** The four levels, each with its ink and a soft fill. Colour is never the only channel:
 *  the chip says the word too. `critical` is status red because it is a starter of yours
 *  who may not play, which is exactly the thing that colour means everywhere else. */
const LEVEL_TONE: Record<NewsLevel, string> = {
  critical: "text-sit bg-sit-soft",
  warning: "text-flip bg-flip-soft",
  upside: "text-start bg-start-soft",
  note: "text-muted bg-soft",
};

/** A sheet of Penthouse letterhead: the wordmark small in the corner, like the ride's. */
function Letterhead() {
  return (
    <span className="desk-letterhead" aria-hidden>
      <IconMark size={9} />
      <span className="chrome-type">PENTHOUSE</span>
    </span>
  );
}

function NewsRow({ it, index }: { it: NewsItem; index: number }) {
  const mine = it.player;
  const also = it.also ?? [];
  return (
    <li className={`desk-news-row print print-${Math.min(index + 1, 5)}`}>
      <div className="flex items-start gap-2.5">
        <span className={`desk-level ${LEVEL_TONE[it.level]}`}>{DESK.news.levels[it.level]}</span>
        <div className="min-w-0 flex-1">
          {/* The headline names the man the story is about; tapping him opens his report,
              because the desk says what happened and the report says how much it matters. */}
          <p className="display text-[16px] leading-[1.15] text-ink">
            {it.kind === "line" ? (
              it.headline
            ) : (
              <>
                <PlayerName p={{ id: it.about.id, name: it.about.name, position: it.about.position, nfl_team: it.about.nfl_team }} className="display" />
                {it.headline.slice(it.about.name.length)}
              </>
            )}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{it.detail}</p>
          <p className="tnum mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            {DESK.news.ago(it.age_hours)}
            {it.kind !== "own" && (
              <>
                {" · "}
                <PlayerName p={{ id: mine.id, name: mine.name, position: mine.position, nfl_team: mine.nfl_team }} className="normal-case tracking-normal" />
              </>
            )}
            {also.length > 0 && <> · {DESK.news.also(also.length)}</>}
          </p>
        </div>
      </div>
    </li>
  );
}

/** The top paper: what just happened in the NFL that touches this roster. */
function NewsPaper({ desk, animate }: { desk: Desk; animate: boolean }) {
  const { news } = desk;
  const hidden = news.count - news.items.length;
  return (
    <article className={`desk-paper desk-paper-news ${animate ? "rise" : ""}`} aria-labelledby="desk-news-title">
      <Letterhead />
      <Eyebrow>
        {DESK.news.eyebrow} · {DESK.news.window(news.window_hours)}
      </Eyebrow>
      <h2 id="desk-news-title" className="display mt-1 text-[22px] leading-[1.05] text-ink">
        {DESK.news.title}
      </h2>
      {news.items.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">{DESK.news.quiet}</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {news.items.map((it, i) => (
            <NewsRow key={it.id} it={it} index={i} />
          ))}
        </ol>
      )}
      {hidden > 0 && <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{DESK.news.more(hidden)}</p>}
    </article>
  );
}

/** A side paper: one line of eyebrow, one headline, one door. */
function SidePaper({
  href,
  eyebrow,
  title,
  line,
  cta,
  animate,
  delay,
  tilt,
}: {
  href: string;
  eyebrow: string;
  title: string;
  line?: string | null;
  cta: string;
  animate: boolean;
  delay: number;
  tilt: "l" | "r";
}) {
  return (
    <Link href={href} className={`desk-paper desk-paper-side desk-tilt-${tilt} ${animate ? `rise rise-${delay}` : ""}`}>
      <Letterhead />
      <Eyebrow>{eyebrow}</Eyebrow>
      <span className="display mt-1 line-clamp-2 text-[17px] leading-tight text-ink">{title}</span>
      {line && <span className="tnum mt-0.5 block whitespace-pre-line text-[12px] font-semibold leading-snug text-muted">{line}</span>}
      <span className="mt-2.5 inline-flex items-center gap-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-ink-2">
        {cta}
        <IconChevron size={12} strokeWidth={2.8} />
      </span>
    </Link>
  );
}

/**
 * A binder on the desk: the staff member's name on the cover, what is inside, and a
 * badge with how many items are worth pursuing. It glows when there is something in
 * it, like a phone with a message on it; a locked binder still shows its count, name-free,
 * which is the same rule the call sheet's teasers follow.
 */
function BinderCover({ b, animate, delay }: { b: Binder; animate: boolean; delay: number }) {
  const words = DESK.binders[b.key];
  const lit = b.count > 0;
  const { href } = SECTIONS[b.key];
  return (
    <Link
      href={href}
      className={`binder ${lit ? "binder-lit" : ""} ${b.locked ? "binder-locked" : ""} ${animate ? `rise rise-${delay}` : ""}`}
      aria-label={`${words.staff}: ${words.line}. ${lit ? DESK.binders.count(b.count) : DESK.binders.clear}${b.locked ? `. ${DESK.binders.locked}` : ""}`}
    >
      <span className="binder-spine" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="binder-staff">{words.staff}</span>
        <span className="binder-line display">{words.line}</span>
      </span>
      <span className="binder-count tnum">{b.locked ? DESK.binders.locked : lit ? DESK.binders.count(b.count) : DESK.binders.clear}</span>
      {lit && (
        <span className="binder-badge tnum" aria-hidden>
          {b.count}
        </span>
      )}
      <IconChevron size={14} strokeWidth={2.6} className="shrink-0 text-muted" />
    </Link>
  );
}

export function DeskView({ desk, c, animate }: { desk: Desk; c: Connection; animate: boolean }) {
  const m = desk.matchup;
  const oddsPct = m?.win_prob != null ? Math.round(m.win_prob * 100) : null;
  // Two projections and, when the engine has one, the win chance under them. Two short
  // lines rather than one long one: the side paper is half of a 320px screen.
  const projLine = m && m.their_proj != null ? `${m.my_proj.toFixed(1)} v ${m.their_proj.toFixed(1)}` : null;
  const oddsLine = oddsPct != null ? DESK.opponent.odds(oddsPct) : null;
  return (
    <section className="desk" aria-label={DESK.aria}>
      {/* The nameplate on the far edge, read from the chair. */}
      <div className={`desk-nameplate ${animate ? "rise" : ""}`}>
        <span className="display truncate text-[15px] leading-none">{c.team_name}</span>
        <span className="desk-nameplate-title">
          {DESK.owner} · Week {desk.week}
        </span>
      </div>

      <NewsPaper desk={desk} animate={animate} />

      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <SidePaper
          href={SECTIONS.matchup.href}
          eyebrow={DESK.opponent.eyebrow}
          title={m?.opponent ?? DESK.opponent.none}
          line={[projLine, oddsLine].filter(Boolean).join("\n")}
          cta={DESK.opponent.cta}
          animate={animate}
          delay={1}
          tilt="l"
        />
        <SidePaper
          href={SECTIONS.sheet.href}
          eyebrow={DESK.sheet.eyebrow}
          title={desk.sheet.summary}
          cta={DESK.sheet.cta}
          animate={animate}
          delay={2}
          tilt="r"
        />
      </div>

      <div className="mt-5">
        <Eyebrow className="px-1">{DESK.binders.eyebrow}</Eyebrow>
        <ul className="mt-2 grid grid-cols-1 gap-2.5" role="list">
          {desk.binders.map((b, i) => (
            <li key={b.key} className="min-w-0">
              <BinderCover b={b} animate={animate} delay={i + 3} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
