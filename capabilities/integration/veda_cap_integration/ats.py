"""ATS integration capabilities (jobs vertical). V1 stubs that proxy to a
configured ATS endpoint declared in the Blueprint's integrations.ats config.
"""

from __future__ import annotations

from typing import Any

import httpx

from veda_shared.capability import capability
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
from veda_shared.schemas.errors import ERROR_CODES, VedaError

log = get_logger(__name__)


async def _ats_config(tenant_id: str) -> dict[str, Any]:
    from sqlalchemy import text

    from veda_shared.infra.postgres import with_tenant

    async with with_tenant(tenant_id) as session:
        row = await session.execute(
            text(
                """
                SELECT content->'integrations'->'ats'->'config' AS cfg
                FROM blueprints.versions
                WHERE tenant_id = :tid AND is_current = TRUE
                LIMIT 1
                """
            ),
            {"tid": tenant_id},
        )
        cfg = row.scalar_one_or_none() or {}
    if not cfg.get("base_url"):
        raise VedaError(ERROR_CODES.CAPABILITY_NOT_ENABLED, "ATS integration not configured")
    return cfg


async def _proxy(tenant_id: str, path: str, method: str, payload: Any) -> Any:
    cfg = await _ats_config(tenant_id)
    headers = {"Authorization": f"Bearer {cfg['token']}"} if cfg.get("token") else {}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.request(method, f"{cfg['base_url'].rstrip('/')}{path}", json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


@capability(CapabilityId.INTEGRATION_ATS_SEARCH_JOBS)
async def search_jobs(call: CapabilityCall) -> dict[str, Any]:
    return {"jobs": await _proxy(call.tenant_id, "/jobs/search", "POST", call.input)}


@capability(CapabilityId.INTEGRATION_ATS_GET_CANDIDATE_PROFILE)
async def get_candidate_profile(call: CapabilityCall) -> dict[str, Any]:
    candidate_id = call.input["candidate_id"]
    return await _proxy(call.tenant_id, f"/candidates/{candidate_id}", "GET", None)


@capability(CapabilityId.INTEGRATION_ATS_SUBMIT_APPLICATION)
async def submit_application(call: CapabilityCall) -> dict[str, Any]:
    return await _proxy(call.tenant_id, "/applications", "POST", call.input)


@capability(CapabilityId.INTEGRATION_ATS_GET_APPLICATION_STATUS)
async def get_application_status(call: CapabilityCall) -> dict[str, Any]:
    application_id = call.input["application_id"]
    return await _proxy(call.tenant_id, f"/applications/{application_id}", "GET", None)
