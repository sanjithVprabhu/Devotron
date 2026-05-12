"""integration-hub — manages external system integrations (Razorpay, Shopify, ATS,
Tally exports, website crawls, custom API sandboxes).

Most actual work happens in capabilities/integration/. This service exposes admin
endpoints (test connection, run sync, analyze API endpoint) and consumes inbound
``integrations.events`` from third-party webhooks.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from veda_shared.capability import registry
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
import veda_cap_integration  # noqa: F401  registers capabilities

setup_otel("veda-integration-hub")
log = get_logger(__name__)
app = FastAPI(title="VEDA Integration Hub", version="0.0.1")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


class ApiSandboxAnalyzeRequest(BaseModel):
    tenant_id: str
    integration_id: str
    endpoint_id: str
    params: dict[str, Any] = {}


@app.post("/sandbox/call")
async def sandbox_call(req: ApiSandboxAnalyzeRequest) -> dict[str, Any]:
    result = await registry.invoke(
        CapabilityCall(
            capability=CapabilityId.INTEGRATION_API_SANDBOX_CALL,
            tenant_id=req.tenant_id,
            input={"integration_id": req.integration_id, "endpoint_id": req.endpoint_id, "params": req.params},
        )
    )
    if not result.ok:
        raise HTTPException(502, result.error.message if result.error else "sandbox call failed")
    return {"output": result.output}


class CrawlRequest(BaseModel):
    tenant_id: str
    url: str
    max_items: int = 50


@app.post("/crawl/preview")
async def crawl_preview(req: CrawlRequest) -> dict[str, Any]:
    result = await registry.invoke(
        CapabilityCall(
            capability=CapabilityId.INTEGRATION_CRAWL_EXTRACT_CATALOG,
            tenant_id=req.tenant_id,
            input={"url": req.url, "max_items": req.max_items},
        )
    )
    if not result.ok:
        raise HTTPException(502, result.error.message if result.error else "crawl failed")
    return {"output": result.output}


class ShopifySyncRequest(BaseModel):
    tenant_id: str


@app.post("/shopify/sync")
async def shopify_sync(req: ShopifySyncRequest) -> dict[str, Any]:
    result = await registry.invoke(
        CapabilityCall(
            capability=CapabilityId.INTEGRATION_SHOPIFY_SYNC_CATALOG,
            tenant_id=req.tenant_id,
            input={},
        )
    )
    if not result.ok:
        raise HTTPException(502, result.error.message if result.error else "shopify sync failed")
    return {"output": result.output}
