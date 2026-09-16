// API client for docs/API.md. With NEXT_PUBLIC_API_URL unset, every call is
// served from src/lib/mocks.ts; when set, it fetches `${NEXT_PUBLIC_API_URL}/api/...`.
import type {
  CheckoutResponse,
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

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const USE_MOCKS = API_URL === "";

const MOCK_ENTITLEMENTS_KEY = "edge.mock.entitlements";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

function mockExtraEntitlements(): Feature[] {
  try {
    const raw = window.localStorage.getItem(MOCK_ENTITLEMENTS_KEY);
    return raw ? (JSON.parse(raw) as Feature[]) : [];
  } catch {
    return [];
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

export async function getLineup(platform: Platform, leagueId: string, teamId: string): Promise<Lineup> {
  if (USE_MOCKS) return mocks.lineupFor(teamId);
  return request<Lineup>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/lineup`);
}

export async function getWaivers(platform: Platform, leagueId: string, teamId: string): Promise<Waivers> {
  if (USE_MOCKS) return mocks.WAIVERS;
  return request<Waivers>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/waivers`);
}

export async function evaluateTrade(platform: Platform, leagueId: string, req: TradeRequest): Promise<TradeResult> {
  if (USE_MOCKS) return mocks.evaluateTrade(req);
  return request<TradeResult>(`/league/${platform}/${encodeURIComponent(leagueId)}/trade`, { method: "POST", body: JSON.stringify(req) });
}

export async function getReport(platform: Platform, leagueId: string, teamId: string): Promise<Report> {
  if (USE_MOCKS) return mocks.reportFor(teamId);
  return request<Report>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/report`);
}
