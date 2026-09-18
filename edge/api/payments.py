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
    session = stripe.checkout.Session.create(
        mode="payment",
        customer_email=email,
        line_items=[{"quantity": 1, "price_data": {
            "currency": "usd", "unit_amount": p["price_cents"],
            "product_data": {"name": f"Edge — {p['name']} ({season} season)", "description": p["blurb"]},
        }}],
        metadata={"email": email, "sku": sku, "season": str(season)},
        success_url=success_url or f"{base}/team?paid={sku}",
        cancel_url=cancel_url or f"{base}/?canceled=1",
    )
    return session.url


def parse_webhook(payload: bytes, sig_header: str) -> dict | None:
    """Verify signature, return {email, sku, season, ref} for a completed checkout, else None."""
    import stripe

    event = stripe.Webhook.construct_event(payload, sig_header, os.environ["STRIPE_WEBHOOK_SECRET"])
    if event["type"] != "checkout.session.completed":
        return None
    s = event["data"]["object"]
    if s.get("payment_status") not in ("paid", None):
        return None
    md = s.get("metadata") or {}
    email = (s.get("customer_details") or {}).get("email") or md.get("email") or s.get("customer_email")
    if not (email and md.get("sku")):
        return None
    return {"email": email.lower(), "sku": md["sku"], "season": int(md.get("season", 0)), "ref": s.get("id", "")}
