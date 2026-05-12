"""``payment.upi_manual.get_details`` — return the tenant's stored UPI ID for manual payment."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text

from veda_shared.capability import capability
from veda_shared.infra.postgres import with_tenant
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId


@capability(CapabilityId.PAYMENT_UPI_MANUAL_GET_DETAILS)
async def get_upi_details(call: CapabilityCall) -> dict[str, Any]:
    async with with_tenant(call.tenant_id) as session:
        row = await session.execute(
            text(
                """
                SELECT content->'integrations'->'payments'->'config'->>'upi_id' AS upi_id
                FROM blueprints.versions
                WHERE tenant_id = :tid AND is_current = TRUE
                LIMIT 1
                """
            ),
            {"tid": call.tenant_id},
        )
        upi_id = row.scalar_one_or_none()
    return {"upi_id": upi_id}
