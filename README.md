# Edge — your league, this week's moves

Connect a Sleeper (or public ESPN) league → start/sit calls, ranked waiver pickups with FAAB bids,
and a Trade Lab that grades trades and drafts counteroffers tuned to the other manager.

## Run it
```bash
# API (Python 3.11, uv)
uv sync
EDGE_DEV=1 uv run uvicorn edge.api.app:app --reload --port 8000
# Web (Node 22)
cd web && npm install && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev   # omit the env var for mock data
```
Demos without the UI:
```bash
uv run python -m edge.cli leagues <sleeper_username>
uv run python -m edge.cli sleeper <league_id>          # every roster with projections
uv run python -m edge.cli espn <league_id>             # public ESPN league
uv run python -m edge.cli card <league_id> <my_team> <their_team> <give_ids> <get_ids>   # verdict PNG
```
Tests: `uv run pytest -q` (offline, fixtures) and `cd web && npm test && npm run build`.

## Pricing (edit `edge/products.py`)
| SKU | Price | Unlocks |
|---|---|---|
| free | $0 | My Team start/sit, 1 league |
| waivers | $3 / season | Waiver Wire Pass |
| trade_lab | $5 / season | Trade Lab |
| full_report | $9 / season | Everything + weekly Full Report, 5 leagues |

## Layout
`edge/` engine + API · `web/` Next.js app · `docs/API.md` contract · `tests/` offline tests ·
`launch/` posts and sample verdict cards · `deploy/` Railway/Render configs · `Dockerfile` API image.
