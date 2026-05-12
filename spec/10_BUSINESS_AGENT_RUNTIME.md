# 10 — Business Agent Runtime

> The per-tenant agent that operates a live business. One instance per business, derived entirely from the Business Blueprint.

---

## Architecture Overview

Each business gets a logical agent mesh — a Supervisor that routes to specialized sub-agents based on message intent:

```
Inbound Message
      │
      ▼
┌─────────────────────────────────────────────────────┐
│  CONTEXT LOADER                                     │
│  Load blueprint (cache) + conversation state        │
│  + principal mode (admin vs customer)               │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  SUPERVISOR                                         │
│  Classifies intent → routes to sub-agent            │
│  Merges response → formats for channel              │
└──┬────────┬────────┬────────┬────────┬──────────────┘
   │        │        │        │        │
   ▼        ▼        ▼        ▼        ▼
CATALOG  TRANSACT  SUPPORT  FOLLOW  ESCALATION
AGENT    AGENT     AGENT    UP      AGENT
                            AGENT
```

---

## The Supervisor

The Supervisor is the top-level router. It:
1. Reads the full incoming message + conversation context
2. Classifies the primary intent
3. Dispatches to the appropriate sub-agent
4. Receives the sub-agent's draft response
5. Post-processes (tone adaptation, language check, length check)
6. Formats for the outbound channel (text vs buttons vs list)
7. Publishes the outbound message

```python
async def supervisor(state: BusinessAgentState) -> BusinessAgentState:
    """Core routing logic"""
    
    # Cheap classification first
    intent = await llm.classify(
        model="haiku",
        task="intent_classification",
        text=state.last_message.content.text or state.last_message.content.transcription,
        options=[
            "product_inquiry",     # "do you have X?"
            "price_check",         # "how much is Y?"
            "availability_check",  # "is Z in stock?"
            "order_placement",     # "I want to buy X"
            "order_status",        # "where is my order?"
            "payment",             # "how do I pay?"
            "complaint",           # "I have a problem"
            "general_support",     # everything else
            "admin_command",       # only if principal is owner/operator
            "out_of_scope",        # something the business can't help with
        ]
    )
    
    # Route to sub-agent
    if intent in ["product_inquiry", "price_check", "availability_check", "product_recommendation"]:
        state = await catalog_agent(state)
    elif intent in ["order_placement", "payment", "order_status"]:
        state = await transaction_agent(state)
    elif intent in ["complaint", "general_support"]:
        state = await support_agent(state)
    elif intent == "admin_command" and state.principal_mode == "admin":
        state = await admin_agent(state)
    elif intent == "out_of_scope":
        state = await out_of_scope_handler(state)
    else:
        state = await support_agent(state)
    
    # Post-process response
    state = await post_process_response(state)
    
    return state

async def post_process_response(state: BusinessAgentState) -> BusinessAgentState:
    """Tone, language, length, format"""
    
    blueprint = state.blueprint
    
    # Ensure correct language (match user's detected language)
    # Ensure tone matches persona config
    # Enforce max_tokens_per_response from blueprint
    # Choose format (text vs buttons vs list) based on response type
    
    if needs_buttons(state.draft_response):
        state.outbound_message = format_as_buttons(state.draft_response)
    elif needs_list(state.draft_response):
        state.outbound_message = format_as_list(state.draft_response)
    else:
        state.outbound_message = format_as_text(state.draft_response)
    
    return state
```

---

## The Catalog Agent

Handles product/service discovery, search, recommendations, and catalog updates.

```python
async def catalog_agent(state: BusinessAgentState) -> BusinessAgentState:
    """
    Searches catalog, returns relevant items.
    Formats as WhatsApp list message when multiple results.
    Uses vehicle compatibility index for auto parts vertical.
    """
    
    # Extract search parameters from message
    search_params = await llm.extract(
        model="haiku",
        task="catalog_search_extraction",
        text=state.last_message_text,
        schema={
            "query": "str",
            "filters": {
                "price_max": "float | null",
                "brand": "str | null",
                "vehicle_make": "str | null",    # auto parts
                "vehicle_model": "str | null",   # auto parts
                "vehicle_year": "int | null",    # auto parts
                "location": "str | null",        # services
            },
            "quantity": "int | null",
            "urgency": "str | null"
        }
    )
    
    # Capability: catalog.search
    results = await capability_call(
        "catalog.search",
        tenant_id=state.tenant_id,
        query=search_params.query,
        filters=search_params.filters,
        limit=5
    )
    
    if not results:
        # No results — check if we can suggest alternatives or offer to notify
        state.draft_response = await llm.generate(
            model="sonnet",
            task="no_results_response",
            context={ "query": search_params.query, "blueprint": state.blueprint_context }
        )
        return state
    
    # Check if we should also recommend similar items
    if state.blueprint.capabilities.enabled contains "recommendations.similar_items":
        recommendations = await capability_call(
            "recommendations.similar_items",
            tenant_id=state.tenant_id,
            seed_items=[r.item_id for r in results[:2]],
            exclude_ids=[r.item_id for r in results]
        )
    
    # Format response
    if len(results) == 1:
        # Single result — rich text with price and stock
        state.draft_response = format_single_item(results[0], state.blueprint)
    else:
        # Multiple results — list message
        state.draft_response = format_item_list(results, state.blueprint)
    
    state.context["last_search_results"] = results
    return state
```

### Auto Parts Vehicle Compatibility

For the auto parts vertical, catalog search includes vehicle compatibility lookup:

```python
# When user says "brake pads for Swift Dzire 2018"
# catalog.search extracts: { vehicle_make: "Maruti", vehicle_model: "Swift Dzire", vehicle_year: 2018 }
# catalog-service queries: SELECT items WHERE compatible_vehicles @> [{make, model, year_from <= 2018, year_to >= 2018}]
```

### Item Display Formats

**Single item (text):**
```
*Bosch Front Brake Pads — Swift Dzire*
Price: ₹1,200 + GST
Stock: ✅ In stock
Brand: Bosch
Compatible: Swift Dzire 2015-2022 (Petrol)

Add to cart? [Add | See similar | Ask more]
```

**Multiple items (list):**
```
Found 3 options for "Swift Dzire brake pads":
[List: Bosch ₹1,200 | Brembo ₹1,900 | Roulunds ₹980]
```

---

## The Transaction Agent

Handles the commerce flow: order creation, payment, order status.

```python
async def transaction_agent(state: BusinessAgentState) -> BusinessAgentState:
    """
    Manages the order lifecycle.
    Integrates with Razorpay for payment.
    Enforces escalation thresholds.
    """
    
    # Determine transaction intent sub-type
    sub_intent = classify_transaction_intent(state)
    
    if sub_intent == "add_to_cart":
        # User selected an item from catalog results
        item = state.context["last_search_results"][state.selected_item_index]
        state = await add_to_cart(state, item)
        
    elif sub_intent == "checkout":
        # Ready to place order
        order_value = calculate_order_value(state.cart, state.blueprint)
        
        # Check escalation threshold
        escalation_triggers = state.blueprint.policies.escalation.triggers
        if should_escalate(order_value, escalation_triggers):
            state = await escalation_agent(state, reason="order_value_above_threshold")
            return state
        
        state = await collect_delivery_details(state)
        
    elif sub_intent == "payment":
        # Collect payment
        payment_method = determine_payment_method(state)
        
        if payment_method == "razorpay":
            payment_link = await capability_call(
                "payment.razorpay",
                order_id=state.current_order.id,
                amount_paise=state.current_order.total_paise,
                customer_name=state.principal.display_name,
                customer_phone=state.principal.phone_number
            )
            state.draft_response = f"Tap to pay ₹{format_inr(state.current_order.total_paise)}:\n{payment_link}"
            
        elif payment_method == "upi_manual":
            state.draft_response = f"""
Pay ₹{format_inr(state.current_order.total_paise)} via UPI:
UPI ID: {state.blueprint.integrations.payments.config.upi_id}
Order #{state.current_order.order_number}

Send screenshot after payment.
"""
        elif payment_method == "cod":
            state = await confirm_cod_order(state)
    
    elif sub_intent == "order_status":
        order = await order_service.get_latest_order(
            tenant_id=state.tenant_id,
            principal_id=state.principal_id
        )
        state.draft_response = format_order_status(order)
    
    return state
```

### Haggling / Negotiation Sub-Flow

```python
async def handle_haggling(state: BusinessAgentState, requested_discount_pct: float) -> BusinessAgentState:
    policy = state.blueprint.policies.haggling
    
    if policy.mode == "off":
        state.draft_response = "Our prices are fixed. Best price already quoted."
        return state
    
    if policy.mode == "bounded":
        max_auto = policy.max_discount_pct
        approval_threshold = policy.approval_required_above_pct
        
        if requested_discount_pct <= max_auto and requested_discount_pct <= (approval_threshold or max_auto):
            # Can grant automatically
            state.draft_response = f"For you — {requested_discount_pct}% off. Final price: ₹{discounted_price}. Deal?"
            if policy.agent_can_remember_policy:
                # Remember this customer gets this discount level
                await update_end_user_profile(state.principal_id, state.tenant_id, 
                                              {"negotiated_discount_pct": requested_discount_pct})
        else:
            # Need owner approval
            await notify_owner_haggling_request(state, requested_discount_pct)
            state.draft_response = "Let me check with the team on that discount. Give me a moment — I'll come back to you shortly."
    
    elif policy.mode == "escalate":
        state = await escalation_agent(state, reason="haggling_request")
    
    return state
```

---

## The Support Agent

Handles complaints, general questions, FAQ retrieval, and edge cases.

```python
async def support_agent(state: BusinessAgentState) -> BusinessAgentState:
    """
    RAG-based FAQ retrieval + LLM fallback.
    Escalates if insufficient confidence.
    """
    
    # Try FAQ retrieval first (Qdrant)
    faq_results = await qdrant.search(
        collection=f"{state.tenant_id}_faq",
        query_text=state.last_message_text,
        limit=3,
        score_threshold=0.75  # only use if highly relevant
    )
    
    if faq_results and faq_results[0].score > 0.85:
        # High confidence FAQ match
        state.draft_response = await llm.generate(
            model="haiku",  # cheap — just formatting the FAQ answer
            task="faq_response_formatter",
            faq_answer=faq_results[0].payload["answer"],
            user_message=state.last_message_text,
            blueprint_context=state.blueprint_context
        )
        state.confidence = faq_results[0].score
        return state
    
    # Medium confidence or no match — use Sonnet
    response = await llm.generate(
        model="sonnet",
        task="support_response",
        context={
            "user_message": state.last_message_text,
            "conversation_history": state.recent_messages,
            "blueprint": state.blueprint_context,
            "faq_hints": [r.payload for r in faq_results],
        }
    )
    
    # Assess confidence of generated response
    confidence = await llm.classify(
        model="haiku",
        task="response_confidence",
        response=response,
        options=["high", "medium", "low"]
    )
    
    if confidence == "low":
        # Escalate rather than send uncertain response
        state = await escalation_agent(state, reason="low_confidence_support")
        return state
    
    state.draft_response = response
    
    # Log unanswered or poorly-answered questions for Daemon
    if confidence in ["medium", "low"]:
        await log_potential_faq_gap(state, response, confidence)
    
    return state
```

---

## The Escalation Agent

Transfers the conversation to a human team member.

```python
async def escalation_agent(state: BusinessAgentState, reason: str) -> BusinessAgentState:
    """
    Creates escalation record.
    Notifies available team member.
    Sends appropriate message to customer.
    """
    
    policy = state.blueprint.policies.escalation
    
    # Find escalation target based on reason
    target_role = policy.triggers[reason].escalate_to if reason in policy.triggers else "operator"
    
    # Find available team member with that role
    team_members = await team_service.get_available(
        tenant_id=state.tenant_id,
        role=target_role
    )
    
    if not team_members:
        # No one available — queue and notify
        await notify_all_admins(state.tenant_id, reason)
    
    # Create escalation record
    escalation = await conversation_service.create_escalation(
        thread_id=state.thread_id,
        tenant_id=state.tenant_id,
        reason=reason,
        assigned_to=team_members[0].id if team_members else None
    )
    
    # Notify team member in their shared inbox (dashboard) + WhatsApp ping
    await notify_team_member(team_members[0] if team_members else None, escalation, state)
    
    # Tell customer
    state.draft_response = policy.escalation_message or \
        "Let me connect you with our team for this. They'll be with you shortly."
    
    state.conversation_status = "escalated"
    return state
```

---

## The Admin Agent (Owner/Team Mode)

When the Supervisor detects `principal_mode == "admin"`:

```python
async def admin_agent(state: BusinessAgentState) -> BusinessAgentState:
    """
    Handles admin commands from the business owner or team.
    Can mutate the Blueprint, query analytics, manage catalog.
    """
    
    # Extract the command
    command = await llm.extract(
        model="sonnet",
        task="admin_command_extraction",
        text=state.last_message_text,
        schema={
            "command_type": "price_update | catalog_add | catalog_remove | policy_change | analytics_query | broadcast | team_action",
            "target": "str",
            "value": "any",
            "confidence": "float"
        }
    )
    
    if command.confidence < 0.8:
        state.draft_response = f"I want to make sure I get this right. Can you be more specific about what you want to change?"
        return state
    
    if command.command_type == "price_update":
        # Confirm before mutating
        state.draft_response = f"Update {command.target} price to {command.value}? [Confirm / Cancel]"
        state.pending_confirmation = { "type": "blueprint_mutation", "patch": build_price_patch(command) }
        
    elif command.command_type == "catalog_add":
        await capability_call("catalog.add", tenant_id=state.tenant_id, item=command.value)
        await trigger_blueprint_mutation(state, "catalog item added")
        state.draft_response = f"Done. Added {command.target} to your catalog."
        
    elif command.command_type == "analytics_query":
        analytics = await get_analytics_summary(state.tenant_id, command.target)
        state.draft_response = format_analytics(analytics)
    
    # etc.
    return state
```

---

## Proactive Outbound (Follow-Up Agent)

The Follow-Up Agent sends messages proactively — triggered by Daemon proposals or event-based rules:

```python
# Triggered by: order status change, Daemon re-engagement proposal, stock alert

async def send_proactive_message(
    tenant_id: str,
    principal_id: str,
    trigger: ProactiveTrigger
) -> None:
    """
    Sends a proactive message to an EndUser.
    Checks 24-hour window — uses template if window expired.
    Checks marketing opt-in.
    Respects daily frequency caps.
    """
    
    # Check opt-in
    user_profile = await get_end_user_profile(tenant_id, principal_id)
    if not user_profile.marketing_opt_in and trigger.type == "marketing":
        return
    
    # Check frequency cap (don't spam)
    recent_outbound = await count_outbound_today(tenant_id, principal_id)
    if recent_outbound >= MAX_PROACTIVE_PER_DAY:
        return
    
    # Check 24-hour window
    window_open = await check_window(tenant_id, principal_id)
    
    if window_open:
        # Can send rich free-form message
        message = await generate_proactive_message(trigger, user_profile, blueprint)
        await send_message(tenant_id, principal_id, message)
    else:
        # Must use template
        template = await find_best_template(tenant_id, trigger.type)
        if template:
            await send_template(tenant_id, principal_id, template, trigger.data)
        else:
            # No suitable template — skip or queue for when window opens
            await queue_for_window_open(tenant_id, principal_id, trigger)
```

---

## State Management

Each conversation's state is a LangGraph graph with checkpointing:

```python
@dataclass
class BusinessAgentState:
    # Identity
    tenant_id: str
    thread_id: str
    principal_id: str
    principal_mode: Literal["customer", "admin"]
    
    # Blueprint (loaded at start, immutable for this conversation)
    blueprint: BusinessBlueprint
    blueprint_context: str  # rendered prompt string
    
    # Conversation
    current_node: str
    recent_messages: List[Message]  # last 10
    conversation_summary: str       # compressed summary of full history
    
    # Commerce
    cart: List[CartItem]
    current_order: Optional[Order]
    context: Dict[str, Any]         # scratch space for sub-agents
    
    # Output
    draft_response: Optional[str]
    outbound_message: Optional[CanonicalMessage]
    
    # Control flow
    pending_confirmation: Optional[Dict]
    conversation_status: str        # active | escalated | resolved
    confidence: float               # current response confidence
```

State is checkpointed to MongoDB after each node execution. On the next message in the same conversation, the state is restored.

---

## LLM Cost Map for Business Agent

| Task | Model | Per-Conversation Frequency | Cost Estimate |
|---|---|---|---|
| Intent classification | Haiku | Once per message | ₹0.01 |
| Catalog search extraction | Haiku | ~30% of messages | ₹0.01 |
| FAQ retrieval + formatting | Haiku | ~20% of messages | ₹0.02 |
| Support response | Sonnet | ~15% of messages | ₹0.15 |
| Transaction handling | Sonnet | ~25% of messages | ₹0.20 |
| Admin commands | Sonnet | ~5% of messages | ₹0.20 |
| Voice transcription | Azure STT | ~40% of messages | ₹0.25 avg |
| **Per-conversation total (avg 8 messages)** | | | **~₹0.80–1.50** |

With Anthropic prompt caching on the Blueprint context (system prompt ~5-10K tokens), cache hit rate of 80% reduces the Sonnet calls significantly. Target: **₹1.00 average per conversation.**
