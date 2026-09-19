# The Booth — three moves, by Sunday

Take the headset. Connect a Sleeper or ESPN league and the booth writes this week's **call sheet**:
who starts, who to claim, what to offer. Each call carries a confidence stamp, one line of why, and
the number under it — and we publish our own hit rate every week.

The Python package is still `edge/` (renaming it would touch every import for no user-visible gain).
Anything a user reads says The Booth.

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
| free | $0 | Depth chart start/sit, 1 league |
| waivers | $3 / season | Wire Pass |
| trade_lab | $5 / season | Trade Lab |
| full_report | $7 / season | Full Booth: everything + the weekly film, 5 leagues |

## Deploy notes
Live: **https://fantasy-tool-alpha.vercel.app** (Vercel, root dir `web/`) + **https://edge-api-gi8d.onrender.com** (Render) for the API.
The web app talks to that API in production; it is not on mock data.
Production branch is `claude/edge-fantasy-app-launch-alo0rr`; there is no `main`. See **docs/DEPLOY.md**.

The share card (`GET /api/share/{id}/card.png`, the image a `/s/{id}` link unfurls with) is
rendered by headless Chromium. The `playwright` package ships no browser, so the API image
installs one — see the `Dockerfile`. Without it that endpoint answers **503** and every share
link unfurls broken, which kills the organic loop quietly. If your host cannot spare the
~400MB, point `EDGE_CHROMIUM` at a Chromium already on the box instead.

## Layout
`edge/` engine + API · `web/` Next.js app · `docs/API.md` contract · `tests/` offline tests ·
`launch/` posts and sample verdict cards · `deploy/` Railway/Render configs · `Dockerfile` API image.
