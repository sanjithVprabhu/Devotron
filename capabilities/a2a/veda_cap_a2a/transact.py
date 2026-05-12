"""``a2a.transact`` — primitives only.

Records the intent to call another tenant's agent into Postgres
(a2a.threads + a2a.messages with requires_human_approval=true) and returns
"queued_for_approval". A future Phase 3.x will:
- Generate signing keypairs for the tenant on first transact
- Format the message per Google A2A protocol
- POST it to the counterparty's published agent endpoint
- Persist the response message
- Resolve approval via the dashboard

For now this is a structured no-op so the harness can practice the flow
under owner approval without real money or data leaving the system.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text as sa_text

from veda_shared.capability import capability
from veda_shared.infra.postgres import get_session
from veda_shared.schemas.errors import ERROR_CODES, VedaError
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId

log = get_logger(__name__)


@capability(CapabilityId.A2A_TRANSACT)
async def transact(call: CapabilityCall) -> dict[str, Any]:
    """Args:
        counterparty_slug: str  — the slug of the target tenant
        category: str           — e.g. 'delivery_request', 'inventory_query'
        message_type: str       — e.g. 'order_create', 'price_quote'
        payload: dict           — opaque-to-orchestrator data passed to counterparty
    """
    counterparty_slug = call.input.get("counterparty_slug")
    category = call.input.get("category", "general")
    message_type = call.input.get("message_type", "request")
    payload = call.input.get("payload", {}) or {}

    if not counterparty_slug:
        raise VedaError(ERROR_CODES.INVALID_INPUT, "counterparty_slug required")
    if not isinstance(payload, dict):
        raise VedaError(ERROR_CODES.INVALID_INPUT, "payload must be an object")

    async with get_session() as session:
        async with session.begin():
            # Resolve counterparty
            row = (await session.execute(
                sa_text("SELECT id::text FROM core.tenants WHERE slug = :s AND status = 'active' LIMIT 1"),
                {"s": counterparty_slug},
            )).first()
            if not row:
                raise VedaError(ERROR_CODES.TENANT_NOT_FOUND, f"unknown counterparty slug: {counterparty_slug}")
            counterparty_tenant_id = row[0]

            # Create or reuse an a2a thread between these two tenants for this category
            existing = (await session.execute(
                sa_text(
                    "SELECT id::text FROM a2a.threads "
                    " WHERE initiator_tenant_id = CAST(:i AS uuid) "
                    "   AND counterparty_tenant_id = CAST(:c AS uuid) "
                    "   AND category = :cat AND status = 'open' "
                    " ORDER BY created_at DESC LIMIT 1"
                ),
                {"i": call.tenant_id, "c": counterparty_tenant_id, "cat": category},
            )).first()
            if existing:
                thread_id = existing[0]
            else:
                created = (await session.execute(
                    sa_text(
                        "INSERT INTO a2a.threads "
                        "  (initiator_tenant_id, counterparty_tenant_id, category, status, metadata) "
                        "VALUES (CAST(:i AS uuid), CAST(:c AS uuid), :cat, 'open', '{}'::jsonb) "
                        "RETURNING id::text"
                    ),
                    {"i": call.tenant_id, "c": counterparty_tenant_id, "cat": category},
                )).first()
                if not created:
                    raise VedaError(ERROR_CODES.INTERNAL, "failed to create a2a thread")
                thread_id = created[0]

            # Insert message with approval gate set true
            import json as _json
            msg_row = (await session.execute(
                sa_text(
                    "INSERT INTO a2a.messages "
                    "  (thread_id, from_tenant_id, to_tenant_id, message_type, payload, requires_human_approval) "
                    "VALUES (CAST(:t AS uuid), CAST(:f AS uuid), CAST(:to AS uuid), :mt, "
                    "        CAST(:p AS jsonb), TRUE) "
                    "RETURNING id::text"
                ),
                {
                    "t": thread_id,
                    "f": call.tenant_id,
                    "to": counterparty_tenant_id,
                    "mt": message_type,
                    "p": _json.dumps(payload),
                },
            )).first()
            if not msg_row:
                raise VedaError(ERROR_CODES.INTERNAL, "failed to record a2a message")
            message_id = msg_row[0]

    log.info(
        "a2a.queued",
        from_tenant=call.tenant_id,
        to_tenant=counterparty_tenant_id,
        thread_id=thread_id,
        message_id=message_id,
        message_type=message_type,
    )
    return {
        "status": "queued_for_approval",
        "thread_id": thread_id,
        "message_id": message_id,
        "counterparty_tenant_id": counterparty_tenant_id,
        "note": (
            "A2A delivery wire-format is not yet shipped (Phase 3.x). The intent "
            "is recorded and gated by owner approval."
        ),
    }
