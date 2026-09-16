# Edge API contract (v1)

FastAPI app in `edge/api/app.py`, served at `/api`. All responses JSON. Errors: `{"error": "message"}` with 4xx.
Auth: `Authorization: Bearer <supabase jwt>` (optional in dev; `X-Edge-User: <email>` accepted when `EDGE_DEV=1`).

## Products / entitlements
`GET /api/products` →
```json
{"products":[
  {"sku":"free","name":"Free","price_cents":0,"features":["my_team"],"leagues":1,"blurb":"Start/sit for one team"},
  {"sku":"waivers","name":"Waiver Wire Pass","price_cents":300,"features":["waivers"],"leagues":1,"blurb":"Top pickups + FAAB bids, rest of season"},
  {"sku":"trade_lab","name":"Trade Lab","price_cents":500,"features":["trade_lab"],"leagues":1,"blurb":"Trade verdicts + counteroffers, rest of season"},
  {"sku":"full_report","name":"Full Report","price_cents":700,"features":["my_team","waivers","trade_lab","full_report"],"leagues":5,"blurb":"Everything, every week, up to 5 leagues"}
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

## My Team (feature: my_team)
`GET /api/league/{platform}/{league_id}/team/{team_id}/lineup` →
```json
{"week":2,"projected_total":131.4,"current_total":124.9,
 "slots":[{"slot":"RB","player":{"id":"4866","name":"Jahmyr Gibbs","position":"RB","nfl_team":"DET","injury_status":null,"projected":26.1,"opponent":"BUF"},
           "confidence":"Lock","reason":"Top RB projection this week (26.1). Nobody on your bench is close.","change":false}],
 "bench":[{"player":{...},"reason":"Sit: 11.2 proj, 4.1 behind your last FLEX."}],
 "changes":[{"slot":"FLEX","out":{"id":"...","name":"Stefon Diggs"},"in":{"id":"...","name":"MarShawn Lloyd"},"gain":1.0,"confidence":"Coin flip","reason":"..."}]}
```
Confidence: `Lock` (margin ≥ 4), `Lean` (≥ 1.5), `Coin flip` (< 1.5).

## Waivers (feature: waivers)
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
 "graphic":{"title":"...","lines":[...]}   // input for the shareable verdict card
}
```

## Full Report (feature: full_report)
`GET /api/league/{platform}/{league_id}/team/{team_id}/report` → `{"week":2,"lineup":{...},"waivers":{...},"trade_targets":[{"their_team_id":"4","give":[...],"get":[...],"verdict":"Fair","why":"..."}],"matchup":{"opponent":"...","my_proj":131.4,"their_proj":118.2,"win_prob":0.61},"html":"<...>"}`
