"use client";
/** The room itself: top bar, league ribbon, tab bar, and the shell every page mounts. */
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useSession, type Session } from "@/lib/session";
import { IconFilm, IconSheet, IconTeam, IconTrade, IconWire } from "./icons";
import { UnlockingBanner, useUnlockOnReturn } from "./Unlocking";
import { LinkButton, OnAir, Opening, Spinner, ThemeToggle, Wordmark } from "./ui";
import { SECTIONS, TAB_ORDER, type SectionKey, type TabKey } from "@/lib/vocab";

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
 * the ribbon above the tab bar — see `LeagueRibbon`.
 */
export function TopBar({ session }: { session: Session }) {
  const email = session.me?.email;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_srgb,var(--color-plane)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
        <Link href="/" aria-label="Penthouse home" className="min-w-0 flex-1">
          <Wordmark className="text-[20px]" />
        </Link>
        <ThemeToggle />
        <Link
          href="/login"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-2 text-[11px] font-black uppercase text-ink-2 hover:bg-soft"
          title={email ?? "Sign in"}
          aria-label={email ? `Account ${email}` : "Sign in"}
        >
          {email ? email[0] : "—"}
        </Link>
      </div>
    </header>
  );
}

/**
 * The nameplate: which league and which team you are reading, on one line, riveted to
 * the top edge of the tab bar.
 *
 * It is a ribbon rather than a row: a small plate that only spans the words it holds,
 * with a chrome rail along its top edge, so it reads as something riveted to the metal
 * rather than as another bar of UI. Shipping it down here does two things the top bar
 * could not — it gets out of the way of the page title, and it sits beside the tabs,
 * which is the one place in the app that is about *where you are*.
 *
 * One line, always: both names truncate rather than wrap, because a nameplate that
 * grows to two lines moves the whole page under it.
 */
export function LeagueRibbon({ session }: { session: Session }) {
  const c = session.connection;
  return (
    <div className="pointer-events-none flex justify-center px-4">
      <Link
        href="/connect"
        className="ribbon rail pointer-events-auto flex min-h-0 min-w-0 max-w-full items-center gap-2 px-4 py-1.5 text-[11px] leading-none"
        aria-label={c ? `${c.league_name}, ${c.team_name}, week ${c.week}. Change league` : "Connect a league"}
      >
        {c ? (
          <>
            {/* Each name gets its own ceiling in characters rather than a share of the
                row. Left to flex-shrink, a long league name and a short team name both
                truncated and the team came out as "H…", which says nothing; a ch cap
                means the league gives up its tail first and the team is only ever cut
                when it is genuinely long. Both fit a 320px plate together. */}
            <span className="max-w-[15ch] truncate font-bold text-ink-2">{c.league_name}</span>
            <span aria-hidden className="h-2.5 w-px shrink-0 bg-line-2" />
            <span className="max-w-[11ch] truncate font-bold text-muted">{c.team_name}</span>
            <span aria-hidden className="h-2.5 w-px shrink-0 bg-line-2" />
            <span className="tnum shrink-0 font-black uppercase tracking-[0.1em] text-muted">Wk {c.week}</span>
          </>
        ) : (
          <span className="truncate font-bold text-muted">Connect a league</span>
        )}
      </Link>
    </div>
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
 * The tabs, with the league nameplate riveted to their top edge.
 *
 * Both live in one fixed block so the ribbon can never drift away from the bar it is
 * attached to, and so the whole assembly has a single height — which is what the page's
 * bottom padding is reserved against (`pb-32` on `main`, measured at 320px).
 */
export function TabBar({ session }: { session: Session }) {
  const path = usePathname();
  return (
    <div className="fixed inset-x-0 bottom-0 z-20">
      <LeagueRibbon session={session} />
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
  /** Right-hand slot on the title row: a week chip, a back chevron. One line, no wrap. */
  aside?: React.ReactNode;
  needsMe?: boolean;
}) {
  const session = useSession();
  const { title, blurb, gate } = SECTIONS[section];
  // Someone returning from Stripe lands on one of these pages, so the wait for the
  // entitlement belongs here rather than in each one.
  const unlock = useUnlockOnReturn(session.refresh);
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar session={session} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-32 pt-5">
        {/* The band is still one fixed height, and every tab pays the same one: the
            blurb is never conditional, so adding it moves the page down once and never
            again. 34px was the h1 alone; the line under it is 13px on `leading-snug`
            (17px) over a 2px gap, so the band is 53px.

            The blurb runs the full width *under* the title row rather than sharing the
            row's left column, so an `aside` (the back chevron on a scout report) cannot
            eat into it: at 320px the widest blurb wants about 200px and the column left
            beside a chip is less than that. It truncates rather than wraps, because the
            height of this band is the one thing on the page that must not move. */}
        <div className="mb-4 min-h-[53px]">
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-[26px]">{title}</h1>
            {aside}
          </div>
          <p className="mt-0.5 truncate text-[13px] leading-snug text-muted">{blurb}</p>
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
              Hook up a Sleeper or ESPN league and {gate} shows up here. No account, no password.
            </p>
            <LinkButton href="/connect" variant="onHero" className="w-full">
              Take me upstairs
            </LinkButton>
          </div>
        )}
      </main>
      <TabBar session={session} />
    </div>
  );
}
