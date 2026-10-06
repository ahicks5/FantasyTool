// Mirrors docs/API.md (Owner's Suite API contract v1).

export type Platform = "sleeper" | "espn" | "yahoo";

/** `battle` is Position Battle (2026-10-05), in both passes. */
export type Feature = "my_team" | "waivers" | "trade_lab" | "full_report" | "battle";

/** `week_pass` and `full_report` (the season) are on sale; `waivers` and `trade_lab` were
 *  retired 2026-09-27 and only ever appear on an account that already holds one. */
export type Sku = "free" | "week_pass" | "full_report" | "league_slot" | "waivers" | "trade_lab";

export interface Product {
  sku: Sku;
  name: string;
  price_cents: number;
  features: Feature[];
  leagues: number;
  blurb: string;
  /** `pass` is the week, `bundle` the season, `add_on` the league slot (it unlocks nothing
   *  and stacks). `a_la_carte` is retired and never on sale. */
  kind?: "free" | "pass" | "bundle" | "add_on" | "a_la_carte";
  /** Set on a subscription: the week pass renews every `week`. Absent = one payment. */
  recurring?: "week";
  /** Days one paid purchase keeps access open (the week pass); absent = rest of season. */
  duration_days?: number;
  for_sale?: boolean;
  /** The season pass only: roughly when the season ends (YYYY-MM-DD), for "weeks left". Display only. */
  through?: string;
}

/** `GET /api/health`: what the API has switched on, never a key. */
export interface Health {
  ok: boolean;
  /** True once a card reader is wired; until then an upgrade is a complimentary grant. */
  stripe: boolean;
  database?: string;
  phone_sign_in?: string | null;
  email_provider?: string;
}

export interface ProductsResponse {
  products: Product[];
}

export interface MeLeague {
  platform: Platform;
  league_id: string;
  name: string;
  team_id: string;
  /** The team's name when it was linked; an older row has "". */
  team_name?: string;
  /** Unix seconds when this league was last opened on any device; null on an older row. */
  last_used?: number | null;
}

/** The flag on the account: `free` or `premium`, and the name the user reads. */
export interface AccountPlan {
  tier: "free" | "premium";
  name: string;
  skus: Sku[];
}

export type Role = "user" | "admin";

/** The account block on `/api/me`. Never a password hash. */
export interface Account {
  email: string;
  name: string;
  role: Role;
  is_admin: boolean;
  plan: AccountPlan;
  /** How many league-slot add-ons this account holds this season. */
  league_slots: number;
  /** Unix seconds when the paid week runs out (grace included); null without a live week pass. */
  pass_until?: number | null;
  /** Whether they ticked the marketing-text box. */
  sms_opt_in?: boolean;
  created?: number | null;
  last_login?: number | null;
  /** E.164, when a number is on the account. Phone-only accounts have `email: ""`. */
  phone?: string | null;
  /** False for an account made with a phone, which signs in by text code. */
  has_password?: boolean;
  /** True once a confirm link to the address on file was clicked. Absent on old payloads. */
  email_verified?: boolean;
}

/** The free first week (docs/SPEC-ONBOARDING.md), as `/api/me` describes it. Unix seconds. */
export interface Trial {
  /** The pass it bills when it ends. */
  sku: Sku;
  started: number;
  /** When access lapses if nothing is paid (the week plus its grace day). */
  until: number | null;
  active: boolean;
  converted: boolean;
  cancelled: boolean;
  /** When the first charge lands, and how much; null once cancelled, paid or revoked. */
  next_charge_at: number | null;
  next_charge_cents: number | null;
}

/** A screen of the sign-up walk the API counts (`PUT /api/me/onboarding`). */
export type OnboardStep = "named" | "email" | "league" | "reveal" | "offer" | "done";

/** What the sign-up walk remembers on the server: screens reached and skips, each a unix time. */
export interface OnboardingState {
  reached?: Partial<Record<"named" | "email" | "league" | "reveal" | "offer" | "done", number>>;
  skipped?: Partial<Record<"name" | "email" | "offer", number>>;
}

export interface Me {
  email: string | null;
  signed_in?: boolean;
  entitlements: Feature[];
  leagues_allowed: number;
  leagues: MeLeague[];
  /** Slots taken this season: on file plus forgotten this season. Absent on old payloads. */
  leagues_used?: number;
  /** What the season pass costs this account now: less while a paid week is live. Absent on old payloads. */
  season_price_cents?: number;
  /** Whether this account asked for the Thursday email. Absent on old payloads = off. */
  email_opt_in?: boolean;
  /** Null when signed out. */
  account?: Account | null;
  /** True when Stripe is configured on the API, so an upgrade is a checkout rather than a grant. */
  checkout?: boolean;
  /** True when the API can text a sign-in code, so the door offers "continue with your phone". */
  phone_sign_in?: boolean;
  /** Stripe's customer-portal login link, where a week-pass subscriber manages or cancels. */
  billing_portal_url?: string | null;
  /** The free first week on file, if any. Absent on old payloads. */
  trial?: Trial | null;
  /** Whether this account may still start its one free week. */
  trial_eligible?: boolean;
  /** How long the free week is. */
  trial_days?: number;
  /** What the sign-up walk remembers. */
  onboarding?: OnboardingState;
  /** True when a confirm-your-address mail would really be sent (a provider is set). */
  email_sending?: boolean;
}

/** `POST /api/auth/phone/start`. `dev_code` only from a dev API, which texts nothing. */
export interface PhoneStartResponse {
  ok: boolean;
  phone: string;
  display: string;
  dev_code?: string;
}

/** `POST /api/auth/phone/verify`: a number on file signs in; a new one gets a ticket to finish signing up. */
export type PhoneVerifyResponse =
  | { new: false; token: string; me: Me }
  | { new: true; ticket: string; phone: string; display: string };

/** `POST /api/auth/register|login|reset`: a bearer token and who it belongs to. */
export interface AuthResponse {
  token: string;
  me: Me;
}

/** `POST /api/account/upgrade`: a checkout `url` when Stripe is wired, else the grant is written and `me` says so. */
export interface UpgradeResponse {
  url: string | null;
  granted: boolean;
  me: Me | null;
}

/** `POST /api/promo`: does a typed code work, and what does the pass cost with it. Display only. */
export interface PromoResponse {
  ok: boolean;
  code: string | null;
  sku: Sku;
  percent_off: number;
  price_cents: number | null;
  /** A free-week code: the days before the first charge. 0 for a discount code. */
  trial_days?: number;
  /** A free-week code only: whether this account may still use it. */
  eligible?: boolean;
}

/** `POST /api/auth/email/verify/start`. `dev_link` only from a dev API, which mails nothing. */
export interface VerifyStartResponse {
  ok: boolean;
  sent: boolean;
  verified: boolean;
  dev_link?: string;
}

/** One row on the admin's list: the account, its plan and its leagues. */
export interface AdminUser {
  email: string;
  name: string;
  role: Role;
  is_admin: boolean;
  created?: number | null;
  last_login?: number | null;
  plan: AccountPlan;
  skus: Sku[];
  leagues: MeLeague[];
  leagues_allowed: number;
  phone?: string | null;
  /** Where the account first came from: a utm_source, `share`, `referral:<host>` or `direct`. */
  source?: string;
  /** Lifetime payments, in cents, from the telemetry log. */
  revenue_cents?: number;
  /** The later of a league opened and a sign-in (epoch seconds). */
  last_active?: number | null;
  /** When they ticked the marketing-text box (epoch seconds), or null. */
  sms_opt_in?: number | null;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  season: number;
  checkout: boolean;
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
  /** Where he ranks at his position among every rostered player in this league this week
   *  (RB12 of 56). Optional: only the lineup payload carries it. */
  pos_rank?: { rank: number; of: number } | null;
  /** The week in progress (`edge/engine/live.py`): where his game stands, and what he has
   *  scored so far in this league's scoring. Null until his game has kicked off, and null
   *  for a man with no game this week. A man whose game is `in` or `final` is locked. */
  game?: GameState | null;
  points?: number | null;
  /** His game's kickoff this week, UTC ISO ("2026-10-06T00:15Z"); null for a man with no
   *  game, and absent on an older API build. The page prints "MON 8:15" beside "PROJ". */
  kickoff?: string | null;
}

export type GameState = "pre" | "in" | "final";

/** Where the week stands (`edge/engine/gameday.py`, `GET` payloads carry it as `clock`). */
export type WeekPhase = "before" | "live" | "final" | "next";

/**
 * The week's clock. `phase` is the server's read of the scoreboard; the instants let the
 * page tick on its own (`lib/gameday.ts`, `weekPhase`): FINAL becomes the countdown at
 * `final_until` (Tuesday 12:00 ET), and a countdown becomes LIVE at the kickoff it counts to.
 * `week` is the week the clock is about, which can be the one before the league's own while
 * last week is still in its FINAL window. `target_week` is the week a move made now lands in.
 */
export interface WeekClock {
  week: number;
  phase: WeekPhase | null;
  first_kickoff: string | null;
  last_kickoff: string | null;
  final_until: string | null;
  next_kickoff: string | null;
  target_week: number | null;
}

/** The week, played: from the last game until Tuesday noon ET (W-021). */
export interface LineupRecap {
  /** What the lineup as you set it scored. */
  total: number;
  /** The best lineup the same roster could have scored. */
  best: number;
  /** `best - total`: what was left on the bench. */
  left: number;
  /** The bench men who would have been in that best lineup, most points first. */
  bench: { player: Player; points: number }[];
}

/** What the lineup has on the board once a starter's game has kicked off. */
export interface LineupLive {
  played: number;
  on: number;
  to_play: number;
  /** The locked starters' points so far. */
  scored: number;
  /** The total as it stands: actuals for the locked men, projections for the rest. */
  live_total: number;
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
  /** Projected points the whole lineup moves by. Every swap is priced against the lineup as
   *  it stood when it was made, so the gains sum to `projected_total - current_total`. */
  gain: number;
  confidence: Confidence;
  reason: string;
  /** P(in outscores out), the calibrated probability the tag is a band of. Null for an
   *  empty slot, where nobody was compared. */
  p?: number | null;
  /** A fix nobody has to think about: the slot was empty or the man in it will not play. */
  forced?: boolean;
}

/** One read on a close call (`engine/decisions.py`): which way it points and the fact,
 *  stated. `favors` is against the decision's `start` man: "start" backs him, "sit" backs
 *  the other, null is context. `key` is one of the seven reads in `LINEUP.factor`. */
export interface DecisionFactor {
  key: "variance" | "stack" | "opponent" | "health" | "rest" | "form" | "role";
  favors: "start" | "sit" | null;
  line: string;
}

/** One man's read on his own, for the side-by-side grid (`engine/decisions.card`): a word
 *  or two, the fact behind it, and how it sits with this week's call. */
export interface ReadCell {
  text: string;
  sub: string | null;
  tone: "good" | "bad" | null;
}

/** A man's card: one cell per read he has data for, keyed like `DecisionFactor.key`. */
export type ReadCard = Partial<Record<DecisionFactor["key"], ReadCell>>;

/** Your own matchup, as the close calls read it: chase the ceiling or protect the floor. */
export interface DecisionGame {
  state: "ahead" | "behind" | "even";
  margin: number;
  live: boolean;
  line: string;
}

/**
 * A start/sit the projection alone does not settle: P(start outscores sit) is under the
 * Lock band. `start` is the engine's call, `change` says whether that differs from the
 * lineup you set, `tipped` says the reads (not the projection) made the call, and `tilt`
 * is the count of reads pointing at `start` net of those pointing at `sit`.
 */
export interface LineupDecision {
  slot: string;
  start: Player;
  sit: Player;
  p: number;
  confidence: Confidence;
  change: boolean;
  tipped: boolean;
  reason: string;
  game: DecisionGame | null;
  factors: DecisionFactor[];
  tilt: number;
}

/** A man who could take a role instead of the engine's pick. `p` is P(pick outscores him),
 *  `factors` the reads on the pair pointed at the pick ("start" backs the pick, "sit" backs
 *  him), `opp` who he plays ("vs DAL", "@ DAL", "Bye"; null without a schedule). */
export interface LineupCandidate {
  player: Player;
  p: number;
  confidence: Confidence;
  factors: DecisionFactor[];
  tilt: number;
  opp: string | null;
  /** His reads on his own. Optional: an API deployed before the grid does not send it. */
  card?: ReadCard;
}

/**
 * One starting role, named the way a manager names it (RB2, WR1, FLEX): the engine's pick,
 * the man you set there, and every man who could take it instead. `decision` is true when
 * the pick is not a Lock over the closest candidate: the role needs the owner. `change`
 * says the pick was not in the lineup you set; `tipped` that the reads, not the
 * projection, seated him. `confidence` and `p` are the pick against the closest candidate.
 */
export interface LineupRole {
  slot: string;
  label: string;
  pick: Player | null;
  was: Player | null;
  candidates: LineupCandidate[];
  confidence: Confidence;
  p: number;
  decision: boolean;
  change: boolean;
  tipped: boolean;
  reason: string;
  game: DecisionGame | null;
  opp: string | null;
  /** The pick's reads on his own. Optional, like the candidates'. */
  card?: ReadCard;
}

/** A slot nobody on the roster can fill this week. The fix is the wire. */
export interface LineupHole {
  slot: string;
  player: Player | null;
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
  /** The two piles, counted: what has to change, and what has to be decided. `required`
   *  counts `holes` too, because a slot nobody can fill is still something to fix. */
  summary?: { required: number; decisions: number };
  /** Nothing to think about: a forced fix, or a swap the projection has settled (Lock). */
  required?: LineupChange[];
  holes?: LineupHole[];
  /** The close calls, pairwise, kept for the film and the grading. The page reads `roles`. */
  decisions?: LineupDecision[];
  /** Every starting role with its pick and the men who could take it. The ones that are a
   *  `decision` are the page's second pile. */
  roles?: LineupRole[];
  /** Where this lineup's projection ranks among the league's this week. */
  standing?: { rank: number; of: number };
  /** Null (or absent, on an older API build) until a starter's game has kicked off. */
  live?: LineupLive | null;
  /** Starters still to kick off. Zero: nothing left to set this week. */
  pending?: number;
  /** The week, played. Only from the week's last game until Tuesday 12:00 ET. */
  recap?: LineupRecap | null;
  /** Where the week stands. Null before the scoreboard has been read. */
  clock?: WeekClock | null;
  /** Set when this is next week's lineup because the week rolled at Tuesday noon. */
  rolled_from?: number | null;
  slots: LineupSlot[];
  bench: BenchEntry[];
  /** Every swap the lineup makes from the one you set, required or decided. */
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

// ---------------------------------------------------------------------------
// The film, as the replay (docs/API.md §The film; edge/engine/film.py)
// ---------------------------------------------------------------------------

/** Where a past projection came from. "platform" is the vendor's stored number, which may
 * have been revised after the games; the page says "as Sleeper has it now" beside it. */
export type FilmSource = "freeze" | "runs" | "platform";

export type FilmVerdict = "went_off" | "flopped" | "as_expected" | "hurt_pregame" | "hurt_in_game" | "did_not_play";

export interface FilmPlayerRef {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
}

/** One reason a man scored what he did. Printed only when the number is unusual for him. */
export interface FilmReason {
  kind: "td_luck" | "usage" | "game_script" | "snaps" | "efficiency" | "turnover" | "injury" | "bye";
  line: string;
  /** +1 helped him, -1 hurt him. */
  sign: 1 | -1;
}

export interface FilmHistory {
  /** 1 = his best game this season. */
  rank_this_season: number;
  weeks: number;
  /** Set only on his best game of the season: the last game he scored as much, or, with
   * `earliest`, the first week the log holds (2025 today). */
  best_since: { season: number; week: number; earliest: boolean } | null;
}

export interface FilmNext {
  kind: "start" | "move_on" | "hold";
  line: string;
  /** The tab that acts on it, or null for "hold". */
  href: string | null;
}

export interface FilmAttribution {
  player: FilmPlayerRef;
  /** The slot he started in, or "BN". */
  slot: string;
  started: boolean;
  had: number | null;
  source: FilmSource | null;
  went: number;
  delta: number | null;
  /** Null when no projection is on record for him. */
  verdict: FilmVerdict | null;
  reasons: FilmReason[];
  history: FilmHistory | null;
  /** Only on the newest graded week. */
  next: FilmNext | null;
}

export interface FilmSwing {
  kind: "opponent" | "turnover" | "injury" | "bench" | "swap" | "claim" | null;
  control: "outside" | "decision" | null;
  points: number | null;
  /** Null only when there was no opponent (a bye). */
  line: string | null;
}

export interface FilmCover {
  /** Absent on a week's own cover; set on the season's newest. */
  week?: number;
  /** The one kind and true line, or null when the scoreline is the cover. */
  line: string | null;
  result: "W" | "L" | "T" | null;
  my_points: number;
  their_points: number | null;
  opponent: string | null;
}

export interface FilmFact {
  kind: "all_play" | "top_score" | "season_best" | "perfect_lineup";
  line: string;
}

export interface WeekFilm {
  week: number;
  opponent: string | null;
  result: "W" | "L" | "T" | null;
  my_points: number;
  their_points: number | null;
  cover: FilmCover;
  facts: FilmFact[];
  swing: FilmSwing | null;
  /** The manager's lineup against the best he had. Null without per-player points. */
  lineup: { points: number; best_possible: number; left: number; perfect: boolean } | null;
  injuries: { player: FilmPlayerRef; verdict: FilmVerdict; line: string | null }[];
  /** Starters in slot order, then the bench men worth a line. */
  attributions: FilmAttribution[];
  /** False when the platform gave a scoreline and nobody's points (ESPN, until F-8). */
  line_by_line: boolean;
  /** How many starters' projections came from each source. */
  sources: Partial<Record<FilmSource, number>>;
  takeaway: (FilmNext & { player: FilmPlayerRef }) | null;
}

export interface FilmSeason {
  team: string;
  league: string;
  /** The NFL season, for keys that must not repeat next year (the projector's). */
  season: number;
  /** The newest week's cover, with its week. Null before any week is over. */
  cover: FilmCover | null;
  /** Newest first. Only weeks that are over. */
  weeks: WeekFilm[];
  algo_version: string;
}

// ---------------------------------------------------------------------------
// The film's league half (docs/API.md §The league; edge/engine/league_film.py)
// ---------------------------------------------------------------------------

export interface FilmTeamRef {
  id: string;
  name: string;
}

export interface FilmSuperlative {
  kind: "top_score" | "unluckiest" | "luckiest" | "blowout" | "best_manager" | "most_left" | "best_claim";
  team: FilmTeamRef;
  value: number;
  line: string;
}

export interface FilmGroups {
  positions: string[];
  teams: { team: FilmTeamRef; overall: string; overall_rank: number; positions: Record<string, { grade: string; rank: number }> }[];
}

export interface FilmExpectation {
  team: FilmTeamRef;
  week: { points: number; projected: number; delta: number } | null;
  /** Only the weeks where every starter had a number; `weeks` says how many. */
  season: { points: number; projected: number; delta: number; weeks: number } | null;
}

export interface FilmGauntlet {
  team: FilmTeamRef;
  points_against: number;
  per_game: number | null;
  /** 1 = the most points faced. */
  rank: number;
}

export interface FilmTradeSide {
  team: FilmTeamRef;
  /** What this side received. */
  players: { id: string; name: string }[];
  /** Points those players scored for this side since, while on its roster. So far. */
  points: number;
  /** Rest-of-season value of what it received: a projection, labelled as one. */
  ros: number;
  /** Draft picks received: named, not valued. */
  picks: number;
  net: number;
  ros_from_here: number;
}

export interface FilmTrade {
  week: number;
  weeks_since: number;
  /** False for a trade under two weeks old: shown, never ranked. */
  ranked: boolean;
  sides: FilmTradeSide[];
}

export interface FilmClaim {
  week: number;
  team: FilmTeamRef;
  add: { id: string; name: string };
  drop: { id: string; name: string }[];
  /** What the pickup scored for this team while on it. */
  points: number;
  /** What the dropped men scored since, wherever they went. */
  dropped_points: number;
  net: number;
  ranked: boolean;
}

export interface FilmLedger {
  through_week: number | null;
  trades: FilmTrade[];
  best_claims: FilmClaim[];
  worst_claims: FilmClaim[];
  teams: { team: FilmTeamRef; moves: number; net: number }[];
}

export interface FilmSeed {
  seed: number;
  team: FilmTeamRef;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  in: boolean;
  /** Inside the line: games clear of the first team out. Outside: games back of the last seed. */
  games: number;
}

export interface FilmPlayoffs {
  teams: number;
  start_week: number | null;
  weeks_left: number | null;
  seeds: FilmSeed[];
}

export interface LeagueFilm {
  league: string;
  /** The newest finished week, which the superlatives are about. */
  week: number | null;
  superlatives: FilmSuperlative[];
  groups: FilmGroups;
  expectation: FilmExpectation[];
  gauntlet: FilmGauntlet[];
  ledger: FilmLedger;
  /** Null when the league did not say how many make it, or nobody has played. */
  playoffs: FilmPlayoffs | null;
  algo_version: string;
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
  /** His game this week has kicked off: `weekly_gain` is 0 and the page says "Played". */
  played?: boolean;
}

export interface Waivers {
  /** The week the claims are for: next week once this one is decided. */
  week: number;
  faab_remaining: number | null;
  waiver_type?: string;
  /** Set when `week` is next week because the week it was rolled from is decided. */
  rolled_from?: number | null;
  clock?: WeekClock | null;
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
  /** His game this week has kicked off: no weekly gain, judged on what comes next. */
  played?: boolean;
}

export interface WaiverPlanResponse {
  week: number;
  rolled_from?: number | null;
  clock?: WeekClock | null;
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
  /** Asset-value balance, min/max. An engine filter now, never shown (W-033). */
  fairness: number;
  /** Will they say yes? The same read the verdict prints. Optional: an older API omits it. */
  acceptance?: Acceptance;
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
  /** The free preview names one GM; this counts the partners a pass would open. */
  hidden?: number;
  algo_version: string;
}

export interface SharedPlayer {
  name: string;
  position: string;
  nfl_team: string;
  photo: string | null;
  team_logo: string | null;
}

export type ShareKind = "trade" | "lock" | "film" | "battle";

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
  /** Absent on a share made before the acceptance read existed (those carry `fairness`). */
  acceptance?: Acceptance;
  style: string | null;
  explanation: string;
  league_name: string;
  week: number;
  give_players: SharedPlayer[];
  get_players: SharedPlayer[];
}

/** What the film's share button sends: the replay cover and at most one player. */
export interface FilmShare {
  result: "W" | "L" | "T" | null;
  my_points: number;
  their_points: number | null;
  opponent: string | null;
  line: string | null;
  team: string;
  star: (SharedPlayer & { went: number }) | null;
}

/** The public snapshot behind /s/{id} for last week's replay cover. Free, like a Lock. */
export interface SharedFilm extends FilmShare {
  kind: "film";
  league_name: string;
  week: number;
}

/** The public snapshot behind /s/{id} for a Position Battle. Display fields only. */
export interface SharedBattle {
  kind: "battle";
  league_name: string;
  week: number;
  spot: string;
  a: SharedPlayer & { where: BattleWhere["kind"] | null };
  b: SharedPlayer & { where: BattleWhere["kind"] | null };
  horizons: Pick<BattleHorizon, "key" | "first" | "last" | "a" | "b" | "winner" | "strength" | "p">[];
  headline: Pick<BattleHeadline, "kind" | "winner" | "a" | "b">;
  tally: { a: number; b: number; rows: number };
}

/** Any kind of snapshot. Shares written before Lock sharing existed carry no `kind`. */
export type SharedSnapshot = SharedVerdict | SharedLock | SharedFilm | SharedBattle;

export function isSharedBattle(s: SharedSnapshot): s is SharedBattle {
  return s.kind === "battle";
}

export function isSharedFilm(s: SharedSnapshot): s is SharedFilm {
  return s.kind === "film";
}

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

/** "Will they say yes?" (W-033): a three-step read off their lineup and their history. */
export type Acceptance = "Likely" | "Maybe" | "Unlikely";

/**
 * One side of a graded trade, every figure as printed: the engine rounds once
 * (`Side.to_dict`), ROS figures in whole points and this week to one decimal, and every
 * surface quotes these numbers rather than rounding again (W-032).
 */
export interface TradeSide {
  team_id?: string;
  team_name?: string;
  value_out: number;
  value_in: number;
  /** value_in - value_out of the printed values. Optional: an older API omits it. */
  value_net?: number;
  lineup_delta_week: number;
  lineup_delta_ros: number;
}

/** Empty object when the league has no transaction history yet. */
export interface Tendencies {
  trades?: number;
  waiver_claims?: number;
  fa_adds?: number;
  /** Null in a league with no FAAB budget, where an average bid reads nothing. */
  avg_bid?: number | null;
  max_bid?: number | null;
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
  /** Their OWN lineup change, never ours with the sign flipped. */
  their_delta_ros: number;
  acceptance: Acceptance;
  style: string | null;
}

export interface TradeResult {
  /** The week `lineup_delta_week` is for: next week once this one is decided. Absent on
   *  an older API build. */
  week?: number;
  verdict: Verdict;
  me: TradeSide;
  them: TradeSide;
  acceptance: Acceptance;
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
  /** The platform's own points once the games are on; null before kickoff and on an
   *  older API build. `live` is true when either side has any. */
  my_points?: number | null;
  their_points?: number | null;
  live?: boolean;
  /** `pre` before any starter kicks off; `live` once one has; `final` once every starter on
   *  both sides has played. Absent on an older API build, which reads as `pre`. From `live`
   *  on, `win_prob` is taken from the live totals below, not the projections. */
  state?: "pre" | "live" | "final";
  /** Points so far plus the projection still to come, each side. Null before kickoff. */
  my_live?: number | null;
  their_live?: number | null;
  /** Projected points each side has still to score. */
  my_left?: number | null;
  their_left?: number | null;
  /** Where the week stands, for the clock beside the score. */
  clock?: WeekClock | null;
  /** On the desk only: the opponent's record and competition rank out of `teams`, from the
   *  same standings table as the nameplate. Null when the opponent is not in the table. */
  opponent_record?: string | null;
  opponent_rank?: number | null;
  teams?: number;
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

/** How hard a story lands: 4 is a starter of yours ruled out, 0 is a line to read past. */
export type NewsSeverity = 0 | 1 | 2 | 3 | 4;

export interface NewsItem {
  id: string;
  kind: NewsKind;
  level: NewsLevel;
  severity: NewsSeverity;
  /** Whether the row carries a door into the action plan. False on upside (good-news)
   *  stories (`newsdesk.has_plan`); absent from an older payload, read off `level`. */
  plan?: boolean;
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
  /**
   * The best item inside, as the notebook's cover line: what it says and whose face is on
   * it. Null when the binder is empty or locked; a locked binder never names a player.
   * Optional as well as nullable: an older API build does not send it.
   */
  top?: { title: string; player: Player | null } | null;
}

/**
 * Last week, in one line: `engine/recap.last_week` cut to its scoreline and its count. Two
 * integers, never a rate. Null in week 1 and for a reader with no recorded call.
 */
export interface Film {
  week: number;
  result: "W" | "L" | "T" | null;
  score: number;
  opp_score: number | null;
  /** Null when we recorded no call for this reader that week: the cover line stands alone. */
  hits: number | null;
  total: number | null;
  /** The replay's cover line for that week, or null when the scoreline is the cover. */
  line: string | null;
  /** Keys the notebook's "not yet opened" light, with the league and the week. */
  season: number | null;
}

/** Three numbers on the desk's nameplate. `ppg` is null before a game has been played. */
export interface DeskStanding {
  record: string;
  rank: number;
  teams: number;
  ppg: number | null;
}

/** One game this week, for the ticker: both teams, the engine's projected total for each,
 *  and the platform's points once the game is on (null before kickoff). */
export interface ScoreboardGame {
  matchup_id: number | string;
  teams: { id: string; name: string; proj: number; points: number | null }[];
}

export interface Desk {
  week: number;
  team: string;
  league: string;
  news: DeskNews;
  /** Optional as well as nullable: an older API build does not send it. */
  standing?: DeskStanding | null;
  matchup?: Matchup | null;
  /** Where the week stands. Optional: an older API build does not send it. */
  clock?: WeekClock | null;
  sheet: { summary: string; moves: number; all_clear: boolean };
  binders: Binder[];
  /** Optional as well as nullable: an older API build does not send it. */
  film?: Film | null;
  /** Every game this week, yours first. Optional: an older API build does not send it. */
  scoreboard?: ScoreboardGame[];
  entitlements: Feature[];
  synced_at: number;
}

/* ------------------------------------------------------------- the plan ---
   One story off the desk: `GET .../team/{id}/desk/plan/{kind}/{mine}/{about}`. See
   docs/API.md, "The action plan". */

export type Posture = "monitor" | "replace" | "watch" | "opening";

/** A man on the depth chart behind the one in the story, and where he sits in this league. */
export interface NextUp extends NewsAbout {
  depth_order: number | null;
  where: "yours" | "wire" | "rostered" | "unknown";
  owner: string | null;
}

export interface PlanWire {
  locked: boolean;
  count: number;
  picks: { player: Player; bid: Bid; reason: string; weekly_gain: number }[];
}

export interface PlanTrade {
  locked: boolean;
  count: number;
  partners: { team_id: string; team_name: string; owner_name: string | null; surplus: number }[];
}

export interface Plan {
  kind: NewsKind;
  posture: Posture;
  severity: NewsSeverity;
  week: number;
  player: Player & { starter: boolean };
  about: NewsAbout;
  /** The story as the desk shows it now; null once it has aged off. */
  story: NewsItem | null;
  next_up: NextUp[];
  bench: Player[];
  swap: Player | null;
  wire: PlanWire | null;
  trade: PlanTrade | null;
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
  /** The film's free cover, riding its 402 (`/film`). */
  cover?: FilmCover | null;
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
export type BoardSort = "projected" | "ros" | "trending" | "season" | "name" | "position";

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
  /** His game this week once it has kicked off; absent or null before kickoff. The board
   *  then shows "Played" in place of a projection (W-027). */
  game?: "in" | "final" | null;
  /** Rest of the fantasy regular season, in this league's scoring. */
  ros: number | null;
  trending_adds: number;
  /** Null means nobody in this league holds him. `is_me` needs a `team_id` on the request. */
  rostered_by: { team_id: string; team_name: string; is_me: boolean } | null;
  /** Points so far this season in this league's scoring, and his rank at his position on
   *  them. Only on a board asked for with `season`; null for a player who has not played. */
  season_pts?: number | null;
  pos_rank?: number | null;
  /** The one fact that put him in a lens. Only on a board asked for with `lens`. */
  lens?: LensFact;
}

/**
 * The scouting lenses. Mirrors `LENSES` in `edge/api/lenses.py`. Each one is a question a
 * column sort cannot answer — my handcuffs, the next man up, a defence's next three weeks —
 * and every one of them is description: a depth chart, a schedule, an add count.
 */
export type Lens = "shortlist" | "handcuffs" | "backups" | "defenses" | "byes" | "risers";

/** The man a backup sits behind, as the platform's depth chart lists him. */
export interface LensPerson {
  id: string;
  name: string;
  position: string;
  injury_status: string | null;
  is_mine: boolean;
  depth: number | null;
}

/** One week of a defence's run: who, where, and how that offence has scored (rank 1 = least). */
export interface LensWeek {
  week: number;
  /** Null is a bye. */
  opp: string | null;
  home: boolean | null;
  rank: number | null;
  of: number | null;
  ppg: number | null;
}

export interface LensFact {
  behind?: LensPerson;
  /** The man in front is in doubt this week: the job may already be open. */
  opening?: boolean;
  outlook?: LensWeek[];
  covers?: { id: string; name: string; week: number }[];
  /** The shortlist: every board he is top five at his position on, and where. */
  top?: Partial<Record<"proj" | "ros" | "adds", number>>;
}

/** How many free agents each lens holds, for the chip beside its name. */
export interface LensCounts {
  week: number;
  counts: Record<Lens, number>;
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
  lens?: Lens | null;
  algo_version?: string;
  /** Rows a free account cannot see: the board shows the top three and counts the rest. */
  locked?: number;
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
  lens?: Lens | null;
  /** Ask for the season so far (`season_pts`, `pos_rank`). */
  season?: boolean;
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

/* ---- the admin's numbers: GET /api/admin/metrics (edge/business/metrics.py) ---- */

export interface MetricTiles {
  revenue_cents: number;
  new_buyers: number;
  signups: number;
  leagues_linked: number;
  spend_cents: number;
  cac_cents: number | null;
}

export type FunnelKey = "landing_signup" | "signup_linked" | "linked_paid_7d" | "week_retained";
export type FunnelStatus = "healthy" | "watch" | "leak" | "none";

export interface FunnelStep {
  key: FunnelKey;
  num: number;
  den: number;
  rate: number | null;
  healthy: number;
  leak: number;
  status: FunnelStatus;
  scope: "range" | "to_date";
}

/** One landing button's row: presses this range, and the sign-ups credited to it (last press wins). */
export interface DoorRow {
  door: string;
  clicks: number;
  people: number;
  signups: number;
  rate: number | null;
}

export type ChannelVerdict = "scale" | "watch" | "kill" | "organic";

export interface ChannelRow {
  source: string;
  visitors: number;
  signups: number;
  linked: number;
  buyers: number;
  revenue_cents: number;
  spend_cents: number;
  cac_cents: number | null;
  verdict: ChannelVerdict;
  campaigns: { campaign: string; signups: number; buyers: number; revenue_cents: number }[];
}

export interface SpendRow {
  id: string;
  day: string;
  channel: string;
  campaign: string;
  cents: number;
  clicks: number | null;
  note: string;
}

export interface CohortRow {
  week_of: string;
  size: number;
  cells: (number | null)[];
}

export interface AdminMetrics {
  range: { start: number; end: number; now: number; start_day: string; end_day: string };
  today: {
    current: MetricTiles & { paying_now: number };
    previous: MetricTiles;
    last_hour: { signups: number; checkouts: number; purchases: number };
  };
  /** The sign-up walk for this range's sign-ups (docs/SPEC-ONBOARDING.md). Absent on older APIs. */
  walk?: {
    cohort: number;
    offer_skipped: number;
    steps: { key: string; label: string; num: number; of_signups: number | null; of_previous: number | null }[];
  };
  funnel: {
    steps: FunnelStep[];
    /** Absent from an API older than `cta_click`. */
    doors?: DoorRow[];
    paywall: { feature: string; views: number }[];
    checkout: { started: number; finished: number; abandoned: number; finish_rate: number | null };
  };
  channels: { rows: ChannelRow[]; spend: SpendRow[] };
  revenue: {
    by_day: { day: string; by_sku: Record<string, number>; total_cents: number }[];
    gross_cents: number;
    refunds_cents: number;
    net_cents: number;
    net_after_fees_cents: number;
    payments: number;
    subscriptions: { started: number; renewals: number; cancelled: number; upgraded: number };
  };
  retention: { all: CohortRow[]; paying: CohortRow[] };
  loop: {
    created: number;
    opens: number;
    opens_per_card: number | null;
    signups: number;
    buyers: number;
    top: { id: string; views: number; created: number }[];
  };
  thresholds: {
    target_cac_cents: number;
    kill_spend_cents: number;
    funnel: Record<FunnelKey, { healthy: number; leak: number }>;
  };
}

export interface AdminEvent {
  created: number;
  name: string;
  anon_id: string;
  email: string;
  sku: string;
  amount_cents: number | null;
  props: Record<string, string | number | boolean | null>;
}

/* ------------------------------------------------------------ Position Battle --- */
// docs/API.md "Position Battle"; edge/engine/battle.py.

/** Which corner: `a` holds the spot, `b` is the challenger. */
export type BattleSide = "a" | "b";

/** Where a man stands relative to the reader. `trade` names the team that holds him. */
export interface BattleWhere {
  kind: "starter" | "bench" | "wire" | "trade";
  slot: string | null;
  /** "WR2", "Bench", "Free agent", or the other team's name. */
  label: string;
  team_name: string | null;
}

/** A man in the corner list: who, where, and the two numbers a picker scans. */
export interface BattleBrief {
  /** Sleeper id, the same id the player page speaks. */
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  photo: string | null;
  team_logo: string | null;
  injury_status: string | null;
  /** This week, in this league's scoring; 0 for a man who will not play. */
  projected: number;
  ros: number;
  where: BattleWhere;
}

/** `GET .../team/{team_id}/battle/options?player=` -- free. */
export interface BattleOptions {
  player: BattleBrief;
  /** The positions that can fight him for this spot, his own first. */
  positions: string[];
  roster: BattleBrief[];
  wire: BattleBrief[];
  trade: BattleBrief[];
  week: number;
}

/** One week of a man's road to week 17. `rank` 1 is the toughest defence against his position. */
export interface BattleWeek {
  week: number;
  opp: string | null;
  home: boolean | null;
  bye: boolean;
  rank: number | null;
  of: number | null;
}

export interface BattleFighter extends BattleBrief {
  injury_body_part: string | null;
  bye_week: number | null;
  slate: BattleWeek[];
  /** "vs DAL", "@ DAL", "Bye"; null without a schedule. */
  opp: string | null;
}

export type BattleHorizonKey = "week" | "next5" | "ros" | "playoffs";

/** This week's strength is the calibrated tag; a longer window's is the size of the gap. */
export type BattleStrength = Confidence | "clear" | "edge" | "even" | "live" | "final";

export interface BattleHorizon {
  key: BattleHorizonKey;
  first: number;
  last: number;
  /** Projected points over the window, each side, this league's scoring. */
  a: number;
  b: number;
  a_games: number | null;
  b_games: number | null;
  winner: BattleSide | null;
  strength: BattleStrength;
  /** This week only: the winner's chance to outscore the other (`calibration.p_beats`). */
  p: number | null;
  /** The reads (this week) or the schedule (later) moved it off the projection's lean. */
  tipped: boolean;
  /** Too close to move: the man in the spot keeps it. */
  held: boolean;
  /** This week only: the start/sit reads, pointed at `a` ("start" backs a, "sit" backs b). */
  factors?: DecisionFactor[];
  tilt?: number;
  sos_a?: number | null;
  sos_b?: number | null;
  /** Playoffs only: the league never said when they start, so weeks 15-17 were used. */
  assumed?: boolean;
  /** This week only: `final` once both men have played (`a`/`b` are actuals, no `p`),
   *  `live` once either has kicked off (actual + still to play), `pre` before. */
  state?: "pre" | "live" | "final";
  a_state?: GameState | null;
  b_state?: GameState | null;
  a_points?: number | null;
  b_points?: number | null;
}

export interface BattleCell {
  v: number | null;
  text: string;
  sub: string | null;
  /** The depth-chart rows name a man; these say who and who holds him here. */
  id?: string;
  owned?: "mine" | "wire" | "team" | "none";
}

export type BattleFamily = "outlook" | "season" | "usage" | "risk" | "schedule" | "situation" | "depth";

export interface BattleRow {
  key: string;
  family: BattleFamily;
  a: BattleCell;
  b: BattleCell;
  /** Which man this row favours, or neither. A row is a count, never a weight. */
  edge: BattleSide | null;
}

export interface BattleHeadline {
  kind: "sweep" | "split" | "draw";
  winner: BattleSide | null;
  /** Horizons each side took. */
  a: number;
  b: number;
  now: BattleSide | null;
  later: BattleSide | null;
}

export interface BattleTally {
  total: { a: number; b: number; rows: number };
  families: Partial<Record<BattleFamily, { a: number; b: number; rows: number }>>;
}

/** `GET .../team/{team_id}/battle?a=&b=` -- paid (`battle`). */
export interface Battle {
  week: number;
  /** "WR2" when the man in the spot starts for you; his position otherwise. */
  spot: string;
  a: BattleFighter;
  b: BattleFighter;
  horizons: BattleHorizon[];
  headline: BattleHeadline;
  tape: BattleRow[];
  tally: BattleTally;
  playoffs: { first: number; last: number; assumed: boolean } | null;
  algo_version: string;
}

/** What the web gets back: the fight, or the haze and the engine's name-free sentence. */
export type BattleResult = { locked: false; battle: Battle } | { locked: true; teaser: string | null };
