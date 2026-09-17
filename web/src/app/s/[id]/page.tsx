import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/ui";
import type { SharedVerdict } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

async function load(id: string): Promise<SharedVerdict | null> {
  if (!API) return null;
  try {
    const res = await fetch(`${API}/api/share/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as SharedVerdict;
  } catch {
    return null;
  }
}

/** Unfurls in a league chat, a subreddit or a Discord — that is the whole point of the page. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = await load(id);
  if (!v) return { title: "Edge — trade verdict" };
  const title = `${v.verdict}: ${v.give.join(" + ")} for ${v.get.join(" + ")}`;
  const image = `${API}/api/share/${encodeURIComponent(id)}/card.png`;
  return {
    title: `${title} — Edge`,
    description: v.explanation,
    openGraph: {
      title,
      description: v.explanation,
      type: "article",
      images: [{ url: image, width: 1080, height: 1080, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description: v.explanation, images: [image] },
  };
}

const TONE: Record<string, { text: string; border: string; bar: string }> = {
  Accept: { text: "text-start", border: "border-start", bar: "bg-start" },
  Reject: { text: "text-sit", border: "border-sit", bar: "bg-sit" },
  Counter: { text: "text-flip-dark", border: "border-flip", bar: "bg-flip" },
  Fair: { text: "text-lean", border: "border-lean", bar: "bg-lean" },
};

function Side({ label, names, players, tone }: { label: string; names: string[]; players: SharedVerdict["give_players"]; tone: string }) {
  return (
    <div className="rounded-2xl border-2 border-line p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <ul className="mt-2 grid gap-2">
        {(players.length ? players : names.map((n) => ({ name: n, position: "", nfl_team: "", photo: null, team_logo: null }))).map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            {p.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo} alt="" className="h-10 w-10 rounded-full bg-soft object-cover object-top" />
            ) : (
              <span className="h-10 w-10 rounded-full bg-soft" aria-hidden />
            )}
            <span className="min-w-0">
              <span className={`block truncate font-extrabold ${tone}`}>{p.name}</span>
              {p.position && (
                <span className="block text-xs text-muted">
                  {p.position} · {p.nfl_team}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await load(id);
  if (!v) notFound();
  const tone = TONE[v.verdict] ?? { text: "text-ink", border: "border-ink", bar: "bg-ink" };
  const fair = Math.round((v.fairness ?? 0) * 100);

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-14 items-center justify-between">
        <Link href="/" aria-label="Edge home">
          <Wordmark className="text-2xl" />
        </Link>
        <span className="text-xs text-muted">
          {v.league_name} {v.week ? `· Week ${v.week}` : ""}
        </span>
      </header>

      <section className={`card mt-2 border-4 p-5 ${tone.border}`}>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Trade verdict</div>
        <div className={`display text-6xl font-black uppercase leading-none ${tone.text}`}>{v.verdict}</div>

        <div className="mt-5 grid gap-3">
          <Side label="Gives" names={v.give} players={v.give_players} tone="text-sit" />
          <Side label="Gets" names={v.get} players={v.get_players} tone="text-start" />
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            <span>Fairness</span>
            <span>{fair}%</span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-soft">
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${fair}%` }} />
          </div>
        </div>

        <p className="mt-4 text-base leading-relaxed">{v.explanation}</p>
      </section>

      <section className="card mt-4 p-5 text-center">
        <p className="display text-lg font-extrabold">Run this on your own league</p>
        <p className="mt-1 text-sm text-muted">
          Connect a Sleeper or ESPN league and get your start/sit calls free. No account needed to look.
        </p>
        <Link href="/connect" className="btn mt-4 inline-flex w-full items-center justify-center rounded-xl bg-start px-5 py-3 font-bold text-white">
          Connect your league
        </Link>
      </section>
    </main>
  );
}
