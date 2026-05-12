"""Shared helpers for daemon jobs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from veda_shared.infra.kafka import get_producer
from veda_shared.infra.postgres import with_tenant
from veda_shared.schemas.constants import KAFKA_TOPICS
from veda_shared.schemas.events import DaemonProposalEvent


async def write_proposal(
    tenant_id: str,
    *,
    proposal_type: str,
    title: str,
    description: str,
    action: dict[str, Any],
    estimated_impact: str | None = None,
) -> str:
    async with with_tenant(tenant_id) as session:
        row = await session.execute(
            text(
                """
                INSERT INTO daemon.proposals
                  (tenant_id, proposal_type, title, description, action, estimated_impact)
                VALUES (:tid, :pt, :title, :desc, :action::jsonb, :impact)
                RETURNING id::text
                """
            ),
            {
                "tid": tenant_id,
                "pt": proposal_type,
                "title": title,
                "desc": description,
                "action": json.dumps(action),
                "impact": estimated_impact,
            },
        )
        proposal_id = row.scalar_one()

    await get_producer().publish(
        KAFKA_TOPICS.DAEMON_PROPOSALS,
        DaemonProposalEvent(
            event_id=str(uuid4()),
            occurred_at=datetime.now(timezone.utc),
            tenant_id=tenant_id,
            proposal={
                "id": proposal_id,
                "tenant_id": tenant_id,
                "proposal_type": proposal_type,
                "title": title,
                "description": description,
                "action": action,
                "estimated_impact": estimated_impact,
                "status": "pending",
                "expires_at": (datetime.now(timezone.utc).isoformat()),
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ),
    )
    return proposal_id
