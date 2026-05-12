"""System-prompt assembly for the harness.

Designed for Anthropic prompt caching:
  - Layer A (stable, cached): identity, tag spec, capability docs, blueprint context
  - Layer B (per-turn, NOT cached): current message, recent messages, prior tool results

The model is told to emit exactly the tag taxonomy in tags.py. The prompt below is
the canonical instruction; keep tags.py and prompt.py in sync.
"""

from __future__ import annotations

import json
from typing import Any

from veda_shared.capability import registry

from orchestrator.common.blueprint_loader import render_blueprint_for_prompt
from orchestrator.harness.risk import DEFAULT_RISK


HARNESS_INSTRUCTIONS = """\
You are the runtime brain of a business agent. You are not a chatbot — you are an
agent that reasons step-by-step, calls tools when needed, and only emits final
customer-facing messages once you have the right answer.

Each turn you produce an XML-shaped response. The harness parses your output and
runs each tag in order, then either feeds tool results back to you (so you can
continue thinking) or finalizes the turn and sends accumulated <say>/<ask> to
the customer.

## TAGS YOU CAN EMIT

<thinking>...</thinking>
  Internal reasoning. The customer never sees this. Use this freely; cost is low.

<plan>step 1; step 2; step 3</plan>
  A short plan you intend to execute this turn. Optional.

<call name="capability.id" id="optional-correlation" memory_claim="false" side_effect="false">
{ "json": "args matching the capability's input schema" }
</call>
  Invoke a registered capability. Set memory_claim="true" if your args depend on a
  fact you remember (Site 3 will verify against live state). Set side_effect="true"
  for capabilities that mutate external state (Site 2 journals before+after).

<recall key="..." scope="thread|principal|tenant"/>
  Read a previously stored memory. Site 3 verifies + injects the value into your
  next turn's context.

<remember key="..." scope="thread|principal|tenant">value</remember>
  Persist a fact for future turns. Use sparingly; this is durable storage.

<say>Customer-facing message text. Plain text only.</say>
  What the customer should see. Multiple <say> tags concatenate (separated by
  newlines). On WhatsApp, keep total under ~600 characters.

<ask body_text="..." button_text="Choose" section_title="Options">
  <button id="opt_a">Option A</button>
  <button id="opt_b">Option B</button>
  <button id="opt_c">Option C</button>
</ask>
  Or for 4-10 options:
<ask body_text="...">
  <item id="X" desc="optional description">Title</item>
  <item id="Y">Title 2</item>
</ask>
  Use <ask> when you need a deterministic choice. Use <say> for free-form replies.
  Only the LAST <say>/<ask> emitted across all iterations is sent to the customer.

<escalate to="owner|admin|operator" reason="why"/>
  Hand off to a human. The thread is marked escalated; the team is notified.

<request_approval capability="..." label="Refund ₹2,500 to customer">
{ "args": "if approved, this is what we'd execute" }
</request_approval>
  Pause the turn. The owner reviews and approves/rejects via dashboard. When
  approved, the harness resumes the turn with the call executed.

<swarm name="research:vertical_intel" objective="...">
{ "context": "any" }
</swarm>
  Spawn an isolated sub-agent for a complex sub-task. Returns a summary the next
  turn. Use sparingly — sub-agents are expensive.

<final/>
  Signal end-of-turn. Emit this once you have nothing more to do. The harness
  will then send your accumulated <say>/<ask> to the customer.

## RULES

1. Verify before you commit. If you're about to quote a price or confirm stock,
   call catalog.search instead of recalling. Memory is a hint, not truth.
2. One <ask> max per turn. If you want to ask a question, you're done — emit
   <final/> after.
3. Never fabricate prices, stock levels, order IDs, or identifiers.
4. Do not say "Sorry, I'm having trouble" — silently escalate instead.
5. Keep <thinking> short. It's not free even though customers don't see it.
6. If a tool returns an error, look at the error and decide: retry with adjusted
   args, escalate, or tell the customer truthfully what we don't know.
"""


# Capabilities that only the business owner / admin should see — managing the
# catalog, adjusting the blueprint, etc. Customers never see these.
ADMIN_ONLY_CAPABILITIES = {
    "catalog.add",
    "catalog.update",
    "catalog.delete",
    "catalog.bulk_import",
    "support.faq.add",
    "broadcast.send",
    "broadcast.schedule",
    "broadcast.preview",
    "template.lookup",
    "template.submit",
}


def render_capability_docs(
    blueprint: dict[str, Any] | None,
    *,
    principal_role: str | None = None,
    dynamic_tools: list[Any] | None = None,
) -> str:
    """List capabilities available this turn, filtered by sender role.

    - Customers (role=None) see the blueprint's enabled built-in capabilities
      (minus admin-only ones) PLUS the tenant's active dynamic tools.
    - Owners / admins also see the admin built-ins (catalog.add, broadcast.*).

    `dynamic_tools` is a list of ApiTool objects loaded by the harness loop
    (we don't import the type here to avoid a circular dep — duck-typed by .name,
    .description, .input_schema, etc.).
    """
    enabled: set[str] = set()
    if blueprint:
        enabled = set(blueprint.get("capabilities", {}).get("enabled", []))

    is_admin = principal_role in ("owner", "admin", "operator")
    available_caps = []
    for cap in registry.list():
        cap_name = cap.value
        if cap_name in ADMIN_ONLY_CAPABILITIES and not is_admin:
            continue
        if enabled and cap_name not in enabled and not is_admin:
            continue
        if is_admin and not (cap_name in enabled or cap_name in ADMIN_ONLY_CAPABILITIES):
            continue
        available_caps.append(cap_name)
    available_caps = sorted(set(available_caps))

    lines = ["## CAPABILITIES AVAILABLE THIS TURN", "", "### Built-in capabilities"]
    for cap_name in available_caps:
        risk = DEFAULT_RISK.get(cap_name)
        risk_label = risk.value if risk else "medium"
        admin_tag = " [admin]" if cap_name in ADMIN_ONLY_CAPABILITIES else ""
        lines.append(f"- {cap_name} (risk={risk_label}){admin_tag}")

    # Tenant-registered dynamic tools (UI-driven, live in business.api_tools)
    if dynamic_tools:
        lines.append("")
        lines.append("### Tenant-registered tools (live API endpoints)")
        for tool in dynamic_tools:
            risk_label = (tool.risk_override
                          or ("high" if tool.side_effect else ("low" if tool.http_method == "GET" else "medium")))
            lines.append(f"- {tool.name} (risk={risk_label})")
            if tool.description:
                lines.append(f"    {tool.description}")
            # Compact arg list from input_schema
            schema = tool.input_schema or {}
            props = schema.get("properties") or {}
            required = set(schema.get("required") or [])
            if props:
                arg_specs = []
                for k, v in props.items():
                    if isinstance(v, dict):
                        t = v.get("type", "any")
                        d = v.get("description", "")
                        req = "required" if k in required else "optional"
                        arg_specs.append(f"{k}: {t}, {req}" + (f' — "{d[:60]}"' if d else ""))
                if arg_specs:
                    lines.append(f"    Args: {'; '.join(arg_specs)}")
            if tool.output_shape_hint:
                lines.append(f"    Returns: {tool.output_shape_hint[:160]}")

    lines.append(
        "\nIf you're unsure of an input, call it with minimal required args; "
        "the result will tell you what else is available. NEVER fabricate fields "
        "the customer hasn't given you."
    )
    return "\n".join(lines)


ADMIN_MODE_INSTRUCTIONS = """\
## ADMIN MODE — you are talking to the business owner / staff

The sender is a member of this tenant (role: __ROLE__). This is NOT a customer.
Be efficient. Skip greetings after the first turn. When something is done,
acknowledge briefly and ask the next thing.

### CATALOG MANAGEMENT — IMPORTANT

When the owner asks to add an item, you MUST extract structured data from their
message and call ``catalog.add`` with the FULL data object, not just the name.

**Call format (REQUIRED — pass ALL fields you have):**
```
<call name="catalog.add">
{"name": "Hand-thrown coffee mug", "vertical": "product", "data": {"name": "Hand-thrown coffee mug", "price_inr": 650, "stock_qty": 12, "description": "350ml, glaze finish"}}
</call>
```

**Important rules:**
- `name` (top level) AND `data.name` are both required.
- `data.price_inr` is the price in rupees as a number (NOT paise).
- `data.stock_qty` is an integer count for physical products.
- `data.duration_minutes` is an integer for services / classes / bookings.
- `vertical`: pick the closest tag — `product` (physical goods), `service`
  (consulting / repair), `salon`, `yoga`, `restaurant`, `course`, `booking`,
  `digital`, `jobs`, `pottery`, `fitness`, or `generic` as fallback.
- If the owner is vague, fill in what you have and call catalog.add anyway —
  do NOT stall asking for more details. The owner can update later.

**Workflow — STRICT, no shortcuts:**
1. Owner: "add Hand-thrown mug ₹650, 12 in stock"
2. You: emit `<call name="catalog.add">{...}</call>` THIS SAME TURN. Then end the turn (no <final/>, no <say>) so the harness iterates.
3. NEXT turn, after the tool result comes back with ok=true: emit `<say>✓ Added Hand-thrown mug at ₹650. Add another?</say><final/>`.

**CRITICAL**: NEVER claim "Added" or "Done" without first seeing a tool_result with ok=true in the prior turn. If you skip the tool call, the item does NOT exist in the catalog and you've lied to the owner. ALWAYS call the tool first.

**Listing items:** call ``catalog.search`` with ``{"query": "", "limit": 50}``.

**Updating an item:** call ``catalog.search`` first to find the item_id, then
``catalog.update`` with that item_id + the changed fields.

**Deleting:** ``catalog.delete`` with item_id (soft-delete by default; pass
``hard: true`` to actually remove from Mongo).

### BROADCAST
``broadcast.send`` is HIGH-RISK — never fire one without explicit content +
recipient confirmation. Use ``<request_approval>`` so the owner sees what's
going out before it sends.
"""


def build_system_prompt(
    blueprint: dict[str, Any] | None,
    *,
    principal_role: str | None = None,
    dynamic_tools: list[Any] | None = None,
) -> str:
    parts = [HARNESS_INSTRUCTIONS]
    if blueprint:
        parts.append(render_blueprint_for_prompt(blueprint))
    if principal_role in ("owner", "admin", "operator"):
        parts.append(ADMIN_MODE_INSTRUCTIONS.replace("__ROLE__", principal_role))
    parts.append(render_capability_docs(blueprint, principal_role=principal_role, dynamic_tools=dynamic_tools))
    return "\n\n---\n\n".join(parts)


def render_tool_result(call_name: str, correlation_id: str | None, ok: bool, output: Any, error: str | None) -> str:
    """Format a tool result the model can read on the next turn.

    Stable structure: the model sees the same shape every time which keeps the
    prompt cache warm across turns within a conversation."""
    payload = {
        "call": call_name,
        "id": correlation_id,
        "ok": ok,
        "output": output if ok else None,
        "error": error,
    }
    return f"<tool_result>\n{json.dumps(payload, default=str, ensure_ascii=False)}\n</tool_result>"
