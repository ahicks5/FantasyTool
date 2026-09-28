"use client";
/**
 * The ESPN link, walked in four steps: make a placeholder bookmark, prime it with our code, log in to ESPN and tap it, come back and paste. The bookmark usually brings you back on its own.
 *
 * Andrew's shape (2026-09-28): the plan in one breath, then one direction per step in the
 * fewest words, an arrow to the next. Nothing else on the page.
 *
 * Two jobs in one route, because the bookmark has to come back somewhere and the place it
 * comes back to should be the place that sent it:
 *
 *   1. With nothing in the URL fragment, it is the walk.
 *   2. With `#s2=…&swid=…&league=…&team=…` in the fragment, the bookmark has just landed.
 *      The key is saved to this device and the page leaves for /connect by `replace`, which
 *      takes the fragment out of history with this entry. The same happens when the code
 *      the bookmark copied is pasted into step 4, for a browser that would not follow the jump.
 *
 * The fragment is read straight off `window.location`, never through `useSearchParams`:
 * a fragment is not a search param, and that hook would make the route dynamic for
 * nothing (see PlayerSheetProvider for the same reasoning). The league id rides in `?id=`
 * and is read the same plain way.
 *
 * Nothing here talks to the API. Reading a league is free and the walk is free; the
 * account is asked for where it always was, at the save on /connect.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ESPN_URL,
  buildEspnKeyBookmarklet,
  detectHand,
  espnKeyReturnUrl,
  parseEspnCode,
  parseEspnKeyReturn,
  type EspnKey,
  type Hand,
} from "@/lib/espnKey";
import { saveEspnAuth } from "@/lib/espnAuth";
import { useLocation } from "@/lib/href";
import { useSession } from "@/lib/session";
import { IconArrowUp, IconChevron, IconCopy } from "@/components/icons";
import { Button, Eyebrow, Wordmark } from "@/components/ui";
import { ESPN_KEY } from "@/lib/vocab";

const HANDS: Hand[] = ["iphone", "android", "computer"];

/* The device is a fact about the browser, read once; the server guesses a phone. */
const never = () => () => {};
const detected = () => detectHand(navigator.userAgent);
const onTheServer = (): Hand => "iphone";

const FIELD =
  "w-full min-w-0 rounded-xl border border-line-2 bg-soft px-4 py-3 font-mono text-[13px] text-ink placeholder:text-muted focus:border-ink focus:bg-paper focus:outline-none";

/** Copy to the clipboard, with the old-school fallback for a browser that refuses the new one. */
async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through */
  }
  if (!fallback) return false;
  try {
    fallback.focus();
    fallback.select();
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/** One step: the number, the title, one direction, and whatever control it needs. */
function Step({ n, title, line, children }: { n: number; title: string; line?: string; children?: React.ReactNode }) {
  return (
    <li className="rounded-[var(--radius-card)] border border-line-2 bg-paper p-4">
      <div className="flex items-baseline gap-3">
        <span className="display tnum text-[26px] leading-none text-muted">{n}</span>
        <h2 className="display text-[20px] leading-tight">{title}</h2>
      </div>
      {line && <p className="mt-2 text-[15px] leading-relaxed text-ink">{line}</p>}
      {children}
    </li>
  );
}

/** The arrow to the next step. */
function Next() {
  return (
    <li aria-hidden className="flex justify-center py-1 text-muted">
      <IconArrowUp size={22} strokeWidth={2.2} className="rotate-180" />
    </li>
  );
}

export default function EspnKeyPage() {
  const router = useRouter();
  const session = useSession();
  // Everything the page knows about itself is read off the address: the league it is for,
  // where the bookmark should come back to, and whether the bookmark has just landed.
  const here = useLocation();
  const leagueId = here?.searchParams.get("id")?.trim() ?? "";
  const origin = here?.origin ?? "";
  const hash = here?.hash ?? "";
  const landed = parseEspnKeyReturn(hash) !== null;
  const guessed = useSyncExternalStore(never, detected, onTheServer);
  const [picked, setPicked] = useState<Hand | null>(null);
  const hand = picked ?? guessed;
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteBad, setPasteBad] = useState(false);
  const codeBox = useRef<HTMLTextAreaElement>(null);

  /** Save the key to this device and go load the league. The league ESPN's page named wins
   *  over the one the walk was opened for; the team rides along so /connect can pick it. */
  function finish(key: EspnKey) {
    saveEspnAuth(key.s2, key.swid);
    const league = key.league || leagueId;
    const q = new URLSearchParams({ platform: "espn" });
    if (league) q.set("id", league);
    if (league && key.team) q.set("team", key.team);
    router.replace(`/connect?${q}`);
  }

  // The landing: the bookmark has just brought us back.
  useEffect(() => {
    const key = parseEspnKeyReturn(hash);
    if (!key) return;
    saveEspnAuth(key.s2, key.swid);
    const league = key.league || leagueId;
    const q = new URLSearchParams({ platform: "espn" });
    if (league) q.set("id", league);
    if (league && key.team) q.set("team", key.team);
    router.replace(`/connect?${q}`);
  }, [hash, leagueId, router]);

  const code = origin ? buildEspnKeyBookmarklet(espnKeyReturnUrl(origin, leagueId), leagueId) : "";

  async function copyCode() {
    const ok = await copyText(code, codeBox.current);
    setCopied(ok ? "yes" : "failed");
    if (!ok) setShowCode(true);
  }

  function submitPaste() {
    const key = parseEspnCode(pasted);
    if (!key) {
      setPasteBad(true);
      return;
    }
    finish(key);
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between gap-3">
        <Link href="/" aria-label="Penthouse home" className="flex min-h-11 items-center">
          <Wordmark className="text-[26px]" short={session.signedIn} />
        </Link>
        <Link
          href={leagueId ? `/connect?platform=espn&id=${encodeURIComponent(leagueId)}` : "/connect"}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line-2 px-4 text-[13px] font-bold hover:bg-soft"
          data-testid="back-to-connect"
        >
          {ESPN_KEY.back}
          <IconChevron size={13} strokeWidth={2.8} />
        </Link>
      </header>

      <main id="content">
        {landed ? (
          <div className="mt-4 rise" data-testid="espn-key-saved" role="status">
            <Eyebrow>{ESPN_KEY.saved.eyebrow}</Eyebrow>
            <h1 className="display mt-2 text-[34px] leading-[1.04]">{ESPN_KEY.saved.title}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              {leagueId ? ESPN_KEY.saved.loading : ESPN_KEY.saved.noLeague}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 rise">
              <Eyebrow>{ESPN_KEY.eyebrow}</Eyebrow>
              <h1 className="display mt-2 text-[34px] leading-[1.04]">{ESPN_KEY.title}</h1>
              <p className="mt-2 max-w-[24rem] text-[16px] leading-relaxed text-ink">{ESPN_KEY.lead}</p>
            </div>

            {/* Which device. Guessed from the browser, always correctable. */}
            <div className="mt-5 flex items-center gap-2" role="radiogroup" aria-label={ESPN_KEY.handAria}>
              {HANDS.map((h) => {
                const on = hand === h;
                return (
                  <button
                    key={h}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(h)}
                    className={`min-h-11 flex-1 rounded-full border px-3 text-[14px] font-bold transition-colors ${
                      on ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper text-ink hover:bg-soft"
                    }`}
                  >
                    {ESPN_KEY.hand[h]}
                  </button>
                );
              })}
            </div>

            <ol className="mt-5 grid">
              <Step n={1} title={ESPN_KEY.place.title} line={ESPN_KEY.place[hand]} />
              <Next />

              <Step n={2} title={ESPN_KEY.prime.title}>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="start" onClick={copyCode} disabled={!code} data-testid="copy-key">
                    <IconCopy size={16} strokeWidth={2.2} />
                    {ESPN_KEY.prime.button}
                  </Button>
                  {copied === "yes" && (
                    <span role="status" className="text-[14px] font-semibold text-start">
                      {ESPN_KEY.prime.copied}
                    </span>
                  )}
                </div>
                {copied === "failed" && (
                  <p role="status" className="mt-2 text-[13px] font-semibold text-sit">
                    {ESPN_KEY.prime.failed}
                  </p>
                )}
                <p className="mt-3 text-[15px] leading-relaxed text-ink">{ESPN_KEY.prime[hand]}</p>
                <button
                  type="button"
                  onClick={() => setShowCode((v) => !v)}
                  className="mt-1 min-h-11 text-[13px] font-semibold text-muted underline underline-offset-4"
                  aria-expanded={showCode}
                >
                  {showCode ? ESPN_KEY.prime.hide : ESPN_KEY.prime.show}
                </button>
                {/* Off screen unless asked for, but always in the DOM so the copy fallback has a box to select. */}
                <textarea
                  ref={codeBox}
                  readOnly
                  value={code}
                  aria-label={ESPN_KEY.prime.keyAria}
                  spellCheck={false}
                  onFocus={(e) => e.currentTarget.select()}
                  className={
                    showCode
                      ? "mt-2 h-28 w-full resize-none rounded-xl border border-line-2 bg-soft p-3 font-mono text-[11px] leading-snug text-ink-2"
                      : "sr-only"
                  }
                />
              </Step>
              <Next />

              <Step n={3} title={ESPN_KEY.go.title} line={ESPN_KEY.go[hand]}>
                <div className="mt-3">
                  <a
                    href={ESPN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-2 bg-paper px-5 text-[14px] font-bold text-ink hover:bg-soft"
                    data-testid="open-espn"
                  >
                    {ESPN_KEY.go.button}
                    <IconChevron size={13} strokeWidth={2.8} />
                  </a>
                </div>
              </Step>
              <Next />

              <Step n={4} title={ESPN_KEY.paste.title} line={ESPN_KEY.paste.body}>
                <div className="mt-3 flex gap-2">
                  <input
                    className={FIELD}
                    value={pasted}
                    onChange={(e) => {
                      setPasted(e.target.value);
                      setPasteBad(false);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && submitPaste()}
                    placeholder={ESPN_KEY.paste.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={ESPN_KEY.paste.placeholder}
                    data-testid="paste-code"
                  />
                  <Button variant="start" onClick={submitPaste} disabled={!pasted.trim()} className="shrink-0">
                    {ESPN_KEY.paste.button}
                  </Button>
                </div>
                {pasteBad && (
                  <p role="status" className="mt-2 text-[13px] font-semibold text-sit">
                    {ESPN_KEY.paste.bad}
                  </p>
                )}
              </Step>
            </ol>

            <p className="mt-5 text-[12px] leading-relaxed text-muted">{ESPN_KEY.privacy}</p>
          </>
        )}
      </main>
    </div>
  );
}
