"""Long-term memory read/write + skeptical-verification helpers (Site 3).

Memory layers:
  - thread scope: short-term (Redis, 24-hour TTL). Useful for in-thread state.
  - principal scope: per-(tenant, end-user). MongoDB ``end_user_profiles.custom_fields``.
  - tenant scope: business-wide. MongoDB ``tenant_facts`` collection.

Verification: any ``<call memory_claim="true">`` triggers Site 3 to re-read the
underlying source-of-truth (Postgres for orders, Mongo for catalog, Redis for
sessions) and either accept the call or replace it with a corrective fact.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import text

from veda_shared.infra.mongo import get_tenant_db
from veda_shared.infra.postgres import with_tenant
from veda_shared.infra.redis import get_redis, tenant_key


Scope = Literal["thread", "principal", "tenant"]


# ── reads ───────────────────────────────────────────────────────────────


async def read_memory(
    *, scope: Scope, key: str, tenant_id: str | None, principal_id: str, thread_id: str | None
) -> str | None:
    if scope == "thread":
        if not thread_id:
            return None
        r = get_redis()
        return await r.get(tenant_key(tenant_id or "veda", "harness", "thread", thread_id, key))
    if scope == "principal":
        db = get_tenant_db(tenant_id or "veda")
        doc = await db["end_user_profiles"].find_one({"principal_id": principal_id})
        if not doc:
            return None
        return (doc.get("custom_fields") or {}).get(key)
    if scope == "tenant":
        if not tenant_id:
            return None
        db = get_tenant_db(tenant_id)
        doc = await db["tenant_facts"].find_one({"key": key})
        return doc.get("value") if doc else None
    return None


async def write_memory(
    *,
    scope: Scope,
    key: str,
    value: str,
    tenant_id: str | None,
    principal_id: str,
    thread_id: str | None,
) -> None:
    now = datetime.now(timezone.utc)
    if scope == "thread":
        if not thread_id:
            return
        r = get_redis()
        k = tenant_key(tenant_id or "veda", "harness", "thread", thread_id, key)
        await r.set(k, value, ex=86_400)
        return
    if scope == "principal":
        db = get_tenant_db(tenant_id or "veda")
        await db["end_user_profiles"].update_one(
            {"principal_id": principal_id},
            {
                "$set": {f"custom_fields.{key}": value, "updated_at": now},
                "$setOnInsert": {"created_at": now, "tenant_id": tenant_id, "principal_id": principal_id},
            },
            upsert=True,
        )
        return
    if scope == "tenant":
        if not tenant_id:
            return
        db = get_tenant_db(tenant_id)
        await db["tenant_facts"].update_one(
            {"key": key}, {"$set": {"value": value, "updated_at": now}}, upsert=True
        )
        return


# ── skeptical verification (Site 3) ────────────────────────────────────


async def verify_memory_claim(
    *,
    capability: str,
    args: dict[str, Any],
    tenant_id: str | None,
    principal_id: str,
) -> tuple[bool, dict[str, Any] | None, str | None]:
    """Re-read the live source for any claim the model is making.

    Returns (ok, corrected_args, note). When `ok` is False, the loop appends
    `note` as a tool_result-style hint and re-invokes the model rather than
    executing the call with stale data.

    Verification matrix (extend as new memory-claim shapes appear):
      - capability=catalog.search with item_id  → confirm item exists + status=active
      - capability=order.* with order_id        → confirm order exists for this principal
      - default                                  → no-op (return True)
    """
    if capability == "catalog.search" and tenant_id:
        item_id = args.get("item_id") or args.get("filters", {}).get("item_id")
        if item_id:
            db = get_tenant_db(tenant_id)
            doc = await db["catalog_items"].find_one(
                {"item_id": item_id, "status": "active"}, {"_id": 0, "item_id": 1, "data.name": 1}
            )
            if not doc:
                return (
                    False,
                    None,
                    f"item {item_id!r} not in active catalog. Search by name/filters instead.",
                )

    if capability.startswith("order.") and tenant_id:
        order_id = args.get("order_id")
        if order_id:
            async with with_tenant(tenant_id) as session:
                row = await session.execute(
                    text(
                        "SELECT principal_id::text, status FROM commerce.orders "
                        "WHERE id = :oid LIMIT 1"
                    ),
                    {"oid": order_id},
                )
                rec = row.mappings().first()
            if not rec:
                return False, None, f"order {order_id!r} not found"
            if rec["principal_id"] != principal_id:
                return False, None, f"order {order_id!r} belongs to a different customer"

    return True, args, None
