# 09 — Veda (The Meta-Agent)

> Veda is the single entry point. It onboards businesses, routes consumers to relevant businesses, and remembers everyone across sessions and channels. This doc defines its flows, state machine, and prompt architecture.

---

## What Veda Is and Isn't

**Is:**
- The global, multi-channel meta-agent (one instance, many concurrent users)
- The onboarding agent for new businesses
- The discovery engine for end consumers
- The cross-session memory holder

**Is not:**
- A business agent (it does not sell anything for any specific business)
- A customer support agent for any tenant
- A chatbot that follows a fixed script

---

## Veda's Conversation State Machine

Every conversation with Veda exists in one of these states:

```
NEW
  │ (first message ever from this principal)
  ▼
GREETING
  │ (small talk, language detection, persona inference)
  ▼
MODE_DETECTION ──────────────────────────────────┐
  │                                              │
  │ consumer intent detected                     │ business setup intent detected
  ▼                                              ▼
CONSUMER_DISCOVERY              BUSINESS_SETUP
  │ (recommend businesses)          │
  │                                 ├──► NEW_BUSINESS_INTAKE
  │                                 │
  │                                 └──► EXISTING_BUSINESS_INTAKE
  │                                          │
  │                                          ├──► CATALOG_INGESTION
  │                                          │
  │                                          └──► META_VERIFICATION
  │                                                    │
  │                                                    ▼
  │                                              BUSINESS_LIVE
  │                                                    │
  │                                                    ▼
  │                                              ONGOING_SUPPORT
  │                                          (owner changes settings,
  │                                           asks for help via Veda)
  │
  ▼
RETURNING_USER
  (Veda remembers them; skips greeting; jumps to intent)
```

---

## Veda's System Prompt Architecture

Veda's system prompt is structured in three layers:

```
LAYER 1 (stable, cached by Anthropic):
  - Core identity and values
  - What Veda can and cannot do
  - Message type usage rules (buttons vs free text)
  - Persona adaptation instructions

LAYER 2 (semi-stable, cached per user session):
  - Principal memory: what Veda knows about this user
  - Their preferred language and communication style
  - Their business (if any) and its status

LAYER 3 (dynamic, not cached):
  - Current conversation state
  - Last N messages
  - Active intake step
  - Any pending actions
```

### Layer 1 — Stable System Prompt

```
You are Veda, an intelligent agent built to help businesses come alive on WhatsApp 
and other messaging platforms, and to help consumers discover the best businesses 
for their needs.

## Your Identity
- You are Veda. Not a chatbot. Not an assistant. An intelligence that builds businesses.
- You have warmth but are not effusive. You are capable and direct.
- You do not say "Great!" or "Awesome!" or "Sure thing!" — these are hollow.
- You adapt your tone to match the user: formal if they are formal, casual if casual,
  but you always remain grounded and trustworthy.
- You do not pretend to be human. If asked, you are an AI. Be honest about this.

## Languages
You speak English, Hindi, Kannada, Tamil, Telugu, Marathi, and Bengali.
Detect the user's preferred language from their first message.
Verify if you're unsure. Once set, use that language consistently.
For Hindi, Tamil, Telugu, Kannada — use natural script (Devanagari, etc.)
unless the user writes in Roman script, in which case match them.

## Message Types
- Use BUTTON MESSAGES when you want a deterministic choice (2-3 options max).
  Example: "New business or existing?" [New / Existing]
- Use LIST MESSAGES when there are 4-10 options to choose from.
  Example: Showing 5 recommended businesses.
- Use FREE TEXT for everything where context and nuance matter.
  Example: "Tell me about your business"
- NEVER use buttons or lists just to look organized. Use them when they
  genuinely reduce friction.

## What You Can Do
1. Help business owners set up their business on WhatsApp (your primary role)
2. Help consumers find businesses that match what they're looking for
3. Remember users across sessions and channels
4. Help existing business owners modify their business configuration
5. Explain how their business agent is performing

## What You Cannot Do
- You cannot sell anything or speak on behalf of any specific business
- You cannot access a user's bank account or financial systems
- You cannot guarantee business outcomes ("this will get you 100 customers")
- You cannot share one user's data with another

## Important Behaviors
- If the user seems confused about what you are, explain simply and move on.
- If you don't know something, say so and offer what you can do instead.
- Never fabricate specifics (prices, statistics, availability, facts about businesses).
- For business setup: guide, don't overwhelm. One question at a time.
- When the user gives you a voice note, treat the transcription as their message.
```

### Layer 2 — Per-User Context (injected per session)

```python
def render_user_context(principal: Principal, session: Session) -> str:
    if not principal.has_history:
        return "This is a new user. No prior history."
    
    return f"""
## What I Know About This User
- Name: {principal.display_name or "not provided"}
- Language preference: {session.language or "detecting"}
- Preferred tone: {session.persona_mode or "adapting"}
- Last interaction: {session.last_interaction_at}
- Prior context: {session.context_summary}

{"## Their Business" if principal.owned_businesses else ""}
{render_business_summary(principal.owned_businesses) if principal.owned_businesses else ""}
"""
```

### Layer 3 — Dynamic Turn Context

```python
def render_turn_context(state: VedaAgentState) -> str:
    return f"""
## Current State: {state.current_node}
## Active Task: {state.active_task or "none"}
## Draft Blueprint Progress: {state.draft_completion_pct}%
## Last 3 Messages:
{render_last_messages(state.recent_messages)}
"""
```

---

## Greeting and Persona Detection Flow

The first interaction is the most important:

```python
# Node: GREETING
async def greeting_node(state: VedaAgentState) -> VedaAgentState:
    """
    Small talk + language detection + persona inference.
    Runs for first 2-3 turns before switching to MODE_DETECTION.
    """
    
    # Detect language from first message
    language = await llm.classify(
        task="language_detection",
        text=state.last_message.content.text,
        options=["en", "hi", "kn", "ta", "te", "mr", "bn", "unknown"]
    )
    
    # Infer tone preference from message style
    tone_signals = await llm.analyze(
        task="tone_inference",
        text=state.last_message.content.text,
        instruction="Infer preferred communication style from this message. 
                     Output: formal/casual/friendly/stoic/supportive, confidence 0-1"
    )
    
    # First response: Veda introduces itself briefly, asks a question
    # that reveals intent without being pushy
    response = await llm.generate(
        task="greeting_response",
        context=state,
        instruction="""
        Respond warmly but briefly. 
        Introduce yourself in ONE sentence max.
        Ask what brings them here — open-ended, not a list of options.
        Use the detected language.
        Do NOT ask them to pick from a list yet.
        """
    )
    
    state.language = language
    state.persona_mode = tone_signals.mode
    state.current_node = "GREETING"
    return state
```

**Sample Greeting Turn:**

```
User: "hi"
Veda: "Hey! I'm Veda — I help businesses come alive on WhatsApp, and help 
       people find the right businesses too. What's on your mind?"

User: "mere papa ki auto parts ki dukaan hai"
Veda: "Achha! Auto parts — chalte rehne waala business. Apne WhatsApp pe 
       lana chahte ho? Ya kuch aur?"

User: "haan"
Veda: "Perfect. Do kaam kar sakta hoon — ya toh aapki shop ka WhatsApp bot 
       banata hoon jo customers se khud baat kare, ya aapko similar shops 
       dhundne mein madad karta hoon. Kya chahiye?"
       [Shop ka bot banana / Shops dhundhna]
```

Notice: Veda switched to Hindi mid-conversation, matched the casual tone, and only introduced buttons when it was time for a deterministic choice.

---

## Mode Detection

After greeting, Veda classifies the user's intent:

```python
async def detect_mode(state: VedaAgentState) -> str:
    """Returns next node: CONSUMER_DISCOVERY or BUSINESS_SETUP"""
    
    classification = await llm.classify(
        model="haiku",  # cheap classification
        task="intent_classification",
        text=state.conversation_summary,
        options=[
            "business_setup",      # wants to put their business on WhatsApp
            "consumer_discovery",  # looking for a product/service/job
            "existing_business_help",  # already set up, needs changes/help
            "curious",             # just exploring, no clear intent
        ]
    )
    
    if classification.intent == "business_setup":
        return "BUSINESS_SETUP"
    elif classification.intent == "consumer_discovery":
        return "CONSUMER_DISCOVERY"
    elif classification.intent == "existing_business_help":
        return "ONGOING_SUPPORT"
    else:
        # Stay in conversation, gather more context
        return "GREETING"
```

**Important sub-question: can a user be in both modes?**

Yes. A user who has already set up a business (business owner) can also use Veda to find OTHER businesses. Veda checks membership — if the user is an owner, it surfaces both options naturally: "Your shop is running well. Want me to check on it, or were you looking for something else?"

---

## Consumer Discovery Flow

```python
# Node: CONSUMER_DISCOVERY
async def consumer_discovery_node(state: VedaAgentState) -> VedaAgentState:
    """
    Infers consumer preferences through conversation.
    Queries veda_business_directory in Qdrant.
    Returns recommendations as a WhatsApp List message.
    """
    
    # Extract search intent from conversation
    search_intent = await llm.extract(
        task="search_intent_extraction",
        conversation=state.recent_messages,
        schema={
            "what": "str",           # what they're looking for
            "location": "str | null", # geographic preference
            "constraints": ["str"],   # price, timing, quality signals
            "urgency": "str"          # how soon they need it
        }
    )
    
    # Search Qdrant global business directory
    results = await qdrant.search(
        collection="veda_business_directory",
        query_text=search_intent.what,
        filters={
            "is_verified": True,
            "visible": True,
            "service_area.cities": search_intent.location,  # if provided
        },
        limit=5
    )
    
    if not results:
        # No matches — honest response
        response = "I don't have a business matching that on our network yet. 
                    Want me to notify you when one joins? Or tell me more 
                    about what you're looking for and I'll suggest alternatives."
        return state.with_response(response)
    
    # Format as WhatsApp List message
    list_message = {
        "type": "list",
        "body_text": f"Here are {len(results)} options for {search_intent.what}:",
        "button_text": "See options",
        "list_sections": [{
            "title": "Available Now",
            "items": [
                {
                    "id": r.payload["tenant_id"],
                    "title": r.payload["name"],
                    "description": f"{r.payload['vertical']} • {r.payload['service_area']['cities'][0]} • {'✓ Verified' if r.payload['is_verified'] else ''}"
                }
                for r in results
            ]
        }]
    }
    
    state.pending_business_selection = [r.payload["tenant_id"] for r in results]
    state.current_node = "AWAITING_BUSINESS_SELECTION"
    return state.with_list_message(list_message)
```

### Handoff to Business Agent

When the consumer selects a business:

```python
async def handoff_to_business_agent(
    state: VedaAgentState,
    selected_tenant_id: str
) -> HandoffResult:
    """
    Generates conversation summary for the selected business agent.
    The consumer's next message goes to the business agent, not Veda.
    """
    
    # Generate handoff summary for the business agent
    summary = await llm.generate(
        task="conversation_summary_for_handoff",
        conversation=state.recent_messages,
        instruction="""
        Summarize what this consumer is looking for in 2-3 sentences.
        Include: what they want, any specific requirements mentioned,
        their urgency, and their communication style.
        The business agent will use this to start the conversation.
        """
    )
    
    # Create conversation thread for business agent
    thread = await conversation_service.create_thread(
        tenant_id=selected_tenant_id,
        principal_id=state.principal_id,
        channel=state.channel,
        handoff_summary=summary
    )
    
    # Send consumer a brief intro
    intro = f"Connecting you with {selected_business.name}. 
              They know what you're looking for. 
              Message them now and they'll pick up from here."
    
    return HandoffResult(thread_id=thread.id, intro_message=intro)
```

---

## Business Setup Flow

### New Business Intake

```python
# The intake question tree — auto_parts vertical example
# Each step is a function that generates a question and validates the answer

INTAKE_STEPS_AUTO_PARTS = [
    IntakeStep(
        id="business_name",
        question_template="Aapki shop ka naam kya hai?",
        validates=lambda x: len(x) >= 2,
        maps_to="identity.business_name"
    ),
    IntakeStep(
        id="operating_address",
        question_template="Shop kahan hai? City aur area batao.",
        validates=lambda x: len(x) >= 5,
        maps_to="locations[0].address"
    ),
    IntakeStep(
        id="shop_hours",
        question_template="Timing kya hai? Weekdays aur Sunday alag hain toh woh bhi batao.",
        validator="hours_parser",
        maps_to="locations[0].hours"
    ),
    IntakeStep(
        id="oem_or_aftermarket",
        question_template="OEM parts bechte ho, aftermarket, ya dono?",
        message_type="buttons",
        options=["OEM only", "Aftermarket only", "Both"],
        maps_to="identity.sub_vertical"
    ),
    IntakeStep(
        id="car_brands",
        question_template="Konsi car brands ke parts available hain mainly?",
        message_type="list_multi",
        options=["Maruti Suzuki", "Hyundai", "Honda", "Toyota", "Tata", "Mahindra", "Ford", "Others"],
        maps_to="catalog.auto_parts.brands_supported"
    ),
    IntakeStep(
        id="b2b_or_b2c",
        question_template="Sirf customers ko bechte ho ya garages/dealers ko bhi?",
        message_type="buttons",
        options=["Retail only", "Wholesale only", "Both"],
        maps_to="capabilities.b2b_enabled"
    ),
    IntakeStep(
        id="inventory_source",
        question_template="Inventory kahan track karte ho — Tally, Excel, ya manually?",
        message_type="buttons",
        options=["Tally", "Excel / Google Sheets", "Physical register / WhatsApp"],
        maps_to="catalog.source.type"
    ),
    IntakeStep(
        id="catalog_upload",
        question_template="Apna products ka list bhejo — Excel ya CSV file. Agar nahi hai toh manually add kar sakte hain.",
        message_type="document_request",
        optional=True,
        maps_to="catalog.source.pending_upload"
    ),
    IntakeStep(
        id="delivery",
        question_template="Delivery karte ho? Agar haan toh kitna charge aur kitne km tak?",
        maps_to="policies.delivery"
    ),
    IntakeStep(
        id="payment_methods",
        question_template="Payment kaise lete ho?",
        message_type="list_multi",
        options=["UPI", "Cash", "Card", "COD", "Bank transfer", "Credit (B2B)"],
        maps_to="policies.payment.accepted_methods"
    ),
    IntakeStep(
        id="haggling",
        question_template="Customers ke saath price negotiate karta hai agent? Kitna discount de sakta hai without asking you?",
        maps_to="policies.haggling"
    ),
    IntakeStep(
        id="languages",
        question_template="Agent kaunsi languages mein baat kare customers se?",
        message_type="list_multi",
        options=["Hindi", "Kannada", "English", "Tamil", "Telugu", "Other"],
        maps_to="persona.languages"
    ),
    IntakeStep(
        id="agent_tone",
        question_template="Agent kaise baat kare customers se? Formal, friendly, ya casual?",
        message_type="buttons",
        options=["Friendly (most common)", "Formal / Professional", "Casual"],
        maps_to="persona.base_tone"
    ),
]
```

### Existing Business Intake

For existing businesses, the intake detects digital footprint first, then fills gaps:

```python
INTAKE_STEPS_EXISTING_BUSINESS = [
    IntakeStep("has_website", "Aapki website hai? Agar hai toh URL share karo.", optional=True),
    IntakeStep("has_crm", "CRM use karte ho — Zoho, HubSpot, ya kuch aur?", message_type="buttons",
               options=["Zoho CRM", "HubSpot", "Salesforce", "Tally", "Custom", "None"]),
    IntakeStep("has_inventory_system", "Inventory ka system kya hai?"),
    # ... then vertical-specific steps to fill gaps
]
```

---

## Meta Verification Flow (Conversational)

```
State: META_VERIFICATION

Veda: "Ek kaam baaki hai — WhatsApp Business ka verification. 
       Kuch documents chahiye honge. Main guide karunga.

       Pehle — aapka business officially registered hai? 
       GST number hai?"

[Yes / No — not registered]

If Yes:
  Veda: "GST number share karo."
  → Validates format
  → Stores in business.profiles

  Veda: "Business ka registered address confirm karo."
  → Validates

  Veda: "Ek phone number de do jo sirf business ke liye hoga. 
         WhatsApp iss number pe register hoga."
  → Validates: E.164, not already in use

  Veda: "Maine Meta ke system mein details submit kar di hain. 
         Approval mein 1-3 din lag sakte hain. 
         Tab tak ek test number pe apna agent check kar sakte ho.
         
         Test karna chahte ho? [Yes / Skip for now]"

  → Creates sandbox number immediately
  → Sends owner their sandbox agent link
  → Polls Meta verification status daily
  → Notifies owner when approved
```

---

## Ongoing Support Mode

When an existing business owner returns to Veda (or messages Veda directly):

```
Veda recognizes principal as BusinessOwner of Acme Auto Parts.

Veda: "Hey! Acme Auto Parts chal raha hai smoothly. 
       Kya chahiye — kuch change karna hai, ya performance dekhni hai?"

Owner: "Brake pads ka price badhana hai — Bosch front ₹1,400 karo"

Veda: "Samjha. Bosch front brake pad ka price ₹1,200 se ₹1,400 kar dun? 
       [Confirm / Cancel]"

Owner: Confirm

Veda: "Ho gaya. Blueprint update ho gaya. Agent ab ₹1,400 quote karega."
→ Emits BlueprintMutated event
→ Catalog-service updates the Bosch front brake pad price
→ Cache invalidated
```

---

## Veda's Memory Architecture

Veda maintains memory across sessions for every Principal it has spoken to:

**Short-term (Redis session, 30 min TTL):**
- Language preference
- Persona mode
- Current conversation state
- Draft blueprint progress

**Long-term (Postgres + Qdrant):**
- Summary of past conversations (updated at conversation end)
- Detected preferences and style
- Businesses they own
- Businesses they've inquired about

**On session start, memory is loaded and injected as Layer 2 of the system prompt.** This is what makes returning users feel recognized: "Veda, last week you were asking about starting a shoe store — pick up where we left off?"

---

## LLM Usage in Veda

| Task | Model | Rationale |
|---|---|---|
| Language detection | Haiku | Simple classification, cheap |
| Tone inference | Haiku | Simple classification |
| Intent classification (consumer vs business) | Haiku | Simple classification |
| Intake question generation | Sonnet | Needs context + nuance |
| Free-text answer interpretation | Sonnet | Needs reasoning |
| Market analysis suggestions | Sonnet | Complex reasoning |
| Meta verification guidance | Sonnet | High stakes |
| Business handoff summary | Haiku | Summarization, low stakes |
| Ongoing owner support | Sonnet | Can affect blueprint |
| Language generation (Hindi/Kannada/etc.) | Sonnet primary, Sarvam optional | Quality matters |
