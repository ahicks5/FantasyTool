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
`GET /api/products` →
```json
{"products":[
  {"sku":"free","name":"Free","price_cents":0,"features":["my_team"],"leagues":1,"kind":"free","blurb":"Start/sit calls for one team, every week."},
  {"sku":"waivers","name":"Wire Pass","price_cents":300,"features":["waivers"],"leagues":1,"kind":"a_la_carte","blurb":"The wire, ranked for your roster, with the bid and the drop. Rest of season."},
  {"sku":"trade_lab","name":"Trade Lab","price_cents":500,"features":["trade_lab"],"leagues":1,"kind":"a_la_carte","blurb":"Trade verdicts and counters tuned to the other manager. Rest of season."},
  {"sku":"full_report","name":"The Penthouse","price_cents":700,"features":["my_team","waivers","trade_lab","full_report"],"leagues":5,"kind":"bundle","blurb":"The whole booth, every week, up to 5 leagues."}
]}
```
`GET /api/me` → `{"email":"...","entitlements":["my_team","waivers"],"leagues_allowed":1,"leagues":[{"platform":"sleeper","league_id":"...","name":"...","team_id":"3"}]}`

`POST /api/checkout {"sku":"full_report"}` → `{"url":"https://checkout.stripe.com/..."}`
`POST /api/stripe/webhook` (Stripe only)

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

## The film (feature: full_report)

The weekly write-up that ships with The Penthouse bundle. Wire name stays `full_report`.
`GET /api/league/{platform}/{league_id}/team/{team_id}/report` → `{"week":2,"lineup":{...},"waivers":{...},"trade_targets":[{"their_team_id":"4","give":[...],"get":[...],"verdict":"Fair","why":"..."}],"matchup":{"opponent":"...","my_proj":131.4,"their_proj":118.2,"win_prob":0.61},"html":"<...>"}`
