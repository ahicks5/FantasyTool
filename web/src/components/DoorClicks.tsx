"use client";
/** Counts which of the landing page's sign-up buttons was pressed: one `cta_click` per press, named by the `data-door` around it. */

import { useEffect } from "react";
import { logDoor } from "@/lib/api";
import { doorOf } from "@/lib/track";

/**
 * One listener for the whole page rather than an onClick on every button, so the doors
 * can stay server-rendered links: a button only has to sit inside a `data-door` to be
 * counted. Only a press on a link counts, so tapping the words beside a button does not.
 * Capture phase, so it runs before Next's link handler starts the navigation.
 */
export function DoorClicks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const door = doorOf(e.target);
      if (door) logDoor(door);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
