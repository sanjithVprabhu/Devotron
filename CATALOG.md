# VEDA Catalog — Storage, UI, and Verticals

The catalog is what the agent draws on when a customer asks "what do you have / how much / when can I get it." It must flex from auto parts → services → bookings → digital content → anything sellable. This doc explains where items live, how to add them, and how the system stays vertical-agnostic.

## Where items live

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│  MongoDB Atlas (per-tenant)    │         │  Qdrant Cloud (per-tenant)     │
│                                │         │                                │
│  veda_tenant_<uuid>            │  sync   │  <uuid>_catalog                │
│   └─ catalog_items collection  │ ──────► │   (vector embeddings of        │
│      (source of truth)         │         │    search_text)                │
└────────────────────────────────┘         └────────────────────────────────┘
            ▲                                          ▲
            │                                          │
            │ writes                                   │ semantic search
            │                                          │
   ┌────────┴────────────────┐               ┌─────────┴────────────┐
   │  catalog-service        │               │  capabilities/       │
   │  POST /items/upsert     │               │  catalog/search.py   │
   │  (apps/catalog-service) │               │  (called by agent)   │
   └─────────────────────────┘               └──────────────────────┘
            ▲
            │
   ┌────────┴────────────────┐
   │  Dashboard              │
   │  /catalog page          │
   │  + Add item form        │
   │  (apps/dashboard)       │
   └─────────────────────────┘
```

**Mongo doc shape** (one document per item):
```jsonc
{
  "_id": "<mongo objectid>",
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "item_id": "sku-a1b2c3d4",                    // stable per-tenant ID
  "vertical": "auto_parts",                      // discriminator
  "status": "active",                            // active | inactive | draft | out_of_stock
  "data": {                                      // polymorphic, vertical-specific
    "name": "Bosch Front Brake Pad Set",
    "brand": "Bosch",
    "price_inr": 1200,
    "mrp_inr": 1450,
    "stock_qty": 14,
    "warranty_months": 6,
    "compatible_vehicles": [{"make": "Maruti", "model": "Swift Dzire", ...}]
  },
  "search_text": "bosch front brake pad set ...", // denormalized for embedding
  "created_at": "...",
  "updated_at": "..."
}
```

The `data` object is **deliberately schemaless**. Verticals add whichever fields make sense for them — the system never enforces a specific shape inside `data`.

## How verticals work

| Vertical (canonical name) | What it represents | Aliases recognized |
|---|---|---|
| `auto_parts` | Physical product (default for pilot) | `product`, `retail`, `fmcg`, `fashion`, `electronics` |
| `service` | Service with a duration | `salon`, `consulting`, `repair`, `fitness`, `tutoring`, `wellness` |
| `booking` | Time-slotted bookable | `appointment`, `reservation`, `clinic`, `restaurant` |
| `digital` | Digital content / access | `course`, `video`, `ebook`, `subscription`, `saas` |
| `jobs` | Job listing | `job` |
| *anything else* | Falls through to generic renderer | — |

The vertical string is just a tag. Dispatch happens in two places:

1. **Agent formatter** — [apps/orchestrator/orchestrator/business/subagents/catalog.py](apps/orchestrator/orchestrator/business/subagents/catalog.py) — decides how to render an item back to the customer (price + stock for products, price + duration for services, etc).
2. **Dashboard form** — [apps/dashboard/app/(app)/catalog/CatalogTable.tsx](apps/dashboard/app/(app)/catalog/CatalogTable.tsx) — decides which fields to show when creating/editing an item.

Both use the same vertical-aliases mapping, so they stay consistent.

## How to add items

### Option A — Dashboard UI (easiest)

1. Run the dashboard: `pnpm --filter dashboard dev`
2. Open http://localhost:3001/catalog (after logging in)
3. Click **Add item**
4. Pick a **Type** from the dropdown — fields update for the vertical:
   - *Product* → name, brand, price, MRP, stock
   - *Service* → name, description, price, duration, location
   - *Booking* → name, duration, capacity, price
   - *Digital* → name, price, length, modules, preview URL
   - *Job* → title, company, location, work mode, CTC range
5. Fill, click "Add product" / "Add service" / etc.
6. Item lands in Mongo + gets indexed into Qdrant — agent can find it within seconds

The table shows a **Type** badge per row + a vertical-appropriate **Details** column. You can filter by type from the dropdown above the table.

### Option B — Direct API (bulk / scripted)

```bash
curl -X POST http://localhost:8082/items/upsert \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_id": "11111111-1111-1111-1111-111111111111",
    "vertical": "salon",
    "data": {
      "name": "Premium Haircut",
      "description": "Cut, wash, style",
      "price_inr": 800,
      "duration_minutes": 45,
      "location": "Indiranagar"
    }
  }'
```

### Option C — Bulk import (Tally CSV)

Already wired for products via `catalog.bulk_import` capability. Reads CSV with `Item Name` / `Rate` / `Qty` columns, ingests as `auto_parts`. Generalizing this for services/digital is a 1-2 day extension.

## How the agent renders each vertical

When the agent calls `catalog.search` and gets back an item, the formatter at [catalog.py](apps/orchestrator/orchestrator/business/subagents/catalog.py) dispatches based on `item.vertical`:

| Vertical | Body shows | Action buttons |
|---|---|---|
| Product | Name, Price (+GST), MRP, Brand, Stock, Warranty | Add to cart / Similar / Ask more |
| Service | Name, Description, Price, Duration, Location, Availability | Book / See slots / Ask more |
| Booking | Name, Duration, Fee, Capacity | Reserve / Available times / Ask more |
| Digital | Name, Description, Price, Length, # modules, Preview URL | Buy / Preview / Ask more |
| Job | Title, Company, Location, Mode, CTC range, Experience | Apply / Full JD / Ask more |
| Unknown | Name, Description, Price (graceful fallback) | More info / Ask more |

### Verified behavior (unit-tested)

```
=== PRODUCT ===
*Bosch Pad*
Price: ₹1,200 + GST
MRP: ₹1,450
Brand: Bosch
Stock: ✅ In stock
Warranty: 6 months

=== SERVICE ===
*Premium Haircut*
Cut + wash + style
Price: ₹800
Duration: 45 min
Location: Indiranagar

=== BOOKING ===
*Dental Consultation*
Duration: 30 min
Fee: ₹500
Capacity: 1

=== DIGITAL ===
*React Crash Course*
Price: ₹2,999
Length: 8h
Modules: 12
Preview: https://example.com/preview

=== JOB ===
*Senior Backend Engineer*
Company: Stripe
Location: Bangalore
Mode: hybrid
CTC: ₹3,000,000 – ₹5,000,000
Experience: 4+ years
```

## Adding a new vertical

If "hot air balloon rides" isn't a service or a booking — it's its own thing — here's how to add it:

1. **Pick a name** — e.g. `experience`. Keep it short, lowercase, snake_case.
2. **Decide which kind it's most like.** Most new verticals fall into one of: product, service, booking, digital. Add the alias to `_PRODUCT_VERTICALS` / `_SERVICE_VERTICALS` / etc. in [catalog.py](apps/orchestrator/orchestrator/business/subagents/catalog.py:108-113) — that's it, no code per vertical needed.
3. **Need new fields?** Just put them in `data` when creating. Example: `{"vertical": "experience", "data": {"name": "Sunrise Balloon", "price_inr": 5500, "departure_window": "5:30 AM"}}`.
4. **Want a custom renderer?** Add a new `_render_<kind>` function and a new entry in `_RENDERERS`. ~30 lines.
5. **Want a custom dashboard form?** Add a new branch in the form switch in [CatalogTable.tsx](apps/dashboard/app/(app)/catalog/CatalogTable.tsx). ~15 lines.

The data layer never needs changes — Mongo + Qdrant happily accept any vertical/data shape.

## What's still vertical-locked (TODO)

| Layer | Status | Why it matters |
|---|---|---|
| Storage (Mongo) | ✅ agnostic | — |
| Search (Qdrant + Mongo text) | ✅ agnostic for query/embed | — |
| Search filters | ⚠️ auto-parts-leaning | Handlers in [capabilities/catalog/search.py](capabilities/catalog/search.py) accept generic filters but the LLM extraction prompt currently only mentions vehicle/brand/price filters. Will need extension when services/bookings start filtering by duration / location / date. |
| Agent formatter | ✅ vertical-aware | This is the file we just refactored |
| Dashboard add form | ✅ vertical-aware | Just refactored |
| Dashboard table | ✅ vertical-aware | Type column + Details column adapt per row |
| Dashboard edit form | ❌ doesn't exist | Today only Add + Delete; no edit-in-place |
| Bulk import | ⚠️ Tally CSV (auto-parts) | Need separate importers for services / digital |
| Booking slot capability | ❌ not built | `availability_summary` field is just text today; real slot picking not wired |
| Digital delivery | ❌ not built | `preview_url` shown but actual purchase → access flow not built |

The first two ❌ items are the next obvious investments once a non-auto-parts pilot starts. Until then, dashboard CRUD + agent rendering covers the storefront layer.

## Inspection / debugging

```bash
# Connect to Atlas and look at items directly
mongosh "$(grep -oP "MONGO_URL=['\"]?\K[^'\"]+" .env)"
> use veda_tenant_11111111-1111-1111-1111-111111111111
> db.catalog_items.find({}).limit(5).pretty()
> db.catalog_items.distinct("vertical")    // list all verticals you have

# Check Qdrant index
curl -H "api-key: $QDRANT_API_KEY" \
  "$QDRANT_URL/collections/11111111-1111-1111-1111-111111111111_catalog"
```
