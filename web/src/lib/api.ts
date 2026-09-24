// API client for docs/API.md. With NEXT_PUBLIC_API_URL unset, every call is
// served from src/lib/mocks.ts; when set, it fetches `${NEXT_PUBLIC_API_URL}/api/...`.
import type {
  MeLeague as AccountLeague,
  ActionFeed,
  AdminUsersResponse,
  AuthResponse,
  Desk,
  Plan,
  EmailPref,
  Standings,
  ShareKind,
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
  SeasonRecap,
  FilmSeason,
  FilmCover,
  LeagueFilm,
  TeamGrades,
  PlayerHit,
  PlayerProfile,
  PlayerBoard,
  BoardQuery,
  LensCounts,
  Role,
  UpgradeResponse,
} from "./types";
import * as mocks from "./mocks";
import { espnAuthHeaders } from "./espnAuth";
import { clearToken, loadToken, saveToken } from "./auth";
import { HttpError } from "./errors";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const USE_MOCKS = API_URL === "";

const MOCK_ENTITLEMENTS_KEY = "booth.mock.entitlements";

/** Thrown on HTTP 402: the feature needs a purchase. Carries the products that unlock it. */
export class PaywallError extends Error {
  feature: string;
  teaser: string | null;
  upsell: PaywallDetail["upsell"];
  cover: FilmCover | null;
  constructor(d: PaywallDetail) {
    super(d.error);
    this.name = "PaywallError";
    this.feature = d.feature;
    this.teaser = d.teaser ?? null;
    this.upsell = d.upsell;
    this.cover = d.cover ?? null;
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
 * Auth headers for the API. A session token from `lib/auth.ts` wins: Authorization: Bearer.
 * Dev, with no token: NEXT_PUBLIC_DEV_USER → X-Edge-User (the API must run with EDGE_DEV=1).
 */
export function getAuthHeaders(): Record<string, string> {
  const token = typeof window === "undefined" ? null : loadToken();
  if (token) return { Authorization: `Bearer ${token}` };
  const dev = process.env.NEXT_PUBLIC_DEV_USER;
  if (dev) return { "X-Edge-User": dev };
  return {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = getAuthHeaders();
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
    if (res.status === 401) {
      // The API says which: a token that has died reads differently from no token at all.
      throw new HttpError(401, typeof d === "string" && /expired/.test(d) ? "Your session expired. Sign in again." : "Sign in to continue.");
    }
    throw new HttpError(res.status, typeof d === "string" ? d : (body?.error ?? `HTTP ${res.status}`));
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
  if (USE_MOCKS) return mockMe();
  return request<Me>("/me");
}

/** Mock: alerts, then grants the product's features locally so the page can be viewed. */
/**
 * Open Stripe Checkout. `returnTo` is the path the buyer should come back to — normally
 * the page they were on, so a waiver pass does not land them on the lineup. Stripe gets
 * it with `?paid=<sku>` appended, which the app shell uses to wait for the entitlement.
 */
export async function checkout(sku: Sku, returnTo?: string): Promise<CheckoutResponse> {
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
  const body: { sku: Sku; success_url?: string; cancel_url?: string } = { sku };
  if (returnTo && typeof window !== "undefined") {
    const origin = window.location.origin;
    const sep = returnTo.includes("?") ? "&" : "?";
    body.success_url = `${origin}${returnTo}${sep}paid=${encodeURIComponent(sku)}`;
    body.cancel_url = `${origin}${returnTo}${sep}canceled=1`;
  }
  return request<CheckoutResponse>("/checkout", { method: "POST", body: JSON.stringify(body) });
}

/* ------------------------------------------------------------------ the account ---
   Register, sign in, sign out, reset, upgrade. The mock path keeps a fake account under
   `booth.mock.user` so the demo can be clicked through; nothing in it reaches a backend. */

const MOCK_USER_KEY = "booth.mock.user";

function mockUser(): string | null {
  try {
    const v = window.localStorage.getItem(MOCK_USER_KEY);
    // Unset means the demo's default signed-in visitor; "" means they signed out.
    return v === null ? mocks.ME.email : v || null;
  } catch {
    return mocks.ME.email;
  }
}

function mockMe(): Me {
  const email = mockUser();
  const extra = mockExtraEntitlements();
  const premium = extra.length > mocks.ME.entitlements.length;
  if (!email) return { ...mocks.ME, email: null, signed_in: false, leagues: [], account: null, entitlements: mocks.ME.entitlements };
  return {
    ...mocks.ME,
    email,
    entitlements: Array.from(new Set([...mocks.ME.entitlements, ...extra])),
    account: {
      ...mocks.ME.account!,
      email,
      name: email.split("@")[0],
      plan: premium ? { tier: "premium", name: "The Penthouse", skus: ["full_report"] } : { tier: "free", name: "Free", skus: [] },
    },
  };
}

function mockSignIn(email: string): AuthResponse {
  try {
    window.localStorage.setItem(MOCK_USER_KEY, email.trim().toLowerCase());
  } catch {
    /* ignore */
  }
  saveToken("mock-session");
  return { token: "mock-session", me: mockMe() };
}

export async function register(email: string, password: string, name = ""): Promise<AuthResponse> {
  if (USE_MOCKS) return mockSignIn(email);
  const out = await request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) });
  saveToken(out.token);
  return out;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  if (USE_MOCKS) return mockSignIn(email);
  const out = await request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  saveToken(out.token);
  return out;
}

export async function logout(): Promise<void> {
  if (USE_MOCKS) {
    try {
      window.localStorage.setItem(MOCK_USER_KEY, "");
    } catch {
      /* ignore */
    }
    clearToken();
    return;
  }
  try {
    await request<unknown>("/auth/logout", { method: "POST" });
  } finally {
    // The token goes whatever the API said: a sign-out that fails on the wire still signs out here.
    clearToken();
  }
}

export async function forgotPassword(email: string): Promise<{ ok: boolean; sent: boolean }> {
  if (USE_MOCKS) return { ok: true, sent: false };
  return request("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
}

export async function resetPassword(token: string, password: string): Promise<AuthResponse> {
  if (USE_MOCKS) return mockSignIn("you@example.com");
  const out = await request<AuthResponse>("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
  saveToken(out.token);
  return out;
}

/**
 * Upgrade: a checkout when Stripe is wired (the reply carries its `url`), a direct grant
 * when it is not (`granted`). `returnTo` is where a checkout should bring the buyer back.
 */
export async function upgrade(sku: Sku, returnTo?: string): Promise<UpgradeResponse> {
  if (USE_MOCKS) {
    const product = mocks.PRODUCTS.find((p) => p.sku === sku);
    try {
      const current = mockExtraEntitlements();
      window.localStorage.setItem(MOCK_ENTITLEMENTS_KEY, JSON.stringify([...current, ...(product?.features ?? [])]));
    } catch {
      /* ignore */
    }
    return { url: null, granted: true, me: mockMe() };
  }
  const body: { sku: Sku; success_url?: string; cancel_url?: string } = { sku };
  if (returnTo && typeof window !== "undefined") {
    const origin = window.location.origin;
    const sep = returnTo.includes("?") ? "&" : "?";
    body.success_url = `${origin}${returnTo}${sep}paid=${encodeURIComponent(sku)}`;
    body.cancel_url = `${origin}${returnTo}${sep}canceled=1`;
  }
  return request<UpgradeResponse>("/account/upgrade", { method: "POST", body: JSON.stringify(body) });
}

/** Mark the league being read, so the next sign-in on any device opens on it. */
export async function markLeagueUsed(platform: Platform, leagueId: string): Promise<void> {
  if (USE_MOCKS) return;
  await request<unknown>(`/leagues/${platform}/${encodeURIComponent(leagueId)}/use`, { method: "POST" });
}

/** Take a league off the account. Frees a slot. */
export async function forgetLeague(platform: Platform, leagueId: string): Promise<AccountLeague[]> {
  if (USE_MOCKS) return [];
  const out = await request<{ leagues: AccountLeague[] }>(`/leagues/${platform}/${encodeURIComponent(leagueId)}`, { method: "DELETE" });
  return out.leagues;
}

/** Everything the API holds on this account, as JSON, for the download button. */
export async function exportMyData(): Promise<unknown> {
  if (USE_MOCKS) return { email: mockUser(), data: {} };
  return request<unknown>("/me/data");
}

/** Erase the account. The API wants the word, so a stray call cannot do it. */
export async function deleteMyAccount(): Promise<void> {
  if (USE_MOCKS) {
    await logout();
    return;
  }
  try {
    await request<unknown>("/me?confirm=delete", { method: "DELETE" });
  } finally {
    clearToken();
  }
}

/* --------------------------------------------------------------------- admin ---- */

export async function adminUsers(): Promise<AdminUsersResponse> {
  if (USE_MOCKS) return mocks.ADMIN_USERS;
  return request<AdminUsersResponse>("/admin/users");
}

export async function adminGrant(email: string, sku: Sku): Promise<void> {
  if (USE_MOCKS) return;
  await request<unknown>(`/admin/users/${encodeURIComponent(email)}/grant`, { method: "POST", body: JSON.stringify({ sku }) });
}

export async function adminRevoke(email: string, sku: Sku): Promise<void> {
  if (USE_MOCKS) return;
  await request<unknown>(`/admin/users/${encodeURIComponent(email)}/revoke`, { method: "POST", body: JSON.stringify({ sku }) });
}

export async function adminSetRole(email: string, role: Role): Promise<void> {
  if (USE_MOCKS) return;
  await request<unknown>(`/admin/users/${encodeURIComponent(email)}/role`, { method: "POST", body: JSON.stringify({ role }) });
}

export async function adminResetLink(email: string): Promise<string> {
  if (USE_MOCKS) return `${window.location.origin}/reset?token=mock`;
  const out = await request<{ url: string }>(`/admin/users/${encodeURIComponent(email)}/reset`, { method: "POST" });
  return out.url;
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
  // Signed in only: the API answers 401 to a stranger, which the connect page turns into
  // the sign-in sheet rather than an error box.
  await request<unknown>("/connect", { method: "POST", body: JSON.stringify(req) });
}

export async function getActions(platform: Platform, leagueId: string, teamId: string): Promise<ActionFeed> {
  if (USE_MOCKS) {
    const me = await getMe();
    return mocks.actionsFor(teamId, me.entitlements);
  }
  return request<ActionFeed>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/actions`);
}

/** The owner's desk: the front page. Free. */
export async function getDesk(platform: Platform, leagueId: string, teamId: string): Promise<Desk> {
  if (USE_MOCKS) {
    const me = await getMe();
    return mocks.deskFor(teamId, me.entitlements);
  }
  return request<Desk>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/desk`);
}

export async function getPlan(platform: Platform, leagueId: string, teamId: string, kind: string, mineId: string, aboutId: string): Promise<Plan> {
  if (USE_MOCKS) {
    const me = await getMe();
    return mocks.planFor(teamId, kind, mineId, aboutId, me.entitlements);
  }
  return request<Plan>(`/league/${platform}/${leagueId}/team/${teamId}/desk/plan/${kind}/${encodeURIComponent(mineId)}/${encodeURIComponent(aboutId)}`);
}

export async function sendFeedback(req: FeedbackRequest): Promise<void> {
  if (USE_MOCKS) return;
  await request<unknown>("/feedback", { method: "POST", body: JSON.stringify(req) });
}

export async function getRoster(platform: Platform, leagueId: string, teamId: string): Promise<Roster> {
  if (USE_MOCKS) {
    const l = mocks.lineupFor(teamId);
    // `ros` is part of the real roster payload (`report.player_dict | {"ros": ...}`), and
    // the trade table weighs both sides with it. The mock used to leave it off, so every
    // player in the picker read "0 ROS" and the table's tally never moved.
    const players = [...l.slots.map((s) => s.player), ...l.bench.map((b) => b.player)]
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ ...p, ros: p.ros ?? mocks.rosValue(p) }));
    return { team: { id: teamId, name: mocks.LEAGUE.teams.find((t) => t.id === teamId)?.name ?? teamId }, players, starters: [] };
  }
  return request<Roster>(`/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/roster`);
}

/**
 * One team's scorecard, for any team in the league.
 *
 * The owner's own card already rides along inside `getLineup`, because the page drawing it
 * is fetching that anyway. This is for the other eleven, where the compare view wants one
 * rival on demand and has no use for their start/sit advice.
 */
/**
 * The season behind you: played weeks, real scores, and what we said at the time.
 *
 * No mock branch. Every other fetcher can fake its payload because it is describing a
 * roster that exists either way, but a recap is a claim about results that happened,
 * and a demo build inventing a season it did not play is the one fabrication this app
 * must never ship. The film renders its empty state instead, which is the truthful
 * answer for a demo: no weeks on record.
 */
export async function getRecap(platform: Platform, leagueId: string, teamId: string): Promise<SeasonRecap> {
  if (USE_MOCKS) {
    const l = mocks.LEAGUE;
    return { team: teamId, league: l.name, league_size: l.teams.length, weeks: [], record: null, points_rank: null };
  }
  return request<SeasonRecap>(
    `/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/recap`,
  );
}

/**
 * The replay: every finished week told as a story (docs/API.md §The replay).
 *
 * A free reader's 402 carries the newest cover, which is free, so it comes back here as
 * `locked` with the cover rather than as an error: the page draws the cover over the
 * paywall. The mock branch returns the empty film, never `mocks.FILM`, for the reason
 * `getRecap` gives: a demo build must not show a season nobody played.
 */
export interface FilmRead {
  locked: boolean;
  cover: FilmCover | null;
  film: FilmSeason | null;
}

export async function getFilm(platform: Platform, leagueId: string, teamId: string): Promise<FilmRead> {
  if (USE_MOCKS) {
    const film = { team: teamId, league: mocks.LEAGUE.name, season: mocks.FILM.season, cover: null, weeks: [], algo_version: mocks.FILM.algo_version };
    return { locked: false, cover: null, film };
  }
  try {
    const film = await request<FilmSeason>(
      `/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/film`,
    );
    return { locked: false, cover: film.cover, film };
  } catch (e) {
    if (e instanceof PaywallError && e.feature === "full_report") return { locked: true, cover: e.cover, film: null };
    throw e;
  }
}

/**
 * The film's league half (docs/API.md §The league). Paid; a free reader's 402 comes back as
 * `locked`. The mock branch has no league to compare, for the same reason as `getFilm`.
 */
export async function getLeagueFilm(platform: Platform, leagueId: string): Promise<{ locked: boolean; film: LeagueFilm | null }> {
  if (USE_MOCKS) return { locked: false, film: null };
  try {
    const film = await request<LeagueFilm>(`/league/${platform}/${encodeURIComponent(leagueId)}/film/league`);
    return { locked: false, film };
  } catch (e) {
    if (e instanceof PaywallError && e.feature === "full_report") return { locked: true, film: null };
    throw e;
  }
}

export async function getTeamGrades(
  platform: Platform,
  leagueId: string,
  teamId: string,
): Promise<TeamGrades> {
  if (USE_MOCKS) {
    const g = mocks.lineupFor(teamId).grades;
    if (!g) throw new Error(`no mock scorecard for team ${teamId}`);
    return { team: { id: teamId, name: mocks.LEAGUE.teams.find((t) => t.id === teamId)?.name ?? teamId }, grades: g };
  }
  return request<TeamGrades>(
    `/league/${platform}/${encodeURIComponent(leagueId)}/team/${encodeURIComponent(teamId)}/grades`,
  );
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
  /** Omitted means "trade", which is what every share was before Lock cards. */
  kind?: ShareKind;
  league_name: string;
  week: number;
  graphic?: unknown;
  explanation?: string;
  give_players?: unknown[];
  get_players?: unknown[];
  call?: unknown;
  film?: unknown;
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

/**
 * Every player in the NFL, by name.
 *
 * League-scoped even though a player is not: `rostered` is a fact about *this* league,
 * and a search that could not tell you a name is already taken would send you to a
 * profile to find out.
 */
export async function searchPlayers(platform: Platform, leagueId: string, q: string, teamId?: string): Promise<PlayerHit[]> {
  if (USE_MOCKS) return mocks.searchPlayers(q);
  const params = new URLSearchParams({ q });
  if (teamId) params.set("team_id", teamId);
  return request<PlayerHit[]>(
    `/league/${platform}/${encodeURIComponent(leagueId)}/players/search?${params.toString()}`,
  );
}

/**
 * The scouting board: every player in the league, cut and ordered by the reader.
 *
 * Only the parameters that are actually set go on the wire, so the server's own defaults
 * stay the single source of truth for what "no filter" means (docs/API.md). Array filters
 * are comma-joined, which is the shape `edge/api/directory.py` parses.
 */
export async function getPlayerBoard(
  platform: Platform,
  leagueId: string,
  query: BoardQuery = {},
  teamId?: string,
): Promise<PlayerBoard> {
  if (USE_MOCKS) return mocks.playerBoard(query, teamId);
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.pos?.length) p.set("pos", query.pos.join(","));
  if (query.nfl_team?.length) p.set("nfl_team", query.nfl_team.join(","));
  if (query.avail && query.avail !== "all") p.set("avail", query.avail);
  if (query.owner) p.set("owner", query.owner);
  if (query.sort) p.set("sort", query.sort);
  if (query.order) p.set("order", query.order);
  if (query.limit != null) p.set("limit", String(query.limit));
  if (query.offset) p.set("offset", String(query.offset));
  if (query.lens) p.set("lens", query.lens);
  if (query.season) p.set("season", "true");
  if (teamId) p.set("team_id", teamId);
  return request<PlayerBoard>(
    `/league/${platform}/${encodeURIComponent(leagueId)}/players?${p.toString()}`,
  );
}

/** How many free agents each scouting lens holds. Free, like the board it cuts. */
export async function getLensCounts(platform: Platform, leagueId: string, teamId?: string): Promise<LensCounts> {
  if (USE_MOCKS) return mocks.lensCounts(teamId);
  const q = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
  return request<LensCounts>(`/league/${platform}/${encodeURIComponent(leagueId)}/players/lenses${q}`);
}


export async function getPlayerProfile(platform: Platform, leagueId: string, playerId: string, teamId?: string): Promise<PlayerProfile> {
  if (USE_MOCKS) return mocks.profileFor(playerId);
  const q = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
  return request<PlayerProfile>(
    `/league/${platform}/${encodeURIComponent(leagueId)}/player/${encodeURIComponent(playerId)}${q}`,
  );
}

/** The table: every team in the league. Free — no entitlement, so no PaywallError branch. */
export async function getStandings(platform: Platform, leagueId: string): Promise<Standings> {
  if (USE_MOCKS) return mocks.STANDINGS;
  return request<Standings>(`/league/${platform}/${encodeURIComponent(leagueId)}/standings`);
}

/**
 * The weekly-email preference. Mock builds have no backend to ask, so the tick is kept
 * in this browser; a real deployment keeps it on the account, because the send is a
 * server job that has to know who asked.
 */
const EMAIL_OPT_IN_MOCK_KEY = "booth.email.optin";

export async function getEmailOptIn(): Promise<boolean> {
  if (USE_MOCKS) {
    try {
      return window.localStorage.getItem(EMAIL_OPT_IN_MOCK_KEY) === "1";
    } catch {
      return false;
    }
  }
  return (await request<EmailPref>("/me/email")).email_opt_in === true;
}

export async function setEmailOptIn(on: boolean): Promise<boolean> {
  if (USE_MOCKS) {
    try {
      window.localStorage.setItem(EMAIL_OPT_IN_MOCK_KEY, on ? "1" : "0");
    } catch {
      /* a browser that refuses storage still gets the tick for this visit */
    }
    return on;
  }
  const out = await request<EmailPref>("/me/email", {
    method: "PUT",
    body: JSON.stringify({ email_opt_in: on }),
  });
  return out.email_opt_in === true;
}
