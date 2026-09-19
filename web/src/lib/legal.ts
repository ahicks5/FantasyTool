/**
 * The handful of facts the Terms and Privacy pages cannot work out for themselves.
 *
 * They live here rather than inline in the prose so that filling them in is one file
 * and one deploy, and so `missingLegalConfig()` can say what is still blank. Stripe
 * asks for a reachable support contact and a stated refund policy before it will turn
 * on live payments, so an unfilled value here is a launch blocker, not a detail.
 *
 * Set them as NEXT_PUBLIC_* variables in Vercel (see web/.env.example).
 */
export interface LegalConfig {
  /** Who is on the hook: a legal entity, or the name the business trades under. */
  operator: string;
  /** A mailbox a customer can actually reach, shown on both pages and in Stripe. */
  supportEmail: string;
  /** Governing law, e.g. "the State of Indiana, USA". Omitted from the page if blank. */
  jurisdiction: string;
  /** Date these versions took effect, e.g. "18 September 2026". */
  effective: string;
  /** Days a customer has to ask for a refund. */
  refundDays: number;
}

const env = (name: string): string => (process.env[name] ?? "").trim();

export const LEGAL: LegalConfig = {
  operator: env("NEXT_PUBLIC_LEGAL_OPERATOR") || "Penthouse",
  supportEmail: env("NEXT_PUBLIC_SUPPORT_EMAIL"),
  jurisdiction: env("NEXT_PUBLIC_LEGAL_JURISDICTION"),
  effective: env("NEXT_PUBLIC_LEGAL_EFFECTIVE"),
  refundDays: Number(env("NEXT_PUBLIC_REFUND_DAYS")) || 14,
};

/**
 * Which required values are still blank.
 *
 * `jurisdiction` is not on this list: a governing-law clause is worth having but the
 * pages read correctly without one, and guessing a jurisdiction is worse than omitting
 * it. `operator` has a usable default, so it is not required either.
 */
export function missingLegalConfig(config: LegalConfig = LEGAL): (keyof LegalConfig)[] {
  const missing: (keyof LegalConfig)[] = [];
  if (!config.supportEmail) missing.push("supportEmail");
  if (!config.effective) missing.push("effective");
  return missing;
}

/** True when the legal pages are complete enough to put in front of Stripe's review. */
export function legalIsLaunchReady(config: LegalConfig = LEGAL): boolean {
  return missingLegalConfig(config).length === 0;
}
