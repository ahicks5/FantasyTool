// Mirrors docs/API.md (Edge API contract v1).

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
  email: string;
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
  nfl_team: string;
  injury_status: string | null;
  projected: number;
  opponent: string;
}

export interface PlayerRef {
  id: string;
  name: string;
  position?: string;
}

export interface LineupSlot {
  slot: string;
  player: Player;
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
  out: PlayerRef;
  in: PlayerRef;
  gain: number;
  confidence: Confidence;
  reason: string;
}

export interface Lineup {
  week: number;
  projected_total: number;
  current_total: number;
  slots: LineupSlot[];
  bench: BenchEntry[];
  changes: LineupChange[];
}

export interface Bid {
  amount: number;
  range: [number, number];
  pct_of_budget: number;
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
  faab_remaining: number;
  picks: WaiverPick[];
}

export interface TradeRequest {
  my_team_id: string;
  their_team_id: string;
  give: string[];
  get: string[];
}

export type Verdict = "Accept" | "Reject" | "Counter" | "Fair";

export interface TradeSide {
  value_out: number;
  value_in: number;
  lineup_delta_week: number;
  lineup_delta_ros: number;
}

export interface Tendencies {
  trades: number;
  waiver_claims: number;
  avg_bid: number;
  favorite_positions: string[];
  style: string;
}

export interface Counter {
  give: string[];
  get: string[];
  why: string;
}

export interface TradeGraphic {
  title: string;
  lines: string[];
}

export interface TradeResult {
  verdict: Verdict;
  me: TradeSide;
  them: TradeSide;
  fairness: number;
  their_tendencies: Tendencies;
  counter: Counter | null;
  explanation: string;
  graphic: TradeGraphic;
}

export interface TradeTarget {
  their_team_id: string;
  give: PlayerRef[];
  get: PlayerRef[];
  verdict: Verdict;
  why: string;
}

export interface Matchup {
  opponent: string;
  my_proj: number;
  their_proj: number;
  win_prob: number;
}

export interface Report {
  week: number;
  lineup: Lineup;
  waivers: Waivers;
  trade_targets: TradeTarget[];
  matchup: Matchup;
  html: string;
}

export interface ApiError {
  error: string;
}
