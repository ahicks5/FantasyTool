"""Trade explanation text. Template by default (free). Claude API when EDGE_USE_CLAUDE=1 and
credentials are available; falls back to the template on any error so the product never breaks."""
from __future__ import annotations

import json
import os

from edge.engine.copy import with_article
from edge.engine.trade import ACCEPT, COUNTER, REJECT, Verdict

MODEL = os.environ.get("EDGE_CLAUDE_MODEL", "claude-opus-5")

SYSTEM = (
    "You write short, plain-language fantasy football trade verdicts for a mobile app. "
    "You are given the engine's numbers; do not invent stats. Quote every number exactly as it "
    "appears in the engine output: never round it, recompute it, or derive a new one. "
    "Lead with what the trade does to the user's starting lineup rest of season (me.lineup_delta_ros). "
    "value_out, value_in and value_net are name value, a secondary point: when the lineup improves, "
    "never present a negative value_net as a loss. 'acceptance' is whether the other manager will "
    "say yes (Likely, Maybe or Unlikely); say it in words, never as a percentage. "
    "3-4 sentences, no headers, no bullet points, no em dashes, no hedging. Speak to the user as "
    "'you'. Name the players. If a counteroffer exists, end with one sentence on what it changes "
    "and why it fits the other manager."
)


def verdict_payload(v: Verdict) -> dict:
    """What every surface reads: the API response, the template and the Claude prompt. The
    figures come from `Side.to_dict`, already rounded, so nobody downstream rounds again."""
    return {
        "verdict": v.verdict,
        "me": v.me.to_dict() | {"give": [p.name for p in v.me.give], "get": [p.name for p in v.me.get]},
        "them": v.them.to_dict(),
        "acceptance": v.acceptance,
        "their_tendencies": v.their_tendencies,
        "counter": v.counter,
        "notes": v.notes,
    }


def graphic(v: Verdict) -> dict:
    """The share card's fields. Both lineup figures are each side's OWN printed delta: the
    card used to print ours with the sign flipped as "their lineup" (W-032)."""
    me, them = v.me.to_dict(), v.them.to_dict()
    return {
        "title": f"{v.verdict}: {', '.join(p.name for p in v.me.give)} for {', '.join(p.name for p in v.me.get)}",
        "verdict": v.verdict,
        "give": [p.name for p in v.me.give], "get": [p.name for p in v.me.get],
        "my_delta_ros": me["lineup_delta_ros"], "their_delta_ros": them["lineup_delta_ros"],
        "acceptance": v.acceptance, "style": v.their_tendencies.get("style"),
    }


# "Will they say yes?", said in a sentence. Same three words the page and the card print.
WILL_THEY = {"Likely": "Will they say yes? Likely.",
             "Maybe": "Will they say yes? Maybe.",
             "Unlikely": "Will they say yes? Unlikely as is."}


def their_line(delta: int) -> str:
    if delta > 0:
        return f"Their lineup gains {delta}."
    if delta < 0:
        return f"Their lineup drops {-delta}."
    return "Their lineup holds."


def name_value_line(lineup: int, net: int) -> str | None:
    """Raw player value, worded so it cannot read as a loss when the lineup gets better."""
    if net < 0 and lineup > 0:
        return f"You give up more name value ({net:+d}), but your lineup gets better."
    if net < 0:
        return f"You give up more name value ({net:+d})."
    if net > 0:
        return f"You get more name value ({net:+d})."
    return None


def template(v: Verdict) -> str:
    p = verdict_payload(v)
    me, them = p["me"], p["them"]
    give, get = ", ".join(me["give"]), ", ".join(me["get"])
    ros = me["lineup_delta_ros"]
    if v.verdict == ACCEPT:
        s = f"Accept. Sending {give} for {get} lifts your starting lineup {ros:+d} points rest of season."
    elif v.verdict == REJECT:
        s = f"Reject. {give} for {get} moves your lineup {ros:+d} points rest of season."
    elif v.verdict == COUNTER:
        s = f"Not as offered. {give} for {get} moves your lineup {ros:+d} rest of season, but there is a version that works."
    else:
        s = f"Fair. {give} for {get} moves your lineup {ros:+d} rest of season."
    value = name_value_line(ros, me["value_net"])
    if value:
        s += f" {value}"
    s += f" {WILL_THEY.get(p['acceptance'], '')} {their_line(them['lineup_delta_ros'])}"
    style = v.their_tendencies.get("style")
    if style:
        s += f" This manager is {with_article(style)}."
    if v.counter:
        s += f" Counter: {', '.join(v.counter['give_names'])} for {', '.join(v.counter['get_names'])}. {v.counter['why']}"
    return " ".join(s.split())


def explain(v: Verdict) -> tuple[str, str]:
    """Returns (text, source) where source is 'claude' or 'template'."""
    if os.environ.get("EDGE_USE_CLAUDE") != "1":
        return template(v), "template"
    try:
        import anthropic

        client = anthropic.Anthropic()
        resp = client.messages.create(
            model=MODEL,
            max_tokens=600,
            output_config={"effort": "low"},
            system=SYSTEM,
            messages=[{"role": "user", "content": "Engine output:\n" + json.dumps(verdict_payload(v), indent=1)
                       + "\n\nWrite the verdict."}],
        )
        if resp.stop_reason == "refusal":
            return template(v), "template"
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        return (text or template(v)), ("claude" if text else "template")
    except Exception:  # network, auth, quota — never block the product on the LLM
        return template(v), "template"
