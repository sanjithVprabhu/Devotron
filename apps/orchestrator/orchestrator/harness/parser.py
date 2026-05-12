"""Lenient XML extractor for LLM-emitted harness output.

LLM output is often imperfect: missing closing tags, unescaped angle brackets in
content, JSON-ish args with stray trailing commas. The parser tolerates all of
that. Anything we can't make sense of is dropped quietly with a log line —
correctness > completeness — because the next iteration's prompt will reflect
what was actually executed and the model will adjust.

Approach:
  1. Find each top-level tag with regex (DOTALL).
  2. For tags with attributes, extract them via a separate attribute regex.
  3. For ``<call>`` arguments, attempt JSON parse; on failure, return ``{}``.
  4. Preserve emit order so dispatch happens in the order the model intended.
"""

from __future__ import annotations

import json
import re
from typing import Any

from veda_shared.logging import get_logger

from orchestrator.harness.tags import (
    AskEvent,
    ButtonSpec,
    CallEvent,
    EscalateEvent,
    FinalEvent,
    HarnessEvent,
    ListItemSpec,
    PlanEvent,
    RecallEvent,
    RememberEvent,
    RequestApprovalEvent,
    SayEvent,
    SwarmEvent,
    ThinkingEvent,
)

log = get_logger(__name__)

# Tag-name regex: top-level tags only (no nested matching here — we handle that
# inside <ask> after the fact). Captures opening attrs + body.
_OUTER_TAG = re.compile(
    r"<\s*(thinking|plan|call|say|ask|remember|recall|escalate|request_approval|swarm|final)\b([^>]*)>"
    r"(.*?)"
    r"<\s*/\s*\1\s*>",
    re.DOTALL | re.IGNORECASE,
)

# Self-closing variant for <final/>, <recall .../>, <escalate .../>, etc.
_SELF_CLOSING = re.compile(
    r"<\s*(final|recall|escalate|request_approval|swarm)\b([^>]*)/\s*>",
    re.DOTALL | re.IGNORECASE,
)

_ATTR = re.compile(r'([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*"([^"]*)"')

# Shorthand for capability calls: GPT-4o (and likely other models) consistently
# regress from `<call name="catalog.search">{...}</call>` to writing the
# capability name as the tag itself: `<catalog.search>{...}</catalog.search>`.
# We accept the shorthand when the tag name is a recognised capability id —
# i.e. has at least one dot, looks like a valid capability id, and is registered.
# Match dotted.lowercase identifiers; verify against the capability registry
# inside `parse()` before promoting them to CallEvents.
_CAPABILITY_SHORTHAND = re.compile(
    r"<\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\b([^>]*)>"
    r"(.*?)"
    r"<\s*/\s*\1\s*>",
    re.DOTALL,
)

# Inside <ask>...</ask>: <button id="X">Title</button> and <item id="X" desc="...">Title</item>
_BUTTON = re.compile(r'<\s*button\b([^>]*)>(.*?)<\s*/\s*button\s*>', re.DOTALL | re.IGNORECASE)
_ITEM = re.compile(r'<\s*item\b([^>]*)>(.*?)<\s*/\s*item\s*>', re.DOTALL | re.IGNORECASE)


def _attrs(blob: str) -> dict[str, str]:
    return {m.group(1).lower(): m.group(2) for m in _ATTR.finditer(blob)}


def _strip_inner_tags(text: str) -> str:
    """Remove nested tags from a body so the remaining text is clean."""
    return re.sub(r"<[^>]+>.*?</[^>]+>", "", text, flags=re.DOTALL).strip()


def parse(raw: str) -> list[HarnessEvent]:
    events: list[HarnessEvent] = []

    # Track positions so we can emit in document order alongside self-closers.
    matches: list[tuple[int, str, dict[str, str], str]] = []
    for m in _OUTER_TAG.finditer(raw):
        matches.append((m.start(), m.group(1).lower(), _attrs(m.group(2)), m.group(3)))
    for m in _SELF_CLOSING.finditer(raw):
        matches.append((m.start(), m.group(1).lower(), _attrs(m.group(2)), ""))

    # Accept capability-name shorthand: <catalog.search>{...}</catalog.search>
    # → treat as <call name="catalog.search">{...}</call>. Only recognised
    # capability ids are promoted; unknown dotted tags are ignored (will be
    # stripped as plain text by lenient recovery).
    for m in _CAPABILITY_SHORTHAND.finditer(raw):
        cap = m.group(1).lower()
        if not _is_known_capability(cap):
            continue
        # Build attrs as if the LLM had written `<call name="cap">`. Preserve
        # any inline attributes the model added (memory_claim, side_effect, id).
        synth_attrs = _attrs(m.group(2))
        synth_attrs["name"] = cap
        matches.append((m.start(), "call", synth_attrs, m.group(3)))
        log.info("harness.parser.capability_shorthand_promoted", capability=cap)

    matches.sort(key=lambda t: t[0])

    for _pos, name, attrs, body in matches:
        try:
            ev = _build(name, attrs, body)
        except Exception as e:  # noqa: BLE001
            log.warning("harness.parser.skip_tag", tag=name, error=str(e))
            continue
        if ev is not None:
            events.append(ev)

    # Lenient recovery: LLMs frequently emit raw text without the <say> wrapper
    # (especially after a tool call, when they assume the result IS the answer).
    # If the response has substantive text outside any tag, treat that as an
    # implicit <say> + <final/>. This prevents the loop from spinning on the
    # same non-tagged response.
    has_actionable = any(
        isinstance(e, (CallEvent, AskEvent, SwarmEvent, RememberEvent, RecallEvent, RequestApprovalEvent))
        for e in events
    )
    has_say = any(isinstance(e, SayEvent) for e in events)
    has_final = any(isinstance(e, FinalEvent) for e in events)

    if not has_say and not has_actionable:
        leftover = _strip_all_tags(raw).strip()
        if len(leftover) >= 4:
            events.append(SayEvent(text=leftover))
            if not has_final:
                events.append(FinalEvent())
            log.info("harness.parser.recovered_implicit_say", chars=len(leftover))

    return events


def _strip_all_tags(raw: str) -> str:
    """Remove every recognised tag (paired and self-closing) and return the
    remaining free-text content."""
    cleaned = _OUTER_TAG.sub("", raw)
    cleaned = _SELF_CLOSING.sub("", cleaned)
    cleaned = _CAPABILITY_SHORTHAND.sub("", cleaned)
    return cleaned


_KNOWN_CAPABILITY_CACHE: set[str] | None = None


def _is_known_capability(name: str) -> bool:
    """Check if a dotted name matches a registered capability id.

    Cached after first call. Conservative: if the registry can't be loaded
    (e.g. import-time issue), returns False so the shorthand is ignored
    rather than producing a malformed CallEvent.
    """
    global _KNOWN_CAPABILITY_CACHE
    if _KNOWN_CAPABILITY_CACHE is None:
        try:
            from veda_shared.schemas.capabilities import CapabilityId

            _KNOWN_CAPABILITY_CACHE = {c.value for c in CapabilityId}
        except Exception:  # noqa: BLE001
            _KNOWN_CAPABILITY_CACHE = set()
    return name in _KNOWN_CAPABILITY_CACHE


def _build(name: str, attrs: dict[str, str], body: str) -> HarnessEvent | None:
    if name == "thinking":
        return ThinkingEvent(text=body.strip())
    if name == "plan":
        return PlanEvent(text=body.strip())
    if name == "say":
        return SayEvent(text=body.strip())
    if name == "final":
        return FinalEvent()

    if name == "call":
        cap = attrs.get("name") or attrs.get("capability")
        if not cap:
            log.warning("harness.parser.call_missing_name")
            return None
        try:
            args = json.loads(body.strip()) if body.strip() else {}
            if not isinstance(args, dict):
                args = {}
        except json.JSONDecodeError:
            log.warning("harness.parser.call_bad_json", capability=cap)
            args = {}
        return CallEvent(
            name=cap,
            correlation_id=attrs.get("id"),
            args=args,
            memory_claim=attrs.get("memory_claim", "").lower() == "true",
            side_effect=attrs.get("side_effect", "").lower() == "true",
        )

    if name == "ask":
        buttons: list[ButtonSpec] = []
        for bm in _BUTTON.finditer(body):
            ba = _attrs(bm.group(1))
            buttons.append(ButtonSpec(id=ba.get("id", ""), title=bm.group(2).strip()))
        items: list[ListItemSpec] = []
        for im in _ITEM.finditer(body):
            ia = _attrs(im.group(1))
            items.append(
                ListItemSpec(
                    id=ia.get("id", ""),
                    title=im.group(2).strip(),
                    description=ia.get("desc") or ia.get("description"),
                )
            )
        body_text = (
            _strip_inner_tags(body)
            or attrs.get("body_text", "").strip()
            or attrs.get("body", "").strip()
        )
        return AskEvent(
            body_text=body_text,
            buttons=buttons,
            list_items=items,
            button_text=attrs.get("button_text", "Choose"),
            list_section_title=attrs.get("section_title", "Options"),
        )

    if name == "remember":
        scope = attrs.get("scope", "principal").lower()
        if scope not in ("thread", "principal", "tenant"):
            scope = "principal"
        key = attrs.get("key", "").strip()
        if not key:
            return None
        return RememberEvent(key=key, value=body.strip(), scope=scope)  # type: ignore[arg-type]

    if name == "recall":
        scope = attrs.get("scope", "principal").lower()
        if scope not in ("thread", "principal", "tenant"):
            scope = "principal"
        key = attrs.get("key", "").strip()
        if not key:
            return None
        return RecallEvent(key=key, scope=scope)  # type: ignore[arg-type]

    if name == "escalate":
        reason = attrs.get("reason") or body.strip() or "unspecified"
        target = attrs.get("to", "operator").lower()
        if target not in ("owner", "admin", "operator"):
            target = "operator"
        return EscalateEvent(reason=reason, escalate_to=target)  # type: ignore[arg-type]

    if name == "request_approval":
        cap = attrs.get("capability", "")
        action_label = attrs.get("label") or attrs.get("action") or cap
        try:
            payload = json.loads(body.strip()) if body.strip() else {}
            if not isinstance(payload, dict):
                payload = {}
        except json.JSONDecodeError:
            payload = {}
        return RequestApprovalEvent(
            action_label=action_label, capability=cap, payload=payload
        )

    if name == "swarm":
        sub = attrs.get("name") or attrs.get("agent") or "subagent"
        objective = attrs.get("objective") or body.strip() or "unspecified"
        try:
            ctx_attr = attrs.get("context")
            ctx: dict[str, Any] = json.loads(ctx_attr) if ctx_attr else {}
            if not isinstance(ctx, dict):
                ctx = {}
        except json.JSONDecodeError:
            ctx = {}
        return SwarmEvent(sub_agent_name=sub, objective=objective, context=ctx)

    return None
