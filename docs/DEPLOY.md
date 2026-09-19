# Deploy — where this thing actually lives

The short version, so nobody has to ask again.

## Current state (verified 2026-09-19)

The web app is live and serving The Booth. **It is running entirely on mock data.**
`NEXT_PUBLIC_API_URL` is not set on the Vercel project, so every league, player and number
on the live site comes from `web/src/lib/mocks.ts`. It looks like a working product and none
of it is real. Two checks that prove it, either of which you can re-run any time:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://fantasy-tool-alpha.vercel.app/s/anything
# 404 for every id — the share page needs the API, so this is 404 until one is wired up
```

and no backend origin appears in any client bundle. Connecting a league on the live site
therefore cannot work against a real Sleeper or ESPN league yet.

**To make it real:** deploy the API (Railway, from the repo `Dockerfile`), then set
`NEXT_PUBLIC_API_URL` to its URL in the Vercel project and redeploy. It is inlined at build
time, so the redeploy is required, not optional.

| Piece | Where | Notes |
|---|---|---|
| Web (Next.js) | **https://fantasy-tool-alpha.vercel.app** | Vercel. Root Directory must be `web/`, not the repo root. |
| API (FastAPI) | Railway | Container from the repo `Dockerfile`. Configs in `deploy/`. |
| Production branch | `claude/edge-fantasy-app-launch-alo0rr` | **There is no `main` in this repo.** Every branch is a `claude/*` branch. |

## Clicking through the live demo

While the site runs on mock data, **every paid feature is unlocked by default** so it can be
walked end to end without hitting a paywall over numbers that are not real. Two sticky
switches, either appended to any page:

| URL | What you get |
|---|---|
| `…/home?lock=1` | the real free tier: start/sit only, so you can see the locked states and the upsell |
| `…/home?unlock=1` | everything open again |

The choice is remembered in the browser until you flip it back.

**This cannot weaken real billing.** It all sits inside `USE_MOCKS`, which is only true while
`NEXT_PUBLIC_API_URL` is unset. Point the site at a real API and entitlements come from
`GET /api/me`, with the server returning 402 on every paid route — nothing in the web bundle
can open a paid feature against a real backend. Once the API is wired up, drop the default in
`mockExtraEntitlements` back to `[]` if you still want the mock build to start locked.

## How a deploy happens

Vercel builds from the production branch listed above. To ship the web app, fast-forward
that branch to whatever you want live and push:

```bash
git push origin HEAD:claude/edge-fantasy-app-launch-alo0rr
```

Work still happens on a feature branch; that push is the release step. To roll back, point
the branch at the previous commit:

```bash
git push --force-with-lease origin <last-good-sha>:claude/edge-fantasy-app-launch-alo0rr
```

### Deploying from a machine without a browser (agents, CI)

`vercel login` needs an interactive browser, so it cannot run in a sandbox. For CLI deploys,
put a token from <https://vercel.com/account/tokens> in the environment as `VERCEL_TOKEN`:

```bash
cd web && npx vercel deploy --prod --token "$VERCEL_TOKEN"
```

Without that token the only route to production is the git push above.

## Environment variables

Web (Vercel project settings → Environment Variables):

| Name | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | the Railway API's URL | **Unset means the whole site runs on mock data from `web/src/lib/mocks.ts`.** It looks fine and is entirely fake. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Magic-link sign-in; without it `/login` says sign-in is not wired up. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Same. |

`NEXT_PUBLIC_*` values are inlined at **build** time, so changing one needs a redeploy, not
just a restart.

API (Railway):

| Name | Value | Why |
|---|---|---|
| `EDGE_DB` | a path on the mounted volume | SQLite via `edge/api/store.py`. On an ephemeral filesystem every entitlement is lost on restart. |
| `EDGE_CACHE_DIR` | a path on the mounted volume | The 14MB Sleeper player file is cached here for 24h. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe | The $7 pass and the webhook that grants it. |
| `SUPABASE_JWT_SECRET` | Supabase | Verifies the JWT the web sends. |
| `EDGE_USE_CLAUDE`, `ANTHROPIC_API_KEY` | optional | LLM-written trade explanations. Without them the templates are used. |
| `EDGE_CHROMIUM` | optional | Path to an existing Chromium. Only needed if the image does not install its own — see below. |

Secrets live in the host's dashboard, never in the repo. `.env` is gitignored.

## The one that bites: the share card needs a browser

`GET /api/share/{id}/card.png` renders the verdict image with headless Chromium. That image
is what a `/s/{id}` link unfurls with in a group chat, which is the entire organic loop.

The `playwright` pip package **ships no browser**. Without one the endpoint answers `503`,
the page still loads, and every shared link unfurls broken — silently. The `Dockerfile` runs
`playwright install --with-deps chromium` for exactly this reason. It adds roughly 400MB; if
a host cannot spare it, set `EDGE_CHROMIUM` to a Chromium already on the box instead.

Verify after any deploy:

```bash
curl -sI https://<api-host>/api/share/<some-id>/card.png   # want 200 image/png, not 503
```

## Not wired up yet

- **Email sending.** `edge/delivery/weekly_email.py` renders; nothing sends. Pick a provider
  (Resend's free tier) and add the key.
- **Stripe** has only been exercised against a fake webhook event, never a real test-mode run.
- **Domain.** `thebooth.com`, `.app` and `.io` are all taken. Verified available:
  `callthebooth.com` (recommended), `theboothfantasy.com`, `boothcalls.com`, `theboothnfl.com`,
  `thebooth.football`. Code uses `thebooth.example` as a placeholder.
