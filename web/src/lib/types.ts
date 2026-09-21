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
  /** Whether this account asked for the Thursday email. Absent on old payloads = off. */
  email_opt_in?: boolean;
}

/** GET/PUT /api/me/email */
export interface EmailPref {
  email: string;
  email_opt_in: boolean;
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
  /**
   * What is wrong, in the platform's words: "Concussion", "Hamstring". It rides beside
   * `injury_status` and never replaces it — a body part is not a ruling, and only the
   * status says whether he plays.
   */
  injury_body_part?: string | null;
  /** When the platform last had news on this player, epoch **milliseconds**. This is the
   *  whole answer to "did anyone just get hurt": it is a timestamp on the news, not on the
   *  injury, so it moves when a player is cleared as well as when he is ruled out. */
  news_updated?: number | null;
  /** The week he is off. Null when the platform did not say — never 0, which is a week. */
  bye_week?: number | null;
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

/** One team's scorecard on its own, from `/team/{id}/grades` — the compare view's unit. */
export interface TeamGrades {
  team: { id: string; name: string };
  grades: Grades;
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

/**
 * The film: what actually happened, which is the one thing no other tab can show.
 *
 * Every other room in the app is about the next kickoff. This is the only backward-looking
 * surface, so it is the only one allowed to state results rather than projections.
 */
export interface RecapStarter {
  slot: string;
  player: PlayerRef | null;
  /**
   * What we had him at that week, or null. **Null is the normal case**: no projection for
   * a past week is recoverable after the fact, so this is only ever read back from what we
   * recorded at the time. A reader who joined in week 6 has nulls for weeks 1 to 5, and the
   * page must say "no record" there rather than quietly drawing a shorter season.
   */
  projected: number | null;
  /** What he actually scored, in this league's own scoring. */
  actual: number;
}

export interface BenchScore {
  player: PlayerRef;
  points: number;
}

export interface WeekRecap {
  week: number;
  opponent: string | null;
  my_points: number;
  their_points: number | null;
  /** Null when the week has no opponent on record (a bye in the league's schedule). */
  won: boolean | null;
  starters: RecapStarter[];
  /** The most this roster could have scored that week. Null when the bench is unknown. */
  best_possible: number | null;
  /** Bench players who outscored a starter, worst miss first. Empty is the good week. */
  bench: BenchScore[];
}

/**
 * One start/sit call we made last week, and what happened to it.
 *
 * Stated flat, per call: this player outscored that one, by this margin. A tie is not a
 * hit. `projected` is the margin **we showed at the time**, read back out of the run we
 * recorded, and null wherever we have no record of one of the two — the same rule as
 * `RecapStarter.projected`, and never re-derived from today's data.
 *
 * Nothing sums these. There is no "points gained" and no "points left on your bench":
 * CLAUDE.md bars a public decision-accuracy claim until `scripts/score_runs.py` has graded
 * real weeks, and `lib/recap.ts` already refuses to sum hits for the same reason.
 */
export interface LastWeekCall {
  start: PlayerRef;
  sit: PlayerRef;
  hit: boolean;
  /** What the starter outscored the benched player by. Negative is a miss. */
  margin: number;
  /** The margin we projected, or null when we recorded no number for one of them. */
  projected: number | null;
}

/**
 * How last week's calls landed: one line on the call sheet, the detail in the film.
 *
 * Free for everyone. Absent far more often than not — the feed sends null in week 1, for a
 * reader with no recorded call, and for a platform that gives us a scoreline with nobody's
 * points attached (ESPN) — and the line simply does not render.
 *
 * `hits` and `total` are integers on purpose: "2 of 3 calls hit" is this reader's own week
 * and is allowed; `hits / total` is a rate, which is a claim about the product, and is not.
 */
export interface LastWeek {
  week: number;
  /** Null when there was no opponent that week; the line then drops its scoreline. */
  result: "W" | "L" | "T" | null;
  score: number;
  opp_score: number | null;
  calls: LastWeekCall[];
  hits: number;
  total: number;
  algo_version?: string;
}

export interface SeasonRecap {
  team: string;
  league: string;
  league_size: number;
  /** Newest week first. Only weeks that have actually been played. */
  weeks: WeekRecap[];
  record: { wins: number; losses: number; ties: number } | null;
  /**
   * Where this team's total points rank in the league, 1 = most. Read against `record`:
   * a good rank with a bad record is the honest word for unlucky, and it is the one thing
   * a manager cannot see on the platform itself.
   */
  points_rank: number | null;
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

/* ------------------------------------------------------------- the desk ---
   The front page: `GET .../team/{id}/desk`. See docs/API.md, "The owner's desk". */

export type NewsKind = "own" | "qb" | "target" | "backfield" | "line";
export type NewsLevel = "critical" | "warning" | "upside" | "note";

/** A player of yours a story touches. */
export interface NewsPlayerRef {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  starter: boolean;
  photo?: string | null;
  team_logo?: string | null;
}

/** The man the story is about, in the platform's words. */
export interface NewsAbout {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  status: string | null;
  body_part: string | null;
  notes: string | null;
  practice: string | null;
  photo?: string | null;
  team_logo?: string | null;
}

export interface NewsItem {
  id: string;
  kind: NewsKind;
  level: NewsLevel;
  headline: string;
  detail: string;
  /** Epoch milliseconds, the platform's own date on the news. */
  at: number | null;
  age_hours: number;
  player: NewsPlayerRef;
  about: NewsAbout;
  /** Other players of yours the same story touches. */
  also?: NewsPlayerRef[];
  /** For `line`: the other linemen out on the same offence. */
  others?: NewsAbout[];
}

export interface DeskNews {
  window_hours: number;
  /** How many stories there were; `items` is capped. */
  count: number;
  items: NewsItem[];
}

export interface Binder {
  key: "team" | "waivers" | "trade";
  count: number;
  locked: boolean;
  top_benefit: string | null;
}

export interface Desk {
  week: number;
  team: string;
  league: string;
  news: DeskNews;
  matchup?: Matchup | null;
  sheet: { summary: string; moves: number; all_clear: boolean };
  binders: Binder[];
  entitlements: Feature[];
  synced_at: number;
}

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

/**
 * When each bench stops mattering, as the league itself defines it.
 *
 * Every field here is read off the league's own settings — Sleeper hands us
 * `waiver_day_of_week`, `daily_waivers_hour` and `trade_deadline`; ESPN hands us a
 * deadline timestamp — so a countdown built on this is the league's deadline and not a
 * convention we assumed. Null means the platform did not tell us, and a row with a null
 * deadline shows no clock rather than a guessed one.
 *
 * The lineup deadline is deliberately absent: it is Sunday's first kickoff on the
 * reader's own clock, which the server does not have, and `nextKickoff()` already
 * computes it in the browser.
 */
export interface Deadlines {
  /** 0 = Sunday … 6 = Saturday, in US/Eastern — the day claims process. */
  waiver_day: number | null;
  /** 0–23, US/Eastern, the hour claims process on that day. */
  waiver_hour: number | null;
  /**
   * True when claims clear every day at `waiver_hour`, which is Sleeper's daily-waiver
   * mode and the setting the test league runs on. Such a league has no waiver *night*,
   * so `waiver_day` is null for it — but null also means "the platform did not tell us",
   * and the two must never be read as each other. Hence a flag, not an inference.
   */
  waiver_daily?: boolean;
  /** The last week trades may be made. Compared against `week`, never against a date. */
  trade_deadline_week: number | null;
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
  /** Optional: an older API build does not send it, and the sheet must still render. */
  deadlines?: Deadlines | null;
  /**
   * How last week's calls landed, or null. Free for every reader, paid or not.
   * Optional as well as nullable: an older API build does not send the key at all.
   */
  last_week?: LastWeek | null;
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

// ---------------------------------------------------------------------------
// The scout report: one player, in depth
// ---------------------------------------------------------------------------

/**
 * A player as a search result: enough to recognise him, nothing else.
 *
 * Deliberately thin. The search box queries every player in the league's platform dump
 * (~11k rows, most of them practice-squad linemen nobody will ever type), so the payload
 * is the four fields a human uses to tell two Josh Allens apart.
 */
/** How a board row may be ordered. Mirrors `SORTS` in `edge/api/directory.py`. */
export type BoardSort = "projected" | "ros" | "trending" | "name" | "position";

/** Who holds him, from this league's point of view. Mirrors `AVAILABILITY` there. */
export type BoardAvailability = "all" | "free" | "rostered" | "mine";

/**
 * One row of the scouting board.
 *
 * **Every number is nullable, and null is not zero.** A zero projection is a real answer —
 * a bye week, a deep bench — and a null means we never priced him at all, which is what a
 * name search that reached past the league into the platform dump hands back. The board
 * draws a dash for null and the real number for zero; merging them would state a fact
 * about the player that we do not have.
 */
export interface BoardRow {
  id: string;
  name: string;
  position: string;
  /** Every slot he is eligible for, so a board filtered to RB still shows a dual-listed back. */
  positions: string[];
  nfl_team: string | null;
  photo?: string | null;
  team_logo?: string | null;
  injury_status: string | null;
  injury_body_part: string | null;
  /** Never 0 — 0 would read as a real week. Null means we do not know. */
  bye_week: number | null;
  /** This week, in this league's scoring. */
  projected: number | null;
  /** Rest of the fantasy regular season, in this league's scoring. */
  ros: number | null;
  trending_adds: number;
  /** Null means nobody in this league holds him. `is_me` needs a `team_id` on the request. */
  rostered_by: { team_id: string; team_name: string; is_me: boolean } | null;
}

/**
 * The filter controls this league can actually offer.
 *
 * Built server-side from the league's own rows, never hard-coded: a league with no kicker
 * slot has no K chip, and an IDP league gets its own positions without anybody editing a
 * list. Same rule as scoring — read the league, never assume it.
 */
export interface BoardFacets {
  positions: string[];
  nfl_teams: string[];
  teams: { id: string; name: string }[];
}

export interface PlayerBoard {
  week: number;
  /** Every match, not the page — the difference is how the reader tells a narrow filter
   *  from an empty league. */
  total: number;
  offset: number;
  limit: number;
  sort: BoardSort;
  order: "desc" | "asc";
  rows: BoardRow[];
  facets: BoardFacets;
  algo_version?: string;
}

/** What the board is being asked for. Everything optional; the server holds the defaults. */
export interface BoardQuery {
  q?: string;
  pos?: string[];
  nfl_team?: string[];
  avail?: BoardAvailability;
  owner?: string | null;
  sort?: BoardSort;
  order?: "desc" | "asc";
  limit?: number;
  offset?: number;
}

export interface PlayerHit {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  /**
   * Seasons played before this one. **0 is a rookie; null is "the platform did not say"**
   * — which it does not for a team defence or for anyone off the usual depth charts.
   * The two are not the same and a rookie must not be rendered as unknown.
   */
  years_exp: number | null;
  /** True when somebody in *this* league rosters him. Free agents are the interesting ones. */
  rostered: boolean;
}

/**
 * One game in a player's log, scored by the reader's own league.
 *
 * `points` is computed through `edge/data/scoring.py` from the raw stat line, never read
 * off Sleeper's `pts_ppr` — the whole rule (CLAUDE.md: "Never assume PPR"). Every other
 * number here is a raw count the platform published, so the row is checkable against any
 * box score.
 *
 * Nulls are load-bearing: a stat the platform did not record for this position is null,
 * not zero. A quarterback has no target count; that is not "0 targets".
 */
export interface ScoutGame {
  week: number;
  /** The team he faced, or null when the platform did not say. */
  opponent: string | null;
  /** False when he did not take a snap: a bye, an inactive, or an injury. */
  played: boolean;
  points: number;
  /** His share of his own offence's snaps, 0–1. The closest thing to a route count that exists. */
  snap_pct: number | null;
  targets: number | null;
  carries: number | null;
  /** Carries inside the 20 plus targets inside the 20: the scoring chances he was given. */
  rz_touches: number | null;
  yards: number | null;
  tds: number | null;
}

/**
 * A whole season rolled up, scored by the reader's league.
 *
 * Shares (`target_share`, `rush_share`) are this player's count over his own team's count
 * in the weeks he played, so a player who missed a month is not punished for the weeks he
 * was not there.
 */
export interface ScoutSplit {
  season: number;
  /** Games he actually played, which is what every per-game number below divides by. */
  games: number;
  points: number;
  ppg: number | null;
  snap_pct: number | null;
  targets: number | null;
  target_share: number | null;
  carries: number | null;
  rush_share: number | null;
  rz_touches: number | null;
  /** Every yard he gained, however he gained it: passing plus rushing plus receiving. */
  yards: number | null;
  tds: number | null;
  /**
   * The three fields below exist so a read can say the stat a position is actually judged
   * by. They are optional because the report renders without them — only `reads` consumes
   * them, and an older API build simply produces slightly blunter prose.
   *
   * Without `attempts`, a quarterback's volume had to be stated as yards a game, when the
   * number every manager actually quotes is attempts. Without the yards split, a running
   * back's efficiency had to be yards per *touch*, because a single combined `yards` total
   * cannot be divided by carries to get yards per carry — the receiving yards are in there
   * too. Both of those were honest and both were the wrong number.
   */
  attempts?: number | null;
  rush_yards?: number | null;
  rec_yards?: number | null;
  /** Where his points rank among everyone at his position, 1 = best. Null before anyone has played. */
  pos_rank: number | null;
  pos_total: number | null;
  /** His best and worst week, so the average has a shape around it. */
  best: number | null;
  worst: number | null;
}

/**
 * One plain-English observation, derived from counts and nothing else.
 *
 * Every read is arithmetic on the two splits above — snaps up, targets down, red-zone work
 * appearing — and says what changed rather than what it means for next week. Nothing here
 * is a projection, a rating or a claim about our own accuracy, which is the line
 * `docs/ACCURACY_PROGRAM.md` draws and CLAUDE.md repeats.
 */
export interface ScoutRead {
  /** Stable key for the icon and for tests: "role" | "volume" | "chances" | "shape" | "efficiency". */
  key: string;
  head: string;
  line: string;
  /** Which way it moved. "flat" is a real answer and the most common one. */
  tone: "up" | "down" | "flat";
}

export interface ScoutPlayer {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  photo?: string | null;
  team_logo?: string | null;
  /** Same rule as `PlayerHit.years_exp`: 0 is a rookie, null is "not provided". */
  years_exp: number | null;
  injury_status?: string | null;
  injury_body_part?: string | null;
  bye_week?: number | null;
}

/**
 * The whole report for one player in one league.
 *
 * League-scoped on purpose, twice over: the points are scored by this league's settings,
 * and `owner` says who holds him here. The same player is a different report in a
 * six-point-passing-touchdown league, and pretending otherwise is the bug
 * `docs/DATA.md` warns about.
 */
export interface PlayerProfile {
  player: ScoutPlayer;
  /** The team that rosters him in this league, or null when he is on the wire. */
  owner: { team_id: string; team_name: string; is_me: boolean } | null;
  this_season: ScoutSplit | null;
  last_season: ScoutSplit | null;
  /** This season's games, newest first. Empty in week 1 and that is a real answer. */
  games: ScoutGame[];
  reads: ScoutRead[];
  algo_version: string;
}

/** Every team against every other team, every played week. */
export interface AllPlay {
  wins: number;
  losses: number;
  ties: number;
}

export interface StandingsTeam {
  id: string;
  name: string;
  owner_name: string | null;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  /** The platform's own best-possible season total. Null when it publishes none (ESPN). */
  max_points: number | null;
  /** The platform's own streak label, e.g. "2W". Null when it publishes none (ESPN). */
  streak: string | null;
  /** 1 = best. Record first, points for second. Tied teams share the better place. */
  rank: number;
  /** Where this team's season points sit, 1 = most. Null when nobody has scored yet. */
  points_rank: number | null;
  /** 1 = best roster from here, by rest-of-season starting value. May disagree with `rank`. */
  strength_rank: number;
  /** Null until a week has been played — weeks 1 and 2 are the normal case. */
  all_play: AllPlay | null;
  /**
   * All-play win rate minus the real one. POSITIVE means scoring better than the record
   * shows — the opposite sign to `LuckRead.gap` in lib/recap.ts. Null with no played weeks.
   */
  luck: number | null;
}

export interface Standings {
  teams: StandingsTeam[];
  algo_version: string;
}
