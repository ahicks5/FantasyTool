# PENTHOUSE — fantasy football weekly moves

Paid fantasy football web app. Connect a league, get this week's moves. NFL 2026 is underway
and launch is days out: **speed > polish**.

1. **Depth chart** — start/sit calls with a confidence stamp and a one-line reason.
2. **The wire** — top 5 pickups ranked by roster fit, with a suggested FAAB bid.
3. **Trade Lab (paid)** — verdict on a proposed trade + a counteroffer tuned to the other
   manager's tendencies. Numbers from the engine; the Claude API writes the explanation.

Free for 1 team, $7 unlocks the season (Stripe). Marketing via stamped verdict graphics.

## Where things are

**`docs/MAP.md` — read it before your first change.** It has the spine, a routing table for
"I want to change X → touch these files, run this test", and a generated inventory of every
module with its own one-line description. It is a build artifact with a test, so it is true.

Then only what you need:

| | |
|---|---|
| State of play, what is blocked, what has already cost time | `docs/HANDOFF.md` |
| Hosting, env vars, how to ship and how to roll back | `docs/DEPLOY.md` |
| Where every number comes from, and the cookie rules | `docs/DATA.md` |
| How the web app is wired, and the traps in it | `docs/WEB.md` |
| What the brand allows | `docs/BRAND.md` |
| The API contract | `docs/API.md` |
| Everything else (risk, legal, economics, accuracy) | the index at the end of `docs/MAP.md` |

## Rules

- **Nothing is done without a test or a working demo.** Tests run offline against fixtures.
  Live-API checks go in `edge/cli.py` demo commands, not in tests.
- Run before pushing: `uv run pytest -q`, and `cd web && npm test && npm run build`.
- Everything downstream of a connector is platform-agnostic: connectors map into
  `edge/models.py` and nothing after that knows which platform it came from.
- Scoring is always computed from the league's own scoring settings. **Never assume PPR.**
- Raw stats, never points, until `edge/data/scoring.py` says otherwise.
- **The LLM explains; it never ranks, values or invents a number.**
- Nothing outside `edge/data/providers.py` talks to a projection vendor.
- `edge/products.py` is the only source of truth for what is free and what is paid.
- Any word a user reads lives in `web/src/lib/vocab.ts`, never inline.
- Keep secrets in `.env` (gitignored). Never commit keys, and never paste ESPN cookies
  anywhere — see `docs/DATA.md`.
- Don't add a dependency when the stdlib does the job.
- **Do not claim decision accuracy in public** until `scripts/score_runs.py` exists.
  `scripts/backtest.py` measures projection separation, which is not the same claim —
  `docs/ACCURACY_PROGRAM.md` names the gap.
- Small commits with clear messages. Push to the working branch at the end of each session.
- After adding or renaming a module: `uv run python scripts/gen_map.py`.
- Keep `TASKS.md` current. End every session with: what's done, what's next, decisions needed
  from Andrew.

## Facts that bite

- **There is no `main` branch.** Production is `claude/edge-fantasy-app-launch-alo0rr`, and
  Vercel builds from it, so shipping the web app is
  `git push origin HEAD:claude/edge-fantasy-app-launch-alo0rr`. Vercel's Root Directory is
  `web/`. Everything else about hosting: `docs/DEPLOY.md`.
- Web **https://fantasy-tool-alpha.vercel.app** · API **https://edge-api-gi8d.onrender.com**.
  The live web app talks to that API — it is **not** on mock data, so editing
  `web/src/lib/mocks.ts` changes nothing in production. To open the paywall for testing, set
  `EDGE_DEMO_UNLOCK=1` on Render.
- **The package is still `edge/`.** Renaming it would touch every import, test and script for
  no user-visible gain. The env vars (`EDGE_DEV`, `EDGE_DB`, `X-Edge-User`) and the `booth.*`
  browser keys stay too — renaming those signs every existing user out of their league, their
  theme and their ticked calls. Anything a *user* reads says Penthouse.
- **The mark exists four times** (`icon.svg`, `IconMark`, `MARK_PATH`, `ShareCard.tsx`).
  Redraw them in one commit and re-run `scripts/render_brand_assets.py`. See `docs/BRAND.md`.
- **Making the Lock card free must never open Trade Lab as a side effect.** A start/sit card
  is shareable by someone who has never paid and never signed in; that is the growth loop.
  `test_the_paid_card_is_still_paid` pins the other half. Snapshots are display-only: never
  an email, a league id or a roster.
- **Grades are rank-anchored, and the spread only damps the scale.** Do not "improve" this
  into a rank-plus-position-in-range blend — read the docstring in `edge/engine/grades.py`,
  which exists to stop exactly that regression coming back.
- **Check both themes** before shipping any surface. Dark is the default and is not read off
  the OS; see `docs/WEB.md`.

## Brand, in one paragraph

The product is the **owner's box**: the top floor, above the noise, where the staff still
hands you a **call sheet** but you own the building. Competitors are encyclopedias you browse;
we are three moves you make before kickoff. **Penthouse** is one word, everywhere a user reads
it. Tagline: **"Own the week."** Voice: the staff in your ear — confident, clipped, verb
first, plural. Never hedge on a call the engine is confident about; say plainly when it is a
coin flip. Look: black and polished chrome, two type families, the metal is the only
decoration. Sections are **call sheet** (home) · **depth chart** (team) · **scouting**
(waivers) · **GM's Office** (trade) · **the film** (report) — but what you *buy* keeps its
product name: Wire Pass, Trade Lab, The Penthouse. Full guide: **`docs/BRAND.md`**; how it is
actually built: **`docs/WEB.md`**.

## Confidence tags — Lock is not honest yet

Shipping today: Lock ≥ 4 pts margin, Lean 1.5–4, Coin flip < 1.5. Graded over 2025 weeks 1–17
(85,006 within-position pairs): **Lock 75.1%**, Lean 61.7%, Coin flip 52.5%. Lean and Coin
flip are honest. **Lock was advertised at ~80% and its 95% interval (74.6–75.6) never touches
it** — you need a margin near 7 points before a call is right four times in five.

`edge/calibration.py` replaces the margin with P(a beats b) and every tag then delivers what
it promises (Lock 81.0%), but **it is not wired into `lineup.py`** — that changes what users
see and is Andrew's call. Below 1.5 points `lineup.stabilize` holds the incumbent rather than
recommending the swap; week 1 priced 48 such swaps at −28 points. Adjust thresholds only with
data: `docs/CALIBRATION.md`, `docs/BACKTEST.md`.

## The weekly ritual

`scripts/weekly.py freeze|grade|health`, scheduled in `.github/workflows/weekly.yml` (Thursday
freeze, Tuesday grade, daily health check) and delivered as a pull request. Safe to run twice,
any time. Thursday's freeze cannot be recovered afterwards — it snapshots what we actually
showed, so next week's backtest grades that rather than a revised number. Re-record the
offline replay fixtures with `scripts/record_replay_fixture.py <week>` when the numbers in
`tests/test_evaluate.py` need to move — never loosen them without a reason.

## Stack

- `edge/` — Python 3.11 engine, league connectors and the FastAPI API. Andrew can read/tweak.
- `web/` — Next.js (App Router, TypeScript, Tailwind), mobile-first. Talks to the API.
- Supabase (magic-link auth + Postgres) · Stripe Checkout + webhook · Vercel + Render.
- Persistence today is SQLite (`edge/api/store.py`), with a Postgres twin (`store_pg.py`)
  selected by `DATABASE_URL`. One contract, pinned by `tests/test_store_contract.py`.
- Claude API is optional: `EDGE_USE_CLAUDE=1` turns on LLM-written trade explanations (model
  from `EDGE_CLAUDE_MODEL`); otherwise free templates. **Load the `claude-api` skill before
  touching SDK code.**
- Test league: public Sleeper **1403186749361901568** ("The Megalabowl", 12 teams, half PPR,
  FAAB $100, 2 FLEX, DEF, no K). Fixtures recorded 2026-09-16, week 2.

## Owner

Andrew (self-taught Python/VBA/automation). Steers, doesn't type every line. Keep explanations
short and plain; any visual you make *for him* should be light and high-contrast.
