"""Trade explanation text. Template by default (free). Claude API when EDGE_USE_CLAUDE=1 and
credentials are available; falls back to the template on any error so the product never breaks."""
from __future__ import annotations

import json
import os

from edge.engine.trade import ACCEPT, COUNTER, REJECT, Verdict

MODEL = os.environ.get("EDGE_CLAUDE_MODEL", "claude-opus-5")

SYSTEM = (
    "You write short, plain-language fantasy football trade verdicts for a mobile app. "
    "You are given the engine's numbers; do not invent stats. 3-4 sentences, no headers, no bullet points, "
    "no hedging. Speak to the user as 'you'. Name the players. If a counteroffer exists, end with one "
    "sentence on why it fits the other manager."
)


def verdict_payload(v: Verdict) -> dict:
    return {
        "verdict": v.verdict,
        "me": v.me.to_dict() | {"give": [p.name for p in v.me.give], "get": [p.name for p in v.me.get]},
        "them": v.them.to_dict(),
        "fairness": v.fairness,
        "their_tendencies": v.their_tendencies,
        "counter": v.counter,
        "notes": v.notes,
    }


def template(v: Verdict) -> str:
    me, them = v.me, v.them
    give = ", ".join(p.name for p in me.give)
    get = ", ".join(p.name for p in me.get)
    s = ""
    if v.verdict == ACCEPT:
        s = f"Accept. Sending {give} for {get} lifts your starting lineup by {me.lineup_delta_ros:.0f} points rest of season."
    elif v.verdict == REJECT:
        s = f"Reject. {give} for {get} costs your lineup {abs(me.lineup_delta_ros):.0f} points rest of season and you give up {me.value_out:.0f} in value for {me.value_in:.0f}."
    elif v.verdict == COUNTER:
        s = f"Not as offered. {give} for {get} leaves your lineup {me.lineup_delta_ros:+.0f} rest of season, but there is a version that works."
    else:
        s = f"Fair. {give} for {get} is close to even ({me.value_out:.0f} out, {me.value_in:.0f} in); your lineup moves {me.lineup_delta_ros:+.0f} rest of season."
    s += f" Their lineup moves {them.lineup_delta_ros:+.0f}."
    style = v.their_tendencies.get("style")
    if style:
        article = "an" if style[0] in "aeiou" else "a"
        s += f" This manager is {article} {style}."
    if v.counter:
        s += f" Counter: {', '.join(v.counter['give_names'])} for {', '.join(v.counter['get_names'])}. {v.counter['why']}"
    return s


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
