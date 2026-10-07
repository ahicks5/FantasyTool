/** The landing page: the stage and the door, how quick it is, the rooms as the kit's posters, who it is for, and the door again. Indexable. */
import Link from "next/link";
import { LandingBar } from "@/components/LandingBar";
import { Reveal } from "@/components/Reveal";
import { WarmDoor } from "@/components/WarmDoor";
import { DoorClicks } from "@/components/DoorClicks";
import {
  IconBars,
  IconBinoculars,
  IconBolt,
  IconCheck,
  IconChevron,
  IconFilm,
  IconPeople,
  IconRoster,
  IconStar,
  IconTarget,
  IconTeam,
  IconTrade,
  IconX,
} from "@/components/icons";
import { Countdown, Eyebrow, LinkButton, Lockup, OnAir, Wordmark } from "@/components/ui";
import { SOCIALS } from "@/lib/site";
import { LANDING, LINES } from "@/lib/vocab";

const DESK = LANDING.desk;
const POSTERS = LANDING.posters;
const BATTLE = LANDING.battle;

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

type PosterKey = keyof typeof POSTERS;
type Icon = (p: { size?: number; strokeWidth?: number }) => React.ReactElement;

/**
 * Each poster's art: the stage tint behind it and the icon tile beside each of its points,
 * drawn from the kit's own squares. The words live in `LANDING.posters` (vocab.ts). The
 * tint is decoration and never the only thing carrying a meaning.
 */
const POSTER_ART: Record<PosterKey, { stage: string; icons: Icon[] }> = {
  trade: { stage: "stage-gold", icons: [IconRoster, IconTrade, IconPeople] },
  waivers: { stage: "stage-blue", icons: [IconBinoculars, IconBars, IconTarget] },
  team: { stage: "stage-gold", icons: [IconCheck, IconStar, IconTeam] },
  battle: { stage: "stage-split", icons: [IconBolt, IconBars, IconTarget] },
  report: { stage: "", icons: [IconCheck, IconCheck, IconCheck] },
};

/** The metal each plate is cut in, and the colour its points and tiles take. */
const METAL = {
  gold: { plate: "metal-gold", ink: "text-gold", border: "border-gold/60", rule: "var(--color-gold)" },
  blue: { plate: "metal-blue", ink: "text-blue", border: "border-blue/60", rule: "var(--color-blue)" },
  chrome: { plate: "metal-chrome", ink: "text-metal", border: "border-metal/50", rule: "var(--color-metal)" },
} as const;

/** A poster's pill: an outline in the room's metal, as the kit draws its URL button. */
const PILL =
  "mt-7 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-5 text-[13px] font-black uppercase tracking-[0.12em] hover:bg-white/5";

/**
 * Every door on the page opens the register page, and the one exception is the way
 * back in for an owner who already has an account.
 *
 * A cold visitor has no account and no league, and the account comes first (Andrew,
 * 2026-09-24): register, land on your account, then link the league. Log in is on the
 * page too, plainly, because a returning owner who lands here should not have to read
 * the pitch to find the door (Andrew, 2026-09-27). The footer's social links are the
 * only other way off the page, and they open in a new tab.
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
 * `ring` is a corner's colour, for the battle.
 */
function Face({ name, photo, team, ring = "", size = 46 }: { name: string; photo?: string; team?: string; ring?: string; size?: number }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-black text-white/60 ${ring}`}
      style={{ width: size, height: size }}
    >
      <span aria-hidden>{initials(name)}</span>
      {photo && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-cover bg-top bg-no-repeat"
          style={{ backgroundImage: `url("${photo}")` }}
        />
      )}
      {team && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 h-[19px] w-[19px] rounded-full bg-[length:19px_19px] bg-center bg-no-repeat"
          style={{ backgroundImage: `url("https://sleepercdn.com/images/team_logos/nfl/${team}.png")` }}
        />
      )}
    </span>
  );
}

/** The confidence stamp, inked white for the dark screen. */
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
 * The app's own top bar, small, across the top of a phone screen: the wordmark the
 * posters show (OS · SUITE ●) and, on the right, whose office it is.
 */
function PhoneBar({ right }: { right?: React.ReactNode }) {
  return (
    <div className="phone-bar">
      <Wordmark className="text-[13px]" link={false} />
      {right}
    </div>
  );
}

/**
 * One question on the desk, on a phone: who on the staff answers it, the question, and the
 * answer. Every one is a door, because a reader who has just read "Who do I start?" with a
 * worked answer under it is at the moment they most want their own, and a card that does
 * nothing when tapped is a dead end at the peak of the page.
 */
function DeskCard({ from, q, children, className = "" }: { from: string; q: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={WAY_IN} data-door="desk" className={`phone group hover:brightness-110 ${className}`}>
      <article className="phone-screen flex h-full flex-col">
        <PhoneBar />
        <div className="hero flex flex-1 flex-col p-5">
          <div className="eyebrow">{from}</div>
          <h3 className="display mt-1 text-[21px] leading-tight">{q}</h3>
          <div className="mt-4 flex flex-1 flex-col border-t border-white/10 pt-4">{children}</div>
          <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-white/80 group-hover:text-white">
            {LANDING.deskCta}
            <IconChevron size={13} strokeWidth={2.8} />
          </span>
        </div>
      </article>
    </Link>
  );
}

/**
 * One room, as the kit's poster for it: the two plates, the line under them, a rule, and
 * what the room does, beside the room's worked answer on a phone. A phone gets the plates,
 * the line and the points' heads; the sentences under the heads wait for a wide screen.
 * Posters alternate sides from md up so the page reads as a wall of them, not a list.
 */
function RoomPoster({ k, flip = false, children }: { k: PosterKey; flip?: boolean; children: React.ReactNode }) {
  const p = POSTERS[k];
  const art = POSTER_ART[k];
  const metal = METAL[p.metal];
  return (
    <Reveal>
      <article
        className={`stage ${art.stage} grid items-center gap-7 rounded-[28px] border border-white/10 p-5 sm:p-8 md:grid-cols-2 md:gap-10 lg:p-12`}
        aria-label={p.plates.join(" ")}
      >
        <div className={flip ? "md:order-2" : ""}>
          <h3 className="poster-head text-[46px] sm:text-[60px] lg:text-[76px]">
            <span className="metal metal-chrome block">{p.plates[0]}</span>
            <span className={`metal ${metal.plate} block`}>{p.plates[1]}</span>
          </h3>
          <p className="poster-sub mt-3 text-[10.5px] sm:mt-4 sm:text-[12.5px]">{p.sub}</p>
          <span aria-hidden className="poster-rule mt-4" style={{ "--rule": metal.rule } as React.CSSProperties} />
          {p.points.length > 0 && (
            <ul className="mt-5 grid gap-3 sm:mt-6 sm:gap-4">
              {p.points.map((pt, i) => {
                const Icon = art.icons[i];
                return (
                  <li key={pt.head} className="flex items-center gap-3.5 sm:items-start">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] sm:h-12 sm:w-12 ${metal.ink}`}>
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[12px] font-black uppercase tracking-[0.1em] sm:text-[13px] ${metal.ink}`}>{pt.head}</span>
                      <span className="mt-0.5 hidden text-[14px] leading-snug text-white/75 sm:block">{pt.body}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {k === "report" && (
            <>
              <p className="mt-5 hidden text-[15px] leading-relaxed text-white/70 sm:block">{LANDING.film.body}</p>
              <ul className="mt-5 grid gap-2.5">
                {LANDING.film.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5 text-[14px] font-bold text-white/85">
                    <IconCheck size={15} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                    {pt}
                  </li>
                ))}
              </ul>
            </>
          )}
          {/* The poster's own pill, as the kit draws its URL button: an outline in the
              room's metal. The staff door on every room, the film door on the film. */}
          {k === "report" ? (
            <Link href={WAY_IN} data-door="film" className={`${PILL} ${metal.ink} ${metal.border}`}>
              {p.door}
              <IconChevron size={13} strokeWidth={2.8} />
            </Link>
          ) : (
            <Link href={WAY_IN} data-door="staff" className={`${PILL} ${metal.ink} ${metal.border}`}>
              {p.door}
              <IconChevron size={13} strokeWidth={2.8} />
            </Link>
          )}
        </div>
        <div className={`mx-auto w-full max-w-[24rem] ${flip ? "md:order-1" : ""}`}>{children}</div>
      </article>
    </Reveal>
  );
}

export default function Landing() {
  return (
    <div>
      {/* ------------------------------------------------------------------ stage ---
          The kit's lit stage, edge to edge: the floodlights at the top corners, the
          nameplate and the two doors across the top, then the lockup, the headline in
          two plates and the door. No theme switch here: dark is the room, and the switch
          lives in the app for an owner who wants the lights on (Andrew, 2026-09-27). */}
      <div className="stage stage-gold">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          {/* Log in is always visible; the loud door hides below 480px, where the hero's
              button is one thumb away and the wordmark needs the width. */}
          <header className="flex h-16 items-center justify-between gap-2">
            <Wordmark className="whitespace-nowrap text-[20px]" />
            <nav className="flex shrink-0 items-center gap-2" aria-label="Account">
              <Link
                href={LOGIN}
                className="btn inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-white/20 px-4 text-[13px] font-bold text-white hover:bg-white/10"
              >
                {LANDING.login}
              </Link>
              <Link
                href={WAY_IN}
                data-door="header"
                className="btn cta-gold hidden min-h-11 items-center gap-1 whitespace-nowrap rounded-full px-4 text-[13px] font-black min-[480px]:inline-flex"
              >
                {LANDING.bar.cta}
                <IconChevron size={13} strokeWidth={2.8} />
              </Link>
            </nav>
          </header>

          <main id="content">
            {/* -------------------------------------------------------------- hero ---
                The poster, as a page: the lockup, the brand line, the tagline in two
                plates (chrome, then gold), and the line that says where you are walking
                in. Then the door, and the week's call sheet on a phone.

                On a phone the page is the lockup, the headline, one line, the door and
                the sheet, in that order; the status line, the staff sentence and the
                proof lines are for a wide screen (Andrew, 2026-09-28: way fewer words
                on mobile).

                The copy paints whole on the first frame: no `rise` and no `Reveal` on
                it, so a cold load never shows a hole between the line and the button
                while a delayed fade catches up (W-001). */}
            <section className="grid items-center gap-10 pb-14 pt-6 sm:pb-20 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pb-24 lg:pt-12">
              <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                <Lockup className="text-[18px] sm:text-[22px] lg:items-start" descriptor={LINES.descriptor} />
                <Eyebrow className="mt-7">
                  <span className="sm:hidden">{LANDING.eyebrowShort}</span>
                  <span className="hidden sm:inline">{LANDING.eyebrow}</span>
                </Eyebrow>
                <h1 className="poster-head mt-3 text-[50px] sm:text-[78px] lg:text-[92px]">
                  <span className="metal metal-chrome block">{LANDING.headline[0]}</span>
                  <span className="metal metal-gold block">{LANDING.headline[1]}</span>
                </h1>
                <p className="display mt-5 text-[21px] leading-snug text-white sm:text-[25px]">{LANDING.lead}</p>
                <p className="mt-2 hidden max-w-[34rem] text-[17px] leading-snug text-white/85 sm:block">{LANDING.avatar}</p>
                <p className="mt-3 hidden max-w-[32rem] text-[15px] leading-relaxed text-white/65 sm:block">{LANDING.staff}</p>
                <p className="mt-2.5 text-[15px] leading-snug text-white/70 sm:hidden">{LANDING.staffShort}</p>
                <div className="mt-7 grid w-full max-w-[26rem] gap-3">
                  <div id={HERO_CTA_ID} data-door="hero">
                    <LinkButton href={WAY_IN} variant="gold" className="w-full rounded-full py-3.5 text-[16px]">
                      {LANDING.cta}
                    </LinkButton>
                    <p className="mt-2 text-center text-[13px] font-bold text-white/70">{LANDING.effort}</p>
                  </div>
                  <p className="text-center text-[13px] text-white/55">
                    {LANDING.loginLead}{" "}
                    <Link href={LOGIN} className="font-bold text-white underline underline-offset-4 hover:text-gold">
                      {LANDING.login}
                    </Link>
                  </p>
                </div>

                <ul className="mt-8 hidden gap-2.5 text-left sm:grid" aria-label="Why owners trust it">
                  {LANDING.proof.map((p, i) => (
                    <li key={p.head} className={`flex items-start gap-3 rise rise-${i + 3}`}>
                      <IconCheck size={16} strokeWidth={3} className="mt-[3px] shrink-0 text-gold" />
                      <p className="text-[14px] leading-snug text-white/70">
                        <span className="font-black text-white">{p.head}</span> {p.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* The example sheet, on a phone the way the posters hold the app. It is the
                  biggest thing on the first screen and the thing people tap, so the whole
                  sheet is a door to the register page, and its last row says so. */}
              <div className="phone mx-auto w-full max-w-[26rem] rise rise-4">
                <div className="phone-screen">
                  <PhoneBar right={<span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">{DESK.week}</span>} />
                  <Link href={WAY_IN} data-door="sheet" className="hero callsheet sweep callsheet-live group block hover:opacity-95" aria-label={`Example call sheet. ${LANDING.sheetCta}`}>
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
                      <OnAir className="text-white/70" />
                      <Countdown onHero />
                    </div>
                    <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                      <div className="display tnum text-[24px] leading-tight sm:text-[27px]">{LANDING.exampleHead}</div>
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
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
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
                  <span className="cta-gold display flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[18px]">
                    {i + 1}
                  </span>
                  <span className="hidden rounded-full bg-gold-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-gold md:inline">
                    {s.when}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="display text-[18px] leading-tight md:mt-5 md:text-[20px]">{s.title}</div>
                  <p className="mt-0.5 text-[12px] font-black uppercase tracking-[0.12em] text-gold md:hidden">{s.when}</p>
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
            <LinkButton href={WAY_IN} variant="gold" className="w-full rounded-full">
              {LANDING.steps.cta}
            </LinkButton>
          </div>
        </section>

        {/* ----------------------------------------------------------------- rooms ---
            The front office, room by room, as the kit's posters: GM's Office, Scouting
            Department, Coach's Lineup, Position Battle, the film. Each is the room's
            plates and what it does, beside the question it answers worked on a phone. */}
        <section className="mt-12 sm:mt-16 lg:mt-24" aria-labelledby="rooms-title">
          <Reveal>
            <Eyebrow>{LANDING.roomsHead}</Eyebrow>
            <h2 id="rooms-title" className="display mt-2 max-w-[40rem] text-[28px] leading-[1.05] sm:text-[38px]">
              {LANDING.roomsLead}
            </h2>
          </Reveal>
          <div className="mt-6 grid gap-4 sm:mt-8 lg:gap-6">
            <RoomPoster k="trade">
              <DeskCard from={DESK.gm.from} q={DESK.gm.q}>
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
            </RoomPoster>

            <RoomPoster k="waivers" flip>
              <DeskCard from={DESK.scout.from} q={DESK.scout.q}>
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
            </RoomPoster>

            <RoomPoster k="team">
              <DeskCard from={DESK.coach.from} q={DESK.coach.q}>
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
            </RoomPoster>

            <RoomPoster k="battle" flip>
              <DeskCard from={BATTLE.from} q={BATTLE.q}>
                <div className="flex items-start justify-between gap-2">
                  {[
                    { corner: BATTLE.blue, who: BATTLE.a, ring: "ring-2 ring-corner", ink: "text-corner" },
                    { corner: BATTLE.red, who: BATTLE.b, ring: "ring-2 ring-clash", ink: "text-clash" },
                  ].map((side, i) => (
                    <div key={side.corner} className={`flex flex-1 flex-col items-center text-center ${i === 1 ? "order-3" : ""}`}>
                      <div className={`text-[9.5px] font-black uppercase tracking-[0.14em] ${side.ink}`}>{side.corner}</div>
                      <span className="mt-2">
                        <Face name={side.who.player} ring={side.ring} size={52} />
                      </span>
                      <div className="display mt-2 text-[13.5px] leading-tight">{side.who.player}</div>
                      <div className="text-[11px] text-white/50">{side.who.meta}</div>
                    </div>
                  ))}
                  <span className="order-2 self-center text-[20px] font-black italic text-white/80">VS</span>
                </div>
                <p className="poster-head metal metal-blue mt-4 text-center text-[30px]">{BATTLE.call}</p>
                <p className="mt-1 text-center text-[12.5px] text-white/65">{BATTLE.line}</p>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                  {BATTLE.horizons.map((h) => (
                    <div key={h.label} className="rounded-lg bg-white/[0.06] px-3 py-2.5">
                      <div className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/50">{h.label}</div>
                      <div className="tnum mt-1 flex items-baseline justify-between text-[15px] font-black">
                        <span className="text-corner">{h.a}</span>
                        <span className="text-white/60">{h.b}</span>
                      </div>
                      <div className="mt-1.5 flex h-[5px] overflow-hidden rounded-full" aria-hidden>
                        <span className="bg-corner" style={{ flex: Number(h.a) }} />
                        <span className="bg-clash" style={{ flex: Number(h.b) }} />
                      </div>
                    </div>
                  ))}
                </div>
              </DeskCard>
            </RoomPoster>

            <RoomPoster k="report">
              <DeskCard from={DESK.film.from} q={DESK.film.q}>
                <ul className="grid grid-cols-4 gap-2" aria-label="Grades by position">
                  {DESK.film.grades.map((g) => (
                    <li key={g.pos} className="flex flex-col items-center rounded-lg bg-white/[0.06] px-2 py-2.5">
                      <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/50">{g.pos}</div>
                      {/* Centred by flex, not text-align: `text-start` is our green AND Tailwind's text-align:start. */}
                      <div className={`display tnum mt-0.5 text-[22px] ${gradeTone(g.grade)}`}>{g.grade}</div>
                    </li>
                  ))}
                </ul>
                <p className="mt-auto flex items-center gap-2 pt-4 text-[13px] font-bold text-white/75">
                  <IconFilm size={15} strokeWidth={2} className="shrink-0 text-white/60" />
                  {DESK.film.line}
                </p>
              </DeskCard>
            </RoomPoster>
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

        {/* ----------------------------------------------------------------- close ---
            The stage again, smaller: the clock, the two plates, the door. */}
        <section className="stage stage-gold mx-auto mt-12 max-w-3xl rounded-[28px] border border-white/10 p-6 pt-20 text-center sm:mt-16 sm:p-10 sm:pt-24 lg:mt-24 rise" aria-label={LANDING.close.eyebrow}>
          <div className="flex items-center justify-center gap-3">
            <Eyebrow>{LANDING.close.eyebrow}</Eyebrow>
            <Countdown onHero />
          </div>
          <h2 className="poster-head mx-auto mt-4 text-[44px] sm:text-[64px]">
            <span className="metal metal-chrome block">{LANDING.close.plates[0]}</span>
            <span className="metal metal-gold block">{LANDING.close.plates[1]}</span>
          </h2>
          <p className="mx-auto mt-4 hidden max-w-[26rem] text-[15px] leading-relaxed text-white/70 sm:block">{LANDING.close.body}</p>
          <div id={CLOSE_CTA_ID} data-door="close" className="mx-auto mt-7 max-w-[26rem]">
            <LinkButton href={WAY_IN} variant="gold" className="w-full rounded-full py-3.5 text-[16px]">
              {LANDING.close.cta}
            </LinkButton>
            <p className="mt-2 text-[13px] font-bold text-white/70">{LANDING.effort}</p>
          </div>
          <p className="mt-3 text-[13px] text-white/55">
            {LANDING.loginLead}{" "}
            <Link href={LOGIN} className="font-bold text-white underline underline-offset-4">
              {LANDING.login}
            </Link>
          </p>
        </section>

        {/* The credit line is not decoration: Sleeper's API docs ask for attribution on the
            trending data the action feed uses. edge/data/providers.py carries the canonical
            string; if the projection vendor ever changes, change it there and here together. */}
        <footer className="mt-16 border-t border-line pt-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col items-center sm:items-start">
              <Lockup className="text-[14px]" />
              <span className="poster-sub mt-3 text-[10.5px]">{LINES.taglineLong}</span>
            </div>
            <div className="flex flex-col items-center sm:items-end">
              <span className="eyebrow">{LANDING.follow}</span>
              <ul className="mt-1 flex gap-1">
                {SOCIALS.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 items-center px-2.5 text-[13px] font-bold text-ink-2 hover:text-gold"
                      aria-label={`${social.label} ${social.handle}`}
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-center text-[12px] leading-relaxed text-muted sm:text-left">
            Projections and trending data from Sleeper, re-scored to your league&rsquo;s settings. Headshots via
            Sleeper and ESPN. Not affiliated with the NFL, the NFLPA, Sleeper, ESPN, or Yahoo.
          </p>
          <div className="-ml-3 mt-1 flex justify-center gap-1 text-[12px] font-bold text-muted sm:justify-start">
            <Link href="/terms" className="flex min-h-11 items-center px-3 hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="flex min-h-11 items-center px-3 hover:text-ink">
              Privacy
            </Link>
          </div>
        </footer>
      </div>

      <LandingBar heroId={HERO_CTA_ID} closeId={CLOSE_CTA_ID} href={WAY_IN} />
      <WarmDoor />
      {/* Which button people press, for /admin's funnel tab (`cta_click`, docs/SPEC-ADMIN-METRICS.md). */}
      <DoorClicks />
    </div>
  );
}
