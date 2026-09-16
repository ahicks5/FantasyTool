"""Stripe Checkout + webhook. Prices are created inline from products.py, so there's nothing to set
up in the Stripe dashboard except the webhook endpoint. Test mode is free."""
from __future__ import annotations

import os

from edge import products


def create_checkout(email: str, sku: str, season: int, success_url: str | None, cancel_url: str | None) -> str:
    import stripe

    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    p = products.BY_SKU[sku]
    base = os.environ.get("EDGE_WEB_URL", "http://localhost:3000")
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
