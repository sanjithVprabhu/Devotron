"""Catalog gap detection — searches that returned zero results."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from veda_shared.infra.mongo import get_tenant_db
from veda_shared.logging import get_logger

from daemon.jobs._common import write_proposal

log = get_logger(__name__)


async def run(tenant_id: str, *, lookback_days: int = 7, min_count: int = 2) -> int:
    db = get_tenant_db(tenant_id)
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    cursor = db["messages"].find(
        {
            "direction": "outbound",
            "created_at": {"$gte": since},
            "agent_metadata.tool_calls": {
                "$elemMatch": {"tool": "catalog.search", "output.items": {"$size": 0}}
            },
        }
    )
    queries: dict[str, int] = {}
    async for d in cursor:
        for tc in (d.get("agent_metadata") or {}).get("tool_calls", []):
            if tc.get("tool") != "catalog.search":
                continue
            q = (tc.get("input") or {}).get("query")
            if isinstance(q, str) and q:
                queries[q.lower()] = queries.get(q.lower(), 0) + 1

    proposed = 0
    for q, n in queries.items():
        if n >= min_count:
            await write_proposal(
                tenant_id,
                proposal_type="catalog_gap",
                title=f"Add to catalog: '{q[:50]}'",
                description=f"Searched {n} times this week with zero results.",
                action={"type": "catalog_prompt", "query": q, "search_count": n},
            )
            proposed += 1
    log.info("daemon.catalog_gaps.proposed", tenant_id=tenant_id, count=proposed)
    return proposed
