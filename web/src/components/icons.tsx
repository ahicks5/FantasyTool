/** Line icons at a common 24px grid. Emoji read as placeholder art in a paid product. */
import { useId } from "react";
import { MARK_BOX, MARK_D } from "@/lib/mark";

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
/* The ESPN key's walk: the buttons the reader is about to tap, drawn as the phone draws them. */
export const IconShare = (p: P) => (
  <Svg {...p}><path d="M12 3.5v11" /><path d="M8.5 7 12 3.5 15.5 7" /><path d="M7 10.5H5.5v10h13v-10H17" /></Svg>
);
export const IconBookmark = (p: P) => (
  <Svg {...p}><path d="M6.5 4.5h11v16l-5.5-4-5.5 4z" /></Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M5.5 15.5h-1v-11h11v1" /></Svg>
);
export const IconMore = (p: P) => (
  <Svg {...p}><circle cx="12" cy="5.5" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="18.5" r="1.4" fill="currentColor" /></Svg>
);
export const IconStar = (p: P) => (
  <Svg {...p}><path d="m12 3.8 2.5 5.3 5.7.7-4.2 4 1.1 5.7L12 16.7l-5.1 2.8 1.1-5.7-4.2-4 5.7-.7z" /></Svg>
);
export const IconGlobe = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" /></Svg>
);
export const IconTap = (p: P) => (
  <Svg {...p}><path d="M9.5 12.5V6a1.75 1.75 0 0 1 3.5 0v5.5" /><path d="M13 11.5V10a1.75 1.75 0 0 1 3.5 0v2M16.5 12a1.75 1.75 0 0 1 3.5 0v3.5c0 3.3-2.2 5.5-5.5 5.5H13a5 5 0 0 1-4.2-2.3l-3-4.6a1.6 1.6 0 0 1 2.6-1.8l1.1 1.4" /></Svg>
);
export const IconKey = (p: P) => (
  <Svg {...p}><circle cx="8" cy="14.5" r="4" /><path d="M11 12 20 3M16 7l2.5 2.5M13.5 9.5 16 12" /></Svg>
);

/* The poster set: the tiles beside each room's points on the landing page, drawn from the
   kit's own icon squares. Same grid and stroke as everything above. */

/** Four position chips: the roster at a glance. */
export const IconRoster = (p: P) => (
  <Svg {...p}><rect x="3.5" y="4.5" width="7.5" height="6.5" rx="1.6" /><rect x="13" y="4.5" width="7.5" height="6.5" rx="1.6" /><rect x="3.5" y="13" width="7.5" height="6.5" rx="1.6" /><rect x="13" y="13" width="7.5" height="6.5" rx="1.6" /></Svg>
);
/** Three rising bars. */
export const IconBars = (p: P) => (
  <Svg {...p}><path d="M5.5 19.5v-5M12 19.5v-9M18.5 19.5V5" strokeWidth={p.strokeWidth ? p.strokeWidth + 1.2 : 3} /></Svg>
);
export const IconBinoculars = (p: P) => (
  <Svg {...p}><circle cx="6.8" cy="15.5" r="3.6" /><circle cx="17.2" cy="15.5" r="3.6" /><path d="M10.4 15.2h3.2M4.2 12.6 6.6 5.5h2.6l1 4.5M19.8 12.6l-2.4-7.1h-2.6l-1 4.5" /></Svg>
);
export const IconTarget = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></Svg>
);
/** Three heads: the managers across the league, side by side. */
export const IconPeople = (p: P) => (
  <Svg {...p}><circle cx="12" cy="8.5" r="3" /><circle cx="5.6" cy="10" r="2.3" /><circle cx="18.4" cy="10" r="2.3" /><path d="M6.8 19.5a5.2 5.2 0 0 1 10.4 0M2.5 18.6a3.6 3.6 0 0 1 4.6-3.4M21.5 18.6a3.6 3.6 0 0 0-4.6-3.4" /></Svg>
);
export const IconBolt = (p: P) => (
  <Svg {...p}><path d="M13.2 2.8 5.5 13.2h6l-1 8 7.9-10.6h-6.1l.9-7.8Z" /></Svg>
);

/**
 * The mark: the OS monogram (`lib/mark.ts` holds the path and says where its other two
 * copies live). Filled rather than stroked, unlike everything else here, because the logo
 * is a solid silhouette. It inks in `currentColor`, so a parent sets its metal.
 *
 * By default it sits in a 24x24 square and `size` is the square's side, so a slot built
 * for a square mark (the loading ring, the elevator doors, a letterhead) takes it as is.
 * `tight` crops to the ink instead and makes `size` the height, for where the mark sits
 * on a line of type and has to stand as tall as the caps beside it.
 */
export const IconMark = ({ className = "", size = 22, tight = false }: { className?: string; size?: number | string; tight?: boolean }) => {
  const box = tight ? `${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.w} ${MARK_BOX.h}` : "0 0 24 24";
  const ratio = MARK_BOX.w / MARK_BOX.h;
  const width = !tight ? size : typeof size === "number" ? size * ratio : `calc(${size} * ${ratio.toFixed(4)})`;
  return (
    <svg width={width} height={size} viewBox={box} fill="currentColor" fillRule="evenodd" className={className} aria-hidden>
      <path d={MARK_D} />
    </svg>
  );
};

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
/** A bell, for the one banner that interrupts the call sheet. Never decoration. */
export const IconAlarm = (p: P) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5" />
    <path d="M4.2 16.5h15.6" />
    <path d="M10.2 19.4a2 2 0 0 0 3.6 0" />
  </Svg>
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

/** A notepad with a pen across it: the head coach's notes, top-left of the lineup. */
export const IconNotes = (p: P) => (
  <Svg {...p}>
    <path d="M6 3.5h9.5a1.5 1.5 0 0 1 1.5 1.5v6" />
    <path d="M6 3.5A1.5 1.5 0 0 0 4.5 5v14A1.5 1.5 0 0 0 6 20.5h6" />
    <path d="M7.5 8h6M7.5 11.5h4.5M7.5 15h3" />
    <path d="m20.2 12.3 1.5 1.5-6.2 6.2-2.3.8.8-2.3z" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 21V4.5" />
    <path d="M5.5 5h11.2l-1.6 3.4 1.6 3.4H5.5z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 21 19.5H3z" />
    <path d="M12 9.5v4.5M12 16.8v.2" strokeWidth={2.6} />
  </Svg>
);
/** Position Battle: two blades crossed, a spark where they meet. */
export const IconClash = (p: P) => (
  <Svg {...p}>
    <path d="M4 4l9.5 9.5M20 4l-9.5 9.5" />
    <path d="M6.5 16.5 4 19M17.5 16.5 20 19" />
    <path d="M8.5 13.5l2 2M15.5 13.5l-2 2" />
    <path d="M12 2.5v2M9.5 3.5l.8 1.6M14.5 3.5l-.8 1.6" strokeWidth={1.6} />
  </Svg>
);

/**
 * The monogram in metal, for where it is big enough for a gradient to read: the stacked
 * lockup, the elevator doors, the loading ring. The stops are CSS variables (`--mark-*` in
 * globals.css), so it is near-white chrome in the dark room and graphite on paper, and any
 * surface that is dark in both themes pins it silver the way it pins `--chrome`.
 */
export const IconMarkChrome = ({ className = "", size = 22, tight = false }: { className?: string; size?: number | string; tight?: boolean }) => {
  const id = `osm-${useId().replace(/:/g, "")}`;
  const box = tight ? `${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.w} ${MARK_BOX.h}` : "0 0 24 24";
  const ratio = MARK_BOX.w / MARK_BOX.h;
  const width = !tight ? size : typeof size === "number" ? size * ratio : `calc(${size} * ${ratio.toFixed(4)})`;
  return (
    <svg width={width} height={size} viewBox={box} fillRule="evenodd" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" style={{ stopColor: "var(--mark-1)" }} />
          <stop offset="0.34" style={{ stopColor: "var(--mark-2)" }} />
          <stop offset="0.6" style={{ stopColor: "var(--mark-3)" }} />
          <stop offset="0.8" style={{ stopColor: "var(--mark-4)" }} />
          <stop offset="1" style={{ stopColor: "var(--mark-1)" }} />
        </linearGradient>
      </defs>
      <path d={MARK_D} fill={`url(#${id})`} />
    </svg>
  );
};
