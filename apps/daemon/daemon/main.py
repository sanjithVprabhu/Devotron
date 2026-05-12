"""Daemon runner — proactive intelligence per tenant.

Runs on schedule (default 6h per tenant). For each tenant: load events from the
last window, run analysis jobs, write Daemon Proposals to Postgres + Kafka.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from sqlalchemy import text

from daemon.jobs import catalog_gaps, conversation_review, faq_patterns, reengagement
from veda_shared.infra.postgres import get_session
from veda_shared.infra.redis import get_redis, tenant_key
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel
from veda_shared.schemas.constants import DAEMON_LOCK_TTL_SECONDS

setup_otel("veda-daemon")
log = get_logger(__name__)
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    scheduler.add_job(_run_all_tenants, "interval", hours=1, id="daemon-every-hour")
    scheduler.start()
    log.info("daemon.scheduler.started")
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="VEDA Daemon", version="0.0.1", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/run/{tenant_id}")
async def run_for_tenant_endpoint(tenant_id: str) -> dict[str, int]:
    n = await run_for_tenant(tenant_id)
    return {"proposals": n}


async def _run_all_tenants() -> None:
    async with get_session() as session:
        rows = await session.execute(
            text("SELECT id::text FROM core.tenants WHERE status = 'active'")
        )
        tenant_ids = [r[0] for r in rows.all()]

    log.info("daemon.tick", tenants=len(tenant_ids))
    await asyncio.gather(*(run_for_tenant(t) for t in tenant_ids), return_exceptions=True)


async def run_for_tenant(tenant_id: str) -> int:
    r = get_redis()
    lock = await r.set(tenant_key(tenant_id, "daemon", "lock"), "1", ex=DAEMON_LOCK_TTL_SECONDS, nx=True)
    if not lock:
        log.info("daemon.skip.locked", tenant_id=tenant_id)
        return 0

    proposals = 0
    try:
        proposals += await reengagement.run(tenant_id)
        proposals += await faq_patterns.run(tenant_id)
        proposals += await catalog_gaps.run(tenant_id)
        proposals += await conversation_review.run(tenant_id)
    finally:
        await r.delete(tenant_key(tenant_id, "daemon", "lock"))
    log.info("daemon.tenant_done", tenant_id=tenant_id, proposals=proposals)
    return proposals
