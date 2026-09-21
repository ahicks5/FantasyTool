"use client";
/**
 * The action plan: one story off the desk and every door out of it.
 *
 * The desk says what happened. This room says what to do about it: the call (monitor,
 * fill the slot, expect less, weigh the start), the man behind him on his own team's
 * depth chart and where that man sits in this league, who on your bench plays the spot,
 * the wire's top pickups there, and which managers are deep at it. All of it is the
 * engine's (`edge/engine/plan.py`); the wire's names and the trade partners' names are
 * what Wire Pass and Trade Lab sell, so without them the page shows the counts and the
 * door to the tab that sells them.
 *
 * The story is named in the query string (`?kind=own&for=4866&about=4866`), never in the
 * path: the static demo export cannot pre-render a path it has not seen.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { NewsFace, Severity } from "@/components/Desk";
import { IconChevron } from "@/components/icons";
import { PlayerName } from "@/components/Players";
import { AppShell } from "@/components/Shell";
import { ErrorBox, Eyebrow, SkeletonList } from "@/components/ui";
import { getPlan } from "@/lib/api";
import { useCached } from "@/lib/cache";
import type { Connection } from "@/lib/storage";
import type { NextUp, Plan, Player } from "@/lib/types";
import { DESK, PLAN, SECTIONS } from "@/lib/vocab";

const proj = (p: Player) => (typeof p.projected === "number" ? p.projected.toFixed(1) : "—");

/** A section of the plan: an eyebrow, who it is from, and the rows. */
function Room({ title, from, children, className = "" }: { title: string; from: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>{title}</Eyebrow>
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{from}</span>
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** One player, one line: the face, the name, a note under it, a number on the right. */
function Row({ p, note, right, tone = "" }: { p: Player | NextUp; note: string; right?: string; tone?: string }) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <Avatar name={p.name} photo={p.photo} teamLogo={p.team_logo} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold leading-tight">
          <PlayerName p={{ id: p.id, name: p.name, position: p.position, nfl_team: p.nfl_team, photo: p.photo }} />
        </div>
        <div className={`truncate text-[11px] leading-tight ${tone || "text-muted"}`}>{note}</div>
      </div>
      {right && <span className="display tnum shrink-0 text-[17px] leading-none">{right}</span>}
    </li>
  );
}

function whereNote(n: NextUp): { text: string; tone: string } {
  const w = PLAN.nextUp.where;
  const depth = n.depth_order ? `${PLAN.nextUp.depth(n.depth_order)} · ` : "";
  if (n.where === "yours") return { text: `${depth}${w.yours}`, tone: "text-start font-bold" };
  if (n.where === "wire") return { text: `${depth}${w.wire}`, tone: "text-flip font-bold" };
  if (n.where === "rostered") return { text: `${depth}${w.rostered(n.owner ?? "")}`, tone: "" };
  return { text: `${depth}${w.unknown}`, tone: "" };
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] leading-snug text-muted">{children}</p>;
}

/** A paid list without the pass: the count, and the door to the tab that sells it. */
function Locked({ line, href, cta }: { line: string; href: string; cta: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-xl bg-soft px-3.5 py-3 hover:bg-line">
      <span className="text-[13px] font-bold text-ink-2">{line}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black uppercase tracking-[0.1em] text-ink">
        {cta}
        <IconChevron size={11} strokeWidth={2.8} />
      </span>
    </Link>
  );
}

function PlanView({ plan }: { plan: Plan }) {
  const call = PLAN.posture[plan.posture];
  const a = plan.about;
  const him = plan.player;
  return (
    // `grid-cols-1` is minmax(0, 1fr): an `auto` track would grow to the header row's
    // min-content, which is the whole name unwrapped, and push the page off the phone.
    <div className="grid grid-cols-1 gap-3.5">
      {/* The story, and the call. The dark surface, like every header in the building. */}
      <section className="hero callsheet rise overflow-hidden p-5">
        <div className="flex items-center gap-3">
          {plan.story ? (
            <NewsFace it={plan.story} size="md" />
          ) : (
            <Avatar name={a.name} photo={a.photo} teamLogo={a.team_logo} size="md" />
          )}
          <div className="min-w-0 flex-1">
            <Eyebrow className="!text-white/60">{PLAN.title}</Eyebrow>
            <div className="display mt-0.5 truncate text-[20px] leading-tight text-white">
              <PlayerName p={{ id: a.id, name: a.name, position: a.position, nfl_team: a.nfl_team, photo: a.photo }} />
            </div>
            <div className="truncate text-[12px] font-bold text-white/70">
              {PLAN.status(a.status, a.body_part)}
              {a.practice ? ` · ${PLAN.practice(a.practice)}` : ""}
            </div>
          </div>
          <Severity n={plan.severity} className="desk-sev-hero shrink-0" />
        </div>
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="display text-[22px] leading-none text-white">{call.head}</div>
          <p className="mt-1.5 text-[13px] leading-snug text-white/75">{call.body}</p>
          {plan.story && plan.kind !== "own" && (
            <p className="mt-2 text-[12px] leading-snug text-white/60">
              {plan.story.detail}
            </p>
          )}
          {a.notes && <p className="mt-2 text-[12px] italic leading-snug text-white/55">{a.notes}</p>}
        </div>
      </section>

      <Room title={PLAN.nextUp.title} from={PLAN.nextUp.from} className="rise rise-1">
        {plan.next_up.length === 0 ? (
          <Empty>{PLAN.nextUp.none}</Empty>
        ) : (
          <ol className="divide-y divide-line">
            {plan.next_up.map((n) => {
              const w = whereNote(n);
              return <Row key={n.id} p={n} note={w.text} tone={w.tone} right={n.status ?? undefined} />;
            })}
          </ol>
        )}
      </Room>

      {plan.swap && (
        <Room title={PLAN.swap.title} from={PLAN.swap.from} className="rise rise-2">
          <ol className="divide-y divide-line">
            <Row p={him} note={`${PLAN.swap.him} · ${him.position}${him.nfl_team ? ` ${him.nfl_team}` : ""}`} right={proj(him)} tone="text-start font-bold" />
            <Row p={plan.swap} note={`${PLAN.swap.starter} · ${plan.swap.position}${plan.swap.nfl_team ? ` ${plan.swap.nfl_team}` : ""}`} right={proj(plan.swap)} />
          </ol>
        </Room>
      )}

      {(plan.kind === "own" || plan.kind === "qb" || plan.kind === "line") && (
        <Room title={PLAN.bench.title} from={PLAN.bench.from} className="rise rise-2">
          {plan.bench.length === 0 ? (
            <Empty>{PLAN.bench.none}</Empty>
          ) : (
            <ol className="divide-y divide-line">
              {plan.bench.map((p) => (
                <Row key={p.id} p={p} note={`${p.position}${p.nfl_team ? ` ${p.nfl_team}` : ""} · ${PLAN.bench.projected}`} right={proj(p)} />
              ))}
            </ol>
          )}
        </Room>
      )}

      {plan.wire && (
        <Room title={PLAN.wire.title} from={PLAN.wire.from} className="rise rise-3">
          {plan.wire.locked ? (
            plan.wire.count === 0 ? (
              <Empty>{PLAN.wire.none}</Empty>
            ) : (
              <Locked line={PLAN.wire.locked(plan.wire.count)} href={SECTIONS.waivers.href} cta={PLAN.wire.unlock} />
            )
          ) : plan.wire.picks.length === 0 ? (
            <Empty>{PLAN.wire.none}</Empty>
          ) : (
            <ol className="divide-y divide-line">
              {plan.wire.picks.map((k) => (
                <Row
                  key={k.player.id}
                  p={k.player}
                  note={k.reason}
                  right={typeof k.bid?.amount === "number" ? PLAN.wire.bid(k.bid.amount) : PLAN.wire.priority}
                />
              ))}
            </ol>
          )}
        </Room>
      )}

      {plan.trade && (
        <Room title={PLAN.trade.title} from={PLAN.trade.from} className="rise rise-3">
          {plan.trade.locked ? (
            plan.trade.count === 0 ? (
              <Empty>{PLAN.trade.none}</Empty>
            ) : (
              <Locked line={PLAN.trade.locked(plan.trade.count)} href={SECTIONS.trade.href} cta={PLAN.trade.unlock} />
            )
          ) : plan.trade.partners.length === 0 ? (
            <Empty>{PLAN.trade.none}</Empty>
          ) : (
            <ol className="divide-y divide-line">
              {plan.trade.partners.map((t) => (
                <li key={t.team_id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold leading-tight">{t.team_name}</div>
                    <div className="truncate text-[11px] leading-tight text-muted">{t.owner_name ?? PLAN.trade.surplus}</div>
                  </div>
                  <Link href={SECTIONS.trade.href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black uppercase tracking-[0.1em]">
                    {SECTIONS.trade.label}
                    <IconChevron size={11} strokeWidth={2.8} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Room>
      )}

      <Link
        href={SECTIONS.home.href}
        className="btn rise rise-4 inline-flex min-h-0 items-center justify-center gap-1 rounded-xl border border-line-2 bg-soft px-3.5 py-2.5 text-[13px] font-bold hover:bg-line"
      >
        {PLAN.back}
        <IconChevron size={13} strokeWidth={2.8} />
      </Link>
    </div>
  );
}

function PlanBody({ c }: { c: Connection }) {
  const q = useSearchParams();
  const kind = q.get("kind");
  const mine = q.get("for");
  const about = q.get("about");
  const key = kind && mine && about ? `plan:${c.platform}:${c.league_id}:${c.team_id}:${kind}:${mine}:${about}` : null;
  const { data, error, reload } = useCached<Plan>(key, () => getPlan(c.platform, c.league_id, c.team_id, kind!, mine!, about!));

  if (!key) return <Gone />;
  if (error) return /not on this desk|404/i.test(error) ? <Gone /> : <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <SkeletonList rows={4} />;
  return <PlanView plan={data} />;
}

function Gone() {
  return (
    <div className="card p-6 text-center">
      <Eyebrow>{PLAN.title}</Eyebrow>
      <p className="mx-auto mt-2 max-w-[18rem] text-[15px] leading-relaxed text-ink-2">{PLAN.gone}</p>
      <Link href={SECTIONS.home.href} className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold">
        {PLAN.back}
        <IconChevron size={13} strokeWidth={2.8} />
      </Link>
      <span className="sr-only">{DESK.aria}</span>
    </div>
  );
}

export default function PlanPage() {
  return (
    <AppShell section="plan">
      {(s) => (
        <Suspense fallback={<SkeletonList rows={4} />}>
          <PlanBody c={s.connection!} />
        </Suspense>
      )}
    </AppShell>
  );
}
