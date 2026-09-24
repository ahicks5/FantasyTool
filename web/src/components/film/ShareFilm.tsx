"use client";
/**
 * Turns last week's replay cover into a public link. Free, no account, like a Lock card:
 * the cover and the share card stay free (SPEC-FILM D2), and a result is the thing a
 * league chat actually wants to see on a Tuesday.
 *
 * What travels is the cover and at most one player (the one who carried the week, with
 * what he scored). The story stays in the app; `edge/api/share.film_snapshot` strips
 * anything else the body carries.
 */
import { useState } from "react";
import { createShare } from "@/lib/api";
import type { FilmShare } from "@/lib/types";
import { FILM } from "@/lib/vocab";
import { Button, ErrorBox } from "../ui";

export function ShareFilm({ film, leagueName, week }: { film: FilmShare; leagueName: string; week: number }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const r = await createShare({ kind: "film", film, league_name: leagueName, week });
      setUrl(r.url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(FILM.share.copyFail);
    }
  }

  if (!url)
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={make} busy={busy} className="w-full">
          {busy ? FILM.share.busy : FILM.share.button}
        </Button>
        {error ? <div className="mt-2"><ErrorBox error={error} /></div> : null}
      </div>
    );
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-soft p-2">
      <code className="min-w-0 flex-1 truncate px-1 text-[13px]">{url}</code>
      <Button size="sm" onClick={copy}>
        {copied ? FILM.share.copied : FILM.share.copy}
      </Button>
    </div>
  );
}
