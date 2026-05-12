# 13 — Integrations

> All external system integrations: WhatsApp/Meta, Razorpay, ATS APIs, website crawl, API sandbox, Shopify.

---

## Meta / WhatsApp Business API

### Setup Flow (per tenant)

1. Tenant provides: business name, phone number, GST/legal entity proof
2. VEDA creates Meta Business Manager via Graph API (or guides user through manual steps if API unavailable)
3. Registers phone number with WhatsApp Business API
4. Submits for display name approval (1-7 days, manual by Meta)
5. VEDA polls status daily, notifies tenant when approved
6. Sandbox number provided immediately while waiting

### API Surface Used
- `POST /v18.0/{waba-id}/phone_numbers` — register number
- `POST /v18.0/{phone-number-id}/messages` — send messages
- `GET /v18.0/{phone-number-id}` — check quality rating
- `POST /v18.0/{waba-id}/message_templates` — submit templates
- Webhooks: `messages`, `message_status`, `business_capability_update`

### Quality Rating Monitoring
```python
async def monitor_quality_rating(tenant_id: str) -> None:
    rating = await meta_api.get_phone_quality(tenant_id)
    current = await get_stored_rating(tenant_id)
    if rating != current:
        await update_stored_rating(tenant_id, rating)
        if rating == "red":
            await notify_owner(tenant_id, "WARNING: Your WhatsApp number quality is RED. Reduce broadcast volume.")
            await auto_pause_broadcasts(tenant_id)
```

---

## Razorpay

### Integration Points
- Payment Links (primary) — no redirect needed, UX stays in WhatsApp
- Webhooks for payment confirmation
- Refunds API
- Razorpay Subscriptions (for VEDA's own billing)

### Webhook Verification
```python
async def verify_razorpay_webhook(payload: bytes, signature: str) -> bool:
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

### Payment Link Flow
1. Agent calls `payment.razorpay.create_link`
2. Link sent to customer in WhatsApp message
3. Customer pays in browser (leaves WhatsApp, pays, returns)
4. Razorpay webhook fires to VEDA `POST /webhooks/razorpay`
5. VEDA confirms order, sends confirmation to customer

---

## Website Crawl Integration

For businesses with existing websites:

```python
async def crawl_and_extract_catalog(url: str, tenant_id: str) -> List[CatalogItem]:
    # Step 1: Fetch sitemap or crawl up to 50 pages
    pages = await crawl4ai.crawl(url, max_pages=50, respect_robots_txt=True)
    
    # Step 2: For each page, classify (product vs blog vs about)
    product_pages = []
    for page in pages:
        classification = await llm.classify(
            model="haiku",
            task="page_type_classification",
            content=page.text[:2000],
            options=["product", "category", "blog", "about", "contact", "other"]
        )
        if classification == "product":
            product_pages.append(page)
    
    # Step 3: Extract product data from product pages
    extracted_items = []
    for page in product_pages:
        # Try Schema.org/JSON-LD first (clean)
        schema_data = extract_schema_org(page.html)
        if schema_data:
            items = map_schema_org_to_catalog(schema_data)
        else:
            # Fall back to LLM extraction
            items = await llm.extract(
                model="sonnet",
                task="product_extraction",
                html=page.html,
                schema=CatalogItemSchema
            )
        extracted_items.extend(items)
    
    # Step 4: Show preview to owner for confirmation
    return extracted_items  # owner confirms before final import
```

---

## API Sandbox

For businesses with existing APIs:

```python
async def analyze_api_endpoint(
    tenant_id: str,
    endpoint_url: str,
    auth_header: str,
    method: str = "GET"
) -> ApiEndpointAnalysis:
    # Call the endpoint
    response = await http_client.request(method, endpoint_url, headers={"Authorization": auth_header})
    
    # Sample a few responses if paginated
    sample_data = response.json()
    
    # LLM analyzes the response schema
    analysis = await llm.analyze(
        model="sonnet",
        task="api_response_analysis",
        response_sample=json.dumps(sample_data)[:3000],
        instruction="""
        Analyze this API response. Determine:
        1. What type of data does it return? (products, jobs, services, orders, etc.)
        2. What are the key fields and their meaning?
        3. How would this map to a catalog of items a customer might browse?
        4. Confidence in your assessment (0-1).
        """
    )
    
    # Show analysis to owner for confirmation
    return ApiEndpointAnalysis(
        detected_purpose=analysis.data_type,
        field_mapping=analysis.fields,
        confidence=analysis.confidence,
        sample_items=map_to_catalog_items(sample_data, analysis.field_mapping)[:5]
    )
```

---

## Shopify Integration

```python
async def sync_shopify_catalog(tenant_id: str, shop_url: str, access_token: str) -> SyncResult:
    shopify = ShopifyAPI(shop_url, access_token)
    
    products = await shopify.get_all_products()  # handles pagination
    
    catalog_items = [map_shopify_product(p) for p in products]
    
    await catalog_service.bulk_upsert(tenant_id, catalog_items)
    
    # Register webhook for future updates
    await shopify.register_webhook("products/update", f"https://api.veda.in/webhooks/shopify/{tenant_id}")
    
    return SyncResult(imported=len(catalog_items), errors=[])
```

---

## LLM Router (Multi-Provider)

The LLM Router is the central intelligence dispatcher:

```python
# llm_router/router.py

TASK_MODEL_MAP = {
    "language_detection":           {"model": "claude-haiku-4-5-20251001", "provider": "anthropic"},
    "tone_inference":               {"model": "claude-haiku-4-5-20251001", "provider": "anthropic"},
    "intent_classification":        {"model": "claude-haiku-4-5-20251001", "provider": "anthropic"},
    "catalog_search_extraction":    {"model": "claude-haiku-4-5-20251001", "provider": "anthropic"},
    "faq_response_formatter":       {"model": "claude-haiku-4-5-20251001", "provider": "anthropic"},
    "support_response":             {"model": "claude-sonnet-4-6",          "provider": "anthropic"},
    "transaction_handling":         {"model": "claude-sonnet-4-6",          "provider": "anthropic"},
    "admin_commands":               {"model": "claude-sonnet-4-6",          "provider": "anthropic"},
    "intake_question_generation":   {"model": "claude-sonnet-4-6",          "provider": "anthropic"},
    "market_analysis":              {"model": "claude-sonnet-4-6",          "provider": "anthropic"},
    "hindi_generation":             {"model": "claude-sonnet-4-6",          "provider": "anthropic"},
    "indic_deep_generation":        {"model": "sarvam-v1",                  "provider": "sarvam"},   # optional
    "voice_transcription":          {"model": "whisper-1",                  "provider": "azure_openai"},
    "image_analysis":               {"model": "claude-sonnet-4-6",          "provider": "anthropic"},
    "fallback_complex":             {"model": "gpt-4o",                     "provider": "azure_openai"},
    "fallback_simple":              {"model": "gpt-4o-mini",                "provider": "azure_openai"},
}

async def route(task: str, tenant: Tenant, **kwargs) -> LLMResponse:
    config = get_model_config(task, tenant)
    
    # Check budget
    budget = await cost_tracker.get_remaining_budget(tenant.id)
    if budget < CRITICAL_THRESHOLD:
        config = TASK_MODEL_MAP["fallback_simple"]
    
    # Check provider health
    if not await health_registry.is_healthy(config["provider"]):
        config = get_fallback(config)
    
    # Call with cost tracking
    response = await call_provider(config, **kwargs)
    await cost_tracker.record(tenant.id, config, response.usage)
    
    return response
```
