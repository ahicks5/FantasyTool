"use client";
/** The room itself: top bar, title band with the nameplate, ticker, tab bar, and the shell every page mounts. */
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useSession, type Session } from "@/lib/session";
import { IconFilm, IconSheet, IconTeam, IconTrade, IconWire } from "./icons";
import { PlayerSheetProvider } from "./player/PlayerSheetProvider";
import { Ticker } from "./Ticker";
import { UnlockingBanner, useUnlockOnReturn } from "./Unlocking";
import { LinkButton, OnAir, Opening, Spinner, ThemeToggle, Wordmark } from "./ui";
import { ACCOUNT, NAMEPLATE, SECTIONS, TAB_ORDER, type SectionKey, type TabKey } from "@/lib/vocab";
import { accountLabel, initialOf } from "@/lib/account";

// Coach vocabulary, and every label still says what the screen is: scouting is the
// free-agent pool, the GM's office is where deals get made, film is the weekly recap.
// The words themselves live in `lib/vocab.ts` so a rename is one file; this only
// pairs them with their icons.
const TAB_ICONS: Record<TabKey, (p: { size?: number; strokeWidth?: number }) => React.ReactElement> = {
  home: IconSheet,
  team: IconTeam,
  waivers: IconWire,
  trade: IconTrade,
  report: IconFilm,
};

/**
 * The wordmark, the theme switch and the account. Nothing else.
 *
 * The league and team used to live up here as a two-line block on the right, which
 * put the least urgent words on the screen at the top of every page and squeezed the
 * wordmark on a 320px phone. They are a nameplate, not navigation, so they moved to
 * the title band on the right — see `Nameplate`.
 */
export function TopBar({ session }: { session: Session }) {
  const account = session.account;
  const premium = session.premium;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_srgb,var(--color-plane)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
        <Link href="/" aria-label="Penthouse home" className="min-w-0 flex-1">
          <Wordmark className="text-[20px]" />
        </Link>
        <ThemeToggle />
        {/* The account: an initial once signed in (ringed in the start colour on a premium
            account, so the flag is visible from every room), else the two words. */}
        {account ? (
          <Link
            href="/account"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[13px] font-black uppercase hover:bg-soft ${
              premium ? "border-start bg-start-soft text-start ring-1 ring-start" : "border-line-2 text-ink-2"
            }`}
            title={accountLabel(account)}
            aria-label={ACCOUNT.topbar.account(accountLabel(account))}
            data-plan={premium ? "premium" : "free"}
          >
            {initialOf(account) || <IconTeam size={18} />}
          </Link>
        ) : (
          <Link
            href="/login"
            className="flex h-11 shrink-0 items-center justify-center rounded-full border border-line-2 px-3.5 text-[12px] font-bold text-ink-2 hover:bg-soft"
            aria-label={ACCOUNT.topbar.signIn}
          >
            {session.loading ? "\u00a0" : ACCOUNT.topbar.signIn}
          </Link>
        )}
      </div>
    </header>
  );
}

/**
 * The nameplate: which league and which team you are reading, on the right of the title
 * band, on every tab. Small, right-aligned, two short lines: the team, then the league
 * and the week. It used to be a ribbon riveted to the tab bar; Andrew moved it up here
 * (2026-09-21) so the bottom of the screen is the ticker and the tabs and nothing else.
 *
 * Both names truncate rather than wrap, so the band never changes height. It is also the
 * door to `/connect`.
 */
export function Nameplate({ session }: { session: Session }) {
  const c = session.connection;
  return (
    <Link
      href="/connect"
      className="nameplate min-w-0 max-w-[55%] shrink text-right leading-none"
      aria-label={c ? NAMEPLATE.aria(c.league_name, c.team_name, c.week) : NAMEPLATE.connect}
    >
      {c ? (
        <>
          <span className="display block truncate text-[13px] text-ink">{c.team_name}</span>
          <span className="mt-[3px] block truncate text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            {c.league_name} <span aria-hidden>·</span> <span className="tnum">{NAMEPLATE.week(c.week)}</span>
          </span>
        </>
      ) : (
        <span className="block truncate text-[11px] font-bold text-muted">{NAMEPLATE.connect}</span>
      )}
    </Link>
  );
}

/**
 * The tapped tab turns while its route is still arriving. `useLinkStatus` only
 * reports pending inside a Link, which is why this is its own component.
 *
 * Without it, tapping a tab whose chunk is not cached does nothing visible until
 * the page swaps — which reads as a dead tap on a stalled app.
 */
function TabIcon({ Icon, active }: { Icon: (p: { size?: number; strokeWidth?: number }) => React.ReactElement; active: boolean }) {
  const { pending } = useLinkStatus();
  if (pending) return <Spinner size={21} label="Loading" />;
  return <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />;
}

/**
 * The tabs, with the ticker riding on their top edge.
 *
 * Both live in one fixed block so the whole assembly has a single height — which is what
 * the page's bottom padding is reserved against (`pb-28` on `main`: ticker and bar).
 */
export function TabBar({ session }: { session: Session }) {
  const path = usePathname();
  return (
    <div className="fixed inset-x-0 bottom-0 z-20">
      {/* The bottom line: the desk's news running over the tabs, on every screen that
          has a team. Its height is part of what `main`'s bottom padding reserves. */}
      {session.connection && <Ticker c={session.connection} />}
      <nav className="border-t border-line bg-[color-mix(in_srgb,var(--color-plane)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TAB_ORDER.map((key) => {
          const { href, label } = SECTIONS[key];
          const Icon = TAB_ICONS[key];
          const active = path === href || path.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                className={`relative flex h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-tight ${
                  active ? "text-ink" : "text-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {/* An active marker that is not colour alone. */}
                <span
                  aria-hidden
                  className={`absolute top-0 h-[3px] w-8 rounded-b-full bg-start transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
                />
                <TabIcon Icon={Icon} active={active} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      </nav>
    </div>
  );
}

/**
 * Top bar, bottom tabs, and the gate that asks for a league before anything else.
 *
 * Every tab renders its title, and the title row is a fixed-height band: it used to be
 * optional (the call sheet hid it), so moving between tabs shifted everything below by
 * the height of an h1 and the whole page appeared to jump. A band that is always there,
 * always the same height, and painted *before* the data arrives cannot be the thing
 * that moves.
 *
 * `needsMe` is for screens whose first paint depends on entitlements. Everything else
 * mounts as soon as the connection is known — that comes from localStorage and is
 * synchronous — so the page's own loader is the only wait on screen rather than the
 * second of two.
 */
export function AppShell({
  section,
  children,
  aside,
  needsMe = false,
}: {
  section: SectionKey;
  children: (s: Session) => React.ReactNode;
  /** Right-hand slot on the title row, in place of the nameplate: a back chevron. One line, no wrap. */
  aside?: React.ReactNode;
  needsMe?: boolean;
}) {
  const session = useSession();
  const { title, gate } = SECTIONS[section];
  // Someone returning from Stripe lands on one of these pages, so the wait for the
  // entitlement belongs here rather than in each one.
  const unlock = useUnlockOnReturn(session.refresh);
  return (
    // One sheet for the whole app: tapping a name anywhere opens the same player page over
    // the tab you are on, and the tab stays lit because nothing navigated.
    <PlayerSheetProvider>
    <div className="flex min-h-screen flex-col">
      <TopBar session={session} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-5">
        {/* The band is one fixed height and every tab pays the same one, so moving between
            tabs never shifts the page. The h1 on the left; on the right the page's own
            `aside` when it has one (the back chevron on a scout report), otherwise the
            league nameplate. */}
        <div className="mb-4 flex min-h-[40px] items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-[26px]">{title}</h1>
          {aside ?? <Nameplate session={session} />}
        </div>
        <UnlockingBanner state={unlock} />
        {needsMe && session.loading ? (
          <Opening />
        ) : session.connection ? (
          children(session)
        ) : (
          <div className="hero callsheet p-7 text-center">
            <OnAir className="text-white/45" label="Off air" />
            <div className="display mt-3 text-[26px] leading-tight">The room&rsquo;s empty</div>
            <p className="mx-auto mb-6 mt-2 max-w-[17rem] text-[15px] leading-relaxed text-white/70">
              {session.signedIn ? ACCOUNT.room.signedIn : ACCOUNT.room.signedOut} {gate} {ACCOUNT.room.tail}
            </p>
            {/* The account first, then the league: a stranger's door is /register. */}
            <LinkButton href={session.signedIn ? "/connect" : "/register"} variant="onHero" className="w-full">
              {session.signedIn ? ACCOUNT.room.link : ACCOUNT.room.register}
            </LinkButton>
          </div>
        )}
      </main>
      <TabBar session={session} />
    </div>
    </PlayerSheetProvider>
  );
}
