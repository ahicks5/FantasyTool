"""Edge API. See docs/API.md. Run: uv run uvicorn edge.api.app:app --reload"""
from __future__ import annotations

import os

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from edge import products
from edge.api import service
from edge.api.auth import current_user, optional_user
from edge.api.store import Store
from edge.connectors import sleeper
from edge.engine import lineup as lineup_mod
from edge.engine import report, trade, waivers
from edge.engine.explain import explain

app = FastAPI(title="Edge API", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("EDGE_CORS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])
store = Store()


def _season() -> int:
    return int(os.environ.get("EDGE_SEASON", "2026"))


def _skus(email: str | None) -> list[str]:
    return store.skus(email, _season()) if email else []


def _require(email: str | None, feature: str) -> None:
    if not products.can(_skus(email), feature):
        raise HTTPException(402, detail={"error": f"{feature} requires a purchase",
                                         "feature": feature, "upsell": products.upsell(_skus(email), feature)})


def _bundle(platform: str, league_id: str) -> service.Bundle:
    try:
        return service.get_bundle(platform, league_id)
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
    return {"products": products.PRODUCTS}


@app.get("/api/me")
def me(email: str = Depends(current_user)):
    skus = _skus(email)
    return {"email": email, "skus": skus, "entitlements": sorted(products.features_for(skus)),
            "leagues_allowed": products.leagues_allowed(skus), "leagues": store.leagues(email)}


class ConnectIn(BaseModel):
    platform: str
    league_id: str
    team_id: str


@app.post("/api/connect")
def connect(body: ConnectIn, email: str = Depends(current_user)):
    have = store.leagues(email)
    already = any(l["platform"] == body.platform and l["league_id"] == body.league_id for l in have)
    if not already and len(have) >= products.leagues_allowed(_skus(email)):
        raise HTTPException(402, detail={"error": "league limit reached", "feature": "leagues",
                                         "upsell": [products.BY_SKU["full_report"]]})
    b = _bundle(body.platform, body.league_id)
    t = _team(b, body.team_id)
    store.connect_league(email, body.platform, body.league_id, t.id, b.league.name)
    return {"ok": True, "league": {"platform": body.platform, "league_id": body.league_id, "team_id": t.id, "name": b.league.name}}


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
    grant = payments.parse_webhook(payload, sig)
    if grant:
        store.grant(grant["email"], grant["sku"], grant["season"], source="stripe", ref=grant["ref"])
    return {"received": True, "granted": bool(grant)}


# ---- leagues ----

@app.get("/api/sleeper/leagues")
def sleeper_leagues(username: str):
    try:
        return sleeper.find_leagues(username)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(404, f"sleeper user not found: {e}")


@app.get("/api/league/{platform}/{league_id}")
def league_summary(platform: str, league_id: str):
    b = _bundle(platform, league_id)
    lg = b.league
    return {"id": lg.id, "platform": lg.platform, "name": lg.name, "season": lg.season, "week": lg.week,
            "waiver_type": lg.waiver_type, "faab_budget": lg.faab_budget, "starting_slots": lg.starting_slots,
            "teams": [{"id": t.id, "name": t.name, "owner_name": t.owner_name, "record": t.record,
                       "points_for": t.points_for, "faab_remaining": t.faab_remaining} for t in lg.teams]}


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/roster")
def roster(platform: str, league_id: str, team_id: str):
    b = _bundle(platform, league_id)
    t = _team(b, team_id)
    return {"team": {"id": t.id, "name": t.name}, "players": [report.player_dict(p) | {"ros": b.ros.get(p.id, 0.0)} for p in t.players],
            "starters": t.starters}


# ---- features ----

@app.get("/api/league/{platform}/{league_id}/team/{team_id}/lineup")
def lineup(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user)):
    b = _bundle(platform, league_id)
    return report.lineup_dict(lineup_mod.advise(b.league, _team(b, team_id)))


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/waivers")
def waiver_picks(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user)):
    _require(email, "waivers")
    b = _bundle(platform, league_id)
    t = _team(b, team_id)
    picks = waivers.rank(b.league, t, b.ros, b.byes, bid_stats=b.bid_stats, trending=b.trending)
    return report.waivers_dict(b.league, t, picks)


class TradeIn(BaseModel):
    my_team_id: str
    their_team_id: str
    give: list[str]
    get: list[str]


@app.post("/api/league/{platform}/{league_id}/trade")
def trade_lab(platform: str, league_id: str, body: TradeIn, email: str | None = Depends(optional_user)):
    _require(email, "trade_lab")
    b = _bundle(platform, league_id)
    me_t, them_t = _team(b, body.my_team_id), _team(b, body.their_team_id)
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


@app.get("/api/league/{platform}/{league_id}/team/{team_id}/report")
def full_report(platform: str, league_id: str, team_id: str, email: str | None = Depends(optional_user)):
    _require(email, "full_report")
    b = _bundle(platform, league_id)
    t = _team(b, team_id)
    return report.build(b.league, t, b.ros, b.byes, matchups_raw=b.matchups, bid_stats=b.bid_stats, trending=b.trending)


@app.get("/api/health")
def health():
    return {"ok": True}
