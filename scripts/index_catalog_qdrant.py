"""Index the seeded Mongo catalog items into Qdrant Cloud so the agent's
semantic search returns real matches.

Reads MongoDB items where they already live, generates embeddings via OpenAI,
upserts each as a point in the per-tenant Qdrant collection.

Run:
  PYTHONPATH=$REPO/packages/python-shared:$REPO/packages/llm-router \
    python3 scripts/index_catalog_qdrant.py
"""

from __future__ import annotations

import asyncio
import os
import sys

# Allow running directly from the repo root.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for path in (
    os.path.join(ROOT, "packages", "python-shared"),
    os.path.join(ROOT, "packages", "llm-router"),
):
    if path not in sys.path:
        sys.path.insert(0, path)

from qdrant_client.http.models import Distance, PointStruct, VectorParams

from llm_router import get_router
from veda_shared.infra.mongo import get_tenant_db
from veda_shared.infra.qdrant import get_qdrant_client, tenant_collection_name


TENANT_ID = "11111111-1111-1111-1111-111111111111"
EMBEDDING_DIM = 1536  # text-embedding-3-small


async def main() -> None:
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY required (export from .env first)")

    db = get_tenant_db(TENANT_ID)
    items = await db["catalog_items"].find({"status": {"$in": ["active", "out_of_stock"]}}).to_list(length=200)
    if not items:
        sys.exit(f"no catalog items found in tenant_{TENANT_ID}.catalog_items — run pnpm db:seed:catalog first")
    print(f"found {len(items)} items in Mongo")

    qdrant = get_qdrant_client()
    coll = tenant_collection_name(TENANT_ID, "catalog")

    # Recreate the collection so dim mismatches don't silently fail.
    try:
        await qdrant.delete_collection(coll)
    except Exception:  # noqa: BLE001
        pass
    await qdrant.create_collection(
        collection_name=coll,
        vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
    )
    print(f"Qdrant collection ready: {coll}")

    router = get_router()

    # Embed in batches.
    BATCH = 16
    points: list[PointStruct] = []
    for batch_start in range(0, len(items), BATCH):
        batch = items[batch_start : batch_start + BATCH]
        texts = [_text_for_embedding(it) for it in batch]
        embeddings = await router.embed(texts, tenant_id=TENANT_ID)
        for it, vec in zip(batch, embeddings, strict=True):
            data = it.get("data", {})
            points.append(
                PointStruct(
                    id=_to_qdrant_id(it["item_id"]),
                    vector=vec,
                    payload={
                        "tenant_id": TENANT_ID,
                        "item_id": it["item_id"],
                        "vertical": it.get("vertical", "auto_parts"),
                        "name": data.get("name"),
                        "brand": data.get("brand"),
                        "search_text": it.get("search_text"),
                        "status": it.get("status"),
                        "price_inr": float(data.get("price_inr") or 0),
                        "stock_qty": int(data.get("stock_qty") or 0),
                    },
                )
            )

    await qdrant.upsert(collection_name=coll, points=points, wait=True)
    print(f"upserted {len(points)} points into Qdrant collection {coll}")
    print("done. Re-fire the simulator to see the agent quote real prices.")


def _text_for_embedding(item: dict) -> str:
    """Build a richer embedding string than the Mongo search_text — includes
    natural-language phrasing so customer queries embed close in vector space."""
    data = item.get("data", {})
    parts: list[str] = []
    name = data.get("name")
    if name:
        parts.append(name)
    brand = data.get("brand")
    if brand:
        parts.append(f"by {brand}")
    pt = data.get("part_type", "").replace("_", " ")
    if pt:
        parts.append(pt)
    sub = data.get("sub_type", "").replace("_", " ")
    if sub:
        parts.append(sub)
    for v in data.get("compatible_vehicles", []) or []:
        parts.append(f"{v.get('make')} {v.get('model')}")
        if v.get("year_from") and v.get("year_to"):
            parts.append(f"{v['year_from']}-{v['year_to']}")
        if v.get("fuel"):
            parts.append(v["fuel"])
    parts.extend(data.get("oem_numbers") or [])
    return " ".join(p for p in parts if p)


def _to_qdrant_id(item_id: str) -> str:
    """Qdrant only accepts uint or UUID. Map our SKU strings to deterministic UUIDv5."""
    import uuid

    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"veda://catalog/{item_id}"))


if __name__ == "__main__":
    asyncio.run(main())
