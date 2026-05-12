"""Conversation quality review — flag escalated/low-confidence threads for owner review."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from veda_shared.infra.postgres import with_tenant
from veda_shared.logging import get_logger

from daemon.jobs._common import write_proposal

log = get_logger(__name__)


async def run(tenant_id: str, *, lookback_days: int = 3, max_proposals: int = 5) -> int:
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    async with with_tenant(tenant_id) as session:
        rows = await session.execute(
            text(
                """
                SELECT id::text, status, last_message_at
                FROM conversations.threads
                WHERE tenant_id = :tid AND status = 'escalated' AND updated_at >= :since
                ORDER BY last_message_at DESC LIMIT :lim
                """
            ),
            {"tid": tenant_id, "since": since, "lim": max_proposals},
        )
        threads = list(rows.mappings().all())

    proposed = 0
    for t in threads:
        await write_proposal(
            tenant_id,
            proposal_type="conversation_review",
            title=f"Review escalated conversation from {t['last_message_at']}",
            description="An escalation was raised in this thread — review and close the loop.",
            action={"type": "review_link", "thread_id": t["id"]},
        )
        proposed += 1
    log.info("daemon.conversation_review.proposed", tenant_id=tenant_id, count=proposed)
    return proposed
