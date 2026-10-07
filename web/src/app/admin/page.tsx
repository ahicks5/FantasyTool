"use client";
/** The front office: every account, its plan and its leagues, and the owner's levers. Admin only. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccountGate } from "@/components/account/AccountGate";
import { DoorFrame } from "@/components/account/Door";
import { Loading } from "@/components/Loading";
import { Button, Card, ErrorBox, Eyebrow, LinkButton } from "@/components/ui";
import { adminGrant, adminResetLink, adminRevoke, adminSetRole, adminUserEvents, adminUsers } from "@/lib/api";
import Dashboard, { type MetricsTab } from "@/components/admin/Dashboard";
import { money } from "@/lib/adminMetrics";
import { accountContact, accountLabel, matchesAccount, planLabel, shortDate } from "@/lib/account";
import { useSession } from "@/lib/session";
import type { AdminEvent, AdminUser, AdminUsersResponse, Sku } from "@/lib/types";
import { ACCOUNT, PRICING } from "@/lib/vocab";

/** What the owner can hand out: what is on sale. The retired passes can only be taken back. */
const GRANTABLE: { sku: Sku; label: string }[] = [
  { sku: "full_report", label: PRICING.names.full_report },
  { sku: "week_pass", label: PRICING.names.week_pass },
];
const RETIRED: { sku: Sku; label: string }[] = [
  { sku: "waivers", label: PRICING.names.waivers },
  { sku: "trade_lab", label: PRICING.names.trade_lab },
];

/** One account's event log, newest first: "I paid and it's still locked" starts here. */
function Timeline({ email }: { email: string }) {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    adminUserEvents(email).then(setEvents).catch(setError);
  }, [email]);
  if (error) return <ErrorBox error={error} />;
  if (!events) return <Loading />;
  if (events.length === 0) return <p className="text-[12px] text-muted">{ACCOUNT.admin.timelineEmpty}</p>;
  return (
    <ol className="grid gap-1 text-[12px]" data-testid="admin-timeline">
      {events.map((e, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span className="min-w-0 truncate text-ink">
            <strong>{e.name}</strong>
            {e.sku ? ` · ${e.sku}` : ""}
            {e.amount_cents ? ` · ${money(e.amount_cents)}` : ""}
            {Object.keys(e.props).length ? ` · ${Object.entries(e.props).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}
          </span>
          <span className="tnum shrink-0 text-muted">
            {new Date(e.created * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Row({ u, me, onChange }: { u: AdminUser; me: string; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeline, setTimeline] = useState(false);
  const isMe = u.email === me;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    try {
      const url = await adminResetLink(u.email);
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const premium = u.plan.tier === "premium";
  const paid = (u.revenue_cents ?? 0) > 0;
  return (
    <li className="card p-4" data-testid="admin-row" data-email={u.email}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="display truncate text-[17px] leading-tight">
            {accountLabel(u)}
            {isMe && <span className="ml-2 text-[12px] font-bold text-muted">({ACCOUNT.admin.you})</span>}
          </p>
          {accountContact(u) && <p className="truncate text-[12px] text-muted">{accountContact(u)}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* Paid, comped or free: a granted pass is not a customer (W-052, W-053). */}
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${premium && paid ? "bg-start-fill text-white" : premium ? "bg-flip-soft text-flip" : "bg-soft text-muted"}`}>
            {premium ? (paid ? planLabel(u.skus) : ACCOUNT.plan.comped) : ACCOUNT.plan.free}
          </span>
          {u.is_admin && <span className="inline-flex rounded-full bg-ink px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-paper">{ACCOUNT.plan.admin}</span>}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-2">
        {planLabel(u.skus)} <span aria-hidden>·</span> <span className="tnum">{ACCOUNT.admin.leagues(u.leagues.length, u.leagues_allowed)}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-muted">
        {ACCOUNT.admin.joined} <span className="tnum">{shortDate(u.created) || ACCOUNT.admin.never}</span> <span aria-hidden>·</span> {ACCOUNT.admin.lastSeen}{" "}
        <span className="tnum">{shortDate(u.last_active ?? u.last_login) || ACCOUNT.admin.never}</span>
      </p>
      {(u.source || u.revenue_cents || u.sms_opt_in) && (
        <p className="mt-0.5 text-[12px] text-muted">
          {ACCOUNT.admin.source} <strong className="text-ink-2">{u.source ?? "direct"}</strong> <span aria-hidden>·</span> {ACCOUNT.admin.lifetime}{" "}
          <strong className="tnum text-ink-2">{money(u.revenue_cents ?? 0)}</strong>
          {u.sms_opt_in ? (
            <>
              {" "}
              <span aria-hidden>·</span> {ACCOUNT.admin.smsYes}
            </>
          ) : null}
        </p>
      )}
      {u.leagues.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {u.leagues.map((l) => (
            <li key={`${l.platform}:${l.league_id}`} className="rounded-full bg-soft px-2.5 py-1 text-[11px] font-bold text-ink-2">
              {l.name}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...GRANTABLE, ...RETIRED.filter((r) => u.skus.includes(r.sku))].map((g) =>
          u.skus.includes(g.sku) ? (
            <Button key={g.sku} size="sm" variant="secondary" busy={busy === `revoke:${g.sku}`} onClick={() => run(`revoke:${g.sku}`, () => adminRevoke(u.email, g.sku))}>
              {ACCOUNT.admin.revoke} {g.label}
            </Button>
          ) : (
            <Button key={g.sku} size="sm" variant="secondary" busy={busy === `grant:${g.sku}`} onClick={() => run(`grant:${g.sku}`, () => adminGrant(u.email, g.sku))}>
              {ACCOUNT.admin.grant} {g.label}
            </Button>
          ),
        )}
        <Button size="sm" variant="secondary" busy={busy === "slot"} onClick={() => run("slot", () => adminGrant(u.email, "league_slot"))}>
          {ACCOUNT.admin.slot}
        </Button>
        {!isMe && (
          <Button
            size="sm"
            variant="ghost"
            busy={busy === "role"}
            onClick={() => run("role", () => adminSetRole(u.email, u.role === "admin" ? "user" : "admin"))}
          >
            {u.role === "admin" ? ACCOUNT.admin.demote : ACCOUNT.admin.promote}
          </Button>
        )}
        <Button size="sm" variant="ghost" busy={busy === "reset"} onClick={reset}>
          {ACCOUNT.admin.resetLink}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTimeline(!timeline)} aria-expanded={timeline}>
          {timeline ? ACCOUNT.admin.timelineHide : ACCOUNT.admin.timeline}
        </Button>
      </div>
      {timeline && (
        <div className="mt-2 rounded-xl bg-soft px-3 py-2">
          <Timeline email={u.email} />
        </div>
      )}
      {link && (
        <p className="mt-2 break-all rounded-xl bg-soft px-3 py-2 text-[12px] text-ink-2">
          {copied && <span className="block font-bold text-start">{ACCOUNT.admin.copied}</span>}
          <span className="tnum">{link}</span>
        </p>
      )}
      {error ? (
        <div className="mt-2">
          <ErrorBox error={error} />
        </div>
      ) : null}
    </li>
  );
}

function AdminBody({ me }: { me: string }) {
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    adminUsers()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch(setError);
  }, []);
  useEffect(load, [load]);
  const users = useMemo(() => {
    return (data?.users ?? []).filter((u) => matchesAccount(u, q));
  }, [data, q]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="mt-6 flex items-center gap-2">
        <input
          className="w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none"
          placeholder={ACCOUNT.admin.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoCapitalize="none"
          aria-label={ACCOUNT.admin.search}
        />
        <span className="tnum shrink-0 text-[12px] font-bold text-muted" data-testid="admin-count">
          {ACCOUNT.admin.count(data.users.length)}
        </span>
      </div>
      <ul className="mt-3 grid gap-2">
        {users.map((u) => (
          <Row key={u.email} u={u} me={me} onChange={load} />
        ))}
        {users.length === 0 && <li className="card p-4 text-[14px] text-muted">{ACCOUNT.admin.none}</li>}
      </ul>
    </>
  );
}

type Tab = MetricsTab | "accounts";
const TABS: Tab[] = ["today", "funnel", "channels", "revenue", "retention", "loop", "accounts"];

/** The numbers first, the accounts last: the owner opens this on Sunday morning to see the week. */
function AdminTabs({ me }: { me: string }) {
  const [tab, setTab] = useState<Tab>("today");
  return (
    <>
      <nav className="mt-5 flex flex-wrap gap-1.5" aria-label={ACCOUNT.admin.eyebrow} data-testid="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-9 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold ${tab === t ? "bg-ink text-paper" : "bg-soft text-ink-2"}`}
          >
            {ACCOUNT.admin.metrics.tabs[t]}
          </button>
        ))}
      </nav>
      {tab === "accounts" ? <AdminBody me={me} /> : <Dashboard tab={tab} />}
    </>
  );
}

export default function AdminPage() {
  const session = useSession();
  const gate = useAccountGate();
  const router = useRouter();
  const asked = useRef(false);
  useEffect(() => {
    if (session.loading || session.signedIn || asked.current) return;
    asked.current = true;
    gate.signIn("account").then((ok) => {
      if (!ok) router.push("/login?next=%2Fadmin");
    });
  }, [session.loading, session.signedIn, gate, router]);

  return (
    <DoorFrame>
      <div className="pt-6 rise">
        <Eyebrow>{ACCOUNT.admin.eyebrow}</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{ACCOUNT.admin.title}</h1>
        <p className="mt-2 max-w-[24rem] text-[15px] leading-relaxed text-muted">{ACCOUNT.admin.lead}</p>
      </div>
      {session.loading || !session.signedIn ? (
        <div className="pt-10">
          <Loading />
        </div>
      ) : !session.isAdmin ? (
        <Card className="mt-6">
          <p className="text-[15px] leading-relaxed text-ink">{ACCOUNT.admin.notYou}</p>
          <LinkButton href="/account" variant="secondary" className="mt-4 w-full">
            {ACCOUNT.title}
          </LinkButton>
        </Card>
      ) : (
        <AdminTabs me={session.me?.email ?? ""} />
      )}
    </DoorFrame>
  );
}
