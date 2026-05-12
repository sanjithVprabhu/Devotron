"""template-service — WhatsApp Business message template lifecycle."""

from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from veda_shared.infra.postgres import with_tenant
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel
from veda_shared.settings import get_settings

setup_otel("veda-template-service")
log = get_logger(__name__)
app = FastAPI(title="VEDA Templates", version="0.0.1")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


class SubmitTemplateRequest(BaseModel):
    tenant_id: str
    name: str
    category: str  # marketing|utility|authentication
    language: str = "en"
    components: list[dict[str, Any]]


@app.post("/templates/submit")
async def submit_template(req: SubmitTemplateRequest) -> dict[str, Any]:
    async with with_tenant(req.tenant_id) as session:
        # Look up the WABA id
        row = await session.execute(
            text(
                "SELECT waba_id FROM business.whatsapp_numbers WHERE tenant_id = :tid AND is_primary = TRUE LIMIT 1"
            ),
            {"tid": req.tenant_id},
        )
        rec = row.mappings().first()
        if not rec or not rec["waba_id"]:
            raise HTTPException(409, "tenant has no WABA configured")
        waba_id = rec["waba_id"]

        # Persist as pending in our DB.
        await session.execute(
            text(
                """
                INSERT INTO templates.whatsapp_templates (tenant_id, name, category, language, status, components)
                VALUES (:tid, :name, :cat, :lang, 'pending', :comp::jsonb)
                ON CONFLICT (tenant_id, name, language) DO UPDATE
                  SET components = EXCLUDED.components, status = 'pending', updated_at = NOW()
                """
            ),
            {
                "tid": req.tenant_id,
                "name": req.name,
                "cat": req.category,
                "lang": req.language,
                "comp": json.dumps(req.components),
            },
        )
        await session.commit()

    s = get_settings()
    if not s.meta_system_user_token:
        log.warning("template.submit.dev_mode", tenant_id=req.tenant_id, name=req.name)
        return {"status": "pending", "note": "Meta token missing; persisted locally only"}

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"https://graph.facebook.com/{s.meta_graph_version}/{waba_id}/message_templates",
            headers={"Authorization": f"Bearer {s.meta_system_user_token}"},
            json={
                "name": req.name,
                "category": req.category.upper(),
                "language": req.language,
                "components": req.components,
            },
        )
        if resp.status_code >= 400:
            log.error("template.submit.failed", status=resp.status_code, body=resp.text)
            raise HTTPException(resp.status_code, resp.text)
        body = resp.json()
        return {"status": "submitted", "meta_template_id": body.get("id")}
