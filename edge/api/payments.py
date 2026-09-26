"""Stripe Checkout + webhook. Prices are created inline from products.py, so there's nothing to set
up in the Stripe dashboard except the webhook endpoint. Test mode is free."""
from __future__ import annotations

import os
from urllib.parse import urlparse

from edge import products


def same_origin(url: str | None, base: str) -> str | None:
    """`url` if it points at our own web app, else None.

    The client chooses where Stripe returns the buyer, so that value is attacker-chosen
    input: left unchecked it turns our Checkout session into an open redirect that
    arrives wearing a real payment flow. Anything off-origin is dropped and the caller
    falls back to the default.
    """
    if not url:
        return None
    u, b = urlparse(url), urlparse(base)
    if u.scheme in ("http", "https") and (u.scheme, u.netloc) == (b.scheme, b.netloc):
        return url
    return None


def create_checkout(email: str, sku: str, season: int, success_url: str | None, cancel_url: str | None) -> str:
    import stripe

    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    p = products.BY_SKU[sku]
    base = os.environ.get("EDGE_WEB_URL", "http://localhost:3000")
    success_url = same_origin(success_url, base)
    cancel_url = same_origin(cancel_url, base)
    from edge.api.accounts import is_placeholder

    # A phone-only account has no address; Stripe asks for one on its own page, and the
    # grant still finds the account through the metadata key.
    contact = {} if is_placeholder(email) else {"customer_email": email}
    session = stripe.checkout.Session.create(
        mode="payment",
        **contact,
        line_items=[{"quantity": 1, "price_data": {
            "currency": "usd", "unit_amount": p["price_cents"],
            "product_data": {"name": f"Penthouse — {p['name']} ({season} season)", "description": p["blurb"]},
        }}],
        metadata={"email": email, "sku": sku, "season": str(season)},
        success_url=success_url or f"{base}/team?paid={sku}",
        cancel_url=cancel_url or f"{base}/?canceled=1",
    )
    return session.url


def parse_webhook(payload: bytes, sig_header: str) -> dict | None:
    """Verify the signature and translate a Stripe event into something to do.

    Returns one of:
      {"action": "grant",   email, sku, season, ref, payment_ref}
      {"action": "revoke",  payment_ref, reason}
      {"action": "restore", payment_ref, reason}
      None — an event we do not act on.

    A purchase that is refunded or charged back has to lose access, or a $7 pass is
    refundable into a free season. Refunds arrive as a *charge*, which carries no
    checkout session, so the payment intent recorded at grant time is what links them.
    """
    import stripe

    event = stripe.Webhook.construct_event(payload, sig_header, os.environ["STRIPE_WEBHOOK_SECRET"])
    kind = event["type"]
    obj = event["data"]["object"]

    # Delayed payment methods settle after the redirect, so both events grant.
    if kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if obj.get("payment_status") not in ("paid", None):
            return None
        md = obj.get("metadata") or {}
        # The account key we wrote first: the address typed on Stripe's page can differ from
        # the account's (and a phone-only account has none), and the pass belongs to the account.
        email = md.get("email") or (obj.get("customer_details") or {}).get("email") or obj.get("customer_email")
        if not (email and md.get("sku")):
            return None
        return {"action": "grant", "email": email.lower(), "sku": md["sku"],
                "season": int(md.get("season", 0)), "ref": obj.get("id", ""),
                "payment_ref": _payment_ref(obj)}

    if kind == "charge.refunded":
        # Partial refunds happen (a goodwill gesture, a price adjustment) and should not
        # cost someone the thing they still mostly paid for. Only a full refund revokes.
        amount, refunded = obj.get("amount") or 0, obj.get("amount_refunded") or 0
        if amount and refunded < amount:
            return None
        return {"action": "revoke", "payment_ref": _payment_ref(obj), "reason": "refunded"}

    if kind == "charge.dispute.created":
        return {"action": "revoke", "payment_ref": _payment_ref(obj), "reason": "disputed"}

    if kind == "charge.dispute.closed":
        # Won means the charge stands, so the access it bought should stand with it.
        if obj.get("status") == "won":
            return {"action": "restore", "payment_ref": _payment_ref(obj), "reason": "dispute_won"}
        return {"action": "revoke", "payment_ref": _payment_ref(obj), "reason": "dispute_lost"}

    return None


def _payment_ref(obj: dict) -> str:
    """The payment intent id, however this particular object spells it.

    Sessions, charges and disputes all reference the same payment intent, which is the
    only identifier common to a purchase and the refund that undoes it. Stripe expands
    it to an object in some payloads and leaves it a string in others.
    """
    pi = obj.get("payment_intent")
    if isinstance(pi, dict):
        pi = pi.get("id")
    return pi or ""
