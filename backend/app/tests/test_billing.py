"""Billing & entitlements (Phase 3)."""
import hashlib
import hmac
import json

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.config.settings import settings
from app.models.billing import Entitlement, PaymentEvent, PaymentOrder, Plan, Subscription
from app.models.user import User
from app.services import entitlement_service
from app.tests.conftest import TestSessionLocal
from app.tests.conftest import generate_design

WEBHOOK_SECRET = "test-webhook-secret"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    resp = await client.post(
        "/api/auth/register",
        json={"name": "Billing User", "email": email, "password": "password123"},
    )
    body = resp.json()
    return body["access_token"], body["user"]["id"]


def _sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


# ── Webhook signature verification + idempotency ─────────────────────────────


async def test_webhook_rejects_bad_signature(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    body = json.dumps({"event": "order.paid", "payload": {}}).encode()

    resp = await client.post(
        "/api/billing/webhook",
        content=body,
        headers={"X-Razorpay-Signature": "deadbeef", "X-Razorpay-Event-Id": "evt_bad"},
    )
    assert resp.status_code == 400
    async with TestSessionLocal() as s:
        count = await s.scalar(select(PaymentEvent))
    assert count is None  # nothing persisted for a bad signature


async def test_webhook_is_idempotent_on_event_id(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    body = json.dumps({"event": "payment.captured", "payload": {}}).encode()
    headers = {"X-Razorpay-Signature": _sign(body), "X-Razorpay-Event-Id": "evt_1"}

    first = await client.post("/api/billing/webhook", content=body, headers=headers)
    second = await client.post("/api/billing/webhook", content=body, headers=headers)

    assert first.json()["status"] == "processed"
    assert second.json()["status"] == "duplicate"
    async with TestSessionLocal() as s:
        events = (await s.execute(select(PaymentEvent))).scalars().all()
    assert len(events) == 1


async def test_paid_webhook_marks_order_and_activates_subscription(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    _, user_id = await _register(client, "sub-activate@example.com")

    async with TestSessionLocal() as s:
        s.add(Plan(code="pro", name="Pro", price_paise=49900, interval="monthly", limits={}))
        s.add(PaymentOrder(
            user_id=user_id, plan_code="pro", razorpay_order_id="order_ABC",
            amount_paise=49900, currency="INR", status="created",
        ))
        await s.commit()

    body = json.dumps({
        "event": "order.paid",
        "payload": {"order": {"entity": {"id": "order_ABC"}}},
    }).encode()
    resp = await client.post(
        "/api/billing/webhook",
        content=body,
        headers={"X-Razorpay-Signature": _sign(body), "X-Razorpay-Event-Id": "evt_paid"},
    )
    assert resp.status_code == 200

    async with TestSessionLocal() as s:
        order = await s.scalar(select(PaymentOrder).where(PaymentOrder.razorpay_order_id == "order_ABC"))
        sub = await s.scalar(select(Subscription).where(Subscription.user_id == user_id))
    assert order.status == "paid"
    assert sub is not None and sub.status == "active" and sub.plan_code == "pro"


# ── Free-tier limits enforced (backend-only) ──────────────────────────────────


async def test_project_limit_returns_402_when_exceeded(client: AsyncClient):
    token, _ = await _register(client, "proj-limit@example.com")
    # Free tier allows 3 projects.
    for i in range(3):
        ok = await client.post("/api/projects", json={"title": f"P{i}"}, headers=_headers(token))
        assert ok.status_code == 201
    blocked = await client.post("/api/projects", json={"title": "P4"}, headers=_headers(token))
    assert blocked.status_code == 402
    assert blocked.json()["code"] == "PAYMENT_REQUIRED"


async def test_duplicate_project_is_gated_by_the_same_project_limit(client: AsyncClient):
    """Duplicating creates a project, so it must clear the plan gate too —
    otherwise the free-tier cap is bypassed by duplicating an existing project."""
    token, _ = await _register(client, "dup-limit@example.com")
    first = await client.post("/api/projects", json={"title": "P0"}, headers=_headers(token))
    project_id = first.json()["id"]
    for i in range(1, 3):
        assert (
            await client.post("/api/projects", json={"title": f"P{i}"}, headers=_headers(token))
        ).status_code == 201

    blocked = await client.post(f"/api/projects/{project_id}/duplicate", headers=_headers(token))
    assert blocked.status_code == 402
    assert blocked.json()["code"] == "PAYMENT_REQUIRED"


async def test_generation_quota_returns_402_when_exceeded(client: AsyncClient, monkeypatch):
    token, user_id = await _register(client, "gen-limit@example.com")
    # Lower the generation quota to 1 via a per-user entitlement override.
    async with TestSessionLocal() as s:
        s.add(Entitlement(
            subject_type="user", subject_id=user_id,
            feature="max_generations_per_period", value={"value": 1},
        ))
        await s.commit()

    first = await generate_design(client, _headers(token))
    second = await generate_design(client, _headers(token))

    assert first.status_code == 200
    assert second.status_code == 402


async def test_admin_bypasses_project_limit(client: AsyncClient):
    token, user_id = await _register(client, "admin-bypass@example.com")
    async with TestSessionLocal() as s:
        await s.execute(update(User).where(User.id == user_id).values(is_admin=True))
        await s.commit()
    # Admins are not gated — 5 projects on a "free" account all succeed.
    for i in range(5):
        resp = await client.post("/api/projects", json={"title": f"A{i}"}, headers=_headers(token))
        assert resp.status_code == 201


# ── Feature gates resolve backend-side ────────────────────────────────────────


async def test_require_feature_blocks_free_and_allows_override():
    async with TestSessionLocal() as s:
        user = User(name="Feat", email="feat@example.com", hashed_password="x")
        s.add(user)
        await s.flush()
        uid = user.id
        # Free tier: dxf_export is off.
        with pytest.raises(Exception):
            await entitlement_service.require_feature(s, uid, entitlement_service.FEATURE_DXF_EXPORT)
        # Grant it via an entitlement override → now allowed (no raise).
        s.add(Entitlement(subject_type="user", subject_id=uid,
                          feature=entitlement_service.FEATURE_DXF_EXPORT, value={"value": True}))
        await s.commit()
        await entitlement_service.require_feature(s, uid, entitlement_service.FEATURE_DXF_EXPORT)


# ── No sensitive payment data is ever stored ─────────────────────────────────


def test_billing_tables_store_no_card_or_bank_data():
    forbidden = {"card", "card_number", "cvv", "cvc", "pan", "upi", "vpa",
                 "bank_account", "account_number", "ifsc", "expiry"}
    for model in (PaymentOrder, PaymentEvent, Subscription, Plan):
        columns = {c.name for c in model.__table__.columns}
        assert columns.isdisjoint(forbidden), f"{model.__tablename__} exposes a sensitive column"
