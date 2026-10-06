"use client";
/** The nameplate in the corner of every page but the landing page: "SUITE", and a link to the desk (signed in) or the front door (signed out). */
import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { useSession } from "@/lib/session";

/**
 * One rule, so no page can get it wrong (Andrew, 2026-10-05, W-007): the short word everywhere
 * except the landing page, and the mark goes home: `/home` once you are in, `/` before.
 * The landing page keeps the full `<Wordmark />`, it is the pitch there.
 */
export function HomeMark({ className = "text-[20px]", linkClassName = "flex min-h-11 items-center" }: { className?: string; linkClassName?: string }) {
  const session = useSession();
  return (
    <Link href={session.signedIn ? "/home" : "/"} aria-label="Owner's Suite home" className={linkClassName}>
      <Wordmark className={className} short />
    </Link>
  );
}
