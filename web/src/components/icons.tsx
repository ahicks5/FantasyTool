/** Line icons at a common 24px grid. Emoji read as placeholder art in a paid product. */
type P = { className?: string; size?: number; strokeWidth?: number };

function Svg({ children, className = "", size = 22, strokeWidth = 1.9 }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <Svg {...p}><path d="M3 11.4 12 4l9 7.4" /><path d="M5.5 10v9.5a.5.5 0 0 0 .5.5h3.5V15h5v5H18a.5.5 0 0 0 .5-.5V10" /></Svg>
);
export const IconTeam = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="5" rx="1.5" /><rect x="3" y="12" width="18" height="5" rx="1.5" /><path d="M7 20h10" /></Svg>
);
export const IconWaivers = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconTrade = (p: P) => (
  <Svg {...p}><path d="M4 8.5h13l-3.2-3.2M20 15.5H7l3.2 3.2" /></Svg>
);
export const IconReport = (p: P) => (
  <Svg {...p}><path d="M6 3.5h8l5 5v12H6z" /><path d="M14 3.5V9h5" /><path d="M9.5 13.5h5M9.5 17h5" /></Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" /></Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}><path d="M4.5 12.5 9.5 17.5 19.5 6.5" /></Svg>
);
export const IconArrowUp = (p: P) => (
  <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
);
export const IconSun = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" /></Svg>
);
export const IconMoon = (p: P) => (
  <Svg {...p}><path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5Z" /></Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}><path d="M9 5.5 15.5 12 9 18.5" /></Svg>
);

/**
 * The crown. The mark itself, traced from the logo: three sharp peaks over a
 * flared body and a separate band beneath it.
 *
 * Filled rather than stroked, unlike everything else here, because the logo is a
 * solid silhouette and a hairline outline of it turns to mush below ~20px. It
 * inks in `currentColor`, so it takes the chrome gradient from a parent with
 * `.chrome-type` exactly like the letters do.
 */
export const IconCrown = ({ className = "", size = 22 }: { className?: string; size?: number | string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path d="M2.6 18 4.2 5 8.2 11 12 3.2 15.8 11 19.8 5 21.4 18Z" />
    <path d="M3.4 19.4h17.2v2.2H3.4z" />
  </svg>
);

/* The section set: a call sheet, a depth-chart board, the wire, the film. */

export const IconSheet = (p: P) => (
  <Svg {...p}><rect x="4.5" y="3.5" width="15" height="17" rx="2" /><path d="M9 3.5V6h6V3.5" /><path d="M8.5 11h7M8.5 15h4.5" /></Svg>
);
export const IconWire = (p: P) => (
  <Svg {...p}><path d="M12 13.5V21" /><circle cx="12" cy="11" r="1.6" /><path d="M8.6 14.4a4.8 4.8 0 0 1 0-6.8M15.4 7.6a4.8 4.8 0 0 1 0 6.8" /><path d="M5.8 17.2a8.8 8.8 0 0 1 0-12.4M18.2 4.8a8.8 8.8 0 0 1 0 12.4" /></Svg>
);
export const IconFilm = (p: P) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 5v14M16 5v14" /><path d="M3 12h18" /></Svg>
);
export const IconHeadset = (p: P) => (
  <Svg {...p}><path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" /><rect x="2.8" y="13.5" width="4" height="6" rx="1.8" /><rect x="17.2" y="13.5" width="4" height="6" rx="1.8" /><path d="M19.2 19.5v.6a2 2 0 0 1-2 2H13" /></Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" /></Svg>
);

/**
 * The check a coach makes by hand, not the one a form prints: a slightly
 * off-axis tick with an overshoot on the long stroke. `pathLength="1"` lets the
 * `.grease` class draw it with resolution-independent dash maths.
 */
export const IconGreaseCheck = (p: P) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 3}>
    <path d="M3.5 12.8 9 18.4 20.8 4.6" pathLength={1} />
  </Svg>
);

/* A verdict on a call we made. Deliberately a thumb rather than a star or a heart:
   the question is "was this right", not "did you enjoy it". */
export const IconThumbUp = (p: P) => (
  <Svg {...p}><path d="M7 20V10l4.5-6a2 2 0 0 1 3.3 2.1L13.5 9H19a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 18 19H7Z" /><rect x="3" y="10" width="4" height="10" rx="1" /></Svg>
);
export const IconThumbDown = (p: P) => (
  <Svg {...p}><path d="M7 4v10l4.5 6a2 2 0 0 0 3.3-2.1L13.5 15H19a2 2 0 0 0 2-2.3l-1-6A2 2 0 0 0 18 5H7Z" /><rect x="3" y="4" width="4" height="10" rx="1" /></Svg>
);
