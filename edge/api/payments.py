"""Stripe Checkout + webhook. Prices are created inline from products.py, so there's nothing to set
up in the Stripe dashboard except the webhook endpoint. Test mode is free.

The season pass and the league slot are one payment each. The week pass is a subscription
that renews weekly: every paid invoice (`invoice.paid`) writes one week of access, and a
cancelled subscription simply stops writing them. docs/DEPLOY.md lists the events."""
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


def checkout_name(sku: str, season: int) -> str:
    """The line the buyer reads on Stripe's page and their receipt."""
    if sku == products.WEEK_SKU:
        return "Penthouse — Week pass (7 days)"
    if sku == products.SEASON_SKU:
        return f"Penthouse — Season pass ({season} season)"
    return f"Penthouse — {products.BY_SKU[sku]['name']} ({season} season)"


def create_checkout(email: str, sku: str, season: int, success_url: str | None, cancel_url: str | None) -> str:
    import stripe

    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    if not products.for_sale(sku):
        raise ValueError(f"{sku!r} is not for sale")
    p = products.BY_SKU[sku]
    base = os.environ.get("EDGE_WEB_URL", "http://localhost:3000")
    success_url = same_origin(success_url, base)
    cancel_url = same_origin(cancel_url, base)
    from edge.api.accounts import is_placeholder

    # A phone-only account has no address; Stripe asks for one on its own page, and the
    # grant still finds the account through the metadata key.
    contact = {} if is_placeholder(email) else {"customer_email": email}
    metadata = {"email": email, "sku": sku, "season": str(season)}
    price_data = {"currency": "usd", "unit_amount": p["price_cents"],
                  "product_data": {"name": checkout_name(sku, season), "description": p["blurb"]}}
    if products.is_recurring(sku):
        # The subscription carries the metadata too: each renewal's invoice reads it from
        # there, long after this session is gone.
        price_data["recurring"] = {"interval": p["recurring"]}
        mode = {"mode": "subscription", "subscription_data": {"metadata": metadata}}
    else:
        mode = {"mode": "payment"}
    session = stripe.checkout.Session.create(
        **mode,
        **contact,
        line_items=[{"quantity": 1, "price_data": price_data}],
        # Andrew makes promo codes in the Stripe dashboard; Checkout shows the field.
        allow_promotion_codes=True,
        metadata=metadata,
        success_url=success_url or f"{base}/team?paid={sku}",
        cancel_url=cancel_url or f"{base}/?canceled=1",
    )
    return session.url


class BadWebhook(Exception):
    """The delivery failed signature verification or was not a Stripe event."""


def parse_webhook(payload: bytes, sig_header: str) -> dict | None:
    """Verify the signature and translate a Stripe event into something to do.

    Returns one of:
      {"action": "grant",   email, sku, season, ref, payment_ref}
      {"action": "revoke",  payment_ref, reason}
      {"action": "restore", payment_ref, reason}
      None — an event we do not act on.

    A purchase that is refunded or charged back has to lose access, or a paid pass is
    refundable into a free season. Refunds arrive as a *charge*, which carries no
    checkout session, so the payment intent recorded at grant time is what links them.
    """
    import stripe

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, os.environ["STRIPE_WEBHOOK_SECRET"])
    except (ValueError, stripe.SignatureVerificationError) as e:
        raise BadWebhook(str(e)) from e
    # stripe-python 15 hands back a StripeObject, which is not a dict and has no `.get`.
    # Everything below reads plain dicts, so convert once, recursively.
    if hasattr(event, "to_dict"):
        event = event.to_dict()
    kind = event["type"]
    obj = event["data"]["object"]

    # Delayed payment methods settle after the redirect, so both events grant.
    if kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        # A subscription's first week is granted by its first `invoice.paid`, like every
        # week after it. Granting here as well would write the same week twice.
        if obj.get("mode") == "subscription":
            return None
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

    if kind == "invoice.paid":
        # One paid week of a subscription. The invoice id is the ref, so a retried delivery
        # is the same row, not a second week.
        md = _invoice_metadata(obj)
        email = md.get("email") or obj.get("customer_email")
        if not (email and md.get("sku") and obj.get("id")):
            return None  # not one of ours: no metadata, nothing to grant
        return {"action": "grant", "email": email.lower(), "sku": md["sku"],
                "season": int(md.get("season", 0)), "ref": obj["id"],
                "payment_ref": _invoice_payment_ref(obj) or _fetch_invoice_payment_ref(obj["id"])}

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


def _invoice_metadata(inv: dict) -> dict:
    """The subscription's metadata, wherever this API version put it on the invoice."""
    for holder in (inv.get("subscription_details"), (inv.get("parent") or {}).get("subscription_details")):
        md = (holder or {}).get("metadata")
        if md:
            return dict(md)
    return {}


def _invoice_payment_ref(inv: dict) -> str:
    """The payment intent that paid this invoice, so a refund of the renewal can find it.

    Older API versions put it on `payment_intent`; newer ones (2026-08-26.dahlia, which the
    live webhook uses) list `payments`, each with a `payment.payment_intent`, and a snapshot
    event may not carry them at all. A $0 invoice (a 100% promo code) has none, and that is
    fine: there is nothing to refund.
    """
    ref = _payment_ref(inv)
    if ref:
        return ref
    for p in ((inv.get("payments") or {}).get("data") or []):
        pi = (p.get("payment") or {}).get("payment_intent")
        if isinstance(pi, dict):
            pi = pi.get("id")
        if pi:
            return pi
    return ""


def _fetch_invoice_payment_ref(invoice_id: str) -> str:
    """Ask Stripe which payment intent paid an invoice, when the event did not say.

    Snapshot payloads on API 2026-08-26.dahlia leave `invoice.payments` unexpanded, so the
    intent a later refund will name is not in the event. Without it a refunded renewal
    could not be matched, so look it up. Any failure leaves the ref empty: the week is
    still granted, and only a refund of it would need a manual revoke.
    """
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not (key and invoice_id):
        return ""
    try:
        import stripe

        stripe.api_key = key
        listing = stripe.InvoicePayment.list(invoice=invoice_id, limit=5)
        data = listing.to_dict() if hasattr(listing, "to_dict") else dict(listing)
        return _invoice_payment_ref({"payments": data})
    except Exception:
        return ""


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
