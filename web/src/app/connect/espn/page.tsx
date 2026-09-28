"use client";
/**
 * The ESPN key: an ESPN league linked from a phone, walked step by step. Copy the bookmark, save it, open your team on ESPN, tap it, and it brings you back here with the league, the team and the key.
 *
 * Two jobs in one route, because the bookmark has to come back somewhere and the place it
 * comes back to should be the place that sent it:
 *
 *   1. With nothing in the URL fragment, it is the walk: which device, then four steps.
 *   2. With `#s2=…&swid=…` in the fragment, the bookmark has just landed. The key is saved
 *      to this device, the fragment is wiped off the address before anything else can see
 *      it, and the page goes back to /connect to load the league it was asked for.
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
  KEY_NAME,
  buildEspnKeyBookmarklet,
  detectHand,
  espnKeyReturnUrl,
  parseEspnKeyReturn,
  type Hand,
} from "@/lib/espnKey";
import { saveEspnAuth } from "@/lib/espnAuth";
import { useLocation } from "@/lib/href";
import { useSession } from "@/lib/session";
import { IconBookmark, IconChevron, IconCopy, IconGlobe, IconKey, IconMore, IconShare, IconStar, IconTap } from "@/components/icons";
import { Button, Eyebrow, LinkButton, Wordmark } from "@/components/ui";
import { ACCOUNT, ESPN_KEY } from "@/lib/vocab";

const HANDS: Hand[] = ["iphone", "android", "computer"];

/* The device is a fact about the browser, read once; the server guesses a phone. */
const never = () => () => {};
const detected = () => detectHand(navigator.userAgent);
const onTheServer = (): Hand => "iphone";

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

/** One step of the walk: a numeral, an icon in a chrome ring, a title, then its lines. */
function Step({
  n,
  icon,
  title,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3.5 rounded-[var(--radius-card)] border border-line-2 bg-paper p-4">
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-2 bg-soft text-ink-2"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="eyebrow">{ESPN_KEY.step(n)}</div>
        <h2 className="display mt-0.5 text-[20px] leading-tight">{title}</h2>
        <div className="mt-2 text-[14px] leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

/** A row of the phone's own buttons, so the reader recognises what to tap before reading it. */
function Taps({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="mb-2 flex flex-wrap items-center gap-1.5">
      {children}
    </span>
  );
}
function Tap({ icon, label }: { icon?: React.ReactNode; label?: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-2 bg-soft px-2.5 text-[12px] font-bold text-ink">
      {icon}
      {label}
    </span>
  );
}
function Then() {
  return <IconChevron size={12} strokeWidth={2.6} className="text-muted" />;
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
  const saved = parseEspnKeyReturn(hash) !== null;
  const guessed = useSyncExternalStore(never, detected, onTheServer);
  const [picked, setPicked] = useState<Hand | null>(null);
  const hand = picked ?? guessed;
  const [copied, setCopied] = useState<"key" | "note" | "failed" | null>(null);
  const [showKey, setShowKey] = useState(false);
  const keyBox = useRef<HTMLTextAreaElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);

  // The landing: the bookmark has just brought us back. Save the key to this device, then
  // leave for /connect with a `replace`, which takes the fragment out of history with this
  // entry: no history row, no share sheet and no screenshot of the walk carries it.
  // The league ESPN's page named wins over the one the walk was opened for; the team rides
  // along so /connect can pick it.
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

  const bookmarklet = origin ? buildEspnKeyBookmarklet(espnKeyReturnUrl(origin, leagueId), leagueId) : "";
  const note = ESPN_KEY.commissioner.note(leagueId || "…");

  async function copyKey() {
    const ok = await copyText(bookmarklet, keyBox.current);
    setCopied(ok ? "key" : "failed");
    if (!ok) setShowKey(true);
  }
  async function copyNote() {
    const ok = await copyText(note, noteBox.current);
    setCopied(ok ? "note" : "failed");
  }

  const saveLines = ESPN_KEY.save[hand];

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
        {saved ? (
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
              <p className="mt-2 max-w-[24rem] text-[15px] leading-relaxed text-muted">{ESPN_KEY.lead}</p>
              <p className="mt-1.5 text-[13px] font-semibold text-ink-2">{ESPN_KEY.time}</p>
            </div>

            {/* Which device. Guessed from the browser, always correctable. */}
            <div className="mt-6">
              <div className="eyebrow" id="hand-label">
                {ESPN_KEY.handAria}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="hand-label">
                {HANDS.map((h) => {
                  const on = hand === h;
                  return (
                    <button
                      key={h}
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPicked(h)}
                      className={`min-h-11 rounded-full border px-3 text-[14px] font-bold transition-colors ${
                        on ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper text-ink hover:bg-soft"
                      }`}
                    >
                      {ESPN_KEY.hand[h]}
                    </button>
                  );
                })}
              </div>
            </div>

            <ol className="mt-5 grid gap-2.5">
              <Step n={1} icon={<IconKey size={20} />} title={ESPN_KEY.copy.title}>
                <p>{ESPN_KEY.copy.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="start" onClick={copyKey} disabled={!bookmarklet} data-testid="copy-key">
                    <IconCopy size={16} strokeWidth={2.2} />
                    {ESPN_KEY.copy.button}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="min-h-11 text-[13px] font-semibold text-muted underline underline-offset-4"
                    aria-expanded={showKey}
                  >
                    {showKey ? ESPN_KEY.copy.hide : ESPN_KEY.copy.show}
                  </button>
                </div>
                {copied === "key" && (
                  <p role="status" className="mt-2 text-[13px] font-semibold text-start">
                    {ESPN_KEY.copy.copied}
                  </p>
                )}
                {copied === "failed" && (
                  <p role="status" className="mt-2 text-[13px] font-semibold text-sit">
                    {ESPN_KEY.copy.failed}
                  </p>
                )}
                {/* Off screen unless asked for, but always in the DOM so the copy fallback has a box to select. */}
                <textarea
                  ref={keyBox}
                  readOnly
                  value={bookmarklet}
                  aria-label={ESPN_KEY.copy.keyAria}
                  spellCheck={false}
                  onFocus={(e) => e.currentTarget.select()}
                  className={
                    showKey
                      ? "mt-3 h-28 w-full resize-none rounded-xl border border-line-2 bg-soft p-3 font-mono text-[11px] leading-snug text-ink-2"
                      : "sr-only"
                  }
                />
              </Step>

              <Step n={2} icon={<IconBookmark size={20} />} title={ESPN_KEY.save.title}>
                {hand === "iphone" && (
                  <Taps>
                    <Tap icon={<IconShare size={14} strokeWidth={2.2} />} label={ESPN_KEY.taps.share} />
                    <Then />
                    <Tap icon={<IconBookmark size={14} strokeWidth={2.2} />} label={ESPN_KEY.taps.addBookmark} />
                    <Then />
                    <Tap label={ESPN_KEY.taps.save} />
                  </Taps>
                )}
                {hand === "android" && (
                  <Taps>
                    <Tap icon={<IconMore size={14} strokeWidth={2.2} />} />
                    <Then />
                    <Tap icon={<IconStar size={14} strokeWidth={2.2} />} />
                    <Then />
                    <Tap icon={<IconMore size={14} strokeWidth={2.2} />} />
                    <Then />
                    <Tap label={ESPN_KEY.taps.bookmarks} />
                  </Taps>
                )}
                <ol className="list-decimal space-y-1.5 pl-5">
                  {saveLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
                <p className="mt-2 text-[12px] text-muted">
                  <span className="font-mono text-ink">{KEY_NAME}</span>
                </p>
              </Step>

              <Step n={3} icon={<IconGlobe size={20} />} title={ESPN_KEY.open.title}>
                <p>{ESPN_KEY.open.body}</p>
                <div className="mt-3">
                  <a
                    href={ESPN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-2 bg-paper px-5 text-[14px] font-bold text-ink hover:bg-soft"
                    data-testid="open-espn"
                  >
                    {ESPN_KEY.open.button}
                    <IconChevron size={13} strokeWidth={2.8} />
                  </a>
                </div>
              </Step>

              <Step n={4} icon={<IconTap size={20} />} title={ESPN_KEY.tap.title}>
                <p>{ESPN_KEY.tap[hand]}</p>
              </Step>
            </ol>

            <p className="mt-4 text-[12px] leading-relaxed text-muted">{ESPN_KEY.privacy}</p>

            {/* The other two doors. */}
            <section className="mt-8">
              <Eyebrow>{ESPN_KEY.other}</Eyebrow>
              <div className="mt-3 grid gap-2.5">
                <div className="rounded-[var(--radius-card)] border border-line-2 bg-paper p-4">
                  <h2 className="display text-[18px] leading-tight">{ESPN_KEY.commissioner.title}</h2>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{ESPN_KEY.commissioner.body}</p>
                  <div className="mt-3">
                    <Button variant="secondary" onClick={copyNote} data-testid="copy-note">
                      <IconCopy size={16} strokeWidth={2.2} />
                      {ESPN_KEY.commissioner.button}
                    </Button>
                  </div>
                  {copied === "note" && (
                    <p role="status" className="mt-2 text-[13px] font-semibold text-start">
                      {ESPN_KEY.commissioner.copied}
                    </p>
                  )}
                  <textarea ref={noteBox} readOnly value={note} aria-hidden tabIndex={-1} className="sr-only" />
                </div>
                <div className="rounded-[var(--radius-card)] border border-line-2 bg-paper p-4">
                  <h2 className="display text-[18px] leading-tight">{ESPN_KEY.paste.title}</h2>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{ESPN_KEY.paste.body}</p>
                  <div className="mt-3">
                    <LinkButton
                      href={leagueId ? `/connect?platform=espn&id=${encodeURIComponent(leagueId)}&paste=1` : "/connect?platform=espn&paste=1"}
                      variant="secondary"
                    >
                      {ESPN_KEY.paste.button}
                    </LinkButton>
                  </div>
                </div>
              </div>
            </section>

            {session.signedIn && (
              <p className="mt-8 text-[13px] text-muted">
                <Link href="/account" className="font-semibold text-ink underline underline-offset-4">
                  {ACCOUNT.backAccount}
                </Link>
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
