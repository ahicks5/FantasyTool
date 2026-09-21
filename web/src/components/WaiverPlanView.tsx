"use client";
/** The waiver plan: the claim we are asking for, its bid, and the backup claims under it. */
import type { WaiverClaim, WaiverPlanResponse } from "@/lib/types";
import { signed } from "@/lib/format";
import { Avatar } from "./Avatar";
import { PlayerName } from "./Players";
import { Countdown, Eyebrow, InjuryTag, Stamp, Why } from "./ui";

/**
 * One signing, printed as one: who comes in at the top, who gets cut and what we
 * offer in the strip under him. The first claim is the call we are asking for, so
 * it gets the band and the stamp; the rest are the backup plan and stay quiet —
 * stamping every card would turn the plan into confetti.
 */
function ClaimCard({ c }: { c: WaiverClaim }) {
  return (
    <li className="card min-w-0 overflow-hidden p-0 print print-1 ring-2 ring-lean">
      <div className="flex items-center justify-between gap-3 bg-lean px-3.5 py-2 text-white">
        <span className="truncate text-[10px] font-black uppercase tracking-[0.12em]">First claim</span>
        {/* Inked white: the band is dark in both themes, where status colour would vanish. */}
        <Stamp ink="text-white" slam className="shrink-0">
          Claim him
        </Stamp>
      </div>

      <div className="flex min-w-0 items-center gap-3 p-3.5">
        <Avatar name={c.add.name} photo={c.add.photo} teamLogo={c.add.team_logo} size="lg" ring="lean" />
        <div className="min-w-0 flex-1">
          <div className="display truncate text-[19px] leading-tight">
            <PlayerName p={c.add} />
            <InjuryTag status={c.add.injury_status} />
          </div>
          {/* One line, not three. The green "In" chip went with them: the band overhead
              already says this is the claim and the strip below says who goes out, so a
              third arrow pointing the same way was decoration paying rent in height. */}
          <div className="tnum mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
            <span className="truncate font-semibold uppercase tracking-wide text-muted">
              {c.add.position} · {c.add.nfl_team ?? "FA"}
            </span>
            {c.weekly_gain > 0 && <span className="text-[13px] font-black text-start">{signed(c.weekly_gain)} wk</span>}
            {c.ros_gain >= 1 && <span className="text-[13px] font-bold text-start">{signed(c.ros_gain, 0)} ROS</span>}
            <span className="font-bold text-muted">{c.net.toFixed(2)}/wk net</span>
          </div>
        </div>
      </div>

      {/* Cut first, then the money: the signing reads top to bottom, in, out, offer. */}
      <div className="flex items-stretch divide-x divide-line border-y border-line bg-soft/70">
        <div className="min-w-0 flex-1 p-3">
          <Eyebrow>Cut</Eyebrow>
          {c.drop ? (
            /* No avatar here: the cut is the small half of the row and a face steals the
               width the name needs. */
            <div className="mt-0.5 min-w-0">
              <span className="block text-[14px] font-black leading-tight text-sit"><PlayerName p={c.drop} /></span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                {c.drop.position}
                {c.drop_cost > 0.05 ? ` · costs ${c.drop_cost.toFixed(2)}/wk` : " · free to lose"}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-[13px] font-bold text-muted">Nobody · open spot</div>
          )}
        </div>
        <div className="min-w-0 flex-1 p-3">
          <Eyebrow>We bid</Eyebrow>
          <div className="display tnum mt-0.5 text-[26px] leading-none">
            {c.bid.amount === null ? <span className="text-[19px]">Priority</span> : `$${c.bid.amount}`}
            {c.bid.range && (
              <span className="tnum ml-1.5 text-[13px] font-bold text-muted">
                ${c.bid.range[0]}–${c.bid.range[1]}
              </span>
            )}
          </div>
          {c.bid.note
            ? <div className="mt-1 text-[11px] leading-snug text-muted">{c.bid.note}</div>
            : c.bid.amount === null && <div className="mt-1 text-[11px] leading-snug text-muted">No money here. Claims run in order.</div>}
        </div>
      </div>

      <div className="p-3.5">
        <p className="text-[14px] leading-relaxed text-ink-2">{c.reason}</p>
        {/* The two figures the bid is built from moved in here. They were a permanent
            third line under the money explaining a number nobody had questioned yet; the
            question they answer is exactly what this disclosure is for. */}
        <Why
          lines={[
            `Worth about ${c.net.toFixed(2)} points a week after the drop.`,
            c.drop_cost > 0.05
              ? `Cutting ${c.drop?.name} costs about ${c.drop_cost.toFixed(2)} a week; that is already subtracted.`
              : "The cut never cracks your rest-of-season lineup, so it costs nothing.",
            c.bid.value_cap != null && c.bid.market != null
              ? `The bid is the smaller of what he is worth to you ($${c.bid.value_cap}) and what claims usually clear for here ($${c.bid.market}).`
              : "This league uses priority waivers, so there is no bid.",
          ]}
          label="How is this priced?"
        />
      </div>
    </li>
  );
}

/**
 * A backup claim, as one row.
 *
 * The backups are not calls, they are what happens if the call is outbid — reference, read
 * once, acted on by nobody until Wednesday morning. Printed as full claim cards they were
 * four fifths of the plan's height and buried the one claim that *is* a call. So they get
 * the line a reference entry deserves: who, what he costs, who goes out for him. His page
 * is one tap away for the rest, like everywhere else in the app.
 */
function BackupRow({ c, index }: { c: WaiverClaim; index: number }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-xl border border-line px-3 py-2">
      <span className="slug w-5 shrink-0 text-center text-[12px] leading-none text-muted">
        {String(index + 1).padStart(2, "0")}
      </span>
      <Avatar name={c.add.name} photo={c.add.photo} teamLogo={c.add.team_logo} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold leading-tight">
          <PlayerName p={c.add} />
          <InjuryTag status={c.add.injury_status} />
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">
          {c.add.position} · {c.add.nfl_team ?? "FA"}
          {/* The man going out is a door too. The row itself is not a button — only the
              two names in it are — so both of them can be. */}
          {c.drop && <> · cut <PlayerName p={c.drop} /></>}
        </span>
      </span>
      <span className="tnum display shrink-0 text-[17px] leading-none">
        {c.bid.amount === null ? <span className="text-[12px] font-bold text-muted">Priority</span> : `$${c.bid.amount}`}
      </span>
    </li>
  );
}

export function WaiverPlanView({ plan, compact = false }: { plan: WaiverPlanResponse; compact?: boolean }) {
  const primary = plan.primary;
  // The call, then the reference under it. They are different things to a reader and are
  // now drawn as different things, so they stop being one undifferentiated stack of cards.
  const backups = plan.fallbacks.filter((c): c is WaiverClaim => !!c);
  const claims = [primary, ...backups].filter((c): c is WaiverClaim => !!c);
  // Counts up on arrival, then snaps. `?? 0` keeps the hook unconditional; a priority
  // league never shows the number.
  // No count-up on a budget. A projected total racing upward reads as a scoreboard
  // settling; a FAAB balance doing it shows "$4" and "$19" on the way to $100, which are
  // wrong numbers presented as real ones — and it made the wire look like it loaded twice.
  const budget = String(plan.faab_remaining ?? 0);

  return (
    <div className="grid min-w-0 gap-3">
      {/* One strip, not a stacked block.
          The budget used to be a 42px hero with a bar of its own above it, which is about
          160px spent saying "$100" on a screen whose whole job is "claim this man, bid
          that much". It is context for the bid, so it reads at the size of context and on
          one line with the rest of it. The countdown earns its place here — a claim you
          file after the deadline is not a claim — so it stays, inline. */}
      <section className="hero callsheet rise flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="display tnum text-[26px] leading-none text-white">
            {plan.faab_remaining === null ? "Priority" : `$${budget}`}
          </span>
          {/* Two nodes, not one interpolated string: the label is what the smoke test
              anchors on, and a label that only exists as half of a sentence is one a
              later copy change breaks silently. */}
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-white/55">
            {plan.waiver_type === "faab" ? "left" : "waiver order"}
          </span>
          {claims.length > 0 && (
            <span className="tnum truncate text-[11px] font-semibold uppercase tracking-wide text-white/55">
              · spend ${plan.total_planned_spend}
            </span>
          )}
        </div>
        {!compact && <Countdown onHero />}
      </section>

      {plan.hold_reason && (
        <div className="card rise p-6 text-center">
          {/* A quiet week is a call too — stamped, not apologised for. When there are
              claims as well, the note stays a note and the stamp stays on the claim. */}
          {claims.length === 0 ? (
            <Stamp size="lg" ink="text-ink" slam className="mb-4">
              Hold
            </Stamp>
          ) : (
            <Eyebrow className="mb-2">Also on the board</Eyebrow>
          )}
          <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-ink-2">{plan.hold_reason}</p>
        </div>
      )}

      {primary && <ol className="grid min-w-0"><ClaimCard c={primary} /></ol>}

      {backups.length > 0 && (
        <section className="min-w-0">
          {/* The heading only appears when there is an order to read, which there is not
              when the plan is one claim. */}
          {!compact && <Eyebrow className="mb-1.5">If he is gone</Eyebrow>}
          <ol className="grid min-w-0 gap-1.5">
            {backups.map((c, i) => (
              <BackupRow key={c.add.id} c={c} index={i + 1} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
