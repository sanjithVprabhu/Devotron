# 11 — Capability Registry

> Every discrete action an agent can take is a Capability. This registry defines all v1 capabilities, their interfaces, and which vertical bundles include them.

---

## What a Capability Is

A Capability is a stateless function (or lightweight service) that does one thing. Agents invoke capabilities as tool calls. Every call is logged to `veda.agent.actions`.

Capability ID format: `{domain}.{action}` — e.g., `catalog.search`, `payment.razorpay`.

---

## Full Capability Registry (v1)

### Domain: `catalog`

| ID | Description | Input | Output |
|---|---|---|---|
| `catalog.search` | Semantic + filter search over tenant catalog | query, filters, limit | `CatalogItem[]` |
| `catalog.add` | Add new item to catalog + re-embed | item data | `CatalogItem` |
| `catalog.update` | Update existing catalog item | item_id, patch | `CatalogItem` |
| `catalog.delete` | Soft-delete catalog item | item_id | `void` |
| `catalog.bulk_import` | Import from CSV/Excel/Shopify/API | source config | `ImportResult` |
| `catalog.vehicle_compat_lookup` | Find parts compatible with vehicle | make, model, year | `CatalogItem[]` |

### Domain: `payment`

| ID | Description | Input | Output |
|---|---|---|---|
| `payment.razorpay.create_link` | Generate Razorpay payment link | amount, order_id, customer | `{ url, order_id }` |
| `payment.razorpay.verify` | Verify payment signature | payment_id, signature | `boolean` |
| `payment.razorpay.refund` | Issue refund | payment_id, amount | `RefundResult` |
| `payment.upi_manual.get_details` | Return UPI ID for manual payment | tenant_id | `{ upi_id }` |
| `payment.cod.confirm` | Mark order as COD, skip payment | order_id | `void` |

### Domain: `broadcast`

| ID | Description | Input | Output |
|---|---|---|---|
| `broadcast.send` | Send message to multiple principals | targets[], template/message | `BroadcastResult` |
| `broadcast.schedule` | Schedule broadcast for later | targets[], message, send_at | `ScheduledBroadcast` |
| `broadcast.preview` | Preview broadcast before sending | targets[], message | `PreviewResult` |

### Domain: `scheduling`

| ID | Description | Input | Output |
|---|---|---|---|
| `scheduling.calendar.check_availability` | Get open slots | date_range, duration | `TimeSlot[]` |
| `scheduling.calendar.book` | Create booking | time_slot, customer_info | `Booking` |
| `scheduling.calendar.cancel` | Cancel booking | booking_id | `void` |

### Domain: `support`

| ID | Description | Input | Output |
|---|---|---|---|
| `support.faq.search` | Search FAQ knowledge base | query | `FAQResult[]` |
| `support.faq.add` | Add new FAQ entry + embed | question, answer | `FAQEntry` |
| `support.escalation.create` | Create escalation + notify team | thread_id, reason | `Escalation` |

### Domain: `recommendations`

| ID | Description | Input | Output |
|---|---|---|---|
| `recommendations.similar_items` | Find similar catalog items | seed_item_ids, limit | `CatalogItem[]` |
| `recommendations.personalized` | Personalized recs for user | principal_id, limit | `CatalogItem[]` |

### Domain: `media`

| ID | Description | Input | Output |
|---|---|---|---|
| `media.transcribe` | STT for voice notes (Hindi, Kannada, EN, etc.) | media_url, language_hint | `{ transcription, language, confidence }` |
| `media.image_analyze` | Analyze product image or ID document | media_url, analysis_type | `{ analysis, extracted_text }` |

### Domain: `template`

| ID | Description | Input | Output |
|---|---|---|---|
| `template.lookup` | Find approved template by name/type | name or type, language | `Template` |
| `template.submit` | Submit template to Meta for approval | template_definition | `{ submission_id }` |

### Domain: `integration`

| ID | Description | Input | Output |
|---|---|---|---|
| `integration.shopify.sync_catalog` | Sync products from Shopify | shop_url | `SyncResult` |
| `integration.ats.search_jobs` | Search jobs in ATS | filters | `Job[]` |
| `integration.ats.get_candidate_profile` | Fetch candidate profile | candidate_id | `CandidateProfile` |
| `integration.ats.submit_application` | Apply for a job | job_id, candidate_id | `Application` |
| `integration.ats.get_application_status` | Check application status | application_id | `ApplicationStatus` |
| `integration.crawl.extract_catalog` | Extract catalog from website | url | `CatalogItem[]` |
| `integration.api_sandbox.call` | Call a custom API endpoint | integration_id, endpoint_id, params | `ApiResponse` |

### Domain: `analytics` (dashboard use, not in agent runtime)

| ID | Description |
|---|---|
| `analytics.conversation_summary` | Summary stats for a period |
| `analytics.funnel` | Discovery → engagement → conversion funnel |
| `analytics.top_queries` | Most asked questions |
| `analytics.revenue` | Order revenue over time |

---

## Vertical Bundles

Each vertical has a default capability bundle — enabled automatically on onboarding:

### Bundle: `auto_parts`
```json
{
  "enabled": [
    "catalog.search", "catalog.update", "catalog.vehicle_compat_lookup",
    "payment.razorpay.create_link", "payment.razorpay.verify",
    "payment.upi_manual.get_details", "payment.cod.confirm",
    "broadcast.send",
    "support.faq.search", "support.faq.add", "support.escalation.create",
    "recommendations.similar_items",
    "media.transcribe", "media.image_analyze",
    "template.lookup"
  ],
  "opt_in_available": [
    "negotiation.bounded",
    "scheduling.calendar.check_availability",
    "scheduling.calendar.book",
    "recommendations.personalized",
    "integration.shopify.sync_catalog"
  ]
}
```

### Bundle: `jobs`
```json
{
  "enabled": [
    "integration.ats.search_jobs",
    "integration.ats.get_candidate_profile",
    "integration.ats.submit_application",
    "integration.ats.get_application_status",
    "support.faq.search", "support.escalation.create",
    "scheduling.calendar.check_availability",
    "scheduling.calendar.book",
    "media.transcribe",
    "broadcast.send",
    "template.lookup"
  ]
}
```

### Bundle: `services`
```json
{
  "enabled": [
    "catalog.search",
    "scheduling.calendar.check_availability",
    "scheduling.calendar.book",
    "scheduling.calendar.cancel",
    "payment.razorpay.create_link",
    "payment.upi_manual.get_details",
    "support.faq.search", "support.escalation.create",
    "broadcast.send",
    "media.transcribe",
    "template.lookup"
  ]
}
```

---

## Capability Implementation Pattern

Each capability is a Python function with a standard interface:

```python
# capabilities/catalog/search.py

from typing import Any
from models import CatalogSearchInput, CatalogSearchOutput
from infrastructure import qdrant_client, mongo_client
from llm_router import llm_router

async def catalog_search(
    tenant_id: str,
    query: str,
    filters: dict[str, Any],
    limit: int = 5
) -> CatalogSearchOutput:
    """
    Hybrid search: BM25 text match + Qdrant vector similarity.
    Returns items sorted by relevance.
    """
    # 1. Embed query
    query_vector = await llm_router.embed(query)
    
    # 2. Qdrant semantic search with payload filters
    semantic_results = await qdrant_client.search(
        collection=f"{tenant_id}_catalog",
        query_vector=query_vector,
        query_filter=build_qdrant_filter(filters, tenant_id),
        limit=limit * 2  # over-fetch for hybrid rerank
    )
    
    # 3. Fetch full items from MongoDB
    item_ids = [r.id for r in semantic_results]
    items = await mongo_client.find(
        f"tenant_{tenant_id}",
        "catalog_items",
        {"item_id": {"$in": item_ids}, "status": "active"}
    )
    
    # 4. Rerank by score
    items_sorted = rerank_by_semantic_score(items, semantic_results)
    
    return CatalogSearchOutput(items=items_sorted[:limit])
```

---

## Capability Health and Fallbacks

Every capability has a health check. If a capability is degraded:

- `catalog.search` degraded → fall back to exact text match (no vectors)
- `payment.razorpay` degraded → offer manual UPI payment
- `media.transcribe` degraded → ask user to type instead: "Having trouble with the voice note — could you type that out?"
- `integration.ats.*` degraded → escalate to human

Capability health is tracked in Redis and surfaced in the dashboard.
