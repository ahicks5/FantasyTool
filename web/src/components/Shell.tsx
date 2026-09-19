"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, type Session } from "@/lib/session";
import { IconFilm, IconSheet, IconTeam, IconTrade, IconWire } from "./icons";
import { BoothOpening, LinkButton, OnAir, ThemeToggle, Wordmark } from "./ui";

// Coach vocabulary, and every label still says what the screen is: scouting is the
// free-agent pool, the GM's office is where deals get made, film is the weekly recap.
// These are section names. What you *buy* keeps its product name — Wire Pass, Trade
// Lab, Full Booth — which is what the pricing table lists.
const TABS = [
  { href: "/home", label: "Call sheet", Icon: IconSheet },
  { href: "/team", label: "Depth", Icon: IconTeam },
  { href: "/waivers", label: "Scouting", Icon: IconWire },
  { href: "/trade", label: "GM's Office", Icon: IconTrade },
  { href: "/report", label: "Film", Icon: IconFilm },
];

export function TopBar({ session }: { session: Session }) {
  const c = session.connection;
  const email = session.me?.email;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_srgb,var(--color-plane)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
        <Link href="/" aria-label="The Booth home" className="shrink-0">
          <Wordmark className="text-[20px]" />
        </Link>
        <Link href="/connect" className="min-w-0 flex-1 text-right leading-tight">
          <div className="truncate text-[13px] font-bold">{c ? c.league_name : "No league"}</div>
          <div className="truncate text-[11px] text-muted">{c ? `${c.team_name} · Week ${c.week}` : "Connect to start"}</div>
        </Link>
        <ThemeToggle />
        <Link
          href="/login"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-2 text-[11px] font-black uppercase text-ink-2 hover:bg-soft"
          title={email ?? "Sign in"}
          aria-label={email ? `Account ${email}` : "Sign in"}
        >
          {email ? email[0] : "—"}
        </Link>
      </div>
    </header>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-[color-mix(in_srgb,var(--color-plane)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
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
                <Icon size={21} strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Top bar, bottom tabs, and the gate that asks for a league before anything else. */
export function AppShell({
  title,
  children,
  hideTitle = false,
}: {
  title: string;
  children: (s: Session) => React.ReactNode;
  hideTitle?: boolean;
}) {
  const session = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar session={session} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-5">
        {!hideTitle && <h1 className="mb-4 text-[26px]">{title}</h1>}
        {session.loading ? (
          <BoothOpening />
        ) : session.connection ? (
          children(session)
        ) : (
          <div className="hero callsheet p-7 text-center">
            <OnAir className="text-white/45" label="Off air" />
            <div className="display mt-3 text-[26px] leading-tight">Booth&rsquo;s empty</div>
            <p className="mx-auto mb-6 mt-2 max-w-[17rem] text-[15px] leading-relaxed text-white/70">
              Hook up a Sleeper or ESPN league and {title.toLowerCase()} shows up here. No account, no password.
            </p>
            <LinkButton href="/connect" variant="onHero" className="w-full">
              Put me in the booth
            </LinkButton>
          </div>
        )}
      </main>
      <TabBar />
    </div>
  );
}
