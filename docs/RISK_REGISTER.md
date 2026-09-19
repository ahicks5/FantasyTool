# Risk register

What could stop Edge from operating, and what we have actually done about it. Reviewed at the
start of each phase in `launch/ROLLOUT_PLAN.md` and whenever a risk's status changes.

Scoring: **Likelihood** and **Impact** are Low / Medium / High. **Exposure** is the pair read
together — a Low-likelihood, High-impact risk that ends the business still gets attention.
Status is one of: `open` (nothing done), `mitigated` (a control exists), `accepted` (we know and
choose to live with it), `closed`.

Owner is Andrew unless it says otherwise. Anything marked **BLOCKS LAUNCH** must be `mitigated`
or `accepted` in writing before a single payment is taken.

---

## Legal and licensing

### L1 — Player photographs on a commercial share card · **BLOCKS LAUNCH**
| | |
|---|---|
| Likelihood | Medium |
| Impact | High — the share card is the entire growth loop |
| Status | **mitigated** (kill-switch shipped), decision still open |

Every trade verdict card prints NFL player headshots fetched from Sleeper's and ESPN's CDNs, and
we charge money for the product that card advertises. Two separate rights are in play, and they
are not the same question:

- **Names and statistics** are on long-settled ground for fantasy providers. *CBC Distribution v.
  MLB Advanced Media* (8th Cir., 2007) held that a fantasy operator may use player names and
  statistics without a licence. This part is low risk.
- **Photographs** are somebody else's copyright in the image itself, plus a right-of-publicity
  question about using a person's likeness to promote a paid product. Neither is answered by CBC.
  Sleeper and ESPN serving the file publicly is not a grant of rights to us.

**Control shipped.** `EDGE_CARD_PHOTOS=0` removes every face from every surface in one move:
the rendered PNG (`edge/graphics.py`), the stored public snapshot (`edge/api/share.py`, so links
shared *before* the switch was flipped also go clean), and the web share page. Falls back to
initials. Verified by `tests/test_compliance.py` and by eye — the card still reads well, because
the hook was always the verdict and the manager-tendency line, not the headshot.

**Consequence of flipping it: close to zero.** That is the important finding. We are not choosing
between a growth loop and a legal risk.

**Still to do:** get a real answer (see `docs/LEGAL_CHECKLIST.md`, question 1). Until then,
decide deliberately whether to launch with photos on. Recommendation: **launch with
`EDGE_CARD_PHOTOS=0`** and turn faces on once someone qualified says it is fine. Team logos are a
separate and probably softer question (trademark, nominative fair use), currently left on.

### L2 — Sleeper API is free for non-commercial use only · **BLOCKS LAUNCH**
| | |
|---|---|
| Likelihood | High (the terms are explicit) |
| Impact | High — it is our league data *and* our projections |
| Status | open |

Sleeper's API docs say the API is free for non-commercial purposes and that commercial use
requires contacting them to discuss licensing. We charge $3–$7. They also ask for attribution on
trending data, which the action feed uses, and give a guidance limit of 1,000 calls per minute.

**Controls shipped.** The attribution line is now carried by the provider
(`edge/data/providers.py`), returned by `GET /api/products`, and rendered in the site footer. The
player list is already cached 24h on disk. The provider interface means switching vendors is one
env var.

**To do:** send the licensing email this week — draft is in `launch/ROLLOUT_PLAN.md` §8. Do not
spend money on ads until there is a reply. If they say no or want more than the business earns:
Tank01 covers projections at $10/mo (stubbed, `EDGE_PROJECTION_PROVIDER=tank01`), but nothing
covers *league state*, so a hard no means rebuilding around ESPN plus user-authorised access, or
running free this season and selling 2027.

### L3 — ESPN has no public API and no terms we have read
| | |
|---|---|
| Likelihood | Medium |
| Impact | Medium — ESPN is a minority of our users today |
| Status | open |

We read `lm-api-reads.fantasy.espn.com`, an undocumented endpoint, for a paid product. Lower
volume than Sleeper and public leagues only, but the terms question is unexamined.

**To do:** read ESPN's terms of use; include in the lawyer's list. Keep ESPN volume low until
answered. Do not build private-league support (espn_s2/SWID) before this is settled — handling a
user's session cookies raises the stakes considerably.

### L4 — No terms, privacy policy, or refund policy · **BLOCKS LAUNCH**
| | |
|---|---|
| Status | **mitigated** — drafts shipped, review pending |

Taking card payments from strangers with no published terms. Drafts now live at `/legal/terms`,
`/legal/privacy`, `/legal/refunds`, written to describe exactly what the code does. They have not
been reviewed by a lawyer. See `docs/LEGAL_CHECKLIST.md`.

### L5 — No business entity; Andrew is personally liable
| | |
|---|---|
| Likelihood | Certain (it is just the current state) |
| Impact | Medium |
| Status | open |

Payments would flow to a natural person, with no liability shield and personal details on the
Stripe account. A single-member LLC is inexpensive and takes about a week.

**To do:** decide before the first live payment. Registering an entity mid-season means
re-onboarding Stripe, so this is cheaper to do now than in November.

### L6 — Sales tax on digital goods
| | |
|---|---|
| Likelihood | Low at our volume |
| Impact | Low |
| Status | accepted, with a control |

US states tax digital products differently and economic-nexus thresholds are far above anything
this season will produce. Not worth modelling by hand.

**Control:** enable Stripe Tax at checkout. It is a setting, it costs a small percentage, and it
removes the question entirely. Revisit only if revenue clears five figures.

---

## Product and data

### P1 — Projection vendor disappears mid-season
| | |
|---|---|
| Likelihood | Low |
| Impact | High |
| Status | mitigated |

Sleeper's projections endpoint is undocumented and free, which is exactly the kind of thing that
vanishes in week 9. The provider interface (`edge/data/providers.py`) plus the Tank01 stub means
a switch is one env var and one class. The stub is **unverified against a live response** — that
is the remaining gap, and it is the kind of gap you discover at the worst moment.

**To do:** buy one month of Tank01 and verify the stat mapping once, before we need it.

### P2 — No rate limit on the Claude API path
| | |
|---|---|
| Likelihood | Medium |
| Impact | Low |
| Status | open |

`POST /api/league/{platform}/{league_id}/trade` calls the Claude API on every request, gated only
by entitlement, with no per-user cap. The unit-economics model calls this a sale's **runway**:
about 330 explained verdicts per $5 Trade Lab pass before that sale is underwater (`uv run python
-m edge.cli economics`). A determined user or a script can exceed that.

The exposure is small in dollars — pennies per call — so this is a nuisance, not a threat. But
the failure mode is unbounded, and an unbounded cost with no alarm is the one worth capping.

**To do:** a per-account daily cap on explained verdicts (the template explanation is free and is
already the fallback), plus a billing alert on the Anthropic account. Half a day.

### P3 — Public share snapshot leaks something private
| | |
|---|---|
| Likelihood | Low |
| Impact | High |
| Status | mitigated |

Share snapshots are display-only by construction and `tests/test_share.py` asserts the league id
never reaches the payload. Keep that test. Any new field on the card is a new thing to check.

### P4 — A recommendation is confidently, publicly wrong
| | |
|---|---|
| Likelihood | Certain |
| Impact | Medium (reputational) |
| Status | mitigated by design |

We publish confidence tags with honest hit rates and the Coin-flip tag exists precisely for this.
The mitigation is the accuracy programme (`docs/ACCURACY_PROGRAM.md`): publish the hit rate every
week, including the misses. A wrong call inside a stated error rate is not a scandal. A wrong call
against a silent claim of accuracy is.

### P5 — Marketing claims we cannot substantiate
| | |
|---|---|
| Likelihood | Medium |
| Impact | Medium |
| Status | open |

The rollout plan's differentiator is "we publish our hit rate". That is an advertising claim on a
paid product, and today the backtest measures *projection separation*, not *our recommendations*.
Those are different things and only one of them is what the marketing says.

**To do:** close the gap before the claim goes in a Reddit post. `docs/ACCURACY_PROGRAM.md` §3.

---

## Operations

### O1 — Single operator, in season, with a day job
| | |
|---|---|
| Likelihood | Certain |
| Impact | Medium |
| Status | accepted |

Sunday morning is the peak and there is one person. Mitigations: a static status line on the
landing page, a support email with a stated response time of one business day, and the rule that
the free tier keeps working even when paid features fail.

### O2 — SQLite on a single host is the whole database
| | |
|---|---|
| Likelihood | Medium |
| Impact | High — purchases live here |
| Status | open |

`edge/api/store.py` is a SQLite file on one container's volume. If the volume is lost, every
purchase record goes with it, and Stripe becomes the only proof anyone paid.

**To do:** a nightly copy of the DB file to object storage, or move `purchases` to Supabase
Postgres. Until then, treat Stripe as the source of truth and keep a documented way to replay
purchases from Stripe into the store.

### O3 — Reddit account banned for self-promotion
| | |
|---|---|
| Likelihood | Medium |
| Impact | Medium |
| Status | open |

Read each subreddit's rules, message the moderators before the launch post, answer questions with
value before ever posting a link, and disclose that you built it. One account, used honestly.

### O4 — Secrets committed to the repo
| | |
|---|---|
| Likelihood | Low |
| Impact | High |
| Status | mitigated |

`.env` is gitignored and CLAUDE.md states the rule. Add a secret-scanning check before the repo
goes public, if it ever does.

---

## The short version

Three things block launch, and two of them are one email and one lawyer's hour:

1. **Ask Sleeper about commercial licensing** (L2). This is the only risk that can end the
   product rather than inconvenience it.
2. **Decide on player photos** (L1). The control is already built and costs us nothing, so the
   cheap default is to launch with faces off.
3. **Publish the legal pages and pick an entity** (L4, L5). Drafts are written; they need a
   review and a decision.

Everything else is a Tuesday.
