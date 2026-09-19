# Launch posts — THE BOOTH

Three legs to every post, in this order where it fits:
1. **Not an encyclopedia.** Everyone else gives you a library to browse. We give you three moves
   you make before kickoff.
2. **We keep score.** We publish our own hit rate every week. Nobody else does.
3. **The stamped verdict.** The trade card is the thing people screenshot into the league chat.

Only cite numbers that are in `docs/BACKTEST.md` or `CLAUDE.md`. If a number isn't there, it
doesn't go in a post — leave the TODO.

---

## Reddit r/fantasyfootball (Tuesday, after MNF)

**Title:** I built a fantasy tool that publishes its own hit rate every week — here's week 1

Body:

Every fantasy site hands you a wall of rankings and lets you sort out what it means. The Booth
does the opposite. Connect a Sleeper or ESPN league and you get a **call sheet**: three moves,
by Sunday. Who starts. Who to claim, and the bid. What to offer, and to whom. Each call gets a
confidence stamp and one line of why.

And we keep score. Week 1, replayed across 6 real leagues (66 teams, every format we support),
the lineup we recommended against the lineup the manager actually started:

- **+2.02 points a team**
- **82% of teams helped or unchanged**
- **Lock** calls right 78.3% of the time (n=23)

We publish the losses too. That same backtest caught our own optimizer recommending 48 swaps
worth under 1.5 projected points — they lost 28 points between them, including *bench Josh Allen
for Stafford* over 0.55. We stopped making that call. It's all written up, methodology and
all, in the repo's BACKTEST doc: projections frozen Thursday morning so we grade what was
actually on screen, abandoned teams excluded, actual points taken from Sleeper's own scoring
rather than ours.

Free: the depth chart — start/sit for one team, every week. Wire Pass $3, Trade Lab $5, or the
Full Booth for $7 — everything, every week, up to 5 leagues. Season pass. No subscription.

[stamped verdict graphic] — a real trade out of a 12-team half-PPR league. Post a league ID and
a trade and I'll run yours in the comments.

<!-- TODO: link to the public hit-rate page once it exists. Right now the only published
     scorecard is docs/BACKTEST.md in the repo. Don't claim a live scoreboard until there is one. -->

---

## X thread

1/ Fantasy sites give you an encyclopedia. You still have to do the reading.

The Booth gives you three moves. By Sunday. That's the whole product.

2/ [stamped verdict graphic]

Trade verdict, stamped, with the counteroffer already written — tuned to how that manager
actually trades. Screenshot it into the league chat.

3/ We keep score, in public.

Week 1, 66 teams, 6 leagues: **+2.02 pts a team. 82% of teams helped.** Locks hit 78.3%.

We publish the weeks we lose too.

4/ Free depth chart for one team. $3 the wire. $5 trade lab. $7 the Full Booth.

Season pass, not a subscription. Link in bio.

---

## Discord (fantasy servers — #tools or #self-promo only)

Built a Sleeper/ESPN tool that isn't another rankings page. It writes you a call sheet: three
moves before kickoff, each one stamped Lock / Lean / Coin flip with a line of why.

We publish our own hit rate — week 1 was +2.02 points a team across 66 teams in 6 leagues, 82%
of teams helped. Locks at 78.3%.

Free tier is the depth chart for one team. Drop a league ID and a trade and I'll post the
stamped verdict.

---

## One-liners (bio, Product Hunt tagline, reply-guy fodder)

- Three moves. By Sunday. We keep score.
- Not a rankings page. A call sheet.
- Every other tool tells you who's good. We tell you what to do, and then we tell you whether
  we were right.
- We publish our hit rate every week. Ask any other fantasy tool for theirs.

---

## Sample verdict graphics

Regenerate the stamped cards (README):

```
uv run python -m edge.cli card <league_id> <my_team_id> <their_team_id> <give_ids> <get_ids> --out launch/cards/
```

The PNGs currently in `launch/cards/` are **stale** — old "edge" wordmark, un-stamped verdict.
Re-render before any of these posts go out.

---

## Numbers we do not have yet (do not invent — fill in when the data lands)

- TODO: weeks 2+ hit rate. Only week 1 is in `docs/BACKTEST.md`. "Every week" is the promise;
  one week is the evidence. Don't say "consistently" or "every week since".
- TODO: **Lean** hit rate. Advertised at ~62% from 1930 pairwise comparisons, but the week 1
  calls we actually made came in at 50% on n=20. Too small to quote either way — quote Lock
  only until weeks 2–4 settle it.
- TODO: user count, testimonials, leagues connected. Zero of these exist. Nothing goes in a
  post until it does.
- TODO: waiver and trade outcome accuracy. The backtest grades lineup decisions only. We cannot
  yet claim a hit rate for the wire or the trade lab.
