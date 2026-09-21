"""Penthouse API. See docs/API.md. Run: uv run uvicorn edge.api.app:app --reload"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from edge import products
from edge.api import desk, directory as directory_mod, scout as scout_mod, service, share as share_mod
from edge.api.auth import current_user, optional_user
from edge.api.limits import RateLimitMiddleware, cors_origins, validate_id, validate_platform
from edge.api.store import open_store
from edge.connectors import sleeper
from edge.engine import grades
from edge.engine import lineup as lineup_mod
from edge.engine import actions as actions_mod
from edge.engine import recap as recap_mod
from edge.engine import report, trade, trade_finder, waiver_plan, waivers
from edge.engine.explain import explain

app = FastAPI(title="Penthouse API", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=cors_origins(),
                   allow_methods=["*"], allow_headers=["*"])
# Outermost, so a refused request costs a dict lookup rather than an upstream fetch.
app.add_middleware(RateLimitMiddleware)
store = open_store()


def _season() -> int:
    return int(os.environ.get("EDGE_SEASON", "2026"))


def _demo_unlock() -> bool:
    """`EDGE_DEMO_UNLOCK=1` hands every caller every paid feature.

    For clicking through a demo deployment without buying anything. It is a real paywall
    bypass, so it is explicit, off unless the value is exactly "1", and deliberately NOT
    implied by `EDGE_DEV` — that flag only relaxes *authentication*, and the two should not
    be confused. Turn it off before anyone is charged.
    """
    return os.environ.get("EDGE_DEMO_UNLOCK") == "1"


def _skus(email: str | None) -> list[str]:
    if _demo_unlock():
        return [p["sku"] for p in products.PRODUCTS if p["price_cents"] > 0]
    return store.skus(email, _season()) if email else []


def _require(email: str | None, feature: str, teaser: str | None = None) -> None:
    if not products.can(_skus(email), feature):
        raise HTTPException(402, detail={"error": f"{feature} requires a purchase", "feature": feature,
                                         "teaser": teaser, "upsell": products.upsell(_skus(email), feature)})


def espn_auth(x_espn_s2: str | None = Header(default=None),
              x_espn_swid: str | None = Header(default=None)):
    """A private ESPN league's cookies, sent per request by the browser that holds them.

    Penthouse never stores these — see `espn_api.EspnAuth`. They arrive as headers rather than in
    a body or a query string so they stay out of URLs, logs and referrers.
    """
    from edge.data.espn_api import EspnAuth
    if not (x_espn_s2 and x_espn_swid):
        return None
    auth = EspnAuth(s2=x_espn_s2, swid=x_espn_swid)
    return auth or None


def _bundle(platform: str, league_id: str, auth=None) -> service.Bundle:
    from edge.data.espn_api import EspnLeagueNotFound, EspnPrivateLeague
    # Every league route funnels through here, so this is the one place identifiers from
    # the URL have to be checked before they are built into an upstream request.
    validate_platform(platform)
    validate_id(league_id, "league id")
    try:
        return service.get_bundle(platform, league_id, auth=auth)
    except EspnPrivateLeague as e:
        # 403, not 404: the league exists and the answer is "sign in", which the web app
        # turns into the cookie form instead of a dead end.
        raise HTTPException(403, detail={"error": str(e), "platform": "espn",
                                         "needs_espn_auth": e.needs_auth})
    except EspnLeagueNotFound as e:
        raise HTTPException(404, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(404, f"could not load league: {e}")


def _team(b: service.Bundle, team_id: str):
    t = b.league.team(team_id)
    if not t:
        raise HTTPException(404, "team not found in league")
    return t


# ---- products / me / checkout ----

@app.get("/api/products")
def get_products():
    """Pricing, plus the data credit the UI is required to show.

    Attribution rides along here because every page already loads this, and a credit line
    that only renders on one page is not a credit line.
    """
    from edge.data import providers

    return {"products": products.PRODUCTS, "attribution": providers.attribution_line()}


@app.get("/api/me")
def me(email: str | None = Depends(optional_user)):
    """Works signed out. An anonymous visitor gets the free tier so they can see value first."""
    skus = _skus(email)
    return {"email": email, "signed_in": bool(email), "skus": skus,
            "entitlements": sorted(products.features_for(skus)),
            "leagues_allowed": products.leagues_allowed(skus),
            "leagues": store.leagues(email) if email else [],
            "email_opt_in": store.email_opt_in(email) if email else False}


class EmailPrefIn(BaseModel):
    email_opt_in: bool


@app.get("/api/me/email")
def get_email_pref(email: str = Depends(current_user)):
    """Whether this account asked for Thursday's call sheet by email. Signed in only.

    An account that has never chosen is off. There is no signed-out version of this:
    a delivery preference with no address attached is not a preference.
    """
    return {"email": email, "email_opt_in": store.email_opt_in(email)}


@app.put("/api/me/email")
def set_email_pref(body: EmailPrefIn, email: str = Depends(current_user)):
    """Tick or untick the weekly email. Idempotent; the reply is the state we now hold."""
    store.set_email_opt_in(email, body.email_opt_in)
    return {"email": email, "email_opt_in": store.email_opt_in(email)}


@app.get("/api/me/data")
def export_my_data(email: str = Depends(current_user)):
    """Everything we hold about this account. Signed in only — it is the account's own data."""
    return store.export_user(email)


@app.delete("/api/me")
def delete_my_data(confirm: str = "", email: str = Depends(current_user)):
    """Erase this account. Requires ?confirm=delete so a stray request cannot do it.

    This revokes any season pass the account bought, which the caller is told up front rather
    than discovering next Sunday. Public share links survive: they carry no email.
    """
    if confirm != "delete":
        raise HTTPException(400, "add ?confirm=delete — this erases your purchases too")
    return {"ok": True, "deleted": store.delete_user(email)}


class ConnectIn(BaseModel):
    platform: str
    league_id: str
    team_id: str


@app.post("/api/connect")
def connect(body: ConnectIn, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """Connect a league. No account required — value first, signup only when it buys something.

    Signed out, we validate the league and team and hand them back; the browser remembers the
    choice. Signed in, we also save it, which is what league limits are actually about.
    """
    b = _bundle(body.platform, body.league_id, auth)
    t = _team(b, body.team_id)
    saved = False
    if email:
        have = store.leagues(email)
        already = any(l["platform"] == body.platform and l["league_id"] == body.league_id for l in have)
        if not already and len(have) >= products.leagues_allowed(_skus(email)):
            raise HTTPException(402, detail={"error": "league limit reached", "feature": "leagues",
                                             "teaser": f"You are saving {len(have)} league"
                                                       f"{'s' if len(have) != 1 else ''}. Full Report keeps up to "
                                                       f"{products.BY_SKU['full_report']['leagues']}.",
                                             "upsell": [products.BY_SKU["full_report"]]})
        store.connect_league(email, body.platform, body.league_id, t.id, b.league.name)
        saved = True
    return {"ok": True, "saved": saved,
            "league": {"platform": body.platform, "league_id": body.league_id, "team_id": t.id,
                       "team_name": t.name, "name": b.league.name, "week": b.league.week}}


class CheckoutIn(BaseModel):
    sku: str
    success_url: str | None = None
    cancel_url: str | None = None


@app.post("/api/checkout")
def checkout(body: CheckoutIn, email: str = Depends(current_user)):
    from edge.api import payments
    if body.sku not in products.BY_SKU or products.BY_SKU[body.sku]["price_cents"] == 0:
        raise HTTPException(400, "unknown or free sku")
    url = payments.create_checkout(email, body.sku, _season(), body.success_url, body.cancel_url)
    return {"url": url}


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    from edge.api import payments
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    event = payments.parse_webhook(payload, sig)
    if not event:
        return {"received": True, "granted": False, "revoked": 0, "restored": 0}

    if event["action"] == "grant":
        store.grant(event["email"], event["sku"], event["season"], source="stripe",
                    ref=event["ref"], payment_ref=event.get("payment_ref", ""))
        return {"received": True, "granted": True, "revoked": 0, "restored": 0}

    # A refund or chargeback withdraws access; a dispute we win gives it back.
    if event["action"] == "revoke":
        n = store.revoke(event["payment_ref"])
        return {"received": True, "granted": False, "revoked": n, "restored": 0, "reason": event.get("reason")}

    n = store.restore(event["payment_ref"])
    return {"received": True, "granted": False, "revoked": 0, "restored": n, "reason": event.get("reason")}


# ---- leagues ----

@app.get("/api/sleeper/leagues")
def sleeper_leagues(username: str):
    try:
        return sleeper.find_leagues(username)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(404, f"sleeper user not found: {e}")


@app.get("/api/league/{platform}/{league_id}")
def league_summary(platform: str, league_id: str, auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    lg = b.league
    return {"id": lg.id, "platform": lg.platform, "name": lg.name, "season": lg.season, "week": lg.week,
            "waiver_type": lg.waiver_type, "faab_budget": lg.faab_budget, "starting_slots": lg.starting_slots,
            "teams": [{"id": t.id, "name": t.name, "owner_name": t.owner_name, "record": t.record,
                       "points_for": t.points_for, "faab_remaining": t.faab_remaining} for t in lg.teams]}


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/roster")
def roster(platform: str, league_id: str, team_id: str, auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    return {"team": {"id": t.id, "name": t.name}, "players": [report.player_dict(p) | {"ros": b.ros.get(p.id, 0.0)} for p in t.players],
            "starters": t.starters}


# ---- features ----

@app.get("/api/league/{platform}/{league_id}/team/{team_id}/lineup")
def lineup(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    team = _team(b, team_id)
    out = report.lineup_dict(lineup_mod.advise(b.league, team))
    # The scorecard rides along with the depth chart rather than getting its own endpoint:
    # the page that shows it already fetches this, and grading needs the same league bundle.
    out["grades"] = grades.grade_team(b.league, team, b.ros).to_dict()
    # Record the call so it can be graded later. Only /actions logged before, so the accuracy
    # programme could only ever see call-sheet readers; a user who lives on the depth chart
    # contributed nothing to the measurement. Same data, same store, same export and delete
    # paths as every other run -- `scripts/score_runs.py` already reads both kinds.
    store.log_run(email, platform, league_id, team_id, b.league.week, "lineup",
                  lineup_mod.ALGO_VERSION, out)
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/grades")
def team_grades(platform: str, league_id: str, team_id: str, auth=Depends(espn_auth)):
    """One team's scorecard, for any team in the league, so a roster can be read against a rival.

    The depth chart already ships the *owner's* scorecard inside `/lineup`, because the page
    that draws it is fetching that anyway. This exists for the other eleven, where the page
    wants one rival on demand and has no use for their start/sit advice.

    **Free, on purpose, and it does not open Trade Lab.** What it returns is a letter and a
    rank per position, computed by `engine/grades.py` from rosters every manager in the
    league can already see on the platform itself. Trade Lab sells the verdict on an offer
    and a counter tuned to the other manager's habits; "their running backs grade C+, ninth
    of twelve" is neither, and `test_the_paid_card_is_still_paid` pins that half regardless.
    Reverse it by adding an entitlement check here -- one line, and the only line.
    """
    b = _bundle(platform, league_id, auth)
    team = _team(b, team_id)
    return {"team": {"id": team.id, "name": team.name},
            "grades": grades.grade_team(b.league, team, b.ros).to_dict()}


@app.get("/api/league/{platform}/{league_id}/standings")
def league_standings(platform: str, league_id: str, email: str | None = Depends(optional_user),
                     auth=Depends(espn_auth)):
    """The table: every team's record, points, streak and roster strength. Free, for everyone.

    The "how am I doing" screen, and the reason to open the app on a Tuesday. **No
    entitlement check, on purpose.** Record, points for and points against are numbers every
    manager in the league can already read on the platform itself; the two we add -- the
    all-play record and the rest-of-season roster ranking -- are computed from rosters that
    are equally public. The week-by-week film underneath it on `/report` is still
    `full_report`, and `test_the_paid_card_is_still_paid` pins that half regardless.
    Reverse this by adding one `_require(email, "full_report")` line here, and that is the
    only line.

    League-wide, so there is no team in it and `log_run` gets an empty `team_id`: these rows
    must never be picked up by `_recorded_projections`, which filters runs by team.
    """
    b = _bundle(platform, league_id, auth)
    out = service.standings(platform, league_id, b, auth=auth)
    store.log_run(email, platform, league_id, "", b.league.week, "standings",
                  out.get("algo_version", "?"), out)
    return out


@app.get("/api/league/{platform}/{league_id}/players/search")
def player_search(platform: str, league_id: str, q: str, team_id: str | None = None,
                  auth=Depends(espn_auth)):
    """Every player the platform carries, by name, for the scouting tab's search box.

    Free, like the profile it leads to, and it opens nothing. See the profile below for why.
    """
    b = _bundle(platform, league_id, auth)
    return scout_mod.search(b, q, team_id)


@app.get("/api/league/{platform}/{league_id}/players")
def player_directory(platform: str, league_id: str, q: str = "", pos: str = "",
                     nfl_team: str = "", avail: str = "all", owner: str | None = None,
                     sort: str = directory_mod.DEFAULT_SORT, order: str = "desc",
                     limit: int = directory_mod.DEFAULT_LIMIT, offset: int = 0,
                     team_id: str | None = None, auth=Depends(espn_auth)):
    """The scouting board: every player in the league, filtered and sorted.

    **Free, on the same line the search box and the profile are free on, and it opens
    nothing.** What it hands back is each player's own numbers -- the projection the
    connector scored against this league's settings, the rest-of-season value, the bye, the
    add count. That is description. Wire Pass sells the decision: which of them fits *this*
    roster, what to bid for him and who to cut to make room, and none of those three words
    appears anywhere in this payload. The 402 on `/waivers` and `/waivers/plan` is
    untouched, `edge/products.py` is still the only thing that decides, and
    `tests/test_directory.py::test_the_board_does_not_open_the_wire` pins it.

    Sorting is the reader's, not ours. He picks a column; we order by it. Nothing here
    ranks a player as a fantasy asset -- that lives in `edge/engine/`, where CLAUDE.md
    keeps it.

    `team_id` is optional and only decides whether `rostered_by.is_me` is true, which is
    also what `avail=mine` reads.
    """
    if owner:
        validate_id(owner, "team id")
    b = _bundle(platform, league_id, auth)
    return directory_mod.query(b, q=q, pos=pos, nfl_team=nfl_team, avail=avail, owner=owner,
                               sort=sort, order=order, limit=limit, offset=offset,
                               team_id=team_id)


@app.get("/api/league/{platform}/{league_id}/player/{player_id}")
def player_profile(platform: str, league_id: str, player_id: str, team_id: str | None = None,
                   auth=Depends(espn_auth)):
    """One player's scouting report, scored by this league's settings.

    **Free, on purpose, and it does not open the wire.** What it returns is what already
    happened -- snaps, targets, carries, red-zone work, and the points those were worth
    under *these* scoring settings. That is descriptive. Wire Pass sells the ranked board,
    the bid and the drop, which are decisions, and `test_the_paid_card_is_still_paid` plus
    the 402 on `/waivers` pin that half regardless of what happens here. It is also the
    front door: CLAUDE.md's own framing is that competitors are encyclopedias you browse
    and we are three moves you make, so the encyclopedia is what gets a stranger in the
    building, not what we charge him for. Reverse it by adding an entitlement check here --
    one line, and the only line.

    `team_id` is optional and only decides whether `owner.is_me` is true; the report is the
    same report without it.
    """
    validate_id(player_id, "player id")
    b = _bundle(platform, league_id, auth)
    got = scout_mod.build(b, player_id, team_id)
    if got is None:
        # No stat line in either season and nobody by that id in the player index. A real
        # 404: the alternative is an empty report that reads like a player who did nothing.
        raise HTTPException(404, "no player by that id")
    return got


def _teaser(b: service.Bundle, t, feature: str) -> str | None:
    """A concrete, name-free sentence for the paywall, computed from the real feed."""
    try:
        feed = actions_mod.build(b.league, t, b.ros, b.byes, entitlements={"my_team"}, bid_stats=b.bid_stats, trending=b.trending)
        a = next((a for a in feed["actions"] if a["feature"] == feature and a["locked"]), None)
        return f"{a['title']}. {a['subtitle']}." if a else None
    except Exception:  # noqa: BLE001
        return None


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/waivers")
def waiver_picks(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    if not products.can(_skus(email), "waivers"):
        _require(email, "waivers", teaser=_teaser(b, t, "waivers"))
    picks = waivers.rank(b.league, t, b.ros, b.byes, bid_stats=b.bid_stats, trending=b.trending)
    return report.waivers_dict(b.league, t, picks)


class TradeIn(BaseModel):
    my_team_id: str
    their_team_id: str
    give: list[str]
    get: list[str]


@app.post("/api/league/{platform}/{league_id}/trade")
def trade_lab(platform: str, league_id: str, body: TradeIn, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    b = _bundle(platform, league_id, auth)
    me_t, them_t = _team(b, body.my_team_id), _team(b, body.their_team_id)
    if not products.can(_skus(email), "trade_lab"):
        _require(email, "trade_lab", teaser=_teaser(b, me_t, "trade_lab"))
    try:
        v = trade.evaluate(b.league, me_t, them_t, body.give, body.get, b.ros,
                           their_profile=b.profiles.get(them_t.id), hoarded=b.hoarded(them_t.id))
    except ValueError as e:
        raise HTTPException(400, str(e))
    text, source = explain(v)
    return {
        "verdict": v.verdict, "me": v.me.to_dict(), "them": v.them.to_dict(), "fairness": v.fairness,
        "their_tendencies": v.their_tendencies, "counter": v.counter, "notes": v.notes,
        "explanation": text, "explanation_source": source,
        "graphic": {
            "title": f"{v.verdict}: {', '.join(p.name for p in v.me.give)} for {', '.join(p.name for p in v.me.get)}",
            "give": [p.name for p in v.me.give], "get": [p.name for p in v.me.get],
            "my_delta_ros": v.me.lineup_delta_ros, "their_delta_ros": v.them.lineup_delta_ros,
            "fairness": v.fairness, "style": v.their_tendencies.get("style"),
        },
    }


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/actions")
def action_feed(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """The home screen: ranked moves. Free users see lineup fixes plus teasers for paid moves."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    ents = products.features_for(_skus(email))
    out = actions_mod.build(b.league, t, b.ros, b.byes, ents, bid_stats=b.bid_stats,
                            trending=b.trending, profiles=b.profiles, matchups_raw=b.matchups,
                            last_week=_last_week(email, platform, league_id, b, t, auth))
    out["entitlements"] = sorted(ents)
    out["synced_at"] = b.loaded_at
    store.log_run(email, platform, league_id, team_id, b.league.week, "actions",
                  out.get("algo_version", "?"), out)
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/desk")
def owners_desk(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """The front page: what just happened to this roster, who is next, and the binders. Free."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    ents = products.features_for(_skus(email))
    feed = actions_mod.build(b.league, t, b.ros, b.byes, ents, bid_stats=b.bid_stats,
                             trending=b.trending, profiles=b.profiles, matchups_raw=b.matchups)
    out = desk.build(t, feed, ents, league=b.league, ros=b.ros)
    out["synced_at"] = b.loaded_at
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/waivers/plan")
def waiver_plan_endpoint(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """Add/drop pairs with fallback claims — the executable version of the waiver page."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    if not products.can(_skus(email), "waivers"):
        _require(email, "waivers", teaser=_teaser(b, t, "waivers"))
    plan = waiver_plan.build(b.league, t, b.ros, b.byes, bid_stats=b.bid_stats, trending=b.trending)
    out = plan.to_dict()
    store.log_run(email, platform, league_id, team_id, b.league.week, "waiver_plan", plan.algo_version, out)
    return out


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/trades/find")
def trade_finder_endpoint(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    """Who to talk to and about what, without the user proposing anything first."""
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    out = trade_finder.find(b.league, t, b.ros, b.profiles)
    if not products.can(_skus(email), "trade_lab"):
        # D3: the free half of GM's Office. 200, not 402 -- who to call and what they are
        # short at, with every offer, player name, rest-of-season figure and fairness
        # number stripped by `trade_finder.preview`. Trade Lab is unchanged: it still owns
        # the offers, `POST /trade` still answers 402, and `edge/products.py` is still the
        # only thing that says so.
        free = {"preview": True, **trade_finder.preview(out)}
        store.log_run(email, platform, league_id, team_id, b.league.week, "trade_finder_preview",
                      free.get("algo_version", "?"), free)
        return free
    store.log_run(email, platform, league_id, team_id, b.league.week, "trade_finder",
                  out.get("algo_version", "?"), out)
    return out


class FeedbackIn(BaseModel):
    platform: str
    league_id: str
    team_id: str
    action_id: str
    action_type: str
    verdict: str            # helpful | wrong
    reason: str | None = None
    week: int | None = None


@app.post("/api/feedback")
def feedback(body: FeedbackIn, email: str | None = Depends(optional_user)):
    if body.verdict not in ("helpful", "wrong"):
        raise HTTPException(400, "verdict must be helpful or wrong")
    store.add_feedback(email, body.platform, body.league_id, body.team_id, body.action_id, body.action_type,
                       body.verdict, body.reason, body.week)
    return {"ok": True}


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/report")
def full_report(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user), auth=Depends(espn_auth)):
    _require(email, "full_report")
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    out = report.build(b.league, t, b.ros, b.byes, matchups_raw=b.matchups, bid_stats=b.bid_stats, trending=b.trending)
    out["waiver_plan"] = waiver_plan.build(b.league, t, b.ros, b.byes, bid_stats=b.bid_stats,
                                           trending=b.trending).to_dict()
    out["trade_finder"] = trade_finder.find(b.league, t, b.ros, b.profiles, limit_partners=2)
    store.log_run(email, platform, league_id, team_id, b.league.week, "report", "report.v2", {"team": t.name})
    return out


def _recorded(email: str | None, platform: str, league_id: str, team_id: str) -> list[dict]:
    """This team's `runs` rows — the only honest record of what we showed it, and when.

    Goes through `export_user`, which is part of the store contract and therefore behaves
    the same on SQLite and Postgres, rather than a new query against one of them. A
    signed-out reader has no rows, which is correct and not an excuse to reconstruct any.
    """
    if not email:
        return []
    try:
        rows = store.export_user(email)["data"].get("runs") or []
    except Exception:  # noqa: BLE001 — a film with no recorded projections still works
        return []
    return [r for r in rows
            if r.get("platform") == platform and str(r.get("league_id")) == str(league_id)
            and str(r.get("team_id")) == str(team_id)]


def _recorded_projections(email: str | None, platform: str, league_id: str, team_id: str) -> dict:
    """What we actually showed this team in past weeks, read back out of `runs`.

    The only honest source for a past week's projection is the row we wrote at the time, so
    this reads and never recomputes.
    """
    return recap_mod.projections_from_runs(_recorded(email, platform, league_id, team_id))


def _last_week(email: str | None, platform: str, league_id: str, b, t, auth) -> dict | None:
    """How last week's calls landed, for the call sheet's one free line (D4).

    Both reads are already paid for elsewhere: the `runs` rows are the ones the film reads
    back, and `service.played_weeks` caches a finished week forever — the film and the
    standings share that cache. A reader with no recorded call returns before the platform
    is touched at all, which is most readers.

    Additive, always. The call sheet is the product and paints from its own feed; a season
    history that fails upstream must cost the reader one line, never the page.
    """
    rows = _recorded(email, platform, league_id, t.id)
    calls = recap_mod.calls_from_runs(rows) if rows else {}
    if not calls:
        return None
    try:
        weeks = service.played_weeks(platform, league_id, b, auth=auth)
    except Exception:  # noqa: BLE001
        return None
    return recap_mod.last_week(b.league, t.id, weeks,
                               recap_mod.projections_from_runs(rows), calls)


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/recap")
def season_recap(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user),
                 auth=Depends(espn_auth)):
    """The film: the season that has already happened, week by week, newest first.

    The one backward-looking room in the app, and the only one that states results. Every
    number in it was scored by the league itself; the `projected` beside a starter is only
    ever what we recorded that week, and is null wherever we recorded nothing. Part of the
    Full Report, like the rest of the film.
    """
    _require(email, "full_report")
    b = _bundle(platform, league_id, auth)
    t = _team(b, team_id)
    weeks = service.played_weeks(platform, league_id, b, auth=auth)
    return recap_mod.build(b.league, t.id, weeks, _recorded_projections(email, platform, league_id, t.id))


class ShareIn(BaseModel):
    kind: str = "trade"
    league_name: str = ""
    week: int | None = None
    # kind="trade": a Trade Lab verdict
    graphic: dict | None = None
    explanation: str = ""
    give_players: list[dict] | None = None
    get_players: list[dict] | None = None
    # kind="lock": a start/sit call
    call: dict | None = None


@app.post("/api/share")
def create_share(body: ShareIn, email: str | None = Depends(optional_user)):
    """Turn a call into a public link. That link is the cheapest marketing we have.

    A start/sit share needs only `my_team`, which is free — so a user who has never paid us,
    and never even signed in, can still post a Lock card. That is deliberate: the trade card
    is the dramatic one, but the free one is the one there are thousands of.
    """
    kind = body.kind or "trade"
    if kind not in share_mod.KINDS:
        raise HTTPException(422, f"unknown share kind {kind!r}")
    feature = share_mod.KIND_FEATURE[kind]
    if not products.can(_skus(email), feature):
        raise HTTPException(402, detail={"error": f"{feature} requires a purchase", "feature": feature,
                                         "teaser": None, "upsell": products.upsell(_skus(email), feature)})
    if kind == "lock":
        call = body.call or {}
        if not (call.get("start") or {}).get("name"):
            raise HTTPException(422, "a start/sit share needs the player to start")
        snap = share_mod.lock_snapshot(call, body.league_name, body.week or 0)
    else:
        snap = share_mod.snapshot(body.graphic or {}, body.explanation, body.league_name,
                                  body.week or 0, body.give_players, body.get_players)
    sid = share_mod.new_id()
    store.put_share(sid, snap)
    base = os.environ.get("EDGE_WEB_URL", "http://localhost:3000").rstrip("/")
    return {"id": sid, "url": f"{base}/s/{sid}"}


def _share_image(share_id: str, shape: str):
    """Render a share card once, then serve it from disk — a social crawler hitting this a
    thousand times must not spin up a browser a thousand times. The cache key carries the
    shape, or the square card and the story would overwrite each other."""
    from fastapi.responses import FileResponse
    from edge import graphics

    snap = store.get_share(share_id, count_view=False)
    if not snap:
        raise HTTPException(404, "no such share")
    cache_dir = Path(os.environ.get("EDGE_CACHE_DIR", ".cache")) / "cards"
    cache_dir.mkdir(parents=True, exist_ok=True)
    suffix = "" if shape == "square" else f".{shape}"
    out = cache_dir / f"{share_id}{suffix}.png"
    if not out.exists():
        # One door: `card_html` picks the verdict or the Lock layout off the snapshot, so
        # this never branches on kind. It also decides the shape it can honour — a Lock has
        # no story layout yet and falls back to square — so the viewport is sized from what
        # comes back, not from what was asked for, or a Lock story would render letterboxed
        # into 1080x1920 with 840px of empty plate under it.
        html = graphics.card_html(snap, shape=shape)
        width, height = graphics.SHAPES[graphics.card_shape(snap, shape)]
        try:
            graphics.render_png(html, out, width=width, height=height)
        except Exception as e:  # noqa: BLE001 — no browser on this host, or a render failure
            raise HTTPException(503, f"card rendering unavailable: {e}")
    return FileResponse(out, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/share/{share_id}/card.png")
def share_card(share_id: str):
    """The 1080x1080 image a link unfurls to, and what gets posted to a feed."""
    return _share_image(share_id, "square")


@app.get("/api/share/{share_id}/story.png")
def share_story(share_id: str):
    """The same verdict at 1080x1920, for an Instagram or TikTok story. Same card, with
    the two sides of the deal stacked and the payload in the middle third where a phone's
    story UI does not cover it."""
    return _share_image(share_id, "story")


@app.get("/api/share/{share_id}")
def read_share(share_id: str):
    """Public on purpose: no auth, so a link works for someone who has never heard of us."""
    snap = store.get_share(share_id)
    if not snap:
        raise HTTPException(404, "that share link has expired or never existed")
    return snap


@app.get("/api/health")
def health():
    """Liveness, plus the one setting that can take the site down without erroring.

    `cors_origins` is reported because a misconfigured allowlist is invisible from the
    server side — every request succeeds and the browser discards the answer. Knowing what
    the running process actually believes turns an afternoon of guessing into one curl.
    """
    return {"ok": True, "cors_origins": cors_origins(),
            "web_url": os.environ.get("EDGE_WEB_URL", "") or None}
