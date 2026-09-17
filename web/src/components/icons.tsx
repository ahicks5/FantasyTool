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
