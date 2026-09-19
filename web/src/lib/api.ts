// API client for docs/API.md. With NEXT_PUBLIC_API_URL unset, every call is
// served from src/lib/mocks.ts; when set, it fetches `${NEXT_PUBLIC_API_URL}/api/...`.
import type {
  ActionFeed,
  ShareResponse,
  TradeFinderResponse,
  WaiverPlanResponse,
  CheckoutResponse,
  FeedbackRequest,
  PaywallDetail,
  Roster,
  ConnectRequest,
  Feature,
  LeagueSummary,
  Lineup,
  Me,
  Platform,
  ProductsResponse,
  Report,
  Sku,
  SleeperLeagueRef,
  TradeRequest,
  TradeResult,
  Waivers,
} from "./types";
import * as mocks from "./mocks";
import { espnAuthHeaders } from "./espnAuth";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const USE_MOCKS = API_URL === "";

const MOCK_ENTITLEMENTS_KEY = "booth.mock.entitlements";

/** Thrown on HTTP 402: the feature needs a purchase. Carries the products that unlock it. */
export class PaywallError extends Error {
  feature: string;
  teaser: string | null;
  upsell: PaywallDetail["upsell"];
  constructor(d: PaywallDetail) {
    super(d.error);
    this.name = "PaywallError";
    this.feature = d.feature;
    this.teaser = d.teaser ?? null;
    this.upsell = d.upsell;
  }
}

/**
 * Thrown on HTTP 403 from a private ESPN league. `needsAuth` says which question to ask:
 * true means we have no cookies for this league, false means the ones we sent were rejected.
 */
export class EspnAuthError extends Error {
  needsAuth: boolean;
  constructor(message: string, needsAuth: boolean) {
    super(message);
    this.name = "EspnAuthError";
    this.needsAuth = needsAuth;
  }
}

/**
 * Auth headers for the API. Dev: NEXT_PUBLIC_DEV_USER → X-Edge-User (API must run with EDGE_DEV=1).
 * Prod: Supabase session → Authorization: Bearer <jwt>.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const dev = process.env.NEXT_PUBLIC_DEV_USER;
  if (dev) return { "X-Edge-User": dev };
  try {
    const { getAccessToken } = await import("./supabase");
    const token = await getAccessToken();
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    /* supabase not configured */
  }
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    // ESPN cookies go on every call, because any of them may hit a private league. They are
    // headers, not query params, so they stay out of URLs, logs and referrers.
    headers: { "Content-Type": "application/json", ...auth, ...espnAuthHeaders(), ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    detail?: string | PaywallDetail | { error: string; needs_espn_auth?: boolean };
  };
  if (!res.ok) {
    const d = body?.detail;
    if (res.status === 402 && d && typeof d === "object" && "upsell" in d) throw new PaywallError(d as PaywallDetail);
    if (res.status === 403 && d && typeof d === "object" && "needs_espn_auth" in d) {
      throw new EspnAuthError(d.error, d.needs_espn_auth !== false);
    }
    if (res.status === 401) throw new Error("Sign in to continue.");
    throw new Error(typeof d === "string" ? d : (body?.error ?? `HTTP ${res.status}`));
  }
  return body;
}

const ALL_FEATURES: Feature[] = ["my_team", "waivers", "trade_lab", "full_report"];

/**
 * What the demo build pretends you have bought.
 *
 * **Mock-path only.** Everything here runs inside `if (USE_MOCKS)`, which is only true when
 * `NEXT_PUBLIC_API_URL` is unset. The moment a real API is configured, entitlements come from
 * `GET /api/me` and the server gates every paid route with a 402 — nothing in this file can
 * open a paid feature against a real backend.
 *
 * The demo defaults to **everything unlocked**, so the deployed site can be clicked through
 * end to end without hitting a paywall over fake data. Two switches, both sticky:
 *
 *   ?lock=1    back to the free tier, to see the locked states and the upsell
 *   ?unlock=1  everything again
 */
function mockExtraEntitlements(): Feature[] {
  if (typeof window === "undefined") return ALL_FEATURES;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has("lock")) {
      window.localStorage.setItem(MOCK_ENTITLEMENTS_KEY, JSON.stringify([]));
      return [];
    }
    if (q.has("unlock")) {
      window.localStorage.setItem(MOCK_ENTITLEMENTS_KEY, JSON.stringify(ALL_FEATURES));
      return ALL_FEATURES;
    }
    const raw = window.localStorage.getItem(MOCK_ENTITLEMENTS_KEY);
    // A stored empty array is a deliberate ?lock=1, not an absence — respect it.
    return raw ? (JSON.parse(raw) as Feature[]) : ALL_FEATURES;
  } catch {
    return ALL_FEATURES;
  }
}

export async function getProducts(): Promise<ProductsResponse> {
  if (USE_MOCKS) return { products: mocks.PRODUCTS };
  return request<ProductsResponse>("/products");
}

export async function getMe(): Promise<Me> {
  if (USE_MOCKS) {
    const extra = mockExtraEntitlements();
    return { ...mocks.ME, entitlements: Array.from(new Set([...mocks.ME.entitlements, ...extra])) };
  }
  return request<Me>("/me");
}

/** Mock: alerts, then grants the product's features locally so the page can be viewed. */
export async function checkout(sku: Sku): Promise<CheckoutResponse> {
  if (USE_MOCKS) {
    const product = mocks.PRODUCTS.find((p) => p.sku === sku);
    window.alert(`Mock checkout: ${product?.name ?? sku}. In production this opens Stripe Checkout.`);
    try {
      const current = mockExtraEntitlements();
      window.localStorage.setItem(MOCK_ENTITLEMENTS_KEY, JSON.stringify([...current, ...(product?.features ?? [])]));
    } catch {
      /* ignore */
    }
    return { url: "" };
  }
  return request<CheckoutResponse>("/checkout", { method: "POST", body: JSON.stringify({ sku }) });
}

export async function getSleeperLeagues(username: string): Promise<SleeperLeagueRef[]> {
  if (USE_MOCKS) return mocks.SLEEPER_LEAGUES;
  return request<SleeperLeagueRef[]>(`/sleeper/leagues?username=${encodeURIComponent(username)}`);
}

export async function getLeague(platform: Platform, leagueId: string): Promise<LeagueSummary> {
  if (USE_MOCKS) return { ...mocks.LEAGUE, id: leagueId, platform };
  return request<LeagueSummary>(`/league/${platform}/${encodeURIComponent(leagueId)}`);
}

export async function connect(req: ConnectRequest): Promise<void> {
  if (USE_MOCKS) return;
  await request<unknown>("/connect", { method: "POST", body: JSON.stringify(req) });
}

export async function getActions(platform: Platform, leagueId: string, teamId: string): Promise<ActionFeed> {
  if (USE_MOCKS) {
    const me = await getMe();
    return mocks.actionsFor(teamId, me.entitlements);
  }
  return request<ActionFeed>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/actions`);
}

export async function sendFeedback(req: FeedbackRequest): Promise<void> {
  if (USE_MOCKS) return;
  await request<unknown>("/feedback", { method: "POST", body: JSON.stringify(req) });
}

export async function getRoster(platform: Platform, leagueId: string, teamId: string): Promise<Roster> {
  if (USE_MOCKS) {
    const l = mocks.lineupFor(teamId);
    const players = [...l.slots.map((s) => s.player), ...l.bench.map((b) => b.player)].filter((p): p is NonNullable<typeof p> => !!p);
    return { team: { id: teamId, name: mocks.LEAGUE.teams.find((t) => t.id === teamId)?.name ?? teamId }, players, starters: [] };
  }
  return request<Roster>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/roster`);
}

export async function getLineup(platform: Platform, leagueId: string, teamId: string): Promise<Lineup> {
  if (USE_MOCKS) return mocks.lineupFor(teamId);
  return request<Lineup>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/lineup`);
}

export async function getWaivers(platform: Platform, leagueId: string, teamId: string): Promise<Waivers> {
  if (USE_MOCKS) return mocks.WAIVERS;
  return request<Waivers>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/waivers`);
}

export async function getWaiverPlan(platform: Platform, leagueId: string, teamId: string): Promise<WaiverPlanResponse> {
  if (USE_MOCKS) return mocks.WAIVER_PLAN;
  return request<WaiverPlanResponse>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/waivers/plan`);
}

export async function findTrades(platform: Platform, leagueId: string, teamId: string): Promise<TradeFinderResponse> {
  if (USE_MOCKS) return mocks.TRADE_FINDER;
  return request<TradeFinderResponse>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/trades/find`);
}

export async function createShare(body: {
  graphic: unknown;
  explanation: string;
  league_name: string;
  week: number;
  give_players: unknown[];
  get_players: unknown[];
}): Promise<ShareResponse> {
  if (USE_MOCKS) return { id: "demo1234", url: `${window.location.origin}/s/demo1234` };
  return request<ShareResponse>("/share", { method: "POST", body: JSON.stringify(body) });
}

export async function evaluateTrade(platform: Platform, leagueId: string, req: TradeRequest): Promise<TradeResult> {
  if (USE_MOCKS) return mocks.evaluateTrade(req);
  return request<TradeResult>(`/league/${platform}/${encodeURIComponent(leagueId)}/trade`, { method: "POST", body: JSON.stringify(req) });
}

export async function getReport(platform: Platform, leagueId: string, teamId: string): Promise<Report> {
  if (USE_MOCKS) return mocks.reportFor(teamId);
  return request<Report>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/report`);
}
