"use client";
/**
 * A player headshot. Initials are painted underneath rather than swapped in on error, so a
 * slow or missing image never leaves an empty circle.
 */

import { useState } from "react";

const SIZES = { xs: "h-5 w-5 text-[8px]", sm: "h-9 w-9 text-[11px]", md: "h-12 w-12 text-xs", lg: "h-[52px] w-[52px] text-sm", xl: "h-20 w-20 text-lg" };
const RINGS = { start: "ring-start", sit: "ring-sit", flip: "ring-flip-fill", lean: "ring-lean" };

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z' .-]/g, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

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
  ring?: keyof typeof RINGS;
}) {
  const [broken, setBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  // A team logo is a centred mark, not a face: crop it and you lose the badge.
  const isLogo = !!photo && photo === teamLogo;
  const ringCls = ring ? `${RINGS[ring]} ring-2 ring-offset-2 ring-offset-[var(--color-paper)]` : "";
  return (
    <span className={`relative inline-block shrink-0 ${className}`}>
      <span className={`relative flex items-center justify-center overflow-hidden rounded-full bg-soft font-black text-muted ${SIZES[size]} ${ringCls}`}>
        <span aria-hidden>{initials(name)}</span>
        {photo && !broken && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            loading="eager"
            decoding="async"
            onError={() => setBroken(true)}
            className={`absolute inset-0 h-full w-full ${isLogo ? "object-contain p-1.5" : "object-cover object-top"}`}
          />
        )}
      </span>
      {teamLogo && !isLogo && !logoBroken && size !== "sm" && size !== "xs" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={teamLogo}
          alt=""
          loading="eager"
          decoding="async"
          onError={() => setLogoBroken(true)}
          className="absolute -bottom-1 -right-1 h-[18px] w-[18px] rounded-full bg-paper p-[2px] shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
        />
      )}
    </span>
  );
}
