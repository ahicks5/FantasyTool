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


def create_checkout(email: str, sku: str, season: int, success_url: str | None, cancel_url: str | None,
                    price_cents: int | None = None, attribution: dict | None = None,
                    promo: str | None = None) -> str:
    """A Checkout session for one sku. `price_cents` overrides the catalog price; the API sets
    it (never the client) for the week-pass holder's season upgrade or a promo code the API
    has already checked. `promo` rides in the metadata so a sale can be traced to it. `attribution` is the
    account's first touch (edge/api/telemetry.py), copied into the metadata so Stripe's own
    dashboard can split revenue by channel too."""
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
    for k in ("utm_source", "utm_campaign", "utm_content"):
        if (attribution or {}).get(k):
            metadata[k] = str(attribution[k])[:120]
    if promo:
        metadata["promo"] = promo
    amount = p["price_cents"] if price_cents is None else price_cents
    if sku == products.SEASON_SKU and amount < p["price_cents"] and not promo:
        # The season bought from a live week: the webhook ends the weekly billing when it lands.
        metadata["upgrade_from"] = products.WEEK_SKU
    price_data = {"currency": "usd", "unit_amount": amount,
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
        # Andrew makes promo codes in the Stripe dashboard; Checkout shows the field. Not when
        # one of our own codes already priced this: discounts never stack.
        allow_promotion_codes=not promo,
        metadata=metadata,
        success_url=success_url or f"{base}/team?paid={sku}",
        cancel_url=cancel_url or f"{base}/?canceled=1",
    )
    return session.url


def cancel_week_subscriptions(email: str) -> int:
    """End every live week-pass subscription on this account, once it holds the season.

    Someone who takes the season should never be billed for another week. Called when a
    season grant lands, whether or not it was the discounted upgrade: a full-price season
    bought beside a running week would otherwise keep charging $4.99 every Monday. The week
    already paid is not refunded; that is what the upgrade price credited. Any failure is
    swallowed and returns what was done, because the season has been paid for either way
    and the week can still be cancelled in the customer portal.
    """
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not (key and email):
        return 0
    try:
        import stripe

        stripe.api_key = key
        safe = email.replace("\\", "\\\\").replace("'", "\\'")
        found = stripe.Subscription.search(query=f"metadata['email']:'{safe}' AND status:'active'", limit=20)
        data = found.to_dict() if hasattr(found, "to_dict") else dict(found)
        n = 0
        for sub in data.get("data") or []:
            md = sub.get("metadata") or {}
            if md.get("sku") == products.WEEK_SKU and (md.get("email") or "").lower() == email.lower():
                stripe.Subscription.cancel(sub["id"])
                n += 1
        return n
    except Exception:
        return 0


class BadWebhook(Exception):
    """The delivery failed signature verification or was not a Stripe event."""


def parse_webhook(payload: bytes, sig_header: str) -> dict | None:
    """Verify the signature and translate a Stripe event into something to do.

    Returns one of:
      {"action": "grant",   email, sku, season, ref, payment_ref}
      {"action": "revoke",  payment_ref, reason}
      {"action": "restore", payment_ref, reason}
      {"action": "abandon", email, sku, ref}          — a Checkout session expired unpaid
      {"action": "cancel",  email, sku, ref}          — a week-pass subscription ended or will
      None — an event we do not act on.

    A grant also carries `amount_cents` and `upgrade` (the season bought from a live week),
    and a revoke `amount_cents`, for the telemetry log. Abandon and cancel change no access:
    they are logged and nothing else.

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
                "payment_ref": _payment_ref(obj), "amount_cents": obj.get("amount_total"),
                "upgrade": md.get("upgrade_from") == products.WEEK_SKU, "promo": md.get("promo") or None}

    if kind == "checkout.session.expired":
        md = obj.get("metadata") or {}
        if not (md.get("email") and md.get("sku")):
            return None
        return {"action": "abandon", "email": md["email"].lower(), "sku": md["sku"], "ref": obj.get("id", "")}

    if kind in ("customer.subscription.deleted", "customer.subscription.updated"):
        md = obj.get("metadata") or {}
        if not (md.get("email") and md.get("sku")):
            return None
        if kind == "customer.subscription.updated":
            # Only the moment someone asks to stop at the period's end counts. The deletion
            # that follows carries the same subscription id, so the log keeps one cancel.
            before = (event["data"].get("previous_attributes") or {})
            if not (obj.get("cancel_at_period_end") and before.get("cancel_at_period_end") is False):
                return None
        return {"action": "cancel", "email": md["email"].lower(), "sku": md["sku"], "ref": obj.get("id", "")}

    if kind == "invoice.paid":
        # One paid week of a subscription. The invoice id is the ref, so a retried delivery
        # is the same row, not a second week.
        md = _invoice_metadata(obj)
        email = md.get("email") or obj.get("customer_email")
        if not (email and md.get("sku") and obj.get("id")):
            return None  # not one of ours: no metadata, nothing to grant
        return {"action": "grant", "email": email.lower(), "sku": md["sku"],
                "season": int(md.get("season", 0)), "ref": obj["id"],
                "payment_ref": _invoice_payment_ref(obj) or _fetch_invoice_payment_ref(obj["id"]),
                "amount_cents": obj.get("amount_paid"), "upgrade": False}

    if kind == "charge.refunded":
        # Partial refunds happen (a goodwill gesture, a price adjustment) and should not
        # cost someone the thing they still mostly paid for. Only a full refund revokes.
        amount, refunded = obj.get("amount") or 0, obj.get("amount_refunded") or 0
        if amount and refunded < amount:
            return None
        return {"action": "revoke", "payment_ref": _payment_ref(obj), "reason": "refunded",
                "amount_cents": refunded or amount, "ref": obj.get("id", "")}

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
