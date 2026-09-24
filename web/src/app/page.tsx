/** The landing page: the pitch, one worked example and the pricing table. Indexable. */
import Link from "next/link";
import { Pricing } from "@/components/Pricing";
import { IconChevron, IconFilm, IconHeadset, IconTeam, IconTrade, IconWire } from "@/components/icons";
import { Countdown, Eyebrow, LinkButton, OnAir, ThemeToggle, Wordmark } from "@/components/ui";
import { LANDING, LINES } from "@/lib/vocab";

/** One example call. The headshots are real Sleeper CDN images. */
const DEMO = [
  {
    tag: "Start",
    title: "Start Jahmyr Gibbs over D'Andre Swift",
    benefit: "+4.2",
    unit: "projected points",
    pill: "Lock",
    bars: 3,
    photo: "https://sleepercdn.com/content/nfl/players/thumb/9221.jpg",
    team: "det",
  },
  {
    tag: "Claim",
    title: "Add Chris Brooks · bid $13–25",
    benefit: "+7.8",
    unit: "this week · +48 rest of season",
    pill: "Lean",
    bars: 2,
    photo: "https://sleepercdn.com/content/nfl/players/thumb/11370.jpg",
    team: "gb",
  },
  {
    tag: "Trade",
    title: "Offer Jakobi Meyers for Jordan Mason",
    benefit: "+51",
    unit: "rest-of-season lineup points",
    pill: "Lean",
    bars: 2,
    photo: "https://sleepercdn.com/content/nfl/players/thumb/8408.jpg",
    team: "min",
  },
];

/**
 * The art for each feature card. The words live in `LANDING.features` (vocab.ts); this
 * only pairs them with the icon and the swatch behind it, keyed the same way the tabs
 * are. The tone is decoration and never the only thing carrying a meaning — the tag
 * pill says Free or the price in words.
 */
type FeatureKey = (typeof LANDING.features)[number]["key"];

const FEATURE_ART: Record<
  FeatureKey,
  { Icon: (p: { size?: number; strokeWidth?: number }) => React.ReactElement; tone: string }
> = {
  team: { Icon: IconTeam, tone: "bg-start-soft text-start" },
  waivers: { Icon: IconWire, tone: "bg-lean-soft text-lean" },
  trade: { Icon: IconTrade, tone: "bg-soft text-ink" },
  report: { Icon: IconFilm, tone: "bg-soft text-ink-2" },
};

/**
 * Every card, and the header pill, opens the register page.
 *
 * They used to point at `/team`, `/waivers` and `/trade`, which is where the feature
 * lives once you have a league, and then at `/connect`. A cold visitor has no account
 * and no league, and the account comes first (Andrew, 2026-09-24): register, land on
 * your account, then link the league. One door, and it is the first step.
 */
const WAY_IN = "/register";

const STEPS = [
  { n: "1", title: "Hook up your league", body: "A Sleeper username or a league ID. No password, nothing to sign." },
  { n: "2", title: "We re-score everything", body: "Every projection re-scored to your league's own settings. Never assumed PPR." },
  { n: "3", title: "You get a call sheet", body: "Ranked moves for the week, each with one line of why. Tick them off as you make them." },
];

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

export default function Landing() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-20">
      {/* The nameplate, the toggle and this pill want 448px between them, so on a phone
          the page scrolled sideways. The pill is the thing that goes: the hero's
          "Open the Penthouse — free" button is one screenful below it and far louder,
          so nothing is lost, while the wordmark — which IS the pitch on this page —
          stays at every width. 512px is the page's own max width, so the pill returns
          exactly when there is room for it rather than at a guessed breakpoint.

          Shortening the label instead was worse: it brought the pill back at 420px,
          where the full row still needs 480. Measure the row, don't guess the word. */}
      <header className="flex h-16 items-center justify-between gap-2">
        <Wordmark className="text-[24px]" />
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <Link
            href={WAY_IN}
            className="btn hidden min-h-11 items-center gap-1 whitespace-nowrap rounded-full border border-line-2 px-4 text-[13px] font-bold hover:bg-soft min-[512px]:inline-flex"
          >
            Open the Penthouse
            <IconChevron size={13} strokeWidth={2.8} />
          </Link>
        </div>
      </header>

      <main id="content">

      <section className="pt-7 rise">
        <Eyebrow>Sleeper · ESPN public and private leagues</Eyebrow>
        {/* The h1 does competitive work, not welcoming work: everyone else in this
            category is an encyclopedia you browse, so the headline is the number of
            moves, not the name of the room. "Own the week." stays as the tagline —
            it rides under the wordmark and on the unfurl card, not here. */}
        <h1 className="display mt-3 text-[43px] leading-[0.98]">
          Three moves
          <br />
          before kickoff.
        </h1>
        <p className="mt-4 max-w-[24rem] text-[17px] leading-relaxed text-ink-2">
          {LINES.heroSub} Connect your league and we write this week&rsquo;s: who starts, who to claim, what to
          offer, by Sunday. One line of why on every call, and the number under it.
        </p>
        <div className="mt-6 grid gap-2.5">
          <LinkButton href={WAY_IN} variant="start" className="w-full">
            Open the Penthouse · free
          </LinkButton>
          <a
            href="#pricing"
            className="btn inline-flex items-center justify-center rounded-xl border border-line-2 px-5 py-3 text-[15px] font-bold text-ink hover:bg-soft"
          >
            See what it costs
          </a>
        </div>
      </section>

      {/* The one dark surface: the product itself, so the page shows before it tells. */}
      <section className="mt-9 rise rise-2" aria-label="Example call sheet">
        <div className="hero callsheet">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <OnAir className="text-white/70" />
            <Countdown onHero />
          </div>

          <div className="px-5 pt-5">
            <div className="eyebrow">Week 2 · The Megalabowl</div>
            <div className="display tnum mt-1 text-[27px] leading-tight">{LANDING.exampleHead}</div>
          </div>

          <ul className="mt-5">
            {DEMO.map((d, i) => (
              <li key={d.title} className="flex items-start gap-3 border-t border-white/10 px-5 py-4">
                <span className="slug w-[18px] shrink-0 pt-[3px] text-[13px] text-white/35">{String(i + 1).padStart(2, "0")}</span>
                <Face name={d.title.split(" ").slice(1, 3).join(" ")} photo={d.photo} team={d.team} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white/12 px-2 py-[3px] text-[10px] font-black uppercase tracking-[0.1em] text-white/85">
                      {d.tag}
                    </span>
                    <HeroStamp filled={d.bars} label={d.pill} />
                  </div>
                  <p className="display mt-1.5 text-[15px] leading-[1.25]">{d.title}</p>
                  <p className="mt-1 text-[13px] leading-snug text-white/60">
                    <span className="tnum font-black text-white">{d.benefit}</span> {d.unit}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="border-t border-white/10 px-5 py-3.5 text-center text-[13px] text-white/55">
            Everything else on your roster is fine. Go enjoy your Sunday.
          </p>
        </div>
      </section>

      <section className="mt-9 grid gap-3">
        {LANDING.features.map((f, i) => {
          const art = FEATURE_ART[f.key];
          return (
            <Link key={f.key} href={WAY_IN} className={`card block p-5 hover:bg-soft rise rise-${i + 1}`}>
              <div className="flex items-start gap-3.5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${art.tone}`}>
                  <art.Icon size={21} strokeWidth={2} />
                </span>
                {/* The room sits on the eyebrow row with the price, which leaves the
                    benefit line the full column. "Trades, with a counter" is 22
                    characters of 19px display type and shared that row with the pill
                    in the old layout, where it truncated at 320px. */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="eyebrow truncate">{f.room}</span>
                    <span className="tnum shrink-0 rounded-full bg-soft px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-ink-2">
                      {f.tag}
                    </span>
                  </div>
                  <div className="display mt-1 text-[19px] leading-tight">{f.title}</div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.body}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="mt-10">
        <Eyebrow>How it works</Eyebrow>
        <ol className="mt-3 grid gap-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3.5">
              <span className="slug flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-soft text-[14px] text-ink-2">
                {s.n}
              </span>
              <div className="min-w-0 pt-1">
                <div className="display text-[16px]">{s.title}</div>
                <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* The differentiator: we grade our own calls in public.

            This block used to lead with "80%" set at 40px. The measured Lock figure is
            75.1% over 2025 weeks 1-17, its 95% interval never touches 80, and CLAUDE.md
            forbids a public decision-accuracy claim until scripts/score_runs.py exists.
            The number is gone rather than corrected: the practice is the differentiator,
            and the per-margin figures live on the depth chart where they are honest. */}
        <div className="card mt-6 p-5">
          <div className="flex items-center gap-3">
            <IconHeadset size={22} strokeWidth={1.9} className="shrink-0 text-muted" />
            <Eyebrow>{LANDING.score.head}</Eyebrow>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{LANDING.score.body}</p>
        </div>
      </section>

      <Pricing />

      </main>

      {/* The credit line is not decoration: Sleeper's API docs ask for attribution on the
          trending data the action feed uses. edge/data/providers.py carries the canonical
          string; if the projection vendor ever changes, change it there and here together. */}
      <footer className="mt-12 border-t border-line pt-5">
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
    </div>
  );
}
