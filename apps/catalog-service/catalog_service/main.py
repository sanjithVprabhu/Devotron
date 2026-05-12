"""catalog-service — per-tenant catalog CRUD + indexing into Qdrant."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client.http.models import Distance, PointStruct, VectorParams

from llm_router import get_router
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.infra.qdrant import get_qdrant_client, tenant_collection_name
from veda_shared.logging import get_logger
from veda_shared.otel import setup_otel

setup_otel("veda-catalog-service")
log = get_logger(__name__)
app = FastAPI(title="VEDA Catalog", version="0.0.1")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


class UpsertItemRequest(BaseModel):
    tenant_id: str
    item_id: str | None = None
    vertical: str
    data: dict[str, Any]
    status: str = "active"


@app.post("/items/upsert")
async def upsert_item(req: UpsertItemRequest) -> dict[str, Any]:
    item_id = req.item_id or f"sku-{uuid4().hex[:8]}"
    name = req.data.get("name") or item_id
    description = req.data.get("description") or ""
    search_text = " ".join(filter(None, [name, description, *(req.data.get("oem_numbers") or [])])).lower()

    db = get_tenant_db(req.tenant_id)
    doc = {
        "tenant_id": req.tenant_id,
        "item_id": item_id,
        "vertical": req.vertical,
        "status": req.status,
        "data": req.data,
        "search_text": search_text,
        "updated_at": datetime.now(timezone.utc),
    }
    await db["catalog_items"].update_one(
        {"item_id": item_id},
        {"$set": doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    # Index in Qdrant (best-effort).
    try:
        embedding = (await get_router().embed([search_text], tenant_id=req.tenant_id))[0]
        coll = tenant_collection_name(req.tenant_id, "catalog")
        qdrant = get_qdrant_client()
        try:
            await qdrant.get_collection(coll)
        except Exception:  # noqa: BLE001
            await qdrant.create_collection(
                collection_name=coll, vectors_config=VectorParams(size=len(embedding), distance=Distance.COSINE)
            )
        await qdrant.upsert(
            collection_name=coll,
            points=[
                PointStruct(
                    id=item_id,
                    vector=embedding,
                    payload={
                        "tenant_id": req.tenant_id,
                        "item_id": item_id,
                        "vertical": req.vertical,
                        "name": name,
                        "search_text": search_text,
                        "status": req.status,
                        "price_inr": float(req.data.get("price_inr") or 0),
                    },
                )
            ],
        )
    except Exception as e:  # noqa: BLE001
        log.warning("catalog.qdrant_index_failed", tenant_id=req.tenant_id, item_id=item_id, error=str(e))

    return {"item_id": item_id}


@app.delete("/items/{tenant_id}/{item_id}")
async def delete_item(tenant_id: str, item_id: str) -> dict[str, Any]:
    db = get_tenant_db(tenant_id)
    res = await db["catalog_items"].update_one({"item_id": item_id}, {"$set": {"status": "inactive"}})
    if res.modified_count == 0:
        raise HTTPException(404, "item not found")
    try:
        coll = tenant_collection_name(tenant_id, "catalog")
        await get_qdrant_client().delete(collection_name=coll, points_selector={"points": [item_id]})
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True}


class ListItemsResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int


@app.get("/items/{tenant_id}", response_model=ListItemsResponse)
async def list_items(tenant_id: str, status: str = "active", limit: int = 50) -> ListItemsResponse:
    db = get_tenant_db(tenant_id)
    docs = await db["catalog_items"].find({"status": status}).limit(limit).to_list(length=limit)
    for d in docs:
        d.pop("_id", None)
    return ListItemsResponse(items=docs, total=len(docs))
