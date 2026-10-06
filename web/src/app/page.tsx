/** The landing page: the front office you walk into, how quick it is, the answers on your desk, the staff, the film, and the door. Indexable. */
import Link from "next/link";
import { LandingBar } from "@/components/LandingBar";
import { Reveal } from "@/components/Reveal";
import { WarmDoor } from "@/components/WarmDoor";
import { DoorClicks } from "@/components/DoorClicks";
import { IconCheck, IconChevron, IconFilm, IconTeam, IconTrade, IconWire, IconX } from "@/components/icons";
import { Countdown, Eyebrow, LinkButton, OnAir, Wordmark } from "@/components/ui";
import { LANDING, LINES } from "@/lib/vocab";

const DESK = LANDING.desk;

/**
 * The players in the worked example. The headshots are real Sleeper CDN images, keyed by
 * Sleeper player id. Picked from Sleeper's own week 5 (2026) projections and trending
 * adds (Andrew, 2026-10-05): each call is one a real owner would hesitate over, never a
 * first-rounder they would start anyway.
 */
const FACES = {
  stevenson: { name: "Rhamondre Stevenson", photo: "https://sleepercdn.com/content/nfl/players/thumb/7611.jpg", team: "ne" },
  kamara: { name: "Alvin Kamara", photo: "https://sleepercdn.com/content/nfl/players/thumb/4035.jpg", team: "no" },
  wilson: { name: "Emanuel Wilson", photo: "https://sleepercdn.com/content/nfl/players/thumb/11435.jpg", team: "sea" },
  sutton: { name: "Courtland Sutton", photo: "https://sleepercdn.com/content/nfl/players/thumb/5045.jpg", team: "den" },
  montgomery: { name: "David Montgomery", photo: "https://sleepercdn.com/content/nfl/players/thumb/5892.jpg", team: "hou" },
};

/** The call sheet in the hero: the week's three moves, as the app writes them. */
const SHEET = [
  { tag: DESK.coach.tag, title: `${DESK.coach.call} ${DESK.coach.over}`, gain: DESK.coach.gain, unit: DESK.coach.unit, stamp: DESK.coach.stamp, bars: 3, face: FACES.stevenson },
  { tag: DESK.scout.tag, title: `${DESK.scout.call} · ${DESK.scout.bid}`, gain: DESK.scout.gain, unit: DESK.scout.unit, stamp: DESK.scout.stamp, bars: 2, face: FACES.wilson },
  { tag: DESK.gm.tag, title: DESK.gm.offer(DESK.gm.giveName, DESK.gm.getName), gain: DESK.gm.gain, unit: DESK.gm.unit, stamp: "Lean", bars: 2, face: FACES.sutton },
];

/**
 * The art for each staff card. The words live in `LANDING.features` (vocab.ts); this
 * only pairs them with the icon and the swatch behind it. The tone is decoration and
 * never the only thing carrying a meaning.
 */
type FeatureKey = (typeof LANDING.features)[number]["key"];

const FEATURE_ART: Record<
  FeatureKey,
  { Icon: (p: { size?: number; strokeWidth?: number }) => React.ReactElement; tone: string }
> = {
  trade: { Icon: IconTrade, tone: "bg-start-soft text-start" },
  waivers: { Icon: IconWire, tone: "bg-lean-soft text-lean" },
  team: { Icon: IconTeam, tone: "bg-soft text-ink" },
};

/**
 * Every door on the page opens the register page, and the one exception is the way
 * back in for an owner who already has an account.
 *
 * A cold visitor has no account and no league, and the account comes first (Andrew,
 * 2026-09-24): register, land on your account, then link the league. Log in is on the
 * page too, plainly, because a returning owner who lands here should not have to read
 * the pitch to find the door (Andrew, 2026-09-27).
 */
const WAY_IN = "/register";
const LOGIN = "/login";
/** The two buttons the follow-along bar watches. */
const HERO_CTA_ID = "hero-cta";
const CLOSE_CTA_ID = "close-cta";
/** How many lines of a "who it is for" list a phone shows; the rest wait for a wide screen. */
const PHONE_LINES = 2;

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z' .-]/g, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/**
 * Headshot for a server component: the photo is painted as a background over the
 * initials, so a missing or slow image degrades to initials rather than a broken icon.
 */
function Face({ name, photo, team }: { name: string; photo: string; team: string }) {
  return (
    <span className="relative inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-black text-white/50">
      <span aria-hidden>{initials(name)}</span>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-cover bg-top bg-no-repeat"
        style={{ backgroundImage: `url("${photo}")` }}
      />
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 h-[19px] w-[19px] rounded-full bg-[length:19px_19px] bg-center bg-no-repeat"
        style={{ backgroundImage: `url("https://sleepercdn.com/images/team_logos/nfl/${team}.png")` }}
      />
    </span>
  );
}

/** The confidence stamp, inked white for the one dark surface on the page. */
function HeroStamp({ filled, label, className = "" }: { filled: number; label: string; className?: string }) {
  return (
    <span className={`stamp text-[10px] text-white ${className}`}>
      <span className="flex items-center gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-[9px] w-[3px] bg-white ${i < filled ? "" : "opacity-30"}`} />
        ))}
      </span>
      {label}
    </span>
  );
}

/** A letter grade's ink: green at the top, amber in the middle, red where it costs you. */
function gradeTone(grade: string): string {
  if (grade.startsWith("A")) return "text-start";
  if (grade.startsWith("B")) return "text-lean";
  return "text-sit";
}

/**
 * One question on the desk: who on the staff answers it, the question, and the answer.
 * Every card is a door, because a reader who has just read "Who do I start?" with a
 * worked answer under it is at the moment they most want their own, and a card that does
 * nothing when tapped is a dead end at the peak of the page.
 */
function DeskCard({ from, q, children, className = "" }: { from: string; q: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={WAY_IN} data-door="desk" className={`hero group flex flex-col p-5 hover:opacity-95 ${className}`}>
      <article className="flex flex-1 flex-col">
        <div className="eyebrow">{from}</div>
        <h3 className="display mt-1 text-[21px] leading-tight">{q}</h3>
        <div className="mt-4 flex flex-1 flex-col border-t border-white/10 pt-4">{children}</div>
        <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-white/80 group-hover:text-white">
          {LANDING.deskCta}
          <IconChevron size={13} strokeWidth={2.8} />
        </span>
      </article>
    </Link>
  );
}

export default function Landing() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      {/* The nameplate and the two doors. No theme switch here: dark is the room, and the
          switch lives in the app for an owner who wants the lights on (Andrew, 2026-09-27).
          Log in is always visible; the loud door hides below 480px, where the hero's
          button is one thumb away and the wordmark needs the width. */}
      <header className="flex h-16 items-center justify-between gap-2">
        {/* 20px below 480: at 24px "OWNER'S SUITE" wrapped to two lines beside the log-in
            pill on a 375px phone, which doubled the header and pushed the door down. */}
        <Wordmark className="whitespace-nowrap text-[20px] min-[480px]:text-[24px]" full />
        <nav className="flex shrink-0 items-center gap-2" aria-label="Account">
          <Link
            href={LOGIN}
            className="btn inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-line-2 px-4 text-[13px] font-bold hover:bg-soft"
          >
            {LANDING.login}
          </Link>
          <Link
            href={WAY_IN}
            data-door="header"
            className="btn hidden min-h-11 items-center gap-1 whitespace-nowrap rounded-full bg-start-fill px-4 text-[13px] font-bold text-white hover:opacity-90 min-[480px]:inline-flex"
          >
            {LANDING.bar.cta}
            <IconChevron size={13} strokeWidth={2.8} />
          </Link>
        </nav>
      </header>

      <main id="content">
        {/* ---------------------------------------------------------------- hero ---
            You are walking into your own front office. The headline says so, the line
            under it says who sits here, the staff sentence says who works for you. The
            call sheet is the desk you sit down at, and it prints while you read: the
            rows come off one at a time, each stamp slams once its row has landed, and a
            sheen crosses the sheet every few seconds (`.sheet-row`, `.callsheet-live`).

            On a phone the page is the headline, one line, the door and the sheet, in
            that order; the staff sentence and the three proof lines are for a wide
            screen, where they sit beside the sheet instead of pushing it below the fold
            (Andrew, 2026-09-28: way fewer words on mobile).

            The copy column paints whole on the first frame: no `rise` and no `Reveal`
            on it, so a cold load never shows a hole between the line and the button
            while a delayed fade catches up (W-001). Only the sheet and what sits below
            the fold arrive with motion. */}
        <section className="grid items-center gap-8 pt-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-16">
          <div>
            <Eyebrow>
              <span className="sm:hidden">{LANDING.eyebrowShort}</span>
              <span className="hidden sm:inline">{LANDING.eyebrow}</span>
            </Eyebrow>
            <h1 className="display mt-3 text-[43px] leading-[0.98] sm:text-[56px] lg:text-[64px]">{LANDING.headline}</h1>
            <p className="display mt-4 max-w-[34rem] text-[18px] leading-snug text-ink sm:mt-5 sm:text-[21px]">{LANDING.avatar}</p>
            <p className="mt-3 hidden max-w-[32rem] text-[16px] leading-relaxed text-ink-2 sm:block">{LANDING.staff}</p>
            <p className="mt-2.5 text-[15px] leading-snug text-ink-2 sm:hidden">{LANDING.staffShort}</p>
            <div className="mt-6 grid max-w-[26rem] gap-3 sm:mt-7">
              <div id={HERO_CTA_ID} data-door="hero">
                <LinkButton href={WAY_IN} variant="start" className="w-full">
                  {LANDING.cta}
                </LinkButton>
                <p className="mt-2 text-center text-[13px] font-bold text-ink-2">{LANDING.effort}</p>
              </div>
              <p className="text-center text-[13px] text-muted">
                {LANDING.loginLead}{" "}
                <Link href={LOGIN} className="font-bold text-ink underline underline-offset-4 hover:text-start">
                  {LANDING.login}
                </Link>
              </p>
            </div>

            <ul className="mt-8 hidden gap-2.5 sm:grid" aria-label="Why owners trust it">
              {LANDING.proof.map((p, i) => (
                <li key={p.head} className={`flex items-start gap-3 rise rise-${i + 3}`}>
                  <IconCheck size={16} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                  <p className="text-[14px] leading-snug text-ink-2">
                    <span className="font-black text-ink">{p.head}</span> {p.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* The example sheet is the biggest thing on the first screen and the thing people
              tap, so it is a door: the whole sheet opens the register page, and its last
              row says so on every width. */}
          <Link href={WAY_IN} data-door="sheet" className="hero callsheet sweep callsheet-live group block rise rise-4 hover:opacity-95" aria-label={`Example call sheet. ${LANDING.sheetCta}`}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <OnAir className="text-white/70" />
              <Countdown onHero />
            </div>
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <div className="eyebrow">{DESK.week}</div>
              <div className="display tnum mt-1 text-[24px] leading-tight sm:text-[27px]">{LANDING.exampleHead}</div>
            </div>
            <ul className="mt-4 sm:mt-5">
              {SHEET.map((d, i) => (
                <li
                  key={d.title}
                  className="print sheet-row flex items-start gap-3 border-t border-white/10 px-4 py-3.5 sm:px-5 sm:py-4"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <span className="slug hidden w-[18px] shrink-0 pt-[3px] text-[13px] text-white/35 sm:inline">{String(i + 1).padStart(2, "0")}</span>
                  <Face name={d.face.name} photo={d.face.photo} team={d.face.team} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-white/12 px-2 py-[3px] text-[10px] font-black uppercase tracking-[0.1em] text-white/85">
                        {d.tag}
                      </span>
                      <HeroStamp filled={d.bars} label={d.stamp} className="slam sheet-stamp" />
                    </div>
                    <p className="display mt-1.5 text-[15px] leading-[1.25]">{d.title}</p>
                    <p className="tick sheet-gain mt-1 text-[13px] leading-snug text-white/60">
                      <span className="tnum font-black text-white">{d.gain}</span> {d.unit}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="hidden border-t border-white/10 px-5 pt-3.5 text-center text-[13px] text-white/55 sm:block">{DESK.foot}</p>
            <span className="flex items-center justify-center gap-1 border-t border-white/10 px-4 py-3.5 text-[14px] font-black text-white group-hover:underline sm:mt-3.5 sm:px-5">
              {LANDING.sheetCta}
              <IconChevron size={14} strokeWidth={2.8} />
            </span>
          </Link>
        </section>

        {/* ----------------------------------------------------------------- steps ---
            Quick is the point: three boxes on a rail, each with the time it takes. It sits
            straight after the hero because "how much work is this?" is the question
            between reading the pitch and pressing the button, and it ends on a button
            while the answer ("two minutes") is still on screen. */}
        <section className="mt-12 sm:mt-16 lg:mt-24">
          <Reveal>
            <Eyebrow>{LANDING.steps.head}</Eyebrow>
            <h2 className="display mt-2 text-[28px] leading-[1.05] sm:text-[38px]">{LANDING.steps.title}</h2>
          </Reveal>
          {/* On a phone each step is one row: the number, the step, how long. The sentence
              under it is for md and up, where the three sit side by side. */}
          <ol className="relative mt-5 grid gap-3 sm:mt-6 md:grid-cols-3 lg:gap-4">
            {LANDING.steps.items.map((s, i) => (
              <li key={s.title} className="relative flex">
                <Reveal className="flex w-full" delay={i * 140}>
                <div className="card flex w-full items-center gap-4 p-4 md:flex-col md:items-stretch md:p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="display flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-start-fill text-[18px] text-white">
                    {i + 1}
                  </span>
                  <span className="hidden rounded-full bg-start-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-start md:inline">
                    {s.when}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="display text-[18px] leading-tight md:mt-5 md:text-[20px]">{s.title}</div>
                  <p className="mt-0.5 text-[12px] font-black uppercase tracking-[0.12em] text-start md:hidden">{s.when}</p>
                  <p className="mt-1.5 hidden text-[14px] leading-relaxed text-muted md:block">{s.body}</p>
                </div>
                </div>
                </Reveal>
                {i < LANDING.steps.items.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-[14px] top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-line-2 bg-plane text-muted md:flex lg:-right-[18px]"
                  >
                    <IconChevron size={14} strokeWidth={2.8} />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="mx-auto mt-5 max-w-[26rem] sm:mt-6" data-door="steps">
            <LinkButton href={WAY_IN} variant="start" className="w-full">
              {LANDING.steps.cta}
            </LinkButton>
          </div>
        </section>

        {/* ------------------------------------------------------------------ desk ---
            The four questions every owner asks in a week, each answered by the member of
            staff who owns it, the way the app answers it. */}
        <section className="mt-12 sm:mt-16 lg:mt-24" aria-labelledby="desk-title">
          <Reveal>
            <Eyebrow>{DESK.eyebrow}</Eyebrow>
            <h2 id="desk-title" className="display mt-2 max-w-[40rem] text-[28px] leading-[1.05] sm:text-[38px]">
              {DESK.title}
            </h2>
          </Reveal>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:gap-4">
            <Reveal className="flex" delay={0}>
            <DeskCard from={DESK.gm.from} q={DESK.gm.q} className="w-full">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: DESK.gm.give, who: DESK.gm.giveName, face: FACES.sutton },
                  { label: DESK.gm.get, who: DESK.gm.getName, face: FACES.montgomery },
                ].map((side) => (
                  <div key={side.label} className="flex items-center gap-2.5">
                    <Face name={side.face.name} photo={side.face.photo} team={side.face.team} />
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/50">{side.label}</div>
                      <div className="display text-[14px] leading-tight">{side.who}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-auto pt-4 text-[13px] leading-snug text-white/60">
                <span className="tnum display text-[22px] text-white">{DESK.gm.gain}</span> {DESK.gm.unit}
              </p>
              <p className="mt-1 text-[13px] text-white/75">{DESK.gm.why}</p>
            </DeskCard>
            </Reveal>

            <Reveal className="flex" delay={120}>
            <DeskCard from={DESK.scout.from} q={DESK.scout.q} className="w-full">
              <div className="flex items-center gap-3">
                <Face name={FACES.wilson.name} photo={FACES.wilson.photo} team={FACES.wilson.team} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="display text-[16px]">{DESK.scout.call}</span>
                    <HeroStamp filled={2} label={DESK.scout.stamp} />
                  </div>
                  <div className="mt-0.5 text-[13px] font-bold text-white/75">{DESK.scout.bid}</div>
                </div>
              </div>
              <p className="mt-auto pt-4 text-[13px] leading-snug text-white/60">
                <span className="tnum display text-[22px] text-white">{DESK.scout.gain}</span> {DESK.scout.unit} · {DESK.scout.ros}
              </p>
            </DeskCard>
            </Reveal>

            <Reveal className="flex" delay={0}>
            <DeskCard from={DESK.coach.from} q={DESK.coach.q} className="w-full">
              <div className="flex items-center gap-3">
                <Face name={FACES.stevenson.name} photo={FACES.stevenson.photo} team={FACES.stevenson.team} />
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-white/40">{DESK.coach.vs}</span>
                <span className="opacity-50">
                  <Face name={FACES.kamara.name} photo={FACES.kamara.photo} team={FACES.kamara.team} />
                </span>
                <span className="ml-auto">
                  <HeroStamp filled={3} label={DESK.coach.stamp} />
                </span>
              </div>
              <p className="display mt-3 text-[16px]">
                {DESK.coach.call} <span className="text-white/55">{DESK.coach.over}</span>
              </p>
              <p className="mt-auto pt-3 text-[13px] leading-snug text-white/60">
                <span className="tnum display text-[22px] text-white">{DESK.coach.gain}</span> {DESK.coach.unit}
              </p>
            </DeskCard>
            </Reveal>

            <Reveal className="flex" delay={120}>
            <DeskCard from={DESK.film.from} q={DESK.film.q} className="w-full">
              <ul className="grid grid-cols-4 gap-2" aria-label="Grades by position">
                {DESK.film.grades.map((g) => (
                  <li key={g.pos} className="flex flex-col items-center rounded-lg bg-white/[0.06] px-2 py-2.5">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/50">{g.pos}</div>
                    {/* Centred by flex, not text-align: `text-start` is our green AND Tailwind's text-align:start. */}
                    <div className={`display tnum mt-0.5 text-[22px] ${gradeTone(g.grade)}`}>{g.grade}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-4 text-[13px] font-bold text-white/75">{DESK.film.line}</p>
            </DeskCard>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------------- fit ---
            Who it is for, and who it is not. Sending the wrong reader away is what makes
            the right one believe the rest of the page. A phone gets the first two lines
            of each list; the lists are written strongest first, so that is the cut. */}
        <section className="mt-12 grid gap-3 sm:mt-16 md:grid-cols-2 lg:mt-24 lg:gap-4" aria-label="Who it is for">
          <Reveal className="flex"><div className="card w-full p-5 sm:p-6">
            <Eyebrow>{LANDING.fit.head}</Eyebrow>
            <ul className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3">
              {LANDING.fit.yes.map((l, i) => (
                <li key={l} className={`${i < PHONE_LINES ? "flex" : "hidden sm:flex"} items-start gap-2.5 text-[15px] leading-snug text-ink`}>
                  <IconCheck size={16} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                  {l}
                </li>
              ))}
            </ul>
          </div></Reveal>
          <Reveal className="flex" delay={120}><div className="card w-full p-5 sm:p-6">
            <Eyebrow>{LANDING.fit.noHead}</Eyebrow>
            <ul className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3">
              {LANDING.fit.no.map((l, i) => (
                <li key={l} className={`${i < PHONE_LINES ? "flex" : "hidden sm:flex"} items-start gap-2.5 text-[15px] leading-snug text-muted`}>
                  <IconX size={16} strokeWidth={3} className="mt-[3px] shrink-0 text-sit" />
                  {l}
                </li>
              ))}
            </ul>
          </div></Reveal>
        </section>

        {/* ----------------------------------------------------------------- staff ---
            The rooms, coolest first, each one a member of the front office. On a phone
            each is one row, the icon and the name; the sentence under it waits for md. */}
        <section className="mt-12 sm:mt-16 lg:mt-24">
          <Reveal>
            <Eyebrow>{LANDING.roomsHead}</Eyebrow>
            <h2 className="display mt-2 text-[28px] leading-[1.05] sm:text-[38px]">{LANDING.roomsLead}</h2>
          </Reveal>
          <div className="mt-5 grid gap-3 sm:mt-6 md:grid-cols-3 lg:gap-4">
            {LANDING.features.map((f, i) => {
              const art = FEATURE_ART[f.key];
              return (
                <Reveal key={f.key} className="flex" delay={i * 120}>
                <Link href={WAY_IN} data-door="staff" className="card flex w-full items-center gap-4 p-4 hover:bg-soft md:flex-col md:items-start md:p-6">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${art.tone}`}>
                    <art.Icon size={23} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="eyebrow block md:mt-5">{f.room}</span>
                    <span className="display mt-0.5 block text-[18px] leading-tight md:mt-1 md:text-[21px]">{f.title}</span>
                    <span className="mt-2 hidden text-[14px] leading-relaxed text-muted md:block">{f.body}</span>
                  </span>
                  <IconChevron size={16} strokeWidth={2.6} className="shrink-0 text-muted md:hidden" />
                </Link>
                </Reveal>
              );
            })}
          </div>

          {/* The film room, on its own: the depth behind every call. */}
          <Reveal>
          <Link href={WAY_IN} data-door="film" className="hero mt-3 grid gap-5 p-5 hover:opacity-95 sm:gap-6 sm:p-6 md:grid-cols-[1.3fr_1fr] md:items-center lg:mt-4 lg:p-8">
            <div>
              <div className="flex items-center gap-2.5">
                <IconFilm size={20} strokeWidth={2} className="text-white/70" />
                <span className="eyebrow">{LANDING.film.room}</span>
              </div>
              <h3 className="display mt-2 text-[28px] leading-tight sm:text-[32px]">{LANDING.film.title}</h3>
              <p className="mt-3 hidden text-[15px] leading-relaxed text-white/70 sm:block">{LANDING.film.body}</p>
            </div>
            <ul className="grid gap-2.5">
              {LANDING.film.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 rounded-xl bg-white/[0.06] px-4 py-3 text-[14px] font-bold text-white/85">
                  <IconCheck size={15} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                  {p}
                </li>
              ))}
            </ul>
          </Link>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------------- faq ---
            Native disclosure elements, so it works with no script and every answer is on
            the page for a crawler. */}
        <section className="mx-auto mt-12 max-w-3xl sm:mt-16 lg:mt-24" aria-label={LANDING.faq.head}>
          <Reveal>
          <Eyebrow>{LANDING.faq.head}</Eyebrow>
          <div className="mt-3 grid gap-2">
            {LANDING.faq.items.map((item) => (
              <details key={item.q} className="faq card">
                <summary className="faq-q display text-[16px]">
                  <span className="min-w-0 flex-1">{item.q}</span>
                  <IconChevron size={16} strokeWidth={2.6} className="faq-chevron shrink-0 text-muted" />
                </summary>
                <p className="px-5 pb-5 text-[14px] leading-relaxed text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
          </Reveal>
        </section>

        {/* ----------------------------------------------------------------- close --- */}
        <section className="hero mx-auto mt-12 max-w-3xl p-6 text-center sm:mt-16 sm:p-10 lg:mt-24 rise" aria-label={LANDING.close.eyebrow}>
          <div className="flex items-center justify-center gap-3">
            <Eyebrow>{LANDING.close.eyebrow}</Eyebrow>
            <Countdown onHero />
          </div>
          <h2 className="display mx-auto mt-3 max-w-[22rem] text-[32px] leading-[1.02] sm:text-[40px]">{LANDING.close.title}</h2>
          <p className="mx-auto mt-3 hidden max-w-[26rem] text-[15px] leading-relaxed text-white/70 sm:block">{LANDING.close.body}</p>
          <div id={CLOSE_CTA_ID} data-door="close" className="mx-auto mt-6 max-w-[26rem]">
            <LinkButton href={WAY_IN} variant="start" className="w-full">
              {LANDING.close.cta}
            </LinkButton>
            <p className="mt-2 text-[13px] font-bold text-white/75">{LANDING.effort}</p>
          </div>
          <p className="mt-3 text-[13px] text-white/60">
            {LANDING.loginLead}{" "}
            <Link href={LOGIN} className="font-bold text-white underline underline-offset-4">
              {LANDING.login}
            </Link>
          </p>
        </section>
      </main>

      {/* The credit line is not decoration: Sleeper's API docs ask for attribution on the
          trending data the action feed uses. edge/data/providers.py carries the canonical
          string; if the projection vendor ever changes, change it there and here together. */}
      <footer className="mt-16 border-t border-line pt-5">
        <div className="flex items-center gap-2.5">
          <Wordmark className="text-[16px]" lamp={false} full link={false} />
          <span className="text-[12px] font-bold text-muted">{LINES.tagline}</span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Projections and trending data from Sleeper, re-scored to your league&rsquo;s settings. Headshots via
          Sleeper and ESPN. Not affiliated with the NFL, the NFLPA, Sleeper, ESPN, or Yahoo.
        </p>
        <div className="-ml-3 mt-1 flex gap-1 text-[12px] font-bold text-muted">
          <Link href="/terms" className="flex min-h-11 items-center px-3 hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="flex min-h-11 items-center px-3 hover:text-ink">
            Privacy
          </Link>
        </div>
      </footer>

      <LandingBar heroId={HERO_CTA_ID} closeId={CLOSE_CTA_ID} href={WAY_IN} />
      <WarmDoor />
      {/* Which button people press, for /admin's funnel tab (`cta_click`, docs/SPEC-ADMIN-METRICS.md). */}
      <DoorClicks />
    </div>
  );
}
