"""``catalog.search`` — hybrid semantic + filter search over per-tenant Mongo
catalog using Qdrant for vector similarity. Falls back to text-only when Qdrant
is unavailable."""

from __future__ import annotations

from typing import Any

from llm_router import get_router
from veda_shared.capability import capability
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.infra.qdrant import get_qdrant_client, tenant_collection_name
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId

log = get_logger(__name__)


@capability(CapabilityId.CATALOG_SEARCH)
async def catalog_search(call: CapabilityCall) -> dict[str, Any]:
    inp = call.input
    tenant_id = call.tenant_id
    query = inp.get("query") or ""
    filters = inp.get("filters") or {}
    limit = int(inp.get("limit") or 5)

    semantic_ids: list[str] = []
    if query:
        try:
            vec = (await get_router().embed([query], tenant_id=tenant_id))[0]
            qdrant = get_qdrant_client()
            qdrant_resp = await qdrant.query_points(
                collection_name=tenant_collection_name(tenant_id, "catalog"),
                query=vec,
                limit=limit * 2,
                with_payload=True,
            )
            # Qdrant point IDs are UUIDs (Qdrant only accepts uint/UUID). The
            # business-side identifier lives in payload.item_id — that's what
            # we join to Mongo on.
            for r in qdrant_resp.points:
                payload_id = (r.payload or {}).get("item_id") if r.payload else None
                if payload_id:
                    semantic_ids.append(str(payload_id))
        except Exception as e:  # noqa: BLE001
            log.info("catalog.qdrant_unavailable", tenant_id=tenant_id, error=str(e))

    db = get_tenant_db(tenant_id)
    col = db["catalog_items"]

    mongo_filter: dict[str, Any] = {"status": filters.get("status", "active")}
    if filters.get("brand"):
        mongo_filter["data.brand"] = filters["brand"]
    if filters.get("price_max") is not None:
        mongo_filter.setdefault("data.price_inr", {})["$lte"] = float(filters["price_max"])
    if filters.get("price_min") is not None:
        mongo_filter.setdefault("data.price_inr", {})["$gte"] = float(filters["price_min"])
    if filters.get("vehicle_make"):
        mongo_filter["data.compatible_vehicles"] = {
            "$elemMatch": {
                "make": filters["vehicle_make"],
                **({"model": filters["vehicle_model"]} if filters.get("vehicle_model") else {}),
            }
        }

    if semantic_ids:
        mongo_filter["item_id"] = {"$in": semantic_ids}
        items = await col.find(mongo_filter).to_list(length=limit * 2)
        # Re-rank by Qdrant order
        order = {s: i for i, s in enumerate(semantic_ids)}
        items.sort(key=lambda x: order.get(x.get("item_id"), len(order)))
        items = items[:limit]
    else:
        # Mongo fallback. Two strategies, in order:
        #   1. $text — uses the search_text text-index, supports multi-word OR matching.
        #   2. $regex on individual significant tokens — guards against missing index
        #      or queries with hyphenated parts (e.g. "brake_pad" vs "brake pads").
        if query:
            tokens = [t for t in _tokenize(query) if len(t) >= 3]
            try:
                items = (
                    await col.find({**mongo_filter, "$text": {"$search": " ".join(tokens) or query}})
                    .to_list(length=limit)
                )
                if not items and tokens:
                    raise RuntimeError("text_search_empty")
            except Exception:  # noqa: BLE001
                # Fallback to regex OR across tokens.
                if tokens:
                    mongo_filter["$or"] = [
                        {"search_text": {"$regex": _normalize_token(t), "$options": "i"}}
                        for t in tokens
                    ]
                items = await col.find(mongo_filter).to_list(length=limit)
        else:
            items = await col.find(mongo_filter).to_list(length=limit)

    return {"items": [_clean(it) for it in items], "total": len(items)}


def _clean(doc: dict[str, Any]) -> dict[str, Any]:
    doc.pop("_id", None)
    doc.pop("embedding_id", None)
    return doc


_STOPWORDS = {"the", "a", "an", "for", "of", "in", "with", "and", "or", "have", "do", "you", "any"}


def _tokenize(text: str) -> list[str]:
    """Split a free-form query into significant lowercase tokens. Strips
    punctuation, drops common stopwords."""
    import re

    return [
        t
        for t in re.split(r"[^a-zA-Z0-9]+", text.lower())
        if t and t not in _STOPWORDS
    ]


def _normalize_token(t: str) -> str:
    """For Mongo $regex: build a pattern that matches the token in either
    spaced or hyphen/underscore form (e.g. "pads" → "pad[s]?", "brake" → "brake")."""
    import re

    # Match word boundary or non-alphanumeric on both sides; allow plurals.
    safe = re.escape(t)
    return rf"(^|[^a-zA-Z0-9]){safe.rstrip('s')}s?($|[^a-zA-Z0-9])"
