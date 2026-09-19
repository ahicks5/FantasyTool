"""Actually putting the weekly email in someone's inbox.

Everything up to the send was already built and tested; this is the last mile. It stays
a thin seam on purpose, for two reasons. Email providers are swapped more often than
anyone expects, and — more importantly — sending is the one action here that cannot be
undone. A wrong render is a bad pixel; a wrong send is a stranger's inbox and a spam
complaint against a domain we need.

So the default provider is a dry run. Sending for real takes both an explicit provider
and a key, and the CLI takes `--send` on top of that. Nothing sends by accident.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

RESEND_ENDPOINT = "https://api.resend.com/emails"


class SendError(RuntimeError):
    """A send that did not happen, with a reason worth reading."""


@dataclass
class Sent:
    provider: str
    to: str
    subject: str
    id: str = ""
    dry_run: bool = False


@dataclass
class DryRunSender:
    """Records what would have been sent. The default, and what tests use."""

    name: str = "dry-run"
    outbox: list[Sent] = field(default_factory=list)

    def send(self, to: str, subject: str, html: str, text: str, sender: str = "") -> Sent:
        _validate(to, subject, html, text)
        record = Sent(provider=self.name, to=to, subject=subject, dry_run=True)
        self.outbox.append(record)
        return record


@dataclass
class ResendSender:
    """Resend's REST API. Their free tier is enough to start."""

    api_key: str
    sender: str
    name: str = "resend"
    # Injectable so tests exercise the real request-building without a network call.
    transport: object | None = None

    def send(self, to: str, subject: str, html: str, text: str, sender: str = "") -> Sent:
        _validate(to, subject, html, text)
        payload = {
            "from": sender or self.sender,
            "to": [to],
            "subject": subject,
            "html": html,
            # Every provider wants the plain-text alternative under its own name; Resend
            # calls it "text". Sending without one is a reliable way into a spam folder.
            "text": text,
        }
        post = self.transport or _httpx_post
        status, body = post(RESEND_ENDPOINT, payload, self.api_key)
        if status >= 300:
            raise SendError(f"resend refused the message ({status}): {str(body)[:300]}")
        return Sent(provider=self.name, to=to, subject=subject, id=str(body.get("id", "")))


def _httpx_post(url: str, payload: dict, api_key: str) -> tuple[int, dict]:
    import httpx

    response = httpx.post(
        url,
        json=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout=20,
    )
    try:
        return response.status_code, response.json()
    except Exception:  # noqa: BLE001 — a non-JSON body is still a result worth reporting
        return response.status_code, {"body": response.text}


def _validate(to: str, subject: str, html: str, text: str) -> None:
    """Refuse the sends that are obviously wrong before they cost anything.

    Deliberately strict: an empty recipient or a blank body reaching a provider is a
    bug that bills us, hurts the sending domain's reputation, and cannot be recalled.
    """
    if not to or "@" not in to or to.startswith("@") or to.endswith("@"):
        raise SendError(f"not a usable address: {to!r}")
    if not subject.strip():
        raise SendError("refusing to send with an empty subject")
    if not html.strip() or not text.strip():
        raise SendError("refusing to send without both an HTML body and a plain-text alternative")


def sender_from_env(env: dict | None = None) -> DryRunSender | ResendSender:
    """The sender this environment is configured for.

    Unset, this is a dry run. Choosing `resend` without a key is an error rather than a
    silent fallback: someone who asked to send and got nothing would not find out until
    they noticed the email never arrived.
    """
    env = env if env is not None else os.environ
    provider = (env.get("EDGE_EMAIL_PROVIDER") or "dry-run").strip().lower()

    if provider in ("dry-run", "dryrun", "none", ""):
        return DryRunSender()

    if provider == "resend":
        key = (env.get("RESEND_API_KEY") or "").strip()
        from_address = (env.get("EDGE_EMAIL_FROM") or "").strip()
        if not key:
            raise SendError("EDGE_EMAIL_PROVIDER=resend needs RESEND_API_KEY")
        if not from_address:
            raise SendError("EDGE_EMAIL_PROVIDER=resend needs EDGE_EMAIL_FROM, e.g. 'Edge <week@yourdomain>'")
        return ResendSender(api_key=key, sender=from_address)

    raise SendError(f"unknown EDGE_EMAIL_PROVIDER: {provider!r} (known: dry-run, resend)")
