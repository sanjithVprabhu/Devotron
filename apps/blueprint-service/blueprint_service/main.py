"""blueprint-service — versioned Blueprint CRUD + mutation event emission."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import jsonpatch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from veda_shared.infra.kafka import get_producer
from veda_shared.infra.postgres import with_tenant
from veda_shared.infra.redis import get_redis, tenant_key
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel
from veda_shared.schemas.constants import KAFKA_TOPICS
from veda_shared.schemas.events import BlueprintMutationEvent

setup_otel("veda-blueprint-service")
log = get_logger(__name__)
app = FastAPI(title="VEDA Blueprint", version="0.0.1")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/blueprints/{tenant_id}/current")
async def get_current(tenant_id: str) -> dict[str, Any]:
    async with with_tenant(tenant_id) as session:
        row = await session.execute(
            text(
                "SELECT version, content FROM blueprints.versions "
                "WHERE tenant_id = :tid AND is_current = TRUE LIMIT 1"
            ),
            {"tid": tenant_id},
        )
        rec = row.mappings().first()
        if not rec:
            raise HTTPException(404, "no current blueprint")
        return {"version": rec["version"], "content": rec["content"]}


@app.get("/blueprints/{tenant_id}/versions/{version}")
async def get_version(tenant_id: str, version: int) -> dict[str, Any]:
    async with with_tenant(tenant_id) as session:
        row = await session.execute(
            text(
                "SELECT content FROM blueprints.versions WHERE tenant_id = :tid AND version = :v LIMIT 1"
            ),
            {"tid": tenant_id, "v": version},
        )
        rec = row.mappings().first()
        if not rec:
            raise HTTPException(404, "version not found")
        return {"version": version, "content": rec["content"]}


class CreateBlueprintRequest(BaseModel):
    tenant_id: str
    content: dict[str, Any]
    mutated_by: str | None = None
    mutation_source: str = "veda"
    mutation_reason: str | None = None


@app.post("/blueprints/create")
async def create_blueprint(req: CreateBlueprintRequest) -> dict[str, Any]:
    async with with_tenant(req.tenant_id) as session:
        # Mark prior current as not current
        await session.execute(
            text(
                "UPDATE blueprints.versions SET is_current = FALSE "
                "WHERE tenant_id = :tid AND is_current = TRUE"
            ),
            {"tid": req.tenant_id},
        )
        row = await session.execute(
            text(
                """
                INSERT INTO blueprints.versions
                  (tenant_id, version, is_current, content, mutated_by, mutation_source, mutation_reason)
                VALUES (
                  :tid,
                  COALESCE((SELECT MAX(version) FROM blueprints.versions WHERE tenant_id = :tid), 0) + 1,
                  TRUE, :content::jsonb, :mby::uuid, :src, :reason
                )
                RETURNING version
                """
            ),
            {
                "tid": req.tenant_id,
                "content": json.dumps(req.content),
                "mby": req.mutated_by,
                "src": req.mutation_source,
                "reason": req.mutation_reason,
            },
        )
        version = row.scalar_one()

    await get_redis().delete(tenant_key(req.tenant_id, "blueprint", "current"))
    await get_producer().publish(
        KAFKA_TOPICS.BLUEPRINT_MUTATIONS,
        BlueprintMutationEvent(
            event_id=str(uuid4()),
            occurred_at=datetime.now(timezone.utc),
            tenant_id=req.tenant_id,
            version_from=max(0, version - 1),
            version_to=version,
            mutated_by_principal=req.mutated_by,
            mutation_source=req.mutation_source,  # type: ignore[arg-type]
            full_blueprint=req.content,
        ),
    )
    return {"version": version}


class MutateBlueprintRequest(BaseModel):
    tenant_id: str
    patch: list[dict[str, Any]]  # JSON Patch RFC 6902
    mutated_by: str | None = None
    mutation_source: str = "dashboard"
    mutation_reason: str | None = None


@app.post("/blueprints/mutate")
async def mutate_blueprint(req: MutateBlueprintRequest) -> dict[str, Any]:
    async with with_tenant(req.tenant_id) as session:
        row = await session.execute(
            text(
                "SELECT version, content FROM blueprints.versions "
                "WHERE tenant_id = :tid AND is_current = TRUE LIMIT 1"
            ),
            {"tid": req.tenant_id},
        )
        rec = row.mappings().first()
        if not rec:
            raise HTTPException(404, "no current blueprint to mutate")
        prior = rec["content"]
        prior_version = rec["version"]
        try:
            new_content = jsonpatch.apply_patch(prior, req.patch)
        except jsonpatch.JsonPatchException as e:
            raise HTTPException(400, f"patch failed: {e}") from e

        await session.execute(
            text(
                "UPDATE blueprints.versions SET is_current = FALSE WHERE tenant_id = :tid AND is_current = TRUE"
            ),
            {"tid": req.tenant_id},
        )
        new_row = await session.execute(
            text(
                """
                INSERT INTO blueprints.versions
                  (tenant_id, version, is_current, content, diff, mutated_by, mutation_source, mutation_reason)
                VALUES (:tid, :v, TRUE, :content::jsonb, :diff::jsonb, :mby::uuid, :src, :reason)
                RETURNING version
                """
            ),
            {
                "tid": req.tenant_id,
                "v": prior_version + 1,
                "content": json.dumps(new_content),
                "diff": json.dumps(req.patch),
                "mby": req.mutated_by,
                "src": req.mutation_source,
                "reason": req.mutation_reason,
            },
        )
        new_version = new_row.scalar_one()

    await get_redis().delete(tenant_key(req.tenant_id, "blueprint", "current"))
    await get_producer().publish(
        KAFKA_TOPICS.BLUEPRINT_MUTATIONS,
        BlueprintMutationEvent(
            event_id=str(uuid4()),
            occurred_at=datetime.now(timezone.utc),
            tenant_id=req.tenant_id,
            version_from=prior_version,
            version_to=new_version,
            mutated_by_principal=req.mutated_by,
            mutation_source=req.mutation_source,  # type: ignore[arg-type]
            diff={"patch": req.patch},
            full_blueprint=new_content,
        ),
    )
    return {"version": new_version}
