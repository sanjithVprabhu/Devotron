"""Re-engagement: find dormant customers, draft a re-engagement message."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from llm_router import get_router
from veda_shared.infra.postgres import with_tenant
from veda_shared.logging import get_logger

from daemon.jobs._common import write_proposal

log = get_logger(__name__)


async def run(tenant_id: str, *, dormancy_days: int = 60, max_per_run: int = 100) -> int:
    threshold = datetime.now(timezone.utc) - timedelta(days=dormancy_days)
    async with with_tenant(tenant_id) as session:
        rows = await session.execute(
            text(
                """
                SELECT principal_id::text, MAX(created_at) AS last_order_at, SUM(total_paise) AS total_paise
                FROM commerce.orders
                WHERE tenant_id = :tid
                GROUP BY principal_id
                HAVING MAX(created_at) < :threshold
                ORDER BY total_paise DESC NULLS LAST
                LIMIT :lim
                """
            ),
            {"tid": tenant_id, "threshold": threshold, "lim": max_per_run},
        )
        dormant = [dict(r) for r in rows.mappings().all()]

    if not dormant:
        return 0

    estimated_revenue = sum(int(d["total_paise"] or 0) for d in dormant) // 4  # rough
    # Draft a single template-suitable message variant for the owner to approve.
    draft = await get_router().complete(
        task="support_response",
        tenant_id=tenant_id,
        system="You draft brief, warm re-engagement messages for an Indian SMB. Hindi/English mix is fine. Stay under 60 words.",
        messages=[{"role": "user", "content": f"Draft a re-engagement WhatsApp message for {len(dormant)} customers who haven't ordered in {dormancy_days}+ days."}],
        max_tokens=160,
    )

    await write_proposal(
        tenant_id,
        proposal_type="reengagement",
        title=f"Re-engage {len(dormant)} dormant customers",
        description=f"{len(dormant)} customers haven't ordered in {dormancy_days}+ days.",
        action={
            "type": "broadcast",
            "targets": [{"principal_id": d["principal_id"]} for d in dormant],
            "message_draft": draft.text.strip(),
        },
        estimated_impact=f"Potential recovery: ₹{estimated_revenue / 100:,.0f}",
    )
    log.info("daemon.reengagement.proposed", tenant_id=tenant_id, dormant=len(dormant))
    return 1
