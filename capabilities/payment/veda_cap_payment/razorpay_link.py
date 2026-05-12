"""``payment.razorpay.create_link`` and ``payment.razorpay.verify``.

Razorpay's hosted Payment Link gives us a URL we can drop into a WhatsApp message.
The customer pays in browser; webhook fires on completion (handled by edge layer).

Credentials lookup order:
  1. business.payment_credentials for this tenant (set via dashboard) — preferred
  2. Global env vars RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET — fallback for dev
  3. Raise UPSTREAM_FAILURE so the agent escalates rather than fabricates a link
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
from typing import Any

import razorpay
from sqlalchemy import text as sa_text

from veda_shared.capability import capability
from veda_shared.infra.postgres import get_session
from veda_shared.infra.secrets import decrypt_secret
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
from veda_shared.schemas.errors import ERROR_CODES, VedaError
from veda_shared.settings import get_settings

log = get_logger(__name__)


async def _tenant_creds(tenant_id: str) -> tuple[str, str, str | None] | None:
    """Returns (key_id, key_secret, webhook_secret_or_None) for this tenant,
    or None if no per-tenant creds are configured."""
    async with get_session() as session:
        async with session.begin():
            await session.execute(
                sa_text("SELECT set_config('app.tenant_id', :t, true)"),
                {"t": tenant_id},
            )
            row = (await session.execute(
                sa_text(
                    "SELECT razorpay_key_id, razorpay_key_secret_enc, razorpay_webhook_secret_enc "
                    "  FROM business.payment_credentials WHERE tenant_id = CAST(:t AS uuid) LIMIT 1"
                ),
                {"t": tenant_id},
            )).first()
            if row is None:
                return None
            key_id, key_secret_enc, webhook_secret_enc = row[0], row[1], row[2]
            if not key_id or not key_secret_enc:
                return None
            key_secret = decrypt_secret(key_secret_enc)
            webhook_secret = decrypt_secret(webhook_secret_enc) if webhook_secret_enc else None
            return key_id, key_secret, webhook_secret


async def _client_for(tenant_id: str) -> tuple[razorpay.Client, str | None]:
    """Returns (client, webhook_secret). Webhook secret is None unless configured."""
    creds = await _tenant_creds(tenant_id)
    if creds is not None:
        key_id, key_secret, webhook_secret = creds
        log.debug("razorpay.using_tenant_creds", tenant_id=tenant_id, key_id=key_id[:12] + "…")
        return razorpay.Client(auth=(key_id, key_secret)), webhook_secret

    s = get_settings()
    if s.razorpay_key_id and s.razorpay_key_secret:
        log.debug("razorpay.using_env_fallback", tenant_id=tenant_id)
        return razorpay.Client(auth=(s.razorpay_key_id, s.razorpay_key_secret)), s.razorpay_key_secret

    raise VedaError(
        ERROR_CODES.UPSTREAM_FAILURE,
        f"Razorpay credentials not configured for tenant {tenant_id}. "
        "Configure them in dashboard → Integrations → Payment.",
    )


@capability(CapabilityId.PAYMENT_RAZORPAY_CREATE_LINK)
async def create_link(call: CapabilityCall) -> dict[str, Any]:
    inp = call.input
    amount_paise = int(inp["amount_paise"])
    order_id = inp["order_id"]
    customer_name = inp.get("customer_name") or "Customer"
    customer_phone = inp.get("customer_phone") or ""
    description = inp.get("description") or f"VEDA order {order_id}"

    client, _wh = await _client_for(call.tenant_id)
    # razorpay-python is a SYNC SDK — calling it directly in this async handler
    # would block the orchestrator's event loop. Run on a worker thread so other
    # in-flight conversations keep moving. Razorpay's API is typically 200-500ms.
    link = await asyncio.to_thread(
        client.payment_link.create,
        {
            "amount": amount_paise,
            "currency": "INR",
            "description": description,
            "customer": {"name": customer_name, "contact": customer_phone},
            "notify": {"sms": False, "email": False},
            "reminder_enable": False,
            "notes": {"order_id": order_id, "tenant_id": call.tenant_id},
            "callback_url": f"{get_settings().app_base_url}/payments/razorpay/return",
            "callback_method": "get",
        },
    )
    return {"url": link["short_url"], "razorpay_payment_link_id": link["id"]}


@capability(CapabilityId.PAYMENT_RAZORPAY_VERIFY)
async def verify_signature(call: CapabilityCall) -> dict[str, Any]:
    # Verify uses the webhook secret if available; otherwise the key secret.
    creds = await _tenant_creds(call.tenant_id)
    if creds is not None:
        _key_id, key_secret, webhook_secret = creds
        secret = webhook_secret or key_secret
    else:
        s = get_settings()
        secret = s.razorpay_key_secret
    if not secret:
        raise VedaError(ERROR_CODES.UPSTREAM_FAILURE, "Razorpay secret missing")

    payload = call.input["payload"].encode("utf-8")
    signature = call.input["signature"]
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return {"valid": hmac.compare_digest(expected, signature)}
