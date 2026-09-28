"use client";
/** Your account: the plan flag, the leagues on file, the upgrades, the Thursday email, and your data. Signed in only. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccountGate } from "@/components/account/AccountGate";
import { DoorFrame } from "@/components/account/Door";
import { IconCheck, IconChevron } from "@/components/icons";
import { Loading } from "@/components/Loading";
import { Button, Card, ErrorBox, Eyebrow, LinkButton, OnAir, ThemeSetting } from "@/components/ui";
import { addPhone, changePassword, deleteMyAccount, phoneStart, setAccountEmail, forgetLeague, getLeague, logout, logoutOthers, markLeagueUsed } from "@/lib/api";
import { describeAuthError } from "@/lib/authError";
import { displayPhone, leagueRoom, shortDate } from "@/lib/account";
import { useSession } from "@/lib/session";
import { clearConnection, saveConnection } from "@/lib/storage";
import type { MeLeague, Sku } from "@/lib/types";
import { ACCOUNT, LINES, PRICING, YAHOO } from "@/lib/vocab";

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

/** The ways in on file: the phone and the email, each addable or changeable. */
function Contact() {
  const session = useSession();
  const account = session.account;
  const [open, setOpen] = useState<"phone" | "email" | null>(null);
  const [number, setNumber] = useState("");
  const [sent, setSent] = useState<{ phone: string; display: string; devCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!account) return null;
  const hasPassword = account.has_password !== false;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const reset = (which: "phone" | "email" | null) => {
    setOpen(which);
    setSent(null);
    setCode("");
    setNumber("");
    setEmail("");
    setPassword("");
    setError(null);
    setNote(null);
  };

  return (
    <section className="mt-3" data-testid="contact">
      <div className="grid gap-2">
        <div className="card flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="eyebrow block">{ACCOUNT.emailOnFile.label}</span>
            <span className="mt-0.5 block truncate text-[15px] font-bold">{account.email || ACCOUNT.emailOnFile.add}</span>
          </span>
          {open !== "email" && (
            <Button size="sm" variant="secondary" onClick={() => reset("email")}>
              {account.email ? ACCOUNT.emailOnFile.change : ACCOUNT.emailOnFile.add}
            </Button>
          )}
        </div>
        {!account.email && open !== "email" && <p className="text-[12px] leading-snug text-muted">{ACCOUNT.emailOnFile.none}</p>}
        {open === "email" && (
          <form
            className="card grid gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await setAccountEmail(email.trim(), password);
                session.refresh();
                reset(null);
                setNote(ACCOUNT.emailOnFile.saved);
              });
            }}
          >
            <label className="grid gap-1.5">
              <span className="eyebrow">{ACCOUNT.email}</span>
              <input className={FIELD} type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            {hasPassword && (
              <label className="grid gap-1.5">
                <span className="eyebrow">{ACCOUNT.emailOnFile.needPassword}</span>
                <input className={FIELD} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
            <Button type="submit" variant="start" className="w-full" busy={busy} disabled={!email.trim() || (hasPassword && !password)}>
              {ACCOUNT.emailOnFile.save}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => reset(null)}>
              {ACCOUNT.security.cancel}
            </Button>
          </form>
        )}

        <div className="card flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="eyebrow block">{ACCOUNT.phone.onFile}</span>
            <span className="mt-0.5 block truncate text-[15px] font-bold tnum">{displayPhone(account.phone) || ACCOUNT.phone.none}</span>
          </span>
          {session.me?.phone_sign_in && open !== "phone" && (
            <Button size="sm" variant="secondary" onClick={() => reset("phone")}>
              {account.phone ? ACCOUNT.phone.replace : ACCOUNT.phone.add}
            </Button>
          )}
        </div>
        {open === "phone" && (
          <form
            className="card grid gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!sent) {
                  const out = await phoneStart(number.trim());
                  setSent({ phone: out.phone, display: out.display, devCode: out.dev_code });
                  return;
                }
                await addPhone(sent.phone, code.trim());
                session.refresh();
                reset(null);
                setNote(ACCOUNT.phone.added);
              });
            }}
          >
            {!sent ? (
              <label className="grid gap-1.5">
                <span className="eyebrow">{ACCOUNT.phone.label}</span>
                <input className={FIELD} type="tel" required autoComplete="tel" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="(555) 234-5678" autoFocus />
              </label>
            ) : (
              <label className="grid gap-1.5">
                <span className="text-[13px] leading-snug text-ink">{ACCOUNT.phone.codeLead(sent.display)}</span>
                <span className="eyebrow">{ACCOUNT.phone.codeLabel}</span>
                <input className={`${FIELD} tnum tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
                {sent.devCode && <span className="text-[12px] text-muted" data-testid="dev-code">{ACCOUNT.phone.devCode(sent.devCode)}</span>}
              </label>
            )}
            <Button type="submit" variant="start" className="w-full" busy={busy} disabled={sent ? code.length < 4 : !number.trim()}>
              {sent ? ACCOUNT.phone.verify : ACCOUNT.phone.send}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => reset(null)}>
              {ACCOUNT.security.cancel}
            </Button>
          </form>
        )}
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

/** Change the password (needs the current one) and sign out every other device. */
function Security({ hasPassword }: { hasPassword: boolean }) {
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
        {!hasPassword ? null : open ? (
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [erasing, setErasing] = useState(false);
  const [confirm, setConfirm] = useState("");
  const account = session.account;
  const me = session.me;

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

  async function buy(sku: Sku, what?: string) {
    if (await gate.upgrade(sku, { what, returnTo: "/account" })) session.refresh();
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
  // Slots used this season, not leagues on file: a forgotten league keeps its slot (Andrew, 2026-09-27).
  const room = leagueRoom(me.leagues_used ?? me.leagues.length, me.leagues_allowed);
  const hasSeason = account.plan.skus.includes("full_report");
  // A week-pass holder (and not the season): the plan says when the week runs out, and where to cancel.
  const weekOnly = account.plan.skus.includes("week_pass") && !hasSeason;
  const planName = account.plan.skus.length === 1 ? (PRICING.names as Record<string, string>)[account.plan.skus[0]] ?? account.plan.name : account.plan.name;
  const current = session.connection;
  const fresh = me.leagues.length === 0 && !me.leagues_used;
  const row = "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-[14px] font-bold";

  // The order, top to bottom (Andrew, 2026-09-27): who you are, your leagues, your plan,
  // then the settings. No price is printed on this page; the upgrade sheet carries it.
  return (
    <>
      <div className="pt-6 rise">
        <Eyebrow>{fresh ? ACCOUNT.welcome.eyebrow : ACCOUNT.eyebrow}</Eyebrow>
        <h1 className="display mt-2 text-[34px] leading-[1.04]">{fresh ? ACCOUNT.welcome.title(account.name) : ACCOUNT.title}</h1>
      </div>

      {account.is_admin && (
        <LinkButton href="/admin" variant="secondary" className="mt-5 w-full">
          {ACCOUNT.adminLink}
          <IconChevron size={16} strokeWidth={2.4} />
        </LinkButton>
      )}

      {/* A new account: it is set, and the one thing left is the league. */}
      {fresh && (
        <div className="hero mt-6 p-6 rise rise-1" data-testid="welcome">
          <OnAir className="text-white/45" label="Off air" />
          <p className="mt-3 max-w-[20rem] text-[16px] leading-relaxed text-white/80">{ACCOUNT.welcome.body}</p>
          <LinkButton href="/connect" variant="onHero" className="mt-5 w-full">
            {ACCOUNT.welcome.cta}
          </LinkButton>
        </div>
      )}

      {/* Who you are. */}
      <section className="mt-6 rise rise-1">
        <div className="flex items-center justify-between gap-3">
          {/* The name, when there is one; the email and phone are right below it. */}
          <p className="display min-w-0 truncate text-[22px] leading-tight">{account.name || ""}</p>
          <PlanFlag premium={premium} admin={account.is_admin} />
        </div>
        <Contact />
      </section>

      {/* Leagues on file: the reason the account exists. */}
      <section className="mt-8 rise rise-2">
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
                    {l.team_name || `Team ${l.team_id}`} · {l.platform === "espn" ? "ESPN" : l.platform === "yahoo" ? YAHOO.label : "Sleeper"}
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
        <p className="mt-2 text-[12px] leading-snug text-muted">{room.full ? `${ACCOUNT.leagues.full} ${ACCOUNT.leagues.keeps}` : ACCOUNT.leagues.keeps}</p>
        <div className="mt-3 grid gap-2">
          {!room.full && !fresh && (
            <LinkButton href="/connect" className="w-full">
              {ACCOUNT.leagues.add}
            </LinkButton>
          )}
          <button type="button" className={`${row} bg-soft text-ink hover:bg-line`} onClick={() => buy("league_slot")} data-testid="add-slot">
            {ACCOUNT.leagues.addSlot}
            <IconChevron size={16} strokeWidth={2.4} />
          </button>
        </div>
      </section>

      {/* The plan. The price lives in the sheet the button opens, never on this page. */}
      <Card className="mt-8 rise rise-3">
        <Eyebrow>{ACCOUNT.plan.eyebrow}</Eyebrow>
        <p className="display mt-1 text-[24px] leading-tight">{planName}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted" data-testid="plan-line">
          {weekOnly && account.pass_until ? ACCOUNT.plan.weekLine(shortDate(account.pass_until)) : premium ? ACCOUNT.plan.premiumLine : ACCOUNT.plan.freeLine}
        </p>
        {!hasSeason && (
          <Button variant="start" className="mt-4 w-full" onClick={() => buy("full_report", LINES.paywallBundle)} data-testid="upgrade-bundle">
            {ACCOUNT.plan.upgrade}
            <IconChevron size={16} strokeWidth={2.6} />
          </Button>
        )}
        {weekOnly && me.billing_portal_url && (
          <a href={me.billing_portal_url} target="_blank" rel="noopener noreferrer" className={`${row} mt-3 bg-soft text-ink`} data-testid="billing-portal">
            {ACCOUNT.plan.manage}
            <IconChevron size={16} strokeWidth={2.4} />
          </a>
        )}
      </Card>

      <Security hasPassword={account.has_password !== false} />

      <section className="mt-8 flex items-center justify-between gap-3">
        <Eyebrow>{ACCOUNT.appearance.eyebrow}</Eyebrow>
        <ThemeSetting label={ACCOUNT.appearance.eyebrow} dark={ACCOUNT.appearance.dark} light={ACCOUNT.appearance.light} />
      </section>

      {error ? (
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-2">
        <LinkButton href="/home" className="w-full">
          {ACCOUNT.back}
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

      {/* The last thing on the page, and the quietest. */}
      <div className="mt-10 border-t border-line pt-4">
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
  // Only while nobody is known: a refresh after a change keeps the page mounted, so the
  // "saved" line under the form survives the reload of the account behind it.
  if (!session.signedIn) {
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
