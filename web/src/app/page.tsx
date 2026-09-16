import Link from "next/link";
import { Pricing } from "@/components/Pricing";
import { LinkButton, Wordmark } from "@/components/ui";

const DEMO = [
  { tag: "Start", tone: "bg-start", title: "Start Jahmyr Gibbs over D'Andre Swift", benefit: "+4.2 projected points", pill: "Lock", photo: "https://sleepercdn.com/content/nfl/players/thumb/9221.jpg", team: "det" },
  { tag: "Waiver", tone: "bg-lean", title: "Add Chris Brooks · bid $13–25", benefit: "+7.8 this week · +48 ROS", pill: "Lean", photo: "https://sleepercdn.com/content/nfl/players/thumb/11370.jpg", team: "gb" },
  { tag: "Trade", tone: "bg-ink", title: "Offer Jakobi Meyers for Jordan Mason", benefit: "+51 ROS lineup points", pill: "Lean", photo: "https://sleepercdn.com/content/nfl/players/thumb/8408.jpg", team: "min" },
];
const PILL: Record<string, string> = { Lock: "bg-start text-white", Lean: "bg-lean text-white" };

const FEATURES = [
  { href: "/team", title: "My Team", body: "Start/sit calls with a confidence tag that we backtest every week. Lock = right ~80% of the time.", tag: "Free" },
  { href: "/waivers", title: "Waivers", body: "Every free agent ranked by how much he improves your lineup, with a FAAB bid and who to drop.", tag: "$3" },
  { href: "/trade", title: "Trade Lab", body: "A verdict on any trade and a counteroffer tuned to how the other manager actually behaves.", tag: "$5" },
];

export default function Landing() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-14 items-center justify-between">
        <Wordmark className="text-2xl" />
        <Link href="/home" className="rounded-full bg-soft px-3 py-1.5 text-sm font-bold">
          Open app
        </Link>
      </header>

      <section className="pt-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Sleeper · ESPN public leagues</p>
        <h1 className="mt-2 text-[2.6rem] font-black leading-[1.02]">
          Your league.
          <br />
          This week&rsquo;s moves.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Connect your league and get a ranked list of what to do: who to start, who to claim, what to offer. Numbers first, one sentence of why.
        </p>
        <div className="mt-6 grid gap-2">
          <LinkButton href="/connect" variant="start">
            Connect your league — free
          </LinkButton>
          <a href="#pricing" className="btn inline-flex items-center justify-center rounded-xl px-5 py-3 font-bold text-ink">
            See pricing
          </a>
        </div>
      </section>

      <section className="mt-10" aria-label="Example moves">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">What it looks like</p>
        <div className="card mt-2 overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Week 2 — The Megalabowl</div>
            <div className="display text-2xl font-black">3 moves worth making</div>
          </div>
          <ul className="divide-y divide-line">
            {DEMO.map((d, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.photo} alt="" className="h-12 w-12 rounded-full bg-soft object-cover object-top" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://sleepercdn.com/images/team_logos/nfl/${d.team}.png`} alt="" className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-white p-0.5 shadow" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white ${d.tone}`}>{d.tag}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PILL[d.pill]}`}>{d.pill}</span>
                  </span>
                  <span className="mt-0.5 block truncate font-extrabold">{d.title}</span>
                  <span className="block text-sm font-bold text-start">{d.benefit}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 text-center text-sm text-muted">Everything else looks fine.</div>
        </div>
      </section>

      <section className="mt-10 grid gap-3">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="card block p-4 hover:bg-soft">
            <div className="flex items-center justify-between">
              <span className="display text-lg font-extrabold">{f.title}</span>
              <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-black">{f.tag}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
          </Link>
        ))}
      </section>

      <Pricing />

      <footer className="mt-12 text-xs leading-relaxed text-muted">
        Projections from Sleeper, rescored to your league&rsquo;s settings. Headshots via Sleeper and ESPN. Not affiliated with any league platform.
      </footer>
    </div>
  );
}
