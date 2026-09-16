"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, type Session } from "@/lib/session";
import { LinkButton, Spinner, Wordmark } from "./ui";

const TABS = [
  { href: "/team", label: "Team", icon: "▤" },
  { href: "/waivers", label: "Waivers", icon: "＋" },
  { href: "/trade", label: "Trade", icon: "⇄" },
  { href: "/report", label: "Report", icon: "☰" },
];

export function TopBar({ session }: { session: Session }) {
  const c = session.connection;
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <Link href="/" aria-label="Edge home">
          <Wordmark className="text-xl" />
        </Link>
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-bold">{c ? c.league_name : "No league"}</div>
          <div className="text-xs text-muted">{c ? `${c.team_name} · Week ${c.week}` : "Connect to start"}</div>
        </div>
      </div>
    </header>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${active ? "text-start" : "text-muted"}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="text-xl leading-none" aria-hidden>
                  {t.icon}
                </span>
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
export function AppShell({ title, children }: { title: string; children: (s: Session) => React.ReactNode }) {
  const session = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar session={session} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-4">
        <h1 className="mb-3 text-2xl font-black tracking-tight">{title}</h1>
        {session.loading ? (
          <Spinner />
        ) : session.connection ? (
          children(session)
        ) : (
          <div className="rounded-xl border border-line p-5 text-center">
            <p className="mb-4 text-muted">Connect a league to see {title.toLowerCase()}.</p>
            <LinkButton href="/connect">Connect your league</LinkButton>
          </div>
        )}
      </main>
      <TabBar />
    </div>
  );
}
