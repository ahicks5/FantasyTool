import Link from "next/link";
import type { Confidence, Verdict } from "@/lib/types";
import { confidenceClass, verdictClass } from "@/lib/format";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-paper p-4 ${className}`}>{children}</div>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold tracking-tight">{children}</h2>;
}

export function ConfidencePill({ value }: { value: Confidence }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${confidenceClass(value)}`}>
      {value}
    </span>
  );
}

export function VerdictWord({ value, className = "" }: { value: Verdict; className?: string }) {
  return <span className={`font-black uppercase tracking-tight ${verdictClass(value)} ${className}`}>{value}</span>;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`}>
      edge<span className="text-start">.</span>
    </span>
  );
}

type BtnProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
};

const BTN =
  "btn inline-flex items-center justify-center rounded-xl px-5 py-3 text-base font-bold transition active:scale-[0.98] disabled:opacity-50";
const VARIANTS = {
  primary: "bg-ink text-white hover:bg-black",
  secondary: "bg-paper text-ink border-2 border-ink hover:bg-soft",
  danger: "bg-sit text-white",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${BTN} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ children, href, variant = "primary", className = "" }: BtnProps & { href: string }) {
  return (
    <Link href={href} className={`${BTN} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p className="py-10 text-center text-muted">{label}</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl border border-sit bg-sit-soft p-4 text-sit">{message}</div>;
}

export function InjuryTag({ status }: { status: string | null }) {
  if (!status) return null;
  const short = status === "Questionable" ? "Q" : status === "Doubtful" ? "D" : status;
  return <span className="ml-1 rounded bg-sit-soft px-1 text-[11px] font-bold text-sit">{short}</span>;
}
