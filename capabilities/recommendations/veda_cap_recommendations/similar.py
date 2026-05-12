"""``recommendations.similar_items`` — find items semantically similar to seed items."""

from __future__ import annotations

from typing import Any

from veda_shared.capability import capability
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.infra.qdrant import get_qdrant_client, tenant_collection_name
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId


@capability(CapabilityId.RECOMMENDATIONS_SIMILAR_ITEMS)
async def similar_items(call: CapabilityCall) -> dict[str, Any]:
    seed_ids: list[str] = call.input["seed_item_ids"]
    exclude_ids: set[str] = set(call.input.get("exclude_ids") or [])
    limit: int = int(call.input.get("limit", 5))
    if not seed_ids:
        return {"items": []}

    qdrant = get_qdrant_client()
    coll = tenant_collection_name(call.tenant_id, "catalog")
    points = await qdrant.retrieve(collection_name=coll, ids=seed_ids, with_vectors=True)
    if not points:
        return {"items": []}
    vec = points[0].vector  # type: ignore[union-attr]

    resp = await qdrant.query_points(
        collection_name=coll,
        query=vec,
        limit=limit + len(exclude_ids) + len(seed_ids),
        with_payload=True,
    )
    out_ids = [
        str(r.id) for r in resp.points if str(r.id) not in exclude_ids and str(r.id) not in seed_ids
    ][:limit]

    db = get_tenant_db(call.tenant_id)
    items = await db["catalog_items"].find({"item_id": {"$in": out_ids}}).to_list(length=limit)
    for it in items:
        it.pop("_id", None)
    return {"items": items}
