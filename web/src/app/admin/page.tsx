"use client";
/** The front office: every account, its plan and its leagues, and the owner's levers. Admin only. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccountGate } from "@/components/account/AccountGate";
import { DoorFrame } from "@/components/account/Door";
import { Loading } from "@/components/Loading";
import { Button, Card, ErrorBox, Eyebrow, LinkButton } from "@/components/ui";
import { adminGrant, adminResetLink, adminRevoke, adminSetRole, adminUsers } from "@/lib/api";
import { matchesAccount, shortDate } from "@/lib/account";
import { useSession } from "@/lib/session";
import type { AdminUser, AdminUsersResponse, Sku } from "@/lib/types";
import { ACCOUNT } from "@/lib/vocab";

const GRANTABLE: { sku: Sku; label: string }[] = [
  { sku: "full_report", label: "The Penthouse" },
  { sku: "waivers", label: "Wire Pass" },
  { sku: "trade_lab", label: "Trade Lab" },
];

function Row({ u, me, onChange }: { u: AdminUser; me: string; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
  return (
    <li className="card p-4" data-testid="admin-row" data-email={u.email}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="display truncate text-[17px] leading-tight">
            {u.name || u.email}
            {isMe && <span className="ml-2 text-[12px] font-bold text-muted">({ACCOUNT.admin.you})</span>}
          </p>
          {u.name && <p className="truncate text-[12px] text-muted">{u.email}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${premium ? "bg-start-fill text-white" : "bg-soft text-muted"}`}>
            {premium ? ACCOUNT.plan.premium : ACCOUNT.plan.free}
          </span>
          {u.is_admin && <span className="inline-flex rounded-full bg-ink px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-paper">{ACCOUNT.plan.admin}</span>}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-2">
        {u.plan.name} <span aria-hidden>·</span> <span className="tnum">{ACCOUNT.admin.leagues(u.leagues.length, u.leagues_allowed)}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-muted">
        {ACCOUNT.admin.joined} <span className="tnum">{shortDate(u.created) || ACCOUNT.admin.never}</span> <span aria-hidden>·</span> {ACCOUNT.admin.lastSeen}{" "}
        <span className="tnum">{shortDate(u.last_login) || ACCOUNT.admin.never}</span>
      </p>
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
        {GRANTABLE.map((g) =>
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
      </div>
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
        <AdminBody me={session.account?.email ?? ""} />
      )}
    </DoorFrame>
  );
}
