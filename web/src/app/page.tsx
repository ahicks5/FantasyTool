import Link from "next/link";
import { Pricing } from "@/components/Pricing";
import { IconArrowUp, IconChevron, IconTeam, IconTrade, IconWaivers } from "@/components/icons";
import { Eyebrow, LinkButton, ThemeToggle, Wordmark } from "@/components/ui";

/** One example move. The headshots are real Sleeper CDN images. */
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
    tag: "Waiver",
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

const FEATURES = [
  {
    href: "/team",
    title: "My Team",
    tag: "Free",
    Icon: IconTeam,
    tone: "bg-start-soft text-start",
    body: "Start/sit calls with a confidence tag we backtest every week. Lock is right about 80% of the time.",
  },
  {
    href: "/waivers",
    title: "Waivers",
    tag: "$3",
    Icon: IconWaivers,
    tone: "bg-lean-soft text-lean",
    body: "Every free agent ranked by how much he actually improves your lineup — with a FAAB bid and who to drop.",
  },
  {
    href: "/trade",
    title: "Trade Lab",
    tag: "$5",
    Icon: IconTrade,
    tone: "bg-soft text-ink",
    body: "A verdict on any trade, plus a counteroffer tuned to how that manager has actually traded before.",
  },
];

const STEPS = [
  { n: "1", title: "Connect", body: "Paste a Sleeper username or a league ID. No password, no account to look." },
  { n: "2", title: "We rescore", body: "Every projection is re-scored to your league's own settings — never assumed PPR." },
  { n: "3", title: "You get a list", body: "Ranked moves for this week, each with one line of why and the number behind it." },
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

/** The confidence meter, redrawn in white for the one dark surface on the page. */
function HeroBars({ filled, label }: { filled: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 py-[3px] pl-2 pr-2.5 text-[10px] font-black uppercase tracking-wider text-white">
      <span className="flex items-center gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-[9px] w-[3px] rounded-[1px] bg-white ${i < filled ? "" : "opacity-30"}`} />
        ))}
      </span>
      {label}
    </span>
  );
}

export default function Landing() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-20">
      <header className="flex h-16 items-center justify-between">
        <Wordmark className="text-[26px]" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/home"
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line-2 px-4 text-[13px] font-bold hover:bg-soft"
          >
            Open app
            <IconChevron size={13} strokeWidth={2.8} />
          </Link>
        </div>
      </header>

      <main id="content">

      <section className="pt-7 rise">
        <Eyebrow>Sleeper · ESPN public leagues</Eyebrow>
        <h1 className="display mt-3 text-[43px] leading-[0.98]">
          Your league.
          <br />
          This week&rsquo;s moves.
        </h1>
        <p className="mt-4 max-w-[24rem] text-[17px] leading-relaxed text-ink-2">
          Connect your league and get a ranked list of what to do — who to start, who to claim, what to offer. Numbers
          first, one sentence of why.
        </p>
        <div className="mt-6 grid gap-2.5">
          <LinkButton href="/connect" variant="start" className="w-full">
            Connect your league — free
          </LinkButton>
          <a
            href="#pricing"
            className="btn inline-flex items-center justify-center rounded-xl border border-line-2 px-5 py-3 text-[15px] font-bold text-ink hover:bg-soft"
          >
            See pricing
          </a>
        </div>
      </section>

      {/* The one dark surface: the product itself, so the page shows before it tells. */}
      <section className="mt-9 rise rise-2" aria-label="Example moves">
        <div className="hero overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <div className="eyebrow">Week 2 — The Megalabowl</div>
              <div className="display mt-1 text-[27px] leading-tight">
                <span className="tnum">3</span> moves worth making
              </div>
            </div>
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <IconArrowUp size={17} strokeWidth={2.4} />
            </span>
          </div>

          <ul className="mt-5">
            {DEMO.map((d) => (
              <li key={d.title} className="flex items-start gap-3 border-t border-white/10 px-5 py-4">
                <Face name={d.title.split(" ").slice(1, 3).join(" ")} photo={d.photo} team={d.team} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-white/12 px-2 py-[3px] text-[10px] font-black uppercase tracking-[0.1em] text-white/85">
                      {d.tag}
                    </span>
                    <HeroBars filled={d.bars} label={d.pill} />
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
            Everything else on your roster looks fine.
          </p>
        </div>
      </section>

      <section className="mt-9 grid gap-3">
        {FEATURES.map((f, i) => (
          <Link key={f.href} href={f.href} className={`card block p-5 hover:bg-soft rise rise-${i + 1}`}>
            <div className="flex items-start gap-3.5">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${f.tone}`}>
                <f.Icon size={21} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="display text-[19px]">{f.title}</span>
                  <span className="tnum shrink-0 rounded-full bg-soft px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-ink-2">
                    {f.tag}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.body}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-10">
        <Eyebrow>How it works</Eyebrow>
        <ol className="mt-3 grid gap-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3.5">
              <span className="display tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-soft text-[14px] text-ink-2">
                {s.n}
              </span>
              <div className="min-w-0 pt-1">
                <div className="display text-[16px]">{s.title}</div>
                <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="card mt-6 p-5">
          <div className="flex items-baseline gap-3">
            <span className="display tnum shrink-0 text-[40px] leading-none text-start">80%</span>
            <div className="min-w-0">
              <Eyebrow>Lock calls, right</Eyebrow>
              <div className="mt-0.5 text-[12px] text-muted">backtested every week</div>
            </div>
          </div>
          <p className="mt-3.5 text-[14px] leading-relaxed text-ink-2">
            Every confidence tag is checked against what actually happened. We only move the thresholds when the data
            says to.
          </p>
        </div>
      </section>

      <Pricing />

      </main>

      <footer className="mt-12 border-t border-line pt-5 text-[12px] leading-relaxed text-muted">
        <div className="-ml-3 flex gap-1 font-bold">
          <Link href="/terms" className="flex min-h-11 items-center px-3 hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="flex min-h-11 items-center px-3 hover:text-ink">
            Privacy
          </Link>
        </div>
        <p className="mt-3">
          Projections from Sleeper, rescored to your league&rsquo;s settings. Headshots via Sleeper and ESPN. Not
          affiliated with any league platform.
        </p>
      </footer>
    </div>
  );
}
