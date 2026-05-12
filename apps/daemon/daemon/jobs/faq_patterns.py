"""FAQ pattern detection — find recurring unanswered queries from messages collection."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from veda_shared.infra.mongo import get_tenant_db
from veda_shared.logging import get_logger

from daemon.jobs._common import write_proposal

log = get_logger(__name__)


async def run(tenant_id: str, *, lookback_days: int = 7, min_count: int = 3) -> int:
    db = get_tenant_db(tenant_id)
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    cursor = db["messages"].find(
        {
            "direction": "inbound",
            "created_at": {"$gte": since},
            "agent_metadata.confidence": {"$lt": 0.7},
        }
    )
    queries: list[str] = []
    async for d in cursor:
        c = d.get("content") or {}
        if c.get("type") == "text":
            queries.append((c.get("text") or "").strip().lower())

    # Naive bucketing: count exact matches. (Real impl: cluster via embeddings.)
    counts: dict[str, int] = {}
    for q in queries:
        counts[q] = counts.get(q, 0) + 1
    proposed = 0
    for q, n in counts.items():
        if n >= min_count and len(q) > 8:
            await write_proposal(
                tenant_id,
                proposal_type="faq_update",
                title=f"Add FAQ for: '{q[:50]}...'",
                description=f"Asked {n} times in the last {lookback_days} days; no high-confidence FAQ matched.",
                action={"type": "faq_add", "question": q, "occurrences": n},
            )
            proposed += 1
            if proposed >= 3:
                break
    log.info("daemon.faq_patterns.proposed", tenant_id=tenant_id, count=proposed)
    return proposed
