"use client";
import { useState } from "react";

const SIZES = { sm: "h-9 w-9 text-xs", md: "h-12 w-12 text-sm", lg: "h-16 w-16 text-base", xl: "h-24 w-24 text-xl" };

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z' .-]/g, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/**
 * Player headshot with initials always painted underneath, so a slow or missing photo never
 * shows an empty circle. Photos come from free CDNs (Sleeper / ESPN) via the API's `photo`
 * field; the team logo sits in the corner.
 */
export function Avatar({
  name,
  photo,
  teamLogo,
  size = "md",
  className = "",
  ring,
}: {
  name: string;
  photo?: string | null;
  teamLogo?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: "start" | "sit" | "flip" | "lean";
}) {
  const [broken, setBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const ringCls = ring ? { start: "ring-start", sit: "ring-sit", flip: "ring-flip", lean: "ring-lean" }[ring] + " ring-2 ring-offset-2" : "";
  return (
    <span className={`relative inline-block shrink-0 ${className}`}>
      <span className={`relative flex items-center justify-center overflow-hidden rounded-full bg-soft font-black text-muted ${SIZES[size]} ${ringCls}`}>
        <span aria-hidden>{initials(name)}</span>
        {photo && !broken && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover object-top" />
        )}
      </span>
      {teamLogo && !logoBroken && size !== "sm" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={teamLogo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setLogoBroken(true)}
          className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-white p-0.5 shadow"
        />
      )}
    </span>
  );
}
