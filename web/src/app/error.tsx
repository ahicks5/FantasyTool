"use client";
/**
 * The boundary for anything a page throws while rendering. Without it Next shows its own
 * blank error screen, which on a paid product reads as the whole app having fallen over.
 * `reset` re-renders the segment, which is usually all a transient failure needs.
 */

import { useEffect } from "react";
import { Button, ErrorBox } from "@/components/ui";
import { HomeMark } from "@/components/HomeMark";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Nothing is wired to collect these yet, so at least leave them where a phone's
    // remote inspector can find them.
    console.error("Owner's Suite crashed while rendering:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4">
      <header className="flex h-16 items-center">
        <HomeMark className="text-[22px]" />
      </header>
      <main className="flex flex-1 flex-col justify-center gap-4 pb-24">
        <ErrorBox error={error} onRetry={reset} />
        <Button variant="primary" onClick={reset} className="w-full">
          Reload this page
        </Button>
        {error.digest && <p className="text-center text-[12px] text-muted">Reference {error.digest}</p>}
      </main>
    </div>
  );
}
