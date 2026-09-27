"use client";
/** The landing page's follow-along bar: the clock and the one door, once the first button has scrolled away. */

import { useEffect, useState } from "react";
import { Countdown, LinkButton } from "./ui";
import { LANDING } from "@/lib/vocab";

/**
 * A page this long asks more than once, and the ask has to be reachable wherever the
 * thumb is. The bar appears when the hero's button leaves the screen and goes away
 * again when the closing button arrives, so the reader never sees two doors at once.
 *
 * It watches the two buttons by id rather than the scroll position: a pixel threshold
 * would have to know the hero's height, which changes with the width of the phone.
 * Without IntersectionObserver (an old WebView) it never shows, which is the safe
 * failure: the page still has its two buttons.
 */
export function LandingBar({ heroId, closeId, href }: { heroId: string; closeId: string; href: string }) {
  const [heroSeen, setHeroSeen] = useState(true);
  const [closeSeen, setCloseSeen] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.getElementById(heroId);
    const close = document.getElementById(closeId);
    if (!hero || !close) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) setHeroSeen(e.isIntersecting);
        if (e.target === close) setCloseSeen(e.isIntersecting);
      }
    });
    io.observe(hero);
    io.observe(close);
    return () => io.disconnect();
  }, [heroId, closeId]);

  const show = !heroSeen && !closeSeen;
  return (
    // `inert` keeps the door out of the tab order while the bar is below the fold, so a
    // keyboard cannot focus a button it cannot see.
    <div className={`landing-bar ${show ? "landing-bar-on" : ""}`} aria-hidden={!show} inert={!show} data-testid="landing-bar">
      <div className="landing-bar-inner">
        {/* The clock carries its own word (Kickoff, Soon, Last call), so nothing is printed over it. */}
        <Countdown className="min-w-0" />
        <LinkButton href={href} variant="start" size="sm" className="shrink-0">
          {LANDING.bar.cta}
        </LinkButton>
      </div>
    </div>
  );
}
