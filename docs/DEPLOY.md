# Deploy — where this thing actually lives

The short version, so nobody has to ask again.

## Current state (verified 2026-09-19, corrected)

The web app is live **and it talks to a real API**, not to mock data.
`NEXT_PUBLIC_API_URL` is set on the Vercel project to the API's **origin**, with no path:
`https://edge-api-gi8d.onrender.com`. `web/src/lib/api.ts` appends `/api/...` itself, so a
value ending in `/api` produces `/api/api/league/...` and every call 404s while the page
still renders — it looks like a dead backend rather than a typo. Verified against the live
site, which requests `https://edge-api-gi8d.onrender.com/api/league/sleeper/{id}`.

An earlier version of this file said the opposite. That was wrong, and it was wrong in a way
worth remembering: the evidence for "it runs on mocks" was that `/s/{id}` 404s and no backend
origin appeared in the chunks the landing page loads. Both were true and neither implied the
conclusion. The way to actually tell is to union the chunks across **every** route and look
for the compiled API base, or simply `curl` the API. A mock-only build also contains the
strings `booth.mock.entitlements` and `Mock checkout`; a real-API build has neither, because
the whole mock branch is compiled out.

Practical consequence: **anything that only changes `web/src/lib/mocks.ts` or the mock branch
of `api.ts` has no effect on the deployed site.** Entitlements, leagues and every number come
from the API.

| Piece | Where | Notes |
|---|---|---|
| Web (Next.js) | **https://fantasy-tool-alpha.vercel.app** | Vercel. Root Directory must be `web/`, not the repo root. |
| API (FastAPI) | **https://edge-api-gi8d.onrender.com** (Render, not Railway) | Container from the repo `Dockerfile`. Blueprint in `deploy/render.yaml`. |
| Production branch | `claude/edge-fantasy-app-launch-alo0rr` | **There is no `main` in this repo.** Every branch is a `claude/*` branch. |

## Clicking through the live demo

Entitlements are decided by the **API**, so opening the paywall is a server-side switch.

Set `EDGE_DEMO_UNLOCK=1` in the Render service's environment. Every caller then owns every
paid feature, signed in or not. Unset it (or set anything other than `1`) to restore normal
gating. It is a genuine paywall bypass: turn it off before anyone can be charged.

`EDGE_DEV` does **not** do this, deliberately. That flag only relaxes authentication; the
whole test suite runs with `EDGE_DEV=1` and still expects 402s.

The web build also has `?lock=1` / `?unlock=1` switches, but those only affect the mock path
and therefore do nothing on the deployed site. They are for `npm run dev` with no API.

### Security: EDGE_DEV is currently on in production

The live API honours an `X-Edge-User` header as proof of identity, which means anyone can
claim to be any email by setting a header. Right now nobody owns anything so the impact is
limited to reading a free-tier response, but the moment real purchases exist this lets a
stranger read a paying user's leagues and entitlements. **Unset `EDGE_DEV` on Render before
launch.** Verify with:

```bash
curl -s -H "X-Edge-User: someone@example.com" https://edge-api-gi8d.onrender.com/api/me
# want: signed_in false. If it says true, EDGE_DEV is still set.
```

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
| `NEXT_PUBLIC_API_URL` | the API origin, **no `/api` suffix** | **Unset means the whole site runs on mock data from `web/src/lib/mocks.ts`.** It looks fine and is entirely fake. A trailing `/api` double-prefixes every call and 404s. |
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
- **Domain.** Not picked yet, and nothing has been checked for availability under the new name.
  Code uses `penthouse.example` as a placeholder — one-line change in `edge/cli.py` and
  `edge/delivery/weekly_email.py` once Andrew chooses. `NEXT_PUBLIC_SITE_URL` sets the web's
  `metadataBase`, which is what makes the unfurl card resolve to an absolute URL.
