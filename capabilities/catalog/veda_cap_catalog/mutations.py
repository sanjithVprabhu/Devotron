"""``catalog.add``, ``catalog.update``, ``catalog.delete`` — owner-driven
catalog management. Mirrors the dashboard's POST /api/catalog upsert, but
invoked from chat by the business agent in admin mode.

Each mutation:
  1. Writes to MongoDB ``catalog_items`` collection (source of truth)
  2. Re-indexes into Qdrant for semantic search
  3. Logs a structured event for audit
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from qdrant_client.http.models import Distance, PointStruct, VectorParams

from llm_router import get_router
from veda_shared.capability import capability
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.infra.qdrant import get_qdrant_client, tenant_collection_name
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
from veda_shared.schemas.errors import ERROR_CODES, VedaError

log = get_logger(__name__)

# Verticals are *advisory* — caller picks the closest fit. The catalog
# document's `data` object is polymorphic; we don't enforce schema here.
_KNOWN_VERTICALS = {
    "auto_parts", "product", "retail", "fmcg", "fashion", "electronics",
    "service", "salon", "consulting", "repair", "fitness", "tutoring", "wellness", "yoga", "pottery",
    "booking", "appointment", "reservation", "clinic", "restaurant",
    "digital", "course", "video", "ebook", "subscription", "saas",
    "jobs", "job_board",
    "generic",
}


def _slugify_item_id(name: str) -> str:
    """Stable-ish item_id from a name. Random suffix for uniqueness across
    items that happen to share a name."""
    import re
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "item"
    return f"{base}-{uuid.uuid4().hex[:6]}"


async def _index_in_qdrant(tenant_id: str, item_id: str, vertical: str, data: dict[str, Any], status: str) -> None:
    """Best-effort vector index. Failure here doesn't roll back the Mongo write
    (the item is still queryable via Mongo text search)."""
    name = data.get("name") or data.get("title") or item_id
    description = data.get("description") or ""
    search_text = " ".join(filter(None, [str(name), str(description)])).lower()
    try:
        embedding = (await get_router().embed([search_text], tenant_id=tenant_id))[0]
        coll = tenant_collection_name(tenant_id, "catalog")
        q = get_qdrant_client()
        try:
            await q.get_collection(coll)
        except Exception:  # noqa: BLE001
            await q.create_collection(
                collection_name=coll,
                vectors_config=VectorParams(size=len(embedding), distance=Distance.COSINE),
            )
        # Qdrant point IDs must be UUID or uint. Use uuid5 keyed on item_id.
        point_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, item_id))
        await q.upsert(
            collection_name=coll,
            points=[
                PointStruct(
                    id=point_uuid,
                    vector=embedding,
                    payload={
                        "tenant_id": tenant_id,
                        "item_id": item_id,
                        "vertical": vertical,
                        "name": name,
                        "search_text": search_text,
                        "status": status,
                        "price_inr": float(data.get("price_inr") or 0),
                    },
                )
            ],
        )
    except Exception as e:  # noqa: BLE001
        log.warning("catalog.qdrant_index_failed", tenant_id=tenant_id, item_id=item_id, error=str(e))


async def _delete_from_qdrant(tenant_id: str, item_id: str) -> None:
    try:
        coll = tenant_collection_name(tenant_id, "catalog")
        q = get_qdrant_client()
        point_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, item_id))
        await q.delete(collection_name=coll, points_selector=[point_uuid])
    except Exception as e:  # noqa: BLE001
        log.warning("catalog.qdrant_delete_failed", tenant_id=tenant_id, item_id=item_id, error=str(e))


@capability(CapabilityId.CATALOG_ADD)
async def catalog_add(call: CapabilityCall) -> dict[str, Any]:
    """Args:
        name (str, required)           — display name
        vertical (str, optional)       — short tag; if omitted, defaults to 'generic'
        data (dict, optional)          — additional fields (price_inr, stock_qty, duration_minutes, ...)
                                         If 'name' is in data it wins over top-level.
        status (str, optional)         — 'active' (default) / 'inactive' / 'draft' / 'out_of_stock'
    """
    inp = call.input
    name = (inp.get("name") or (inp.get("data") or {}).get("name") or "").strip()
    if not name:
        raise VedaError(ERROR_CODES.INVALID_INPUT, "name required")
    vertical = (inp.get("vertical") or "generic").strip().lower()
    if vertical not in _KNOWN_VERTICALS:
        log.info("catalog.add.unknown_vertical_using_generic", vertical=vertical)
        # Keep the original string in the row; we just warn so retrieval doesn't break.
    data = dict(inp.get("data") or {})
    if "name" not in data:
        data["name"] = name
    status = (inp.get("status") or "active").strip()

    item_id = inp.get("item_id") or _slugify_item_id(name)
    search_text = " ".join(filter(None, [data.get("name"), data.get("description")])).lower()

    db = get_tenant_db(call.tenant_id)
    now = datetime.now(timezone.utc)
    await db["catalog_items"].update_one(
        {"item_id": item_id},
        {
            "$set": {
                "tenant_id": call.tenant_id,
                "item_id": item_id,
                "vertical": vertical,
                "status": status,
                "data": data,
                "search_text": search_text,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    await _index_in_qdrant(call.tenant_id, item_id, vertical, data, status)
    log.info("catalog.add.ok", tenant_id=call.tenant_id, item_id=item_id, vertical=vertical, name=name)
    return {"ok": True, "item_id": item_id, "name": name, "vertical": vertical, "price_inr": data.get("price_inr")}


@capability(CapabilityId.CATALOG_UPDATE)
async def catalog_update(call: CapabilityCall) -> dict[str, Any]:
    """Args:
        item_id (str, required)
        data (dict, optional)    — fields to merge into the existing data object
        status (str, optional)   — new status
        vertical (str, optional) — reclassify (rare)
    """
    inp = call.input
    item_id = (inp.get("item_id") or "").strip()
    if not item_id:
        raise VedaError(ERROR_CODES.INVALID_INPUT, "item_id required")

    db = get_tenant_db(call.tenant_id)
    existing = await db["catalog_items"].find_one({"item_id": item_id})
    if not existing:
        raise VedaError(ERROR_CODES.INVALID_INPUT, f"item not found: {item_id}")

    updates_data = inp.get("data") or {}
    merged_data = {**(existing.get("data") or {}), **updates_data}
    new_status = inp.get("status") or existing.get("status", "active")
    new_vertical = inp.get("vertical") or existing.get("vertical", "generic")
    search_text = " ".join(filter(None, [merged_data.get("name"), merged_data.get("description")])).lower()

    await db["catalog_items"].update_one(
        {"item_id": item_id},
        {
            "$set": {
                "data": merged_data,
                "status": new_status,
                "vertical": new_vertical,
                "search_text": search_text,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    await _index_in_qdrant(call.tenant_id, item_id, new_vertical, merged_data, new_status)
    log.info("catalog.update.ok", tenant_id=call.tenant_id, item_id=item_id, updated_keys=list(updates_data.keys()))
    return {"ok": True, "item_id": item_id, "name": merged_data.get("name")}


@capability(CapabilityId.CATALOG_DELETE)
async def catalog_delete(call: CapabilityCall) -> dict[str, Any]:
    """Soft-delete by default (status='inactive'). Pass hard=true to remove
    from Mongo entirely. Soft-delete is reversible and keeps history."""
    inp = call.input
    item_id = (inp.get("item_id") or "").strip()
    if not item_id:
        raise VedaError(ERROR_CODES.INVALID_INPUT, "item_id required")
    hard = bool(inp.get("hard"))

    db = get_tenant_db(call.tenant_id)
    existing = await db["catalog_items"].find_one({"item_id": item_id})
    if not existing:
        raise VedaError(ERROR_CODES.INVALID_INPUT, f"item not found: {item_id}")
    name = (existing.get("data") or {}).get("name", item_id)

    if hard:
        await db["catalog_items"].delete_one({"item_id": item_id})
        await _delete_from_qdrant(call.tenant_id, item_id)
        log.info("catalog.delete.hard", tenant_id=call.tenant_id, item_id=item_id, name=name)
        return {"ok": True, "item_id": item_id, "name": name, "removed": "hard"}

    await db["catalog_items"].update_one(
        {"item_id": item_id},
        {"$set": {"status": "inactive", "updated_at": datetime.now(timezone.utc)}},
    )
    await _delete_from_qdrant(call.tenant_id, item_id)
    log.info("catalog.delete.soft", tenant_id=call.tenant_id, item_id=item_id, name=name)
    return {"ok": True, "item_id": item_id, "name": name, "removed": "soft"}
