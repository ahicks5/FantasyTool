import Link from "next/link";
import { Pricing } from "@/components/Pricing";
import { LinkButton, Wordmark } from "@/components/ui";

const FEATURES = [
  { href: "/team", title: "My Team", body: "Start/sit calls with a confidence tag and one line on why.", tag: "Free" },
  { href: "/waivers", title: "Waivers", body: "Top 5 pickups ranked by roster fit, with a FAAB bid that wins.", tag: "$3" },
  { href: "/trade", title: "Trade Lab", body: "A verdict on any trade and a counter tuned to the other manager.", tag: "$5" },
];

export default function Landing() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-14 items-center justify-between">
        <Wordmark className="text-2xl" />
        <Link href="/team" className="text-sm font-bold underline">
          Open app
        </Link>
      </header>

      <section className="pt-10">
        <h1 className="text-4xl font-black leading-tight tracking-tight">
          Your league.
          <br />
          This week&rsquo;s moves.
        </h1>
        <p className="mt-3 text-lg text-muted">
          Connect a Sleeper or ESPN league and get the start/sit calls, waiver bids and trade verdicts for your team. Numbers first, one sentence of why.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <LinkButton href="/connect">Connect your league</LinkButton>
          <a href="#pricing" className="btn inline-flex items-center justify-center rounded-xl px-5 py-3 font-bold text-ink underline">
            See pricing
          </a>
        </div>
      </section>

      <section className="mt-12 grid gap-3">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="block rounded-xl border border-line p-4 hover:bg-soft">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">{f.title}</span>
              <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-bold">{f.tag}</span>
            </div>
            <p className="mt-1 text-muted">{f.body}</p>
          </Link>
        ))}
      </section>

      <Pricing />

      <footer className="mt-12 text-xs text-muted">Projections from Sleeper, rescored to your league&rsquo;s settings.</footer>
    </div>
  );
}
