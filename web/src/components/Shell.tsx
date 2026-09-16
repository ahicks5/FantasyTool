"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, type Session } from "@/lib/session";
import { LinkButton, SkeletonList, Wordmark } from "./ui";

const TABS = [
  { href: "/home", label: "Home", d: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/team", label: "Team", d: "M4 5h16v4H4zM4 11h16v4H4zM4 17h10v3H4z" },
  { href: "/waivers", label: "Waivers", d: "M12 4v16M4 12h16" },
  { href: "/trade", label: "Trade", d: "M4 8h13l-3-3M20 16H7l3 3" },
  { href: "/report", label: "Report", d: "M6 3h9l5 5v13H6zM14 3v6h6M9 13h6M9 17h6" },
];

function Icon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function TopBar({ session }: { session: Session }) {
  const c = session.connection;
  const email = session.me?.email;
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="Edge home">
          <Wordmark className="text-xl" />
        </Link>
        <Link href="/connect" className="min-w-0 flex-1 text-right">
          <div className="truncate text-sm font-bold">{c ? c.league_name : "No league"}</div>
          <div className="truncate text-xs text-muted">{c ? `${c.team_name} · Week ${c.week}` : "Connect to start"}</div>
        </Link>
        <Link
          href="/login"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft text-xs font-black uppercase"
          title={email ?? "Sign in"}
          aria-label={email ? `Account ${email}` : "Sign in"}
        >
          {email ? email[0] : "·"}
        </Link>
      </div>
    </header>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold ${active ? "text-start" : "text-muted"}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon d={t.d} active={active} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Wraps every app page: top bar, bottom tabs, and a "connect first" gate.
 * `children` is a render function that receives the session once a league is connected.
 */
export function AppShell({ title, children, hideTitle = false }: { title: string; children: (s: Session) => React.ReactNode; hideTitle?: boolean }) {
  const session = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar session={session} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-4">
        {!hideTitle && <h1 className="mb-3 text-2xl font-black tracking-tight">{title}</h1>}
        {session.loading ? (
          <SkeletonList rows={3} tall />
        ) : session.connection ? (
          children(session)
        ) : (
          <div className="card p-6 text-center">
            <div className="display text-2xl font-black">No league yet</div>
            <p className="mb-5 mt-1 text-muted">Connect a Sleeper or ESPN league to see {title.toLowerCase()}.</p>
            <LinkButton href="/connect" className="w-full">
              Connect your league
            </LinkButton>
          </div>
        )}
      </main>
      <TabBar />
    </div>
  );
}
