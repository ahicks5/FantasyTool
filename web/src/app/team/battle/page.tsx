"use client";
/** Position Battle: `/team/battle?a=<id>&b=<id>`. Two men, one spot, the tale of the tape. The corner is free; the verdict is paid. */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/Shell";
import { BattleView } from "@/components/battle/BattleView";
import { Opening } from "@/components/ui";
import type { Session } from "@/lib/session";

function BattleBody({ s }: { s: Session }) {
  const params = useSearchParams();
  const a = params.get("a") ?? "";
  const b = params.get("b");
  if (!a) return <Opening />;
  // Keyed by the man in the spot, so a new fight from another player page starts clean.
  return <BattleView key={a} c={s.connection!} a={a} b={b && b !== a ? b : null} signedIn={s.signedIn} />;
}

export default function BattlePage() {
  return (
    <AppShell section="battle">
      {(s) => (
        <Suspense fallback={<Opening />}>
          <BattleBody s={s} />
        </Suspense>
      )}
    </AppShell>
  );
}
