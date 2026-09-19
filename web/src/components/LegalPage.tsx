import Link from "next/link";
import { Wordmark } from "./ui";
import { LEGAL } from "@/lib/legal";

/** Shared chrome and typography for /terms and /privacy. Plain, readable, no app shell. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="Penthouse home" className="flex min-h-11 items-center">
          <Wordmark className="text-[22px]" />
        </Link>
        <nav className="flex items-center gap-1 text-[13px] font-bold text-muted">
          <Link href="/terms" className="flex min-h-11 items-center px-3 hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="flex min-h-11 items-center px-3 hover:text-ink">
            Privacy
          </Link>
        </nav>
      </header>

      <main id="content">
        <h1 className="display mt-4 text-[32px] leading-tight">{title}</h1>
      {LEGAL.effective && <p className="mt-2 text-[13px] text-muted">In effect from {LEGAL.effective}.</p>}

        <div className="mt-7 grid gap-7">{children}</div>
      </main>

      <footer className="mt-12 border-t border-line pt-5 text-[12px] leading-relaxed text-muted">
        {LEGAL.supportEmail ? (
          <>
            Questions about either page: <a className="underline" href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
          </>
        ) : null}{" "}
        Penthouse is not affiliated with the NFL, ESPN, Sleeper, Yahoo, or any other league platform.
      </footer>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="display text-[19px] leading-snug">{heading}</h2>
      <div className="mt-2 grid gap-2.5 text-[14.5px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="grid gap-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-line-2" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
