/** The public share snapshot: opens with no account, unfurls with a rendered card. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowUp, IconCheck } from "@/components/icons";
import { ConfidencePill, Eyebrow, LinkButton, OnAir, Stamp, Stat, StatusMeter, Wordmark } from "@/components/ui";
import { signed, verdictBlurb } from "@/lib/format";
import { isSharedFilm, isSharedLock, type SharedFilm, type SharedLock, type SharedSnapshot, type SharedVerdict } from "@/lib/types";
import { FILM } from "@/lib/vocab";
import { LINES } from "@/lib/vocab";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
/** The static demo (`npm run demo`) has no API to read a snapshot from. */
const DEMO = process.env.EDGE_DEMO_EXPORT === "1";

async function load(id: string): Promise<SharedSnapshot | null> {
  // Imported lazily so the mock rosters stay out of the real server bundle.
  if (DEMO) return (await import("@/lib/mocks")).sharedVerdictDemo();
  if (!API) return null;
  try {
    const res = await fetch(`${API}/api/share/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as SharedSnapshot;
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
  // Prod's wording, not "trade verdict": a snapshot can be a Lock now, and the middot
  // is the app's separator.
  if (!v) return { title: "Penthouse · a call worth sharing" };
  const image = `${API}/api/share/${encodeURIComponent(id)}/card.png`;
  const title = isSharedFilm(v)
    ? FILM.share.title(v.team, v.result ? FILM.result[v.result] : "", FILM.score(v.my_points, v.their_points))
    : isSharedLock(v)
      ? `${v.confidence}: start ${v.start.name}${v.bench ? ` over ${v.bench.name}` : ""}`
      : `${v.verdict}: ${v.give.join(" + ")} for ${v.get.join(" + ")}`;
  const description = isSharedFilm(v)
    ? v.line || FILM.share.pitch
    : isSharedLock(v)
      ? v.note || `Worth ${signed(v.gain, 1)} projected points in that league's scoring.`
      : v.explanation;
  return {
    title: `${title} · Penthouse`,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [{ url: image, width: 1080, height: 1080, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const TONE: Record<string, { text: string; bar: string }> = {
  Accept: { text: "text-start", bar: "bg-start" },
  Reject: { text: "text-sit", bar: "bg-sit" },
  Counter: { text: "text-flip", bar: "bg-flip-fill" },
  Fair: { text: "text-lean", bar: "bg-lean" },
};

/**
 * The verdict, stamped — the same device as the 1080 card people just saw in the group
 * chat (`components/ShareCard.tsx`). Local to this page rather than a shared primitive:
 * `<Stamp>` is sized for a card badge, and this one has to carry a whole screen.
 * Inked white because it sits on the dark hero, where status green and amber vanish in
 * light mode; the verdict word itself carries the meaning, never the colour.
 */
function VerdictStamp({ verdict }: { verdict: string }) {
  // Sized off the viewport so the longest verdict ("COUNTER") still fits on a 320px phone.
  // `stamp-xl` carries the rule and padding in em, so they track whatever size lands here.
  return (
    <Stamp size="xl" ink="text-white" slam className="text-[clamp(30px,10vw,52px)]">
      {verdict}
    </Stamp>
  );
}

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

/**
 * A free start/sit call, shared. Same two surfaces as a verdict — the stamp on the hero,
 * the detail on paper — because someone arriving from a group chat should not be able to
 * tell which of our cards they landed on, only which call it carries.
 */
function LockBody({ v }: { v: SharedLock }) {
  return (
    <>
      <article className="hero callsheet overflow-hidden rise">
        <span aria-hidden className="block h-[3px] w-full bg-start" />
        <div className="px-6 pb-6 pt-4">
          <div className="flex items-center justify-between gap-3">
            <OnAir className="text-white/70" />
            <Eyebrow>Start / sit{v.slot ? ` · ${v.slot}` : ""}</Eyebrow>
          </div>

          {/* Inked white for the same reason the verdict is: status green vanishes on the
              dark hero in light mode. The word carries the meaning, never the colour. */}
          <h1 className="mt-5 leading-none">
            <span className="sr-only">Start/sit call: </span>
            <Stamp size="xl" ink="text-white" slam className="text-[clamp(30px,10vw,52px)]">
              {v.confidence}
            </Stamp>
          </h1>

          <p className="display mt-5 text-[22px] leading-[1.12] text-white">
            Start {v.start.name}
            {v.bench && <span className="block text-white/60">over {v.bench.name}</span>}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-white/65">
            Somebody ran their lineup through Penthouse. Every projection re-scored to that league&rsquo;s own
            scoring, then one call: start him, or sit him.
          </p>
        </div>
      </article>

      <article className="card mt-3 overflow-hidden rise rise-1">
        <div className="px-6 pb-6 pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow>The call</Eyebrow>
            <ConfidencePill value={v.confidence} />
          </div>

          <div className="mt-3 grid gap-2.5">
            <Side label="Start" names={[v.start.name]} players={[v.start]} accent="bg-start" />
            {v.bench && <Side label="Sit" names={[v.bench.name]} players={[v.bench]} accent="bg-sit" />}
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <Stat label="Worth" value={signed(v.gain, 1)} sub="projected points" tone={v.gain >= 0 ? "start" : "sit"} />
          </div>

          {v.note && <p className="mt-5 text-[15px] leading-relaxed text-ink-2">{v.note}</p>}
        </div>
      </article>
    </>
  );
}

/** Last week's replay cover: the same device as the 1080 film card, the story left behind. */
function FilmShareBody({ v }: { v: SharedFilm }) {
  return (
    <article className="hero callsheet overflow-hidden rise">
      <span aria-hidden className={`block h-[3px] w-full ${v.result === "W" ? "bg-start" : v.result === "L" ? "bg-sit" : "bg-lean"}`} />
      <div className="px-6 pb-6 pt-4">
        <div className="flex items-center justify-between gap-3">
          <OnAir className="text-white/70" />
          <Eyebrow>{FILM.eyebrow}</Eyebrow>
        </div>
        <p className="mt-4 text-[13px] font-bold text-white/60">{v.team}</p>
        <h1 className="mt-3 leading-none">
          {v.result && (
            <Stamp size="xl" ink="text-white" slam className="text-[clamp(30px,10vw,52px)]">
              {FILM.result[v.result]}
            </Stamp>
          )}
        </h1>
        <p className="display tnum mt-4 text-[clamp(34px,11vw,48px)] leading-none text-white">{FILM.score(v.my_points, v.their_points)}</p>
        <p className="mt-2 text-[14px] font-bold text-white/65">{v.opponent ? FILM.vs(v.opponent) : FILM.bye}</p>
        {v.line && <p className="film-cover-line mt-5">{v.line}</p>}
        {v.star && (
          <div className="mt-5 flex items-center gap-3">
            <Face name={v.star.name} photo={v.star.photo} logo={v.star.team_logo} />
            <div className="min-w-0">
              <Eyebrow>{FILM.share.carried}</Eyebrow>
              <p className="display text-[18px] text-white">
                {v.star.name} <span className="tnum text-start">{v.star.went.toFixed(1)}</span>
              </p>
            </div>
          </div>
        )}
        <p className="mt-5 text-[14px] leading-relaxed text-white/65">{FILM.share.pitch}</p>
      </div>
    </article>
  );
}

function TradeBody({ v }: { v: SharedVerdict }) {
  const tone = TONE[v.verdict] ?? { text: "text-ink", bar: "bg-ink" };
  return (
    <>
      {/* The one dark surface: the verdict, stamped, exactly as it unfurled in the chat. */}
      <article className="hero callsheet overflow-hidden rise">
        {/* Keys the card to its verdict at a glance. 3px, the same weight as the call
            sheet's rail — at 6px an amber Counter reads as a caution banner. */}
        <span aria-hidden className={`block h-[3px] w-full ${tone.bar}`} />

        <div className="px-6 pb-6 pt-4">
          <div className="flex items-center justify-between gap-3">
            <OnAir className="text-white/70" />
            <Eyebrow>Penthouse&rsquo;s verdict</Eyebrow>
          </div>

          <h1 className="mt-5 leading-none">
            <span className="sr-only">Trade verdict: </span>
            <VerdictStamp verdict={v.verdict} />
          </h1>
          <p className="display mt-5 text-[20px] leading-snug text-white">{verdictBlurb(v.verdict)}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-white/65">
            Somebody ran this trade through Penthouse. Every projection re-scored to that league&rsquo;s own scoring,
            then one call: take it, counter it, or walk.
          </p>
        </div>
      </article>

      <article className="card mt-3 overflow-hidden rise rise-1">
        <div className="px-6 pb-6 pt-5">
          {/* On paper the status colour is legible, so the verdict is echoed here in ink —
              always with the word, never the colour on its own. */}
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow>The trade</Eyebrow>
            <span className={`display text-[13px] uppercase tracking-wider ${tone.text}`}>{v.verdict}</span>
          </div>

          <div className="mt-3 grid gap-2.5">
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

    </>
  );
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await load(id);
  if (!v) notFound();

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between gap-3">
        <Link href="/" aria-label="Penthouse home" className="flex min-h-11 items-center">
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

      {isSharedFilm(v) ? <FilmShareBody v={v} /> : isSharedLock(v) ? <LockBody v={v} /> : <TradeBody v={v} />}

      {/* The way in. Paper, not hero: the card above is this screen's one dark surface. */}
      <section className="card mt-3 p-6 text-center rise rise-2">
        <Eyebrow>Your turn</Eyebrow>
        <p className="display mx-auto mt-2 max-w-[16rem] text-[27px] leading-[1.08]">Get your own league upstairs</p>
        <ul className="mx-auto mt-4 grid max-w-[18rem] gap-2 text-left text-[13px] leading-snug text-ink-2">
          {[
            "Start/sit calls free, forever",
            "Every projection re-scored to your league's scoring",
            "Free to look. Hook up a league and see",
          ].map((l) => (
            <li key={l} className="flex items-start gap-2">
              <IconCheck size={14} strokeWidth={3} className="mt-[3px] shrink-0 text-start" />
              {l}
            </li>
          ))}
        </ul>
        <LinkButton href="/connect" variant="start" className="mt-6 w-full">
          Take me upstairs · free
        </LinkButton>
        <p className="mt-3.5 text-[12px] font-bold text-muted">{LINES.tagline}</p>
      </section>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-muted">
        A display-only snapshot. No email, league or roster is shared.
      </p>
    </main>
  );
}
