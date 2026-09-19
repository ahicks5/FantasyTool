// Mirrors docs/API.md (Penthouse API contract v1).

export type Platform = "sleeper" | "espn";

export type Feature = "my_team" | "waivers" | "trade_lab" | "full_report";

export type Sku = "free" | "waivers" | "trade_lab" | "full_report";

export interface Product {
  sku: Sku;
  name: string;
  price_cents: number;
  features: Feature[];
  leagues: number;
  blurb: string;
  /** `edge/products.py` has always sent this; the Pricing badge infers it from `sku` instead. */
  kind?: "free" | "a_la_carte" | "bundle";
}

export interface ProductsResponse {
  products: Product[];
}

export interface MeLeague {
  platform: Platform;
  league_id: string;
  name: string;
  team_id: string;
}

export interface Me {
  email: string | null;
  signed_in?: boolean;
  entitlements: Feature[];
  leagues_allowed: number;
  leagues: MeLeague[];
}

export interface CheckoutResponse {
  url: string;
}

export interface SleeperLeagueRef {
  league_id: string;
  name: string;
  status: string;
  total_rosters: number;
}

export interface TeamSummary {
  id: string;
  name: string;
  owner_name: string;
  record: string;
  points_for: number;
  faab_remaining: number;
}

export interface LeagueSummary {
  id: string;
  platform: Platform;
  name: string;
  season: number;
  week: number;
  waiver_type: string;
  faab_budget: number;
  starting_slots: string[];
  teams: TeamSummary[];
}

export interface ConnectRequest {
  platform: Platform;
  league_id: string;
  team_id: string;
}

export type Confidence = "Lock" | "Lean" | "Coin flip";

export interface Player {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  injury_status: string | null;
  projected: number;
  opponent?: string;
  ros?: number;
  photo?: string | null;
  team_logo?: string | null;
}

export interface Roster {
  team: { id: string; name: string };
  players: Player[];
  starters: string[];
}

export interface PlayerRef {
  id: string;
  name: string;
  position?: string;
}

export interface LineupSlot {
  slot: string;
  player: Player | null;
  confidence: Confidence;
  reason: string;
  change: boolean;
}

export interface BenchEntry {
  player: Player;
  reason: string;
}

export interface LineupChange {
  slot: string;
  out: PlayerRef | null;
  in: PlayerRef;
  gain: number;
  confidence: Confidence;
  reason: string;
}

/** The thirteen letters the engine grades on, worst to best. */
export type Grade = "F" | "D-" | "D" | "D+" | "C-" | "C" | "C+" | "B-" | "B" | "B+" | "A-" | "A" | "A+";

/** How stocked a spot is *against what this league starts there* — not against your own starters. */
export type Depth = "deep" | "ok" | "thin";

export interface PositionGrade {
  position: string;
  grade: Grade;
  /** 0..1, where 0.5 is the league mean. Set by rank, then damped toward the middle when
   *  the league is packed — so the meter reads "where you sit, and how much that is worth". */
  percentile: number;
  /** What the lineup effectively starts here — FLEX folded in, so it can beat the dedicated slots. */
  starters: number;
  rank: number;
  league_size: number;
  depth: Depth;
  /** Starters above (+) or below (-) the league mean here. The letter says where, this says by
   *  how much. Optional: an API deployed before the grade rework does not send it, and the
   *  web ships ahead of the API. The note already carries the margin in words. */
  edge_starters?: number;
  starter_names: string[];
  /** Null when there is nobody behind the starters. */
  next_man: string | null;
  note: string;
}

/**
 * The scorecard on a lineup. `rank` and `grade` answer different questions on
 * purpose: rank is where you stand, the grade is what that standing is worth.
 */
export interface Grades {
  overall: Grade;
  overall_percentile: number;
  overall_rank: number;
  overall_edge_starters?: number;
  league_size: number;
  note: string;
  positions: PositionGrade[];
}

export interface Lineup {
  week: number;
  projected_total: number;
  current_total: number;
  slots: LineupSlot[];
  bench: BenchEntry[];
  changes: LineupChange[];
  confidence_hit_rate?: Record<Confidence, number>;
  /** Optional: older API builds and compact embeds ship a lineup without it. */
  grades?: Grades;
}

export interface Bid {
  amount: number | null;
  range: [number, number] | null;
  pct_of_budget: number | null;
  note?: string;
}

export interface WaiverPick {
  player: Player;
  fit_score: number;
  weekly_gain: number;
  ros_gain: number;
  trending_adds: number;
  drop: PlayerRef | null;
  bid: Bid;
  reason: string;
}

export interface Waivers {
  week: number;
  faab_remaining: number | null;
  waiver_type?: string;
  picks: WaiverPick[];
}

/** One executable waiver move: add this player, drop that one, bid this much. */
export interface WaiverClaim {
  add: Player;
  drop: Player | null;
  net: number;
  weekly_gain: number;
  ros_gain: number;
  drop_cost: number;
  bid: Bid & { value_cap?: number | null; market?: number | null };
  reason: string;
  reason_codes: string[];
  trending_adds: number;
}

export interface WaiverPlanResponse {
  week: number;
  faab_remaining: number | null;
  waiver_type: string;
  primary: WaiverClaim | null;
  fallbacks: WaiverClaim[];
  hold_reason: string | null;
  total_planned_spend: number;
  algo_version: string;
}

export interface FinderOffer {
  their_team_id: string;
  their_team_name: string;
  give: string[];
  get: string[];
  give_names: string[];
  get_names: string[];
  give_players: Player[];
  get_players: Player[];
  my_gain_ros: number;
  their_gain_ros: number;
  my_gain_week: number;
  fairness: number;
  verdict: Verdict;
  score: number;
  why: string;
  reason_codes: string[];
}

export interface TradePartner {
  team_id: string;
  team_name: string;
  owner_name: string | null;
  complement: number;
  headline: string;
  positions: { surplus: Record<string, number>; need: Record<string, number> };
  offers: FinderOffer[];
}

export interface TradeFinderResponse {
  week: number;
  my_positions: { surplus: Record<string, number>; need: Record<string, number> };
  summary: string;
  partners: TradePartner[];
  algo_version: string;
}

export interface SharedPlayer {
  name: string;
  position: string;
  nfl_team: string;
  photo: string | null;
  team_logo: string | null;
}

export type ShareKind = "trade" | "lock";

/** What the Lock share button sends. Display fields only; the API strips ids again anyway. */
export interface LockCall {
  start: SharedPlayer;
  bench: SharedPlayer | null;
  gain: number;
  confidence: Confidence;
  slot: string;
  note: string;
}

/** The public snapshot behind /s/{id} for a free start/sit call. */
export interface SharedLock extends LockCall {
  kind: "lock";
  league_name: string;
  week: number;
}

/** The public snapshot behind /s/{id}. Display fields only — no league, no account. */
export interface SharedVerdict {
  kind?: "trade";
  verdict: Verdict;
  give: string[];
  get: string[];
  my_delta_ros: number;
  their_delta_ros: number;
  fairness: number;
  style: string | null;
  explanation: string;
  league_name: string;
  week: number;
  give_players: SharedPlayer[];
  get_players: SharedPlayer[];
}

/** Either kind of snapshot. Shares written before Lock sharing existed carry no `kind`. */
export type SharedSnapshot = SharedVerdict | SharedLock;

export function isSharedLock(s: SharedSnapshot): s is SharedLock {
  return s.kind === "lock";
}

export interface ShareResponse {
  id: string;
  url: string;
}

export interface TradeRequest {
  my_team_id: string;
  their_team_id: string;
  give: string[];
  get: string[];
}

export type Verdict = "Accept" | "Reject" | "Counter" | "Fair";

export interface TradeSide {
  team_id?: string;
  team_name?: string;
  value_out: number;
  value_in: number;
  lineup_delta_week: number;
  lineup_delta_ros: number;
}

/** Empty object when the league has no transaction history yet. */
export interface Tendencies {
  trades?: number;
  waiver_claims?: number;
  fa_adds?: number;
  avg_bid?: number;
  max_bid?: number;
  picks_traded?: number;
  favorite_positions?: string[];
  top_partner?: string | null;
  style?: string;
  hoards?: string[];
}

export interface Counter {
  give: string[];
  get: string[];
  give_names: string[];
  get_names: string[];
  me?: TradeSide;
  them?: TradeSide;
  why: string;
}

export interface TradeGraphic {
  title: string;
  give: string[];
  get: string[];
  my_delta_ros: number;
  their_delta_ros: number;
  fairness: number;
  style: string | null;
}

export interface TradeResult {
  verdict: Verdict;
  me: TradeSide;
  them: TradeSide;
  fairness: number;
  their_tendencies: Tendencies;
  counter: Counter | null;
  notes: string[];
  explanation: string;
  explanation_source?: "claude" | "template";
  graphic: TradeGraphic;
}

export interface TradeTarget {
  their_team_id: string;
  their_team_name: string;
  give: string[];
  get: string[];
  give_names: string[];
  get_names: string[];
  my_gain_ros: number;
  their_gain_ros: number;
  verdict: Verdict;
  why: string;
}

export interface Matchup {
  opponent: string | null;
  opponent_id?: string;
  my_proj: number;
  their_proj: number | null;
  win_prob: number | null;
}

export interface Report {
  week: number;
  league?: string;
  team?: string;
  lineup: Lineup;
  waivers: Waivers;
  trade_targets: TradeTarget[];
  matchup: Matchup | null;
  waiver_plan?: WaiverPlanResponse;
  trade_finder?: TradeFinderResponse;
  html: string;
}

export type ActionType = "start" | "waiver" | "trade" | "hold";

export interface ActionFeedExtras {
  algo_version?: string;
}

export interface Action {
  id: string;
  type: ActionType;
  feature: Feature;
  locked: boolean;
  priority: number;
  title: string;
  subtitle: string;
  benefit: string;
  benefit_value: number;
  confidence: Confidence | null;
  reason: string;
  why: string[];
  players: (Player | null)[];
  cta: { label: string; href: string };
}

export interface ActionFeed {
  week: number;
  team: string;
  league: string;
  projected_total: number;
  current_total: number;
  matchup?: Matchup | null;
  summary: string;
  all_clear: boolean;
  footer: string;
  actions: Action[];
  entitlements: Feature[];
  synced_at: number;
}

export interface FeedbackRequest {
  platform: Platform;
  league_id: string;
  team_id: string;
  action_id: string;
  action_type: ActionType;
  verdict: "helpful" | "wrong";
  reason?: string;
  week?: number;
}

export interface ApiError {
  error: string;
}

/** FastAPI shape: `detail` is a string, or an object for paywall (402) responses. */
export interface PaywallDetail {
  error: string;
  feature: string;
  teaser?: string | null;
  upsell: Product[];
}
