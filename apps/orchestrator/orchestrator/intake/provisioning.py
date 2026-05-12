"""Tenant provisioning — creates a real tenant from an interview draft.

Called when Veda's interview reaches `finalize`. Atomic in Postgres; the
per-tenant Mongo DB and Qdrant collection are lazy-created on first use, so
we don't need to round-trip those services here.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any
from uuid import uuid4

from sqlalchemy import text as sa_text

from orchestrator.intake.geocoding import geocode_with_retry
from veda_shared.infra.postgres import get_session
from veda_shared.logging import get_logger

log = get_logger(__name__)


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:60] or f"biz-{uuid4().hex[:8]}"


async def provision_tenant_from_draft(
    *,
    owner_principal_id: str,
    draft: dict[str, Any],
) -> dict[str, Any]:
    """Create a tenant + owner membership + initial blueprint version.

    Returns: {tenant_id, blueprint_version, business_name}

    Raises if owner_principal_id doesn't exist or required draft fields are missing.
    """
    business_name = (draft.get("business_name") or "").strip()
    if not business_name:
        raise ValueError("draft.business_name required")
    vertical = (draft.get("vertical") or "generic").strip().lower()
    languages = draft.get("languages") or ["en"]
    if isinstance(languages, str):
        languages = [languages]
    description = draft.get("description") or ""
    location = draft.get("location") or "online"
    escalation_phone = draft.get("escalation_phone") or ""

    tenant_id = str(uuid4())
    blueprint_id = str(uuid4())
    blueprint_version = 1

    # Build a minimal but valid Blueprint shape. The dashboard's blueprint
    # editor can refine further; this is the seed.
    blueprint_doc = {
        "version": blueprint_version,
        "vertical": vertical,
        "identity": {
            "business_name": business_name,
            "description": description,
            "locations": [location],
        },
        "persona": {
            "agent_name": business_name,
            "languages": languages,
            "tone": draft.get("tone", "friendly"),
        },
        "policies": {
            "escalation": {
                "owner_phone_e164": escalation_phone,
                "triggers": ["refund", "complaint", "out_of_scope"],
            },
            "payment": {
                "methods": draft.get("payment_methods", ["upi", "razorpay"]),
            },
        },
        "catalog": {
            "search_config": {
                "enable_semantic_search": True,
                "fuzzy_matching": True,
            },
            "pricing_config": {
                "include_gst": True,
            },
        },
        "capabilities": {
            "enabled": [
                "catalog.search",
                "support.faq.search",
                "escalation.create",
                "payment.razorpay.create_link",
            ],
        },
        "raw_interview_draft": draft,  # keep the original for audit/tweaks
    }

    slug = _slugify(business_name) + "-" + uuid4().hex[:6]

    async with get_session() as session:
        async with session.begin():
            # 1. Create tenant
            await session.execute(
                sa_text(
                    "INSERT INTO core.tenants (id, name, slug, vertical, status, created_at) "
                    "VALUES (CAST(:id AS uuid), :name, :slug, :vertical, 'active', NOW())"
                ),
                {"id": tenant_id, "name": business_name, "slug": slug, "vertical": vertical},
            )

            # 2. Owner membership
            await session.execute(
                sa_text(
                    "INSERT INTO core.tenant_memberships "
                    "(tenant_id, principal_id, role, joined_at) "
                    "VALUES (CAST(:t AS uuid), CAST(:p AS uuid), 'owner', NOW())"
                ),
                {"t": tenant_id, "p": owner_principal_id},
            )

            # 3. Business profile (regulatory/legal — most fields stay null until owner fills)
            await session.execute(
                sa_text(
                    "INSERT INTO business.profiles (tenant_id, operating_address) "
                    "VALUES (CAST(:t AS uuid), :loc) "
                    "ON CONFLICT (tenant_id) DO NOTHING"
                ),
                {"t": tenant_id, "loc": location},
            )

            # 3b. Phase 3 primitive — register the tenant in the agent registry,
            # not yet listed publicly (owner can opt in later from dashboard).
            await session.execute(
                sa_text(
                    "INSERT INTO a2a.agent_registry "
                    "(tenant_id, is_listed_publicly, exposed_capabilities, display_name) "
                    "VALUES (CAST(:t AS uuid), FALSE, '{}'::text[], :n) "
                    "ON CONFLICT (tenant_id) DO NOTHING"
                ),
                {"t": tenant_id, "n": business_name},
            )

            # 4. Blueprint version v1, marked current
            await session.execute(
                sa_text(
                    "INSERT INTO blueprints.versions "
                    "(id, tenant_id, version, is_current, content, mutated_by, mutation_source, mutation_reason) "
                    "VALUES (CAST(:id AS uuid), CAST(:t AS uuid), :ver, TRUE, "
                    "CAST(:doc AS jsonb), CAST(:owner AS uuid), 'veda', 'initial setup via Veda interview')"
                ),
                {
                    "id": blueprint_id,
                    "t": tenant_id,
                    "ver": blueprint_version,
                    "doc": json.dumps(blueprint_doc),
                    "owner": owner_principal_id,
                },
            )

    log.info(
        "tenant.provisioned",
        tenant_id=tenant_id,
        business_name=business_name,
        vertical=vertical,
        owner_principal_id=owner_principal_id,
        slug=slug,
    )

    # Best-effort geocoding (off the critical path). Don't block on it.
    if location and location.lower() not in ("online", "online only", "remote"):
        try:
            geo = await geocode_with_retry(location)
        except Exception:  # noqa: BLE001
            geo = None
        if geo:
            try:
                async with get_session() as gs:
                    async with gs.begin():
                        await gs.execute(
                            sa_text(
                                "UPDATE business.profiles SET "
                                "  latitude = :lat, longitude = :lng, city = :city, geocoded_at = NOW() "
                                "WHERE tenant_id = CAST(:t AS uuid)"
                            ),
                            {"lat": geo["lat"], "lng": geo["lng"], "city": geo["city"], "t": tenant_id},
                        )
                log.info("tenant.geocoded", tenant_id=tenant_id, lat=geo["lat"], lng=geo["lng"], city=geo["city"])
            except Exception as e:  # noqa: BLE001
                log.warning("tenant.geocode_persist_failed", tenant_id=tenant_id, error=str(e))
    # Public URLs the owner can share immediately. Base URL is configurable for
    # local dev (localhost:3001) vs production. PUBLIC_BASE_URL env var wins;
    # default to localhost so dev works out of the box.
    base = os.environ.get("PUBLIC_BASE_URL", "http://localhost:3001").rstrip("/")
    chat_url = f"{base}/c/{slug}"
    profile_url = f"{base}/biz/{slug}"
    return {
        "tenant_id": tenant_id,
        "blueprint_version": blueprint_version,
        "business_name": business_name,
        "vertical": vertical,
        "slug": slug,
        "chat_url": chat_url,
        "profile_url": profile_url,
    }
