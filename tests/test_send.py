"""Sending the weekly email.

A send is the one thing here that cannot be undone, so most of these are about refusing
to send rather than about sending.
"""
import pytest

from edge.delivery import weekly_email
from edge.delivery.send import (
    RESEND_ENDPOINT,
    DryRunSender,
    ResendSender,
    SendError,
    sender_from_env,
)


class FakeTransport:
    """Stands in for the HTTP call and remembers exactly what was asked of it."""

    def __init__(self, status=200, body=None):
        self.status, self.body, self.calls = status, body or {"id": "re_123"}, []

    def __call__(self, url, payload, api_key):
        self.calls.append({"url": url, "payload": payload, "api_key": api_key})
        return self.status, self.body


GOOD = dict(to="andrew@example.com", subject="3 moves worth making",
            html="<html><body>hello</body></html>", text="hello")


# ---- choosing a sender ------------------------------------------------------------

def test_the_default_is_a_dry_run_so_nothing_sends_by_accident():
    assert isinstance(sender_from_env({}), DryRunSender)
    assert isinstance(sender_from_env({"EDGE_EMAIL_PROVIDER": ""}), DryRunSender)


def test_asking_for_resend_without_a_key_is_an_error_not_a_silent_dry_run():
    """Someone who asked to send and quietly did not would only find out from a reader."""
    with pytest.raises(SendError, match="RESEND_API_KEY"):
        sender_from_env({"EDGE_EMAIL_PROVIDER": "resend"})


def test_resend_also_needs_a_from_address():
    with pytest.raises(SendError, match="EDGE_EMAIL_FROM"):
        sender_from_env({"EDGE_EMAIL_PROVIDER": "resend", "RESEND_API_KEY": "re_x"})


def test_a_configured_resend_is_returned():
    s = sender_from_env({"EDGE_EMAIL_PROVIDER": "resend", "RESEND_API_KEY": "re_x",
                         "EDGE_EMAIL_FROM": "Edge <week@edge.test>"})
    assert isinstance(s, ResendSender) and s.api_key == "re_x"


def test_an_unknown_provider_is_refused_rather_than_guessed():
    with pytest.raises(SendError, match="unknown"):
        sender_from_env({"EDGE_EMAIL_PROVIDER": "mailchimp"})


# ---- the request we actually make --------------------------------------------------

def test_the_request_matches_what_resend_expects():
    t = FakeTransport()
    s = ResendSender(api_key="re_secret", sender="Edge <week@edge.test>", transport=t)
    out = s.send(**GOOD)

    assert out.id == "re_123" and out.provider == "resend" and out.dry_run is False
    call = t.calls[0]
    assert call["url"] == RESEND_ENDPOINT
    assert call["api_key"] == "re_secret"
    assert call["payload"]["to"] == ["andrew@example.com"]
    assert call["payload"]["from"] == "Edge <week@edge.test>"
    assert call["payload"]["subject"] == GOOD["subject"]
    assert call["payload"]["html"] and call["payload"]["text"], "both parts, or it lands in spam"


def test_a_refusal_from_the_provider_is_surfaced_not_swallowed():
    t = FakeTransport(status=422, body={"message": "domain is not verified"})
    s = ResendSender(api_key="re_x", sender="Edge <week@edge.test>", transport=t)
    with pytest.raises(SendError, match="domain is not verified"):
        s.send(**GOOD)


def test_a_per_message_sender_can_override_the_default():
    t = FakeTransport()
    s = ResendSender(api_key="re_x", sender="Edge <week@edge.test>", transport=t)
    s.send(**GOOD, sender="Edge <alerts@edge.test>")
    assert t.calls[0]["payload"]["from"] == "Edge <alerts@edge.test>"


# ---- the sends we refuse -----------------------------------------------------------

@pytest.mark.parametrize("bad", ["", "   ", "not-an-address", "@edge.test", "andrew@"])
def test_an_unusable_address_never_reaches_the_provider(bad):
    t = FakeTransport()
    s = ResendSender(api_key="re_x", sender="Edge <week@edge.test>", transport=t)
    with pytest.raises(SendError):
        s.send(**{**GOOD, "to": bad})
    assert t.calls == [], "nothing should have been attempted"


def test_an_empty_subject_or_body_is_refused():
    t = FakeTransport()
    s = ResendSender(api_key="re_x", sender="Edge <week@edge.test>", transport=t)
    for bad in ({"subject": "  "}, {"html": ""}, {"text": "   "}):
        with pytest.raises(SendError):
            s.send(**{**GOOD, **bad})
    assert t.calls == []


def test_the_dry_run_validates_exactly_as_the_real_one_does():
    """A dry run that accepts what a real send would refuse is a trap."""
    d = DryRunSender()
    with pytest.raises(SendError):
        d.send(**{**GOOD, "to": "nope"})
    assert d.outbox == []
    d.send(**GOOD)
    assert len(d.outbox) == 1 and d.outbox[0].dry_run is True


# ---- end to end with a real rendered email -----------------------------------------

def test_a_rendered_weekly_email_passes_the_send_checks(league):
    """The thing we actually send, not a fixture of one."""
    from edge.data.schedule import bye_weeks
    from edge.engine import actions
    from edge.engine.values import ros_values
    import json
    from pathlib import Path

    fix = Path(__file__).parent / "fixtures"
    byes = bye_weeks(json.loads((fix / "schedule_2026.json").read_text())["weeks"])
    ros = ros_values(league, json.loads((fix / "sleeper/projections_2026_season.json").read_text()), byes)
    feed = actions.build(league, league.teams[1], ros, byes,
                         entitlements={"my_team", "waivers", "trade_lab", "full_report"})
    mail = weekly_email.build(feed, base_url="https://edge.test")

    t = FakeTransport()
    s = ResendSender(api_key="re_x", sender="Edge <week@edge.test>", transport=t)
    s.send(to="andrew@example.com", subject=mail["subject"], html=mail["html"], text=mail["text"])

    payload = t.calls[0]["payload"]
    assert payload["subject"].strip()
    assert "<html" in payload["html"].lower()
    assert len(payload["text"]) > 50, "the plain-text alternative has to carry the content too"
    assert "https://edge.test" in payload["html"], "links must be absolute in an email client"


# ---- the CLI, which is how a send would actually be triggered ----------------------

@pytest.fixture
def stub_bundle(monkeypatch, league, tmp_path):
    """Serve the recorded league instead of calling Sleeper."""
    import json
    from pathlib import Path
    from edge.api import service
    from edge.data.schedule import bye_weeks
    from edge.engine.values import ros_values

    fix = Path(__file__).parent / "fixtures"
    byes = bye_weeks(json.loads((fix / "schedule_2026.json").read_text())["weeks"])
    ros = ros_values(league, json.loads((fix / "sleeper/projections_2026_season.json").read_text()), byes)
    bundle = service.Bundle(league=league, ros=ros, byes=byes, bid_stats={}, profiles={}, pos_counts={})
    monkeypatch.setattr(service, "get_bundle", lambda *a, **k: bundle)
    return tmp_path


def _run_email(tmp_path, extra):
    from edge import cli
    team = "2"
    cli.main(["email", "L1", team, "--out", str(tmp_path), "--base-url", "https://edge.test", *extra])


def test_without_a_recipient_the_cli_only_renders(stub_bundle, capsys):
    _run_email(stub_bundle, [])
    out = capsys.readouterr().out
    assert "Wrote" in out
    assert "send" not in out.lower().replace("worth making", ""), "no send should be implied"


def test_a_recipient_without_send_is_a_dry_run(stub_bundle, capsys, monkeypatch):
    """The first of two locks: --to alone never delivers."""
    monkeypatch.setenv("EDGE_EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_x")
    monkeypatch.setenv("EDGE_EMAIL_FROM", "Edge <week@edge.test>")
    _run_email(stub_bundle, ["--to", "andrew@example.com"])
    out = capsys.readouterr().out
    assert "Dry run" in out and "Would send to andrew@example.com" in out


def test_send_without_a_configured_provider_is_still_a_dry_run(stub_bundle, capsys, monkeypatch):
    """The second lock: --send with no provider configured does not silently do nothing."""
    monkeypatch.delenv("EDGE_EMAIL_PROVIDER", raising=False)
    _run_email(stub_bundle, ["--to", "andrew@example.com", "--send"])
    out = capsys.readouterr().out
    assert "Dry run" in out and "EDGE_EMAIL_PROVIDER=resend" in out
    assert "Would send" in out


def test_a_misconfigured_provider_fails_loudly_rather_than_rendering_and_stopping(stub_bundle, monkeypatch):
    monkeypatch.setenv("EDGE_EMAIL_PROVIDER", "resend")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    with pytest.raises(SystemExit, match="RESEND_API_KEY"):
        _run_email(stub_bundle, ["--to", "andrew@example.com", "--send"])
