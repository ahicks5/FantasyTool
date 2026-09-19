/** The 404 page, deliberately not indexed. */
import Link from "next/link";
import { LinkButton, Wordmark } from "@/components/ui";

export const metadata = { title: "Not found · Penthouse", robots: { index: false } };

/** A 404 that offers the way back rather than a dead end. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4">
      <header className="flex h-16 items-center">
        <Link href="/" aria-label="Penthouse home">
          <Wordmark className="text-[22px]" />
        </Link>
      </header>
      <main className="flex flex-1 flex-col justify-center pb-24">
        <div className="hero p-7 text-center">
          <div className="eyebrow">404</div>
          <h1 className="display mt-2 text-[28px] leading-tight">This page does not exist</h1>
          <p className="mx-auto mb-6 mt-2 max-w-[19rem] text-[15px] leading-relaxed text-white/70">
            A share link can expire, and the rest of Penthouse lives behind a connected league.
          </p>
          <LinkButton href="/home" variant="onHero" className="w-full">
            Go to this week
          </LinkButton>
        </div>
      </main>
    </div>
  );
}
