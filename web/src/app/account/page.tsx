"use client";
/** Your account: the plan flag, the leagues on file, the upgrades, the Thursday email, and your data. Signed in only. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmailOptIn from "@/components/EmailOptIn";
import { useAccountGate } from "@/components/account/AccountGate";
import { DoorFrame } from "@/components/account/Door";
import { IconCheck, IconChevron } from "@/components/icons";
import { Loading } from "@/components/Loading";
import { Button, Card, ErrorBox, Eyebrow, LinkButton, OnAir } from "@/components/ui";
import { changePassword, deleteMyAccount, exportMyData, forgetLeague, getLeague, getProducts, logout, logoutOthers, markLeagueUsed } from "@/lib/api";
import { describeAuthError } from "@/lib/authError";
import { leagueRoom, upgradesFor } from "@/lib/account";
import { formatCents } from "@/lib/format";
import { useSession } from "@/lib/session";
import { clearConnection, saveConnection } from "@/lib/storage";
import type { MeLeague, Product, Sku } from "@/lib/types";
import { PRODUCTS as FALLBACK } from "@/lib/mocks";
import { ACCOUNT, LINES } from "@/lib/vocab";

function PlanFlag({ premium, admin }: { premium: boolean; admin: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
          premium ? "bg-start-fill text-white" : "bg-soft text-muted"
        }`}
        data-plan={premium ? "premium" : "free"}
      >
        {premium ? ACCOUNT.plan.premium : ACCOUNT.plan.free}
      </span>
      {admin && <span className="inline-flex rounded-full bg-ink px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-paper">{ACCOUNT.plan.admin}</span>}
    </span>
  );
}

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";

/** Change the password (needs the current one) and sign out every other device. */
function Security() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"save" | "others" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    setNote(null);
    try {
      await changePassword(current, next);
      setOpen(false);
      setCurrent("");
      setNext("");
      setNote(ACCOUNT.security.changed);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function others() {
    setBusy("others");
    setError(null);
    setNote(null);
    try {
      setNote(ACCOUNT.security.othersDone(await logoutOthers()));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8" data-testid="security">
      <Eyebrow>{ACCOUNT.security.eyebrow}</Eyebrow>
      <p className="mt-1 text-[13px] leading-snug text-muted">{ACCOUNT.security.line}</p>
      <div className="mt-3 grid gap-2">
        {open ? (
          <form onSubmit={save} className="card grid gap-3 p-4">
            <label className="grid gap-1.5">
              <span className="eyebrow">{ACCOUNT.security.current}</span>
              <input className={FIELD} type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
            </label>
            <label className="grid gap-1.5">
              <span className="eyebrow">{ACCOUNT.newPassword}</span>
              <input className={FIELD} type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              <span className="text-[12px] text-muted">{ACCOUNT.passwordHint}</span>
            </label>
            <Button type="submit" variant="start" className="w-full" busy={busy === "save"} disabled={!current || !next}>
              {ACCOUNT.security.save}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setOpen(false)}>
              {ACCOUNT.security.cancel}
            </Button>
          </form>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => (setOpen(true), setNote(null), setError(null))}>
            {ACCOUNT.security.change}
          </Button>
        )}
        <Button variant="ghost" className="w-full" busy={busy === "others"} onClick={others}>
          {ACCOUNT.security.others}
        </Button>
        {note && (
          <p role="status" className="flex items-center gap-1.5 text-[13px] font-bold text-start">
            <IconCheck size={14} strokeWidth={3} />
            {note}
          </p>
        )}
        {error ? <ErrorBox error={error} describe={describeAuthError} /> : null}
      </div>
    </section>
  );
}

function AccountBody() {
  const router = useRouter();
  const session = useSession();
  const gate = useAccountGate();
  const [products, setProducts] = useState<Product[]>(FALLBACK);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [erasing, setErasing] = useState(false);
  const [confirm, setConfirm] = useState("");
  const account = session.account;
  const me = session.me;

  useEffect(() => {
    getProducts().then((r) => r.products.length && setProducts(r.products)).catch(() => undefined);
  }, []);

  const open = useCallback(
    async (l: MeLeague) => {
      setBusy(`open:${l.league_id}`);
      setError(null);
      try {
        const league = await getLeague(l.platform, l.league_id);
        const team = league.teams.find((t) => t.id === l.team_id);
        saveConnection({
          platform: l.platform,
          league_id: l.league_id,
          team_id: l.team_id,
          league_name: league.name,
          team_name: team?.name ?? l.team_name ?? `Team ${l.team_id}`,
          week: league.week,
        });
        void markLeagueUsed(l.platform, l.league_id).catch(() => undefined);
        router.push("/home");
      } catch (e) {
        setError(e);
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  async function forget(l: MeLeague) {
    setBusy(`forget:${l.league_id}`);
    setError(null);
    try {
      await forgetLeague(l.platform, l.league_id);
      if (session.connection?.league_id === l.league_id && session.connection.platform === l.platform) clearConnection();
      session.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function buy(sku: Sku, what: string) {
    if (await gate.upgrade(sku, { what, returnTo: "/account" })) session.refresh();
  }

  async function download() {
    setBusy("export");
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "penthouse-account.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function erase() {
    setBusy("erase");
    try {
      await deleteMyAccount();
      clearConnection();
      router.push("/");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  if (!account || !me) return <Loading />;
  const premium = account.plan.tier === "premium";
  const room = leagueRoom(me.leagues.length, me.leagues_allowed);
  const offers = upgradesFor(products, account);
  const current = session.connection;
  const fresh = me.leagues.length === 0;

  return (
    <>
      <div className="pt-6 rise">
        <Eyebrow>{fresh ? ACCOUNT.welcome.eyebrow : ACCOUNT.eyebrow}</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{fresh ? ACCOUNT.welcome.title(account.name) : ACCOUNT.title}</h1>
      </div>

      {/* A new account: it is set, and the one thing left is the league. The hero is the
          door to it; everything about the account waits underneath. */}
      {fresh && (
        <div className="hero mt-6 p-6 rise rise-1" data-testid="welcome">
          <OnAir className="text-white/45" label="Off air" />
          <p className="mt-3 max-w-[20rem] text-[16px] leading-relaxed text-white/80">{ACCOUNT.welcome.body}</p>
          <LinkButton href="/connect" variant="onHero" className="mt-5 w-full">
            {ACCOUNT.welcome.cta}
          </LinkButton>
        </div>
      )}

      {/* The plan flag: the one thing every view checks, said plainly at the top. */}
      <Card className={`mt-6 rise ${fresh ? "rise-2" : "rise-1"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>{ACCOUNT.plan.eyebrow}</Eyebrow>
            <p className="display mt-1 text-[24px] leading-tight">{account.plan.name}</p>
            <p className="mt-1 text-[13px] leading-snug text-muted">{premium ? ACCOUNT.plan.premiumLine : ACCOUNT.plan.freeLine}</p>
          </div>
          <PlanFlag premium={premium} admin={account.is_admin} />
        </div>
        <p className="mt-3 text-[15px] font-bold break-words">{account.name || account.email}</p>
        {account.name && <p className="text-[13px] text-muted break-words">{account.email}</p>}
        {!account.plan.skus.includes("full_report") && (
          <Button variant="start" className="mt-4 w-full" onClick={() => buy("full_report", LINES.paywallBundle)} data-testid="upgrade-bundle">
            {ACCOUNT.plan.upgrade}
            <span aria-hidden className="opacity-60">·</span>
            <span className="tnum">{formatCents(products.find((p) => p.sku === "full_report")?.price_cents ?? 700)}</span>
          </Button>
        )}
        {account.is_admin && (
          <Link href="/admin" className="mt-3 flex min-h-11 items-center justify-between rounded-xl bg-soft px-4 text-[14px] font-bold text-ink">
            {ACCOUNT.admin.title}
            <IconChevron size={16} strokeWidth={2.4} />
          </Link>
        )}
      </Card>

      {/* Leagues on file: the reason the account exists. */}
      <section className="mt-6 rise rise-2">
        <div className="flex items-baseline justify-between gap-3">
          <Eyebrow>{ACCOUNT.leagues.eyebrow}</Eyebrow>
          <span className="tnum text-[12px] font-bold text-muted" data-testid="league-room">
            {room.line}
          </span>
        </div>
        <ul className="mt-2 grid gap-2">
          {me.leagues.map((l) => {
            const reading = current?.platform === l.platform && current.league_id === l.league_id;
            return (
              <li key={`${l.platform}:${l.league_id}`} className={`card flex items-center gap-3 p-4 ${reading ? "card-open" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className="display block truncate text-[16px] leading-tight">{l.name}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted">
                    {l.team_name || `Team ${l.team_id}`} · {l.platform === "espn" ? "ESPN" : "Sleeper"}
                    {reading && (
                      <>
                        {" "}
                        <span aria-hidden>·</span> <span className="font-bold text-start">{ACCOUNT.leagues.reading}</span>
                      </>
                    )}
                  </span>
                </span>
                {!reading && (
                  <Button size="sm" variant="secondary" busy={busy === `open:${l.league_id}`} onClick={() => open(l)} aria-label={ACCOUNT.leagues.openAria(l.name)}>
                    {ACCOUNT.leagues.open}
                  </Button>
                )}
                <Button size="sm" variant="ghost" busy={busy === `forget:${l.league_id}`} onClick={() => forget(l)} aria-label={ACCOUNT.leagues.forgetAria(l.name)}>
                  {ACCOUNT.leagues.forget}
                </Button>
              </li>
            );
          })}
          {me.leagues.length === 0 && <li className="card p-4 text-[14px] text-muted">{ACCOUNT.leagues.none}</li>}
        </ul>
        <div className="mt-3 grid gap-2">
          {room.full ? (
            <>
              <p className="text-[13px] leading-snug text-muted">{ACCOUNT.leagues.full}</p>
              <Button variant="secondary" className="w-full" onClick={() => buy("league_slot", ACCOUNT.upgrade.limit)} data-testid="add-slot">
                {ACCOUNT.leagues.addSlot}
                <span aria-hidden className="opacity-60">·</span>
                <span className="tnum">{formatCents(products.find((p) => p.sku === "league_slot")?.price_cents ?? 200)}</span>
              </Button>
            </>
          ) : fresh ? null : (
            <LinkButton href="/connect" className="w-full">
              {ACCOUNT.leagues.add}
            </LinkButton>
          )}
        </div>
      </section>

      {/* What is left to buy. Empty for a bundle holder with every slot they want. */}
      {offers.length > 0 && (
        <section className="mt-8 rise rise-3">
          <Eyebrow>{ACCOUNT.upgrade.title}</Eyebrow>
          <ul className="mt-2 grid gap-2">
            {offers.map((o) => (
              <li key={o.sku} className="card flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="display block text-[16px] leading-tight">{o.name}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">{o.blurb}</span>
                </span>
                <Button size="sm" variant={o.sku === "full_report" ? "start" : "secondary"} onClick={() => buy(o.sku, o.name)}>
                  <span className="tnum">{formatCents(o.price_cents)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 rise rise-3">
        <EmailOptIn />
      </div>

      <Security />

      {/* The privacy page's promises, with buttons behind them. */}
      <section className="mt-8">
        <Eyebrow>{ACCOUNT.data.eyebrow}</Eyebrow>
        <p className="mt-1 text-[13px] leading-snug text-muted">{ACCOUNT.data.line}</p>
        <div className="mt-3 grid gap-2">
          <Button variant="secondary" className="w-full" busy={busy === "export"} onClick={download}>
            {ACCOUNT.data.export}
          </Button>
          {!erasing ? (
            <Button variant="ghost" className="w-full text-sit" onClick={() => setErasing(true)}>
              {ACCOUNT.data.erase}
            </Button>
          ) : (
            <div className="card grid gap-2 border-sit p-4">
              <p className="text-[13px] leading-snug text-ink">{ACCOUNT.data.eraseConfirm}</p>
              <input
                className="w-full rounded-xl border border-line-2 bg-soft px-4 py-3 text-base text-ink focus:border-ink focus:outline-none"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoCapitalize="none"
                aria-label="Type delete to confirm"
              />
              <Button variant="secondary" className="w-full text-sit" disabled={confirm.trim().toLowerCase() !== "delete"} busy={busy === "erase"} onClick={erase}>
                {ACCOUNT.data.erase}
              </Button>
            </div>
          )}
        </div>
      </section>

      {error ? (
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-2">
        <LinkButton href="/home" className="w-full">
          Back upstairs
        </LinkButton>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() =>
            logout().then(() => {
              clearConnection();
              router.push("/");
            })
          }
        >
          {ACCOUNT.signOut}
        </Button>
      </div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
        <IconCheck size={12} strokeWidth={3} />
        {LINES.tagline}
      </p>
    </>
  );
}

/** The view's check: not signed in, the sheet opens; dismissed, the door is /login. */
function Guard({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const gate = useAccountGate();
  const router = useRouter();
  // Asked once per mount: a ref, not state, because the sheet opening is not a render.
  const asked = useRef(false);
  useEffect(() => {
    if (session.loading || session.signedIn || asked.current) return;
    asked.current = true;
    gate.signIn("account").then((ok) => {
      if (!ok) router.push("/login?next=%2Faccount");
    });
  }, [session.loading, session.signedIn, gate, router]);
  if (session.loading || !session.signedIn) {
    return (
      <div className="pt-10">
        <Loading />
      </div>
    );
  }
  return <>{children}</>;
}

export default function AccountPage() {
  return (
    <DoorFrame>
      <Guard>
        <AccountBody />
      </Guard>
    </DoorFrame>
  );
}
