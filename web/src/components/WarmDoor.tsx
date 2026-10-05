"use client";
/** The landing page asks the API who is here before the reader reaches the door, so /register opens on the right form at once. */

import { useEffect } from "react";
import { currentMe } from "@/lib/session";

/**
 * The register form picks its first screen from `me.phone_sign_in`. Asked cold, the
 * answer takes a round trip (and a Render cold start can make that many seconds), and
 * until it arrives the door shows the email-and-password form and then swaps it for
 * the phone one under the reader's thumb: three fields and a password for a beat, at
 * the exact moment the page promised "a phone number and a code".
 *
 * `currentMe` caches in the module, and the landing's doors are client-side links, so
 * asking here means the register page mounts already knowing. It also wakes the API.
 * Nothing renders; a failed read changes nothing, the form simply asks again.
 */
export function WarmDoor() {
  useEffect(() => {
    void currentMe();
  }, []);
  return null;
}
