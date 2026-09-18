import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowUp, IconCheck } from "@/components/icons";
import { Eyebrow, LinkButton, Stat, StatusMeter, Wordmark } from "@/components/ui";
import { signed } from "@/lib/format";
import type { SharedVerdict } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
/** The static demo (`npm run demo`) has no API to read a snapshot from. */
const DEMO = process.env.EDGE_DEMO_EXPORT === "1";

async function load(id: string): Promise<SharedVerdict | null> {
  // Imported lazily so the mock rosters stay out of the real server bundle.
  if (DEMO) return (await import("@/lib/mocks")).sharedVerdictDemo();
  if (!API) return null;
  try {
    const res = await fetch(`${API}/api/share/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as SharedVerdict;
  } catch {
    return null;
  }
}

/**
 * Real share ids are minted at runtime, so none exist at build time and pages render on
 * demand (dynamicParams defaults to true). `output: "export"` refuses an empty list, so
 * the static demo pre-renders its one sample verdict instead.
 */
export async function generateStaticParams(): Promise<{ id: string }[]> {
  return DEMO ? [{ id: "demo" }] : [];
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

const TONE: Record<string, { text: string; bar: string }> = {
  Accept: { text: "text-start", bar: "bg-start" },
  Reject: { text: "text-sit", bar: "bg-sit" },
  Counter: { text: "text-flip", bar: "bg-flip-fill" },
  Fair: { text: "text-lean", bar: "bg-lean" },
};

const BLURB: Record<string, string> = {
  Accept: "This one is worth taking.",
  Reject: "Don't take this one.",
  Counter: "Close — but ask for more.",
  Fair: "Even money either way.",
};

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z' .-]/g, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/**
 * Headshot without client JS: the photo is painted over the initials, so a missing
 * image degrades to initials rather than a broken icon.
 */
function Face({ name, photo, logo }: { name: string; photo: string | null; logo: string | null }) {
  return (
    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft text-[12px] font-black text-muted">
      <span aria-hidden>{initials(name)}</span>
      {photo && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-cover bg-top bg-no-repeat"
          style={{ backgroundImage: `url("${photo}")` }}
        />
      )}
      {logo && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] rounded-full bg-[length:18px_18px] bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${logo}")` }}
        />
      )}
    </span>
  );
}

function Side({
  label,
  names,
  players,
  accent,
}: {
  label: string;
  names: string[];
  players: SharedVerdict["give_players"];
  accent: string;
}) {
  const rows = players.length
    ? players
    : names.map((n) => ({ name: n, position: "", nfl_team: "", photo: null, team_logo: null }));
  return (
    <div className="rounded-[var(--radius-card)] bg-soft p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${accent}`} />
        <span className="eyebrow">{label}</span>
      </div>
      <ul className="mt-3 grid gap-3">
        {rows.map((p, i) => (
          <li key={`${p.name}-${i}`} className="flex items-center gap-3">
            <Face name={p.name} photo={p.photo} logo={p.team_logo} />
            <span className="min-w-0 flex-1">
              <span className="display block text-[16px] leading-[1.2] break-words">{p.name}</span>
              {p.position && (
                <span className="mt-0.5 block text-[12px] font-bold text-muted">
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
  const tone = TONE[v.verdict] ?? { text: "text-ink", bar: "bg-ink" };

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between gap-3">
        <Link href="/" aria-label="Edge home" className="flex min-h-11 items-center">
          <Wordmark className="text-[26px]" />
        </Link>
        <span className="min-w-0 truncate text-right text-[12px] font-bold text-muted">
          {v.league_name}
          {v.week ? (
            <>
              {" · Week "}
              <span className="tnum">{v.week}</span>
            </>
          ) : null}
        </span>
      </header>

      <article className="card overflow-hidden rise">
        <span aria-hidden className={`block h-1.5 w-full ${tone.bar}`} />

        <div className="px-6 pb-6 pt-5">
          <Eyebrow>Trade verdict</Eyebrow>
          <h1 className={`display mt-1.5 text-[60px] uppercase leading-[0.9] ${tone.text}`}>{v.verdict}</h1>
          <p className="mt-2.5 text-[15px] font-bold text-ink-2">{BLURB[v.verdict] ?? ""}</p>

          <div className="mt-6 grid gap-2.5">
            <Side label="You send" names={v.give} players={v.give_players} accent="bg-sit" />
            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-soft text-muted">
                <IconArrowUp size={15} strokeWidth={2.6} className="rotate-180" />
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <Side label="You get" names={v.get} players={v.get_players} accent="bg-start" />
          </div>

          <div className="mt-6">
            <StatusMeter value={v.fairness ?? 0} label="Fairness" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5">
            {/* These are the change to each starting lineup over the rest of the season, not
                a season point total — labelling them "your season" read as the latter. */}
            <Stat
              label="Your lineup"
              value={signed(v.my_delta_ros, 0)}
              sub="rest of season"
              tone={v.my_delta_ros >= 0 ? "start" : "sit"}
            />
            <Stat
              label="Their lineup"
              value={signed(v.their_delta_ros, 0)}
              sub="rest of season"
              tone={v.their_delta_ros >= 0 ? "start" : "sit"}
            />
          </div>

          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">{v.explanation}</p>
          {v.style && (
            <p className="mt-3 inline-flex rounded-full bg-soft px-3 py-1.5 text-[12px] font-bold text-muted">
              Their trading style: {v.style}
            </p>
          )}
        </div>
      </article>

      <section className="hero mt-4 p-6 text-center rise rise-2">
        <Eyebrow>Your turn</Eyebrow>
        <p className="display mx-auto mt-2 max-w-[15rem] text-[27px] leading-[1.08]">Run this on your own league</p>
        <ul className="mx-auto mt-4 grid max-w-[17rem] gap-2 text-left text-[13px] leading-snug text-white/70">
          {["Start/sit calls free, forever", "Projections rescored to your scoring", "No account needed to look"].map(
            (l) => (
              <li key={l} className="flex items-start gap-2">
                <IconCheck size={14} strokeWidth={3} className="mt-[3px] shrink-0 text-white" />
                {l}
              </li>
            ),
          )}
        </ul>
        <LinkButton href="/connect" variant="onHero" className="mt-6 w-full text-hero!">
          Connect your league — free
        </LinkButton>
      </section>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-muted">
        A display-only snapshot. No email, league or roster is shared.
      </p>
    </main>
  );
}
