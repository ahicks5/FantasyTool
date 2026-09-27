/** The landing page: the front office you walk into, the answers on your desk, the staff, the film, how quick it is, and the door. Indexable. */
import Link from "next/link";
import { LandingBar } from "@/components/LandingBar";
import { Reveal } from "@/components/Reveal";
import { IconCheck, IconChevron, IconFilm, IconTeam, IconTrade, IconWire, IconX } from "@/components/icons";
import { Countdown, Eyebrow, LinkButton, OnAir, Wordmark } from "@/components/ui";
import { LANDING, LINES } from "@/lib/vocab";

const DESK = LANDING.desk;

/** The players in the worked example. The headshots are real Sleeper CDN images. */
const FACES = {
  gibbs: { name: "Jahmyr Gibbs", photo: "https://sleepercdn.com/content/nfl/players/thumb/9221.jpg", team: "det" },
  swift: { name: "D'Andre Swift", photo: "https://sleepercdn.com/content/nfl/players/thumb/6790.jpg", team: "chi" },
  brooks: { name: "Chris Brooks", photo: "https://sleepercdn.com/content/nfl/players/thumb/11370.jpg", team: "gb" },
  meyers: { name: "Jakobi Meyers", photo: "https://sleepercdn.com/content/nfl/players/thumb/5947.jpg", team: "jax" },
  mason: { name: "Jordan Mason", photo: "https://sleepercdn.com/content/nfl/players/thumb/8408.jpg", team: "min" },
};

/** The call sheet in the hero: the week's three moves, as the app writes them. */
const SHEET = [
  { tag: DESK.coach.tag, title: `${DESK.coach.call} ${DESK.coach.over}`, gain: DESK.coach.gain, unit: DESK.coach.unit, stamp: DESK.coach.stamp, bars: 3, face: FACES.gibbs },
  { tag: DESK.scout.tag, title: `${DESK.scout.call} · ${DESK.scout.bid}`, gain: DESK.scout.gain, unit: DESK.scout.unit, stamp: DESK.scout.stamp, bars: 2, face: FACES.brooks },
  { tag: DESK.gm.tag, title: DESK.gm.offer(DESK.gm.giveName, DESK.gm.getName), gain: DESK.gm.gain, unit: DESK.gm.unit, stamp: "Lean", bars: 2, face: FACES.meyers },
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
function HeroStamp({ filled, label }: { filled: number; label: string }) {
  return (
    <span className="stamp text-[10px] text-white">
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

/** One question on the desk: who on the staff answers it, the question, and the answer. */
function DeskCard({ from, q, children, className = "" }: { from: string; q: string; children: React.ReactNode; className?: string }) {
  return (
    <article className={`hero flex flex-col p-5 ${className}`}>
      <div className="eyebrow">{from}</div>
      <h3 className="display mt-1 text-[21px] leading-tight">{q}</h3>
      <div className="mt-4 flex flex-1 flex-col border-t border-white/10 pt-4">{children}</div>
    </article>
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
        <Wordmark className="text-[24px]" />
        <nav className="flex shrink-0 items-center gap-2" aria-label="Account">
          <Link
            href={LOGIN}
            className="btn inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-line-2 px-4 text-[13px] font-bold hover:bg-soft"
          >
            {LANDING.login}
          </Link>
          <Link
            href={WAY_IN}
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
            call sheet beside it is the desk you sit down at; it shows on a wide screen
            only, because on a phone the desk section is one scroll below. */}
        <section className="grid items-center gap-10 pt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-16 rise">
          <div>
            <Eyebrow>{LANDING.eyebrow}</Eyebrow>
            <h1 className="display mt-3 text-[43px] leading-[0.98] sm:text-[56px] lg:text-[64px]">{LANDING.headline}</h1>
            <p className="display mt-5 max-w-[34rem] text-[19px] leading-snug text-ink sm:text-[21px]">{LANDING.avatar}</p>
            <p className="mt-3 max-w-[32rem] text-[16px] leading-relaxed text-ink-2">{LANDING.staff}</p>
            <div className="mt-7 grid max-w-[26rem] gap-3">
              <div id={HERO_CTA_ID}>
                <LinkButton href={WAY_IN} variant="start" className="w-full">
                  {LANDING.cta}
                </LinkButton>
              </div>
              <p className="text-center text-[13px] text-muted">
                {LANDING.loginLead}{" "}
                <Link href={LOGIN} className="font-bold text-ink underline underline-offset-4 hover:text-start">
                  {LANDING.login}
                </Link>
              </p>
            </div>

            <ul className="mt-8 grid gap-2.5" aria-label="Why owners trust it">
              {LANDING.proof.map((p, i) => (
                <li key={p.head} className={`flex items-start gap-3 rise rise-${i + 1}`}>
                  <IconCheck size={16} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                  <p className="text-[14px] leading-snug text-ink-2">
                    <span className="font-black text-ink">{p.head}</span> {p.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="hero callsheet hidden lg:block" aria-label="Example call sheet">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
              <OnAir className="text-white/70" />
              <Countdown onHero />
            </div>
            <div className="px-5 pt-5">
              <div className="eyebrow">{DESK.week}</div>
              <div className="display tnum mt-1 text-[27px] leading-tight">{LANDING.exampleHead}</div>
            </div>
            <ul className="mt-5">
              {SHEET.map((d, i) => (
                <li key={d.title} className="flex items-start gap-3 border-t border-white/10 px-5 py-4">
                  <span className="slug w-[18px] shrink-0 pt-[3px] text-[13px] text-white/35">{String(i + 1).padStart(2, "0")}</span>
                  <Face name={d.face.name} photo={d.face.photo} team={d.face.team} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-white/12 px-2 py-[3px] text-[10px] font-black uppercase tracking-[0.1em] text-white/85">
                        {d.tag}
                      </span>
                      <HeroStamp filled={d.bars} label={d.stamp} />
                    </div>
                    <p className="display mt-1.5 text-[15px] leading-[1.25]">{d.title}</p>
                    <p className="mt-1 text-[13px] leading-snug text-white/60">
                      <span className="tnum font-black text-white">{d.gain}</span> {d.unit}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-white/10 px-5 py-3.5 text-center text-[13px] text-white/55">{DESK.foot}</p>
          </div>
        </section>

        {/* ------------------------------------------------------------------ desk ---
            The four questions every owner asks in a week, each answered by the member of
            staff who owns it, the way the app answers it. */}
        <section className="mt-16 lg:mt-24" aria-labelledby="desk-title">
          <Reveal>
            <Eyebrow>{DESK.eyebrow}</Eyebrow>
            <h2 id="desk-title" className="display mt-2 max-w-[40rem] text-[30px] leading-[1.05] sm:text-[38px]">
              {DESK.title}
            </h2>
          </Reveal>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:gap-4">
            <Reveal className="flex" delay={0}>
            <DeskCard from={DESK.gm.from} q={DESK.gm.q} className="w-full">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: DESK.gm.give, who: DESK.gm.giveName, face: FACES.meyers },
                  { label: DESK.gm.get, who: DESK.gm.getName, face: FACES.mason },
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
                <Face name={FACES.brooks.name} photo={FACES.brooks.photo} team={FACES.brooks.team} />
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
                <Face name={FACES.gibbs.name} photo={FACES.gibbs.photo} team={FACES.gibbs.team} />
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-white/40">{DESK.coach.vs}</span>
                <span className="opacity-50">
                  <Face name={FACES.swift.name} photo={FACES.swift.photo} team={FACES.swift.team} />
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
            the right one believe the rest of the page. */}
        <section className="mt-16 grid gap-3 md:grid-cols-2 lg:mt-24 lg:gap-4" aria-label="Who it is for">
          <Reveal className="flex"><div className="card w-full p-6">
            <Eyebrow>{LANDING.fit.head}</Eyebrow>
            <ul className="mt-4 grid gap-3">
              {LANDING.fit.yes.map((l) => (
                <li key={l} className="flex items-start gap-2.5 text-[15px] leading-snug text-ink">
                  <IconCheck size={16} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
                  {l}
                </li>
              ))}
            </ul>
          </div></Reveal>
          <Reveal className="flex" delay={120}><div className="card w-full p-6">
            <Eyebrow>{LANDING.fit.noHead}</Eyebrow>
            <ul className="mt-4 grid gap-3">
              {LANDING.fit.no.map((l) => (
                <li key={l} className="flex items-start gap-2.5 text-[15px] leading-snug text-muted">
                  <IconX size={16} strokeWidth={3} className="mt-[3px] shrink-0 text-sit" />
                  {l}
                </li>
              ))}
            </ul>
          </div></Reveal>
        </section>

        {/* ----------------------------------------------------------------- staff ---
            The rooms, coolest first, each one a member of the front office. */}
        <section className="mt-16 lg:mt-24">
          <Reveal>
            <Eyebrow>{LANDING.roomsHead}</Eyebrow>
            <h2 className="display mt-2 text-[30px] leading-[1.05] sm:text-[38px]">{LANDING.roomsLead}</h2>
          </Reveal>
          <div className="mt-6 grid gap-3 md:grid-cols-3 lg:gap-4">
            {LANDING.features.map((f, i) => {
              const art = FEATURE_ART[f.key];
              return (
                <Reveal key={f.key} className="flex" delay={i * 120}>
                <Link href={WAY_IN} className="card flex w-full flex-col p-6 hover:bg-soft">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${art.tone}`}>
                    <art.Icon size={23} strokeWidth={2} />
                  </span>
                  <span className="eyebrow mt-5">{f.room}</span>
                  <span className="display mt-1 text-[21px] leading-tight">{f.title}</span>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{f.body}</p>
                </Link>
                </Reveal>
              );
            })}
          </div>

          {/* The film room, on its own: the depth behind every call. */}
          <Reveal>
          <Link href={WAY_IN} className="hero mt-3 grid gap-6 p-6 hover:opacity-95 md:grid-cols-[1.3fr_1fr] md:items-center lg:mt-4 lg:p-8">
            <div>
              <div className="flex items-center gap-2.5">
                <IconFilm size={20} strokeWidth={2} className="text-white/70" />
                <span className="eyebrow">{LANDING.film.room}</span>
              </div>
              <h3 className="display mt-2 text-[28px] leading-tight sm:text-[32px]">{LANDING.film.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-white/70">{LANDING.film.body}</p>
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

        {/* ----------------------------------------------------------------- steps ---
            Quick is the point: three boxes on a rail, each with the time it takes. */}
        <section className="mt-16 lg:mt-24">
          <Reveal>
            <Eyebrow>{LANDING.steps.head}</Eyebrow>
            <h2 className="display mt-2 text-[30px] leading-[1.05] sm:text-[38px]">{LANDING.steps.title}</h2>
          </Reveal>
          <ol className="relative mt-6 grid gap-3 md:grid-cols-3 lg:gap-4">
            {LANDING.steps.items.map((s, i) => (
              <li key={s.title} className="relative flex">
                <Reveal className="flex w-full" delay={i * 140}>
                <div className="card flex w-full flex-col p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="display flex h-11 w-11 items-center justify-center rounded-full bg-start-fill text-[18px] text-white">
                    {i + 1}
                  </span>
                  <span className="rounded-full bg-start-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-start">
                    {s.when}
                  </span>
                </div>
                <div className="display mt-5 text-[20px] leading-tight">{s.title}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
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
        </section>

        {/* ------------------------------------------------------------------- faq ---
            Native disclosure elements, so it works with no script and every answer is on
            the page for a crawler. */}
        <section className="mx-auto mt-16 max-w-3xl lg:mt-24" aria-label={LANDING.faq.head}>
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
        <section className="hero mx-auto mt-16 max-w-3xl p-6 text-center sm:p-10 lg:mt-24 rise" aria-label={LANDING.close.eyebrow}>
          <div className="flex items-center justify-center gap-3">
            <Eyebrow>{LANDING.close.eyebrow}</Eyebrow>
            <Countdown onHero />
          </div>
          <h2 className="display mx-auto mt-3 max-w-[22rem] text-[32px] leading-[1.02] sm:text-[40px]">{LANDING.close.title}</h2>
          <p className="mx-auto mt-3 max-w-[26rem] text-[15px] leading-relaxed text-white/70">{LANDING.close.body}</p>
          <div id={CLOSE_CTA_ID} className="mx-auto mt-6 max-w-[26rem]">
            <LinkButton href={WAY_IN} variant="start" className="w-full">
              {LANDING.close.cta}
            </LinkButton>
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
          <Wordmark className="text-[16px]" lamp={false} />
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
    </div>
  );
}
