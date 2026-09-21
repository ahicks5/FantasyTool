# Penthouse API contract (v1)

FastAPI app in `edge/api/app.py`, served at `/api`. All responses JSON. Errors: `{"error": "message"}` with 4xx. Two shapes carry more:
- **402** — the feature needs a purchase: `{"error","feature","teaser","upsell":[product,...]}`.
  `teaser` is a concrete, name-free sentence; the web renders it as a locked state.
- **403** from a private ESPN league: `{"error","needs_espn_auth":bool}`.
  true means ask for cookies, false means the ones supplied expired.
Auth: `Authorization: Bearer <supabase jwt>` (optional in dev; `X-Edge-User: <email>` accepted when `EDGE_DEV=1`).

The package, the env vars and the header keep the `edge`/`EDGE_` spelling on purpose — only what a
user reads says Penthouse. Wire names below are the contract; `web/src/lib/types.ts` mirrors them.

## Products / entitlements
`GET /api/products` → pricing plus `attribution`, the credit line the active projection vendor
requires (Sleeper's docs ask for it on trending data). The UI must render it.
```json
{"attribution":"Projections and trending data from Sleeper",
 "products":[
  {"sku":"free","name":"Free","price_cents":0,"features":["my_team"],"leagues":1,"kind":"free","blurb":"Start/sit calls for one team, every week."},
  {"sku":"waivers","name":"Wire Pass","price_cents":300,"features":["waivers"],"leagues":1,"kind":"a_la_carte","blurb":"The wire, ranked for your roster, with the bid and the drop. Rest of season."},
  {"sku":"trade_lab","name":"Trade Lab","price_cents":500,"features":["trade_lab"],"leagues":1,"kind":"a_la_carte","blurb":"Trade verdicts and counters tuned to the other manager. Rest of season."},
  {"sku":"full_report","name":"The Penthouse","price_cents":700,"features":["my_team","waivers","trade_lab","full_report"],"leagues":5,"kind":"bundle","blurb":"The whole booth, every week, up to 5 leagues."}
]}
```
`GET /api/me` → `{"email":"...","entitlements":["my_team","waivers"],"leagues_allowed":1,"leagues":[{"platform":"sleeper","league_id":"...","name":"...","team_id":"3"}]}
`GET /api/me` also carries `"email_opt_in":false`.

`GET /api/me/email` → `{"email":"...","email_opt_in":false}`
`PUT /api/me/email {"email_opt_in":true}` → `{"email":"...","email_opt_in":true}`

Signed in only. Off is the answer for an account that never chose, so the absence of a record is
never read as consent. The send list is built from this (`edge/delivery/send.recipients`) and also
requires a connected league. Deleting an account removes the preference — see `docs/DATA_INVENTORY.md`.
Nothing is sent yet: there is no `RESEND_API_KEY` and no verified sending domain, so the send is a
dry run and the opt-in screen says so in as many words.

`POST /api/checkout {"sku":"full_report"}` → `{"url":"https://checkout.stripe.com/..."}`
`POST /api/stripe/webhook` (Stripe only)

## Data subject requests
Signed in only — an account acting on its own data. See `docs/DATA_INVENTORY.md`.

`GET /api/me/data` → `{"email":"...","data":{"purchases":[...],"leagues":[...],"runs":[...],"feedback":[...],"email_prefs":[...]}}`
`DELETE /api/me?confirm=delete` → `{"ok":true,"deleted":{"purchases":1,"leagues":2,"runs":9,"feedback":0,"email_prefs":1}}`

Deletion revokes the season pass along with the data — that is the honest consequence and the
`confirm` parameter exists so it cannot happen by accident. Public share links survive: they carry
no email (`edge/api/share.py`).

## Leagues
`GET /api/sleeper/leagues?username=X` → `[{"league_id","name","status","total_rosters"}]`
`GET /api/league/{platform}/{league_id}` → summary
```json
{"id":"...","platform":"sleeper","name":"...","season":2026,"week":2,
 "waiver_type":"faab","faab_budget":100,"starting_slots":["QB","RB",...],
 "teams":[{"id":"1","name":"HusH","owner_name":"HusH","record":"2-0","points_for":159.1,"faab_remaining":100}]}
```
`POST /api/connect {"platform":"sleeper","league_id":"...","team_id":"1"}` → saves to the user's leagues (counts against `leagues_allowed`).

## Depth chart (feature: my_team)

The start/sit call sheet for one team. Wire name stays `my_team`.
`GET /api/league/{platform}/{league_id}/team/{team_id}/lineup` →
```json
{"week":2,"projected_total":131.4,"current_total":124.9,
 "slots":[{"slot":"RB","player":{"id":"4866","name":"Jahmyr Gibbs","position":"RB","nfl_team":"DET","injury_status":null,"projected":26.1,"opponent":"BUF"},
           "confidence":"Lock","reason":"Top RB projection this week (26.1). Nobody on your bench is close.","change":false}],
 "bench":[{"player":{...},"reason":"Sit: 11.2 proj, 4.1 behind your last FLEX."}],
 "changes":[{"slot":"FLEX","out":{"id":"...","name":"Stefon Diggs"},"in":{"id":"...","name":"MarShawn Lloyd"},"gain":1.0,"confidence":"Coin flip","reason":"..."}],
 "grades":{"overall":"A-","overall_percentile":0.83,"overall_rank":1,"league_size":12,
           "note":"1st of 12 on rest-of-season starting value.",
           "positions":[{"position":"RB","grade":"C+","percentile":0.52,"starters":3,"rank":8,
                         "league_size":12,"depth":"thin","starter_names":["Saquon Barkley","David Montgomery"],
                         "next_man":"Aaron Jones","note":"8th of 12 at RB. Aaron Jones is the drop-off..."}]}}
```
Confidence stamp: `Lock` (margin ≥ 4), `Lean` (≥ 1.5), `Coin flip` (< 1.5).

**The scorecard** (`grades`, free tier — `edge/engine/grades.py`) rides along here rather than
getting its own endpoint, because the page that shows it already fetches this and grading needs
the same league bundle.

- `grade` is one of `F D- D D+ C- C C+ B- B B+ A- A A+`.
- `percentile` is 0..1 where **0.5 is league average**. It is measured in *starters*: ±0.75 of a
  starter above or below the league mean spans the whole scale. A `C` therefore means "no edge
  either way", not "bad".
- `rank` is reported separately from `grade` on purpose. Rank is where you stand; the grade is
  how much that standing is worth. In a league where every QB is identical, rank 12 still grades
  `C`, because nobody has an edge.
- `depth` is `deep | ok | thin`, measured against what this league actually starts at that
  position — not against the team's own starters. `next_man` is null when nobody is behind.
- `starters` folds FLEX in, so a 2-RB + 2-FLEX league reports ~3 RB starters.

## The owner's desk (free)

`GET /api/league/{platform}/{league_id}/team/{team_id}/desk`

The front page after the elevator. One payload: what just happened in the NFL that touches
this roster, who is next, the call sheet's own summary, and one binder per staff member with
how many items are inside it. Free for every reader; a paid binder still carries its count
and never a name.

```json
{
  "week": 2, "team": "Gaainzzz", "league": "The Megalabowl", "synced_at": 1758400000.0,
  "news": {
    "window_hours": 72, "count": 6,
    "items": [{
      "id": "own:4866:4866", "kind": "own", "level": "critical", "severity": 3,
      "headline": "Saquon Barkley is Questionable (arm)",
      "detail": "RB, in your lineup. Practice: limited.",
      "at": 1789940000000, "age_hours": 9.4,
      "player": {"id": "4866", "name": "Saquon Barkley", "position": "RB", "nfl_team": "PHI", "starter": true,
                 "photo": "https://sleepercdn.com/content/nfl/players/thumb/4866.jpg",
                 "team_logo": "https://sleepercdn.com/images/team_logos/nfl/phi.png"},
      "about": {"id": "4866", "name": "Saquon Barkley", "position": "RB", "nfl_team": "PHI",
                "status": "Questionable", "body_part": "Arm", "notes": null, "practice": "Limited",
                "photo": "https://sleepercdn.com/content/nfl/players/thumb/4866.jpg",
                "team_logo": "https://sleepercdn.com/images/team_logos/nfl/phi.png"},
      "also": [], "others": []
    }]
  },
  "standing": {"record": "2-0", "rank": 3, "teams": 12, "ppg": 121.4},
  "matchup": {"opponent": "HusH", "opponent_id": "8", "my_proj": 118.2, "their_proj": 109.7, "win_prob": 0.61,
              "opponent_record": "1-1", "opponent_rank": 7, "teams": 12},
  "sheet": {"summary": "3 moves to make", "moves": 3, "all_clear": false},
  "binders": [
    {"key": "team", "count": 2, "locked": false, "top_benefit": "+4.2 pts"},
    {"key": "waivers", "count": 1, "locked": true, "top_benefit": "+7.8 pts"},
    {"key": "trade", "count": 0, "locked": true, "top_benefit": null}
  ],
  "entitlements": ["my_team"]
}
```

- `news.items` is at most eight, hardest-landing first; `count` is how many there were.
  `kind` is one of `own` (a player of yours carries a tag), `qb` (his QB1 is flagged),
  `target` / `backfield` (a starter ahead of him is down, his role opens), `line` (his
  offensive line lost a man; merged per offence, `others` are the rest). `level` is
  `critical` (a starter of yours may not play), `warning`, `upside` or `note`; `severity`
  is how hard it lands, 4 (a starter of yours ruled out) down to 0 (a bench player's QB1 in
  doubt), from the table in `engine/newsdesk.py`, and is the sort order. `also` lists
  the other players of yours the same story touches. Every word is the platform's own
  (`injury_status`, `injury_body_part`, `injury_notes`) or the depth chart as it lists it;
  nothing is predicted and no number is invented. Only news dated inside the window counts.
- `binders[].count` is the number of call-sheet actions of that binder's type, so the badge
  and the tab it opens cannot disagree. `locked` follows `edge/products.py`.
- `standing` is the nameplate's three numbers: the record, the standings' own competition
  rank out of `teams`, and points a game: points for over *completed weeks*, never over the
  record (a league that also plays the median books two results a week). Null in week 1.
- `matchup` is the call sheet's own plus the opponent's record and competition rank out of
  `teams`, read from the same table as `standing`; `sheet.summary` is the call sheet's headline.

### The action plan (free)

`GET /api/league/{platform}/{league_id}/team/{team_id}/desk/plan/{kind}/{mine_id}/{about_id}`

One story off the desk and every door out of it (`engine/plan.py`). `kind`, `mine_id`
(`player.id`) and `about_id` (`about.id`) are the story's own. 404 when the players are not
on this roster's desk.

```json
{
  "kind": "own", "posture": "replace", "severity": 4, "week": 2, "synced_at": 1758400000.0,
  "player": {"id": "4866", "name": "Saquon Barkley", "position": "RB", "projected": 17.2, "starter": true, ...},
  "about": {"id": "4866", "name": "Saquon Barkley", "status": "Out", "body_part": "Arm", ...},
  "story": {"id": "own:4866:4866", ...},
  "next_up": [{"id": "9226", "name": "Will Shipley", "position": "RB", "nfl_team": "PHI", "depth_order": 2,
               "status": null, "where": "wire", "owner": null, "photo": "...", "team_logo": "..."}],
  "bench": [{"id": "...", "name": "Tank Bigsby", "position": "RB", "projected": 8.1, ...}],
  "swap": null,
  "wire": {"locked": true, "count": 2, "picks": []},
  "trade": {"locked": true, "count": 3, "partners": []}
}
```

- `posture` is a code the web puts words on: `monitor` (in doubt, not ruled out),
  `replace` (a starter of yours will not play), `watch` (the man who feeds your starter is
  out), `opening` (a role ahead of a player of yours came open).
- `next_up` is his NFL team's depth chart behind him, in order, with `where` each man sits
  in this league: `yours`, `wire`, `rostered` (with the `owner` team's name) or `unknown`.
  Receivers are read per alignment. Public information: never locked.
- `bench` is your own players at the spot who are not in your lineup, best projection first
  (a hole only: `own`, `qb`, `line`). `swap`, for a role opening for a bench player of
  yours, is the lowest-projected starter the engine sets at his position.
- `wire` and `trade` are null unless the story is a hole and the man is ruled out. `wire` is
  the wire's own ranking narrowed to the position (Wire Pass names them; without it `picks`
  is empty and `count` stands). `trade` is the managers carrying a surplus at the position,
  deepest first (Trade Lab names them). The counts are the same either side of the paywall.

## Scouting (feature: waivers)

Ranked pickups with the bid and the drop. Wire name stays `waivers`.
`GET /api/league/{platform}/{league_id}/team/{team_id}/waivers` →
```json
{"week":2,"faab_remaining":100,"picks":[
 {"player":{...},"fit_score":7.3,"weekly_gain":2.1,"ros_gain":18.4,"trending_adds":40212,
  "drop":{"id":"...","name":"Tank Bigsby","position":"RB"},
  "bid":{"amount":12,"range":[8,15],"pct_of_budget":12},
  "reason":"Slots into your FLEX now and RB2 for the rest of the season. Bye-week cover for Gibbs (wk 8)."}]}
```

### Player search (free)

`GET /api/league/{platform}/{league_id}/players/search?q=chase&team_id=8` →
```json
[{"id":"6794","name":"Ja'Marr Chase","position":"WR","nfl_team":"CIN","years_exp":5,"rostered":true}]
```

Every player the platform carries, not just the ones on a roster. Two characters minimum —
one letter matches thousands and the endpoint returns `[]` rather than a truncated guess.
At most 12 hits, best first: exact name, then either name's opening, then anywhere, with
Sleeper's own relevance rank breaking ties. A player without an NFL team (cut, retired)
still matches but sorts below everyone with one.

League-scoped although a player is not, for one field: `rostered` is a fact about *this*
league, and a search that could not say whether a name is already taken would send the
reader to a profile to find out.

### Player board (free)

`GET /api/league/{platform}/{league_id}/players?pos=RB,WR&avail=free&sort=ros&limit=50` →
```json
{"week":2,"total":214,"offset":0,"limit":50,"sort":"ros","order":"desc",
 "rows":[{"id":"4866","name":"Saquon Barkley","position":"RB","positions":["RB"],
          "nfl_team":"PHI","photo":"https://...","team_logo":"https://...",
          "injury_status":null,"injury_body_part":null,"bye_week":9,
          "projected":18.2,"ros":241.6,"trending_adds":1204,
          "rostered_by":{"team_id":"3","team_name":"Brown Town","is_me":false}}],
 "facets":{"positions":["QB","RB","WR","TE","DEF"],"nfl_teams":["ARI","ATL"],
           "teams":[{"id":"1","name":"Raft Ryders"}]},
 "algo_version":"directory.v1"}
```

The browse half of Scouting, next to the search box above. Every player in the league in
one list, cut and ordered by the reader.

| Param | Values | Default |
|---|---|---|
| `q` | name; two characters before it reaches past the league's own players | — |
| `pos` | comma-separated, e.g. `RB,WR`. Matches **any** slot he is eligible for | all |
| `nfl_team` | comma-separated abbreviations, e.g. `KC,SF` | all |
| `avail` | `all` · `free` · `rostered` · `mine` (needs `team_id`) | `all` |
| `owner` | one team id, for "show me his roster" | — |
| `sort` | `projected` · `ros` · `trending` · `name` · `position` | `projected` |
| `order` | `desc` · `asc` | `desc` |
| `limit` / `offset` | page size (max 200) and where to start | 50 / 0 |

`total` counts every match, not the page. `facets` is built from this league's own rows, so
a league with no kicker slot never offers a K chip — do not hard-code the lists.

`projected` is this week in **this league's scoring**; `ros` is the rest of the regular
season. **Both are `null` when we never priced him, and null is not zero** — a zero is a
real projection (bye week, deep bench), a null means we have no row for him at all, and the
board prints a dash. Null sorts last in *both* directions.

A name query reaches past the league into the full platform dump, so a player cut on
Tuesday is still findable; those rows come back with every number null. The closest name
match leads regardless of which column is sorted — somebody who typed a name is looking for
that player.

**Free, and it opens nothing.** These are each player's own numbers. Which of them fits
*your* roster, what to bid and who to cut are the wire's, they stay behind Wire Pass, and
no field on this payload carries a fit, a bid or a drop.

### Player profile (free)

`GET /api/league/{platform}/{league_id}/player/{player_id}?team_id=8` →
```json
{"player":{"id":"6794","name":"Ja'Marr Chase","position":"WR","nfl_team":"CIN","years_exp":5,
           "injury_status":null,"bye_week":10},
 "owner":{"team_id":"3","team_name":"Brown Town","is_me":false},
 "this_season":{"season":2026,"games":1,"points":18.4,"ppg":18.4,"snap_pct":0.91,
                "targets":11,"target_share":0.31,"carries":null,"rush_share":null,
                "rz_touches":2,"yards":104,"tds":1,"pos_rank":8,"pos_total":64,
                "best":18.4,"worst":18.4,
                "attempts":null,"rush_yards":null,"rec_yards":104},
 "last_season":{"season":2025,"games":17,"points":312.6,"...":"same shape"},
 "games":[{"week":1,"opponent":"CLE","played":true,"points":18.4,"snap_pct":0.91,
           "targets":11,"carries":null,"rz_touches":2,"yards":104,"tds":1}],
 "reads":[{"key":"role","head":"On the field","line":"91% of the snaps, up from 84%.","tone":"up"}],
 "algo_version":"profile.v1"}
```

Three things callers must handle, none of them an error:

- **`this_season` is null and `games` is empty** before anyone has played. In week 1 that is
  every player in the league, and `last_season` is the whole report.
- **A null stat is not a zero.** `targets` on a quarterback is `null` because the platform
  does not record one, and rendering that as "0 targets" is a lie. Same for `snap_pct` when
  the team's snap count is missing, and for `pos_rank` before anyone has scored.
- **`reads` may be empty.** It is arithmetic on the two splits, and one game against no prior
  season produces nothing worth saying.

`years_exp` is **0 for a rookie** and **null when the platform did not say** (a team defence, or
anyone off the usual depth charts). The two are not interchangeable.

`attempts`, `rush_yards` and `rec_yards` are optional and feed `reads` only, so the page renders
without them. They exist because `yards` is a combined total: divided by carries it is not yards
per carry, it is yards per carry with the receiving yards folded in. The split lets a running
back's efficiency be yards per carry and a quarterback's volume be attempts a game, which are the
numbers those positions are actually judged by.

`pos_rank` is measured against players who **took a snap**, not against every player with a row in
the feed. Last season that is 252 receivers rather than 1,365, and the difference is the whole
meaning of the number: "WR26 of 1,365" counts a thousand practice-squad players as the field he
beat. The pool therefore grows through September as players debut, which is why `pos_total` is
returned rather than implied.

`points`, `ppg`, `best`, `worst` and `pos_rank` are scored through the **league's own scoring
settings** from raw stat lines (`edge/data/scoring.py`). Sleeper's `pts_ppr` is stripped at the
source and never reaches here — the same player is a different report in a six-point-passing
league, and that is the point. Every other number is a raw count the platform published, so a
row is checkable against any box score.

**Free, on purpose, and it opens nothing.** What it returns is what already happened, which is
descriptive; Wire Pass sells the ranked board, the bid and the drop, which are decisions.
`test_the_paid_card_is_still_paid` and the 402 on `/waivers` pin the other half. Reverse it by
adding an entitlement check in the endpoint — one line, and the only line.

There is **no route-participation data** in any feed we have. Snap share (`off_snp / tm_off_snp`)
is the closest honest measure of how much a player is on the field, and it is what `snap_pct` is.
Nothing here approximates a route count.

## Trade Finder (free preview, full board: trade_lab)

`GET /api/league/{platform}/{league_id}/team/{team_id}/trades/find`

With `trade_lab` -> the full board:
`{"week":2,"my_positions":{"surplus":{"RB":41.2},"need":{"TE":12.0}},"summary":"...",
  "partners":[{"team_id":"9","team_name":"...","owner_name":"...","complement":1.84,
               "headline":"...","positions":{...},"offers":[{...}]}],
  "blockers":[...],"algo_version":"trade_finder.v1"}`

Without it -> **200, not 402**, and the same board with the move taken out (D3):
`{"preview":true,"week":2,"my_positions":{"surplus":["RB"],"need":["TE"]},"summary":"...",
  "partners":[{"team_id":"9","team_name":"...","owner_name":"...","fit":"Best fit",
               "headline":"...","positions":{"surplus":["WR"],"need":["RB"]}}],
  "algo_version":"trade_finder.v1"}`

Free is the shape of the room: what you can spare, where you are thin, which rosters are
the mirror image of yours. Paid is the move. So the preview carries no offer, no player
name, no rest-of-season figure, no fairness number and no `blockers` -- the blocker
sentence names the player you want and who holds him, so the summary falls back to the
neutral "Hold" line when there is no partner. Positions are ordered lists rather than
magnitudes, because the magnitudes are ROS points. Built by
`edge/engine/trade_finder.preview`; pinned by `tests/test_trade_finder.py` and
`test_the_free_trade_board_is_a_preview_not_a_paywall`. `POST /trade` -- the grade and the
counter -- is unchanged and still 402s.

## Trade Lab (feature: trade_lab)
`POST /api/league/{platform}/{league_id}/trade`
```json
{"my_team_id":"1","their_team_id":"4","give":["5892"],"get":["7525","8228"]}
```
→
```json
{"verdict":"Accept"|"Reject"|"Counter"|"Fair",
 "me":{"value_out":88.1,"value_in":102.4,"lineup_delta_week":1.8,"lineup_delta_ros":9.6},
 "them":{...},
 "fairness":0.87,
 "their_tendencies":{"trades":2,"waiver_claims":9,"avg_bid":14,"favorite_positions":["RB"],"style":"active dealer"},
 "counter":{"give":["5892"],"get":["7525"],"why":"They hoard RBs; asking for two starters won't fly. One-for-one keeps them whole at WR."},
 "explanation":"3–4 sentences (Claude API when key present, template otherwise)",
 "graphic":{"title":"Accept: A for B","give":["A"],"get":["B"],"my_delta_ros":23.0,
            "their_delta_ros":-13.0,"fairness":0.93,"style":"rare trader, FAAB frugal"}
 // input for the shareable verdict card. POST /api/share may additionally carry
 // give_players / get_players (name, position, nfl_team, photo, team_logo) for headshots.
}
```

## Head to head (free)

One team's scorecard, for **any** team in the league, so a roster can be read against a
rival in GM's Office. The connected team's own card already rides inside `/lineup`; this
is for the other eleven, where the page wants one rival and no start/sit advice.

Free deliberately. It returns a letter and a rank per position, computed from rosters
every manager in the league can already see on the platform itself. Trade Lab sells the
verdict on an actual offer and a counter tuned to that manager, which this is not —
`test_a_rivals_letters_are_free_and_do_not_unlock_the_trade_lab` pins the boundary.

`GET /api/league/{platform}/{league_id}/team/{team_id}/grades` →
`{"team":{"id":"4","name":"Waddle My Balls"},"grades":{ ... same `Grades` shape `/lineup` returns ... }}`

## The call sheet's last-week line (free)

`last_week` on the action feed (`GET /api/league/{platform}/{league_id}/team/{team_id}/actions`)
is how the calls we made in the last finished week landed. **Free for every reader, paid or not.**

```json
{"week":1,"result":"W","score":127.78,"opp_score":101.4,
 "calls":[{"start":{"id":"6804","name":"Jordan Love","position":"QB"},
           "sit":{"id":"4034","name":"Jared Goff","position":"QB"},
           "hit":true,"margin":5.42,"projected":2.1}],
 "hits":2,"total":3,"algo_version":"recap.v1"}
```

`null` — and the line does not render — in week 1, for a reader with no recorded run, and for
a platform that gives us a scoreline with nobody's points attached (ESPN). `result` and
`opp_score` are null for a bye week. `margin` is actual points; `projected` is the margin we
showed at the time, read back out of `runs` and null where we have no record.

**There is no summed figure here and none may be derived.** "2 of 3 calls hit" is this
reader's own week. A points-gained total, a points-left-on-the-bench total, or `hits / total`
as a rate is a decision-accuracy claim about the product, which `CLAUDE.md` bars until
`scripts/score_runs.py` has graded real weeks.

## The table (free)

Standings and the power ranking: every team's record, points for and against, the
platform's own best-possible total and streak, plus two numbers no platform publishes --
an all-play record and a rest-of-season roster ranking.

Free deliberately, and it is the top half of `/report`. Everything in it is either the
platform's own published number or computed from rosters every manager in the league can
already see. The week-by-week film below it stays behind `full_report`.

`GET /api/league/{platform}/{league_id}/standings` ->

```json
{"teams":[{"id":"8","name":"Ja'Marrying Rich","owner_name":"andrew",
           "wins":0,"losses":2,"ties":0,"points_for":219.64,"points_against":248.1,
           "max_points":260.4,"streak":"2L","rank":11,"points_rank":8,"strength_rank":6,
           "all_play":{"wins":12,"losses":10,"ties":0},"luck":0.545}],
 "algo_version":"standings.v1"}
```

Things a caller has to handle, none of which are error states:

- **`all_play` and `luck` are `null` until a week has been played**, which is the normal
  case in weeks 1 and 2 and for every brand-new connection. Every other column is still
  there. Build that state first.
- **`max_points` and `streak` are `null` on ESPN.** ESPN publishes no best-possible total
  at all, and no streak *label* -- only a length and a type, which is not the same thing.
  `points_against` is real on both platforms.
- **`points_rank` is `null` when nobody in the league has scored yet.**
- `rank` is record first, points for second. All three ranks are competition ranks: tied
  teams share the better place and the place after them is skipped.
- **`luck` is the all-play win rate MINUS the real one**, so a *positive* number means the
  team is scoring better than its record shows. That is the opposite sign to `LuckRead.gap`
  in `web/src/lib/recap.ts`; `standingsRead` there is the one place that converts.
- `strength_rank` is rest-of-season starting-lineup value (`engine/grades._lineup_value`),
  1 = best roster from here. It is allowed to disagree with `rank`; that is the point.
- Costs no extra network on a warm process: it reads the cached league bundle and the same
  finished-week list the film uses, which is cached per week for the life of the process.
  A season history that fails upstream nulls the all-play columns; it never errors.

## The film (feature: full_report)

The weekly write-up that ships with The Penthouse bundle. Wire name stays `full_report`.
`GET /api/league/{platform}/{league_id}/team/{team_id}/report` → `{"week":2,"lineup":{...},"waivers":{...},"trade_targets":[{"their_team_id":"4","give":[...],"get":[...],"verdict":"Fair","why":"..."}],"matchup":{"opponent":"...","my_proj":131.4,"their_proj":118.2,"win_prob":0.61},"html":"<...>"}`

### Season recap

The backward-looking half, and the only endpoint in the API that reports results rather
than projections.

`GET /api/league/{platform}/{league_id}/team/{team_id}/recap` →
```json
{"team":"I Feel Purdy","league":"...","league_size":12,
 "weeks":[{"week":8,"opponent":"TrentDuckworth","my_points":93.78,"their_points":110.9,"won":false,
           "starters":[{"slot":"QB","player":{"id":"11564","name":"Drake Maye","position":"QB"},"projected":null,"actual":32.28}],
           "best_possible":116.38,
           "bench":[{"player":{"id":"4098","name":"Kareem Hunt","position":"RB"},"points":17.2}]}],
 "record":{"wins":3,"losses":11,"ties":0},"points_rank":8,"algo_version":"recap.v1"}
```

Things a caller has to handle, none of which are error states:

- **`projected` is `null` for essentially every starter today.** No projection for a past
  week is recoverable after the fact, so the only honest source is what we recorded at the
  time — and nothing currently logs a lineup, so there is almost nothing to read back.
  Build the "no record" state as the primary one.
- **`starters` and `bench` are empty on ESPN, and `best_possible` is null.** ESPN gives the
  scoreline for every past week in one call, but who was started and what each player scored
  sits behind its `mBoxscore` view, one week at a time, which `edge/data/espn_api.py` does
  not fetch. Real weeks, no line-by-line.
- `weeks` is newest first and holds played weeks only. `won` is `my > theirs`, so a tie
  reads `false`; `null` is reserved for a week with no opponent on record.
- `bench` is worst miss first, and a bench player only counts against slots he was eligible
  for — a kicker never "outscores" a receiver.
- Sleeper costs one matchups call per week (there is no bulk endpoint), so a week-14 league
  is 14 serial calls on a cold process. Finished weeks are cached for the life of the
  process and cannot change, so steady state is roughly one call. A week that fails is
  dropped and the rest are returned: a season is never an error page.
