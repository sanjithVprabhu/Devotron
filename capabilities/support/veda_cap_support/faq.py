"""``support.faq.search`` and ``support.faq.add`` — FAQ retrieval/storage in Qdrant."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from llm_router import get_router
from qdrant_client.http.models import Distance, PointStruct, VectorParams

from veda_shared.capability import capability
from veda_shared.infra.qdrant import get_qdrant_client, tenant_collection_name
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId

log = get_logger(__name__)


@capability(CapabilityId.SUPPORT_FAQ_SEARCH)
async def faq_search(call: CapabilityCall) -> dict[str, Any]:
    query: str = call.input["query"]
    limit: int = int(call.input.get("limit", 3))

    vec = (await get_router().embed([query], tenant_id=call.tenant_id))[0]
    qdrant = get_qdrant_client()
    try:
        resp = await qdrant.query_points(
            collection_name=tenant_collection_name(call.tenant_id, "faq"),
            query=vec,
            limit=limit,
            with_payload=True,
        )
    except Exception as e:  # noqa: BLE001
        log.info("faq.collection_missing", tenant_id=call.tenant_id, error=str(e))
        return {"hits": []}
    return {
        "hits": [
            {"score": float(r.score), "question": (r.payload or {}).get("question"), "answer": (r.payload or {}).get("answer")}
            for r in resp.points
        ]
    }


@capability(CapabilityId.SUPPORT_FAQ_ADD)
async def faq_add(call: CapabilityCall) -> dict[str, Any]:
    question: str = call.input["question"]
    answer: str = call.input["answer"]
    source: str = call.input.get("source", "owner_defined")

    qdrant = get_qdrant_client()
    coll = tenant_collection_name(call.tenant_id, "faq")
    try:
        await qdrant.get_collection(coll)
    except Exception:  # noqa: BLE001
        await qdrant.create_collection(
            collection_name=coll,
            vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
        )
    vec = (await get_router().embed([question], tenant_id=call.tenant_id))[0]
    point_id = str(uuid4())
    await qdrant.upsert(
        collection_name=coll,
        points=[
            PointStruct(
                id=point_id,
                vector=vec,
                payload={
                    "tenant_id": call.tenant_id,
                    "question": question,
                    "answer": answer,
                    "source": source,
                    "confidence": 1.0,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        ],
    )
    return {"id": point_id}
