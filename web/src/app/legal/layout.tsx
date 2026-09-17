/* Shared chrome for the three legal pages.
 *
 * DRAFT — written to describe exactly what the code does, not to be a substitute for a
 * lawyer reading it. See docs/LEGAL_CHECKLIST.md for the review queue before launch.
 * Whenever the product changes what it stores, shares, or charges for, these pages and
 * docs/DATA_INVENTORY.md change in the same commit. */
import Link from "next/link";
import { Wordmark } from "@/components/ui";

export const LAST_UPDATED = "17 September 2026";

const PAGES = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/refunds", label: "Refunds" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-14 items-center justify-between">
        <Link href="/" aria-label="Edge home">
          <Wordmark className="text-2xl" />
        </Link>
        <nav className="flex gap-3 text-sm font-bold text-muted">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="hover:text-ink">
              {p.label}
            </Link>
          ))}
        </nav>
      </header>
      <article className="legal mt-6">{children}</article>
      <footer className="mt-12 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        Questions about any of this: <a className="underline" href="mailto:support@edge.example">support@edge.example</a>.
        <br />
        Edge is not affiliated with the NFL, the NFLPA, Sleeper, ESPN, or Yahoo.
      </footer>
    </div>
  );
}
