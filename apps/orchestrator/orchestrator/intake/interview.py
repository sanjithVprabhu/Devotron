"""LLM-driven business interview.

Replaces the old hardcoded auto-parts question tree. Veda asks adaptive
questions based on whatever the business owner says, fills out a draft
Blueprint as it goes, and signals when it has enough to provision a tenant.

The interview is fully vertical-agnostic — there are no per-vertical question
lists. The LLM looks at the conversation history + current draft, decides what's
still missing, and asks the most natural next question. A yoga teacher gets
yoga-relevant questions, a parts dealer gets parts-relevant questions — all from
the same code.

Required draft fields (the minimum to provision):
- business_name: what the business is called
- vertical: short tag the LLM picks (auto_parts / salon / yoga / course / job_board / consulting / ...)
- description: one-line summary
- languages: list of language codes the agent will speak with customers
- location: city or "online only"
- escalation_phone: owner's number in E.164 for human handoff

Optional (collected if naturally surfaced, otherwise skipped):
- tone, payment_methods, delivery_or_fulfillment, sample_offerings
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from llm_router import get_router
from veda_shared.logging import get_logger

log = get_logger(__name__)

REQUIRED_FIELDS = ("business_name", "vertical", "description", "languages", "location", "escalation_phone")

# Vertical-aware follow-up questions — asked AFTER all required fields are collected.
# Each entry is a list of (field_key, question_prompt) tuples. The interview engine
# will keep cycling until either: all follow-ups for the inferred vertical are
# collected, OR the user signals "skip" / "done with setup".
VERTICAL_FOLLOWUPS: dict[str, list[tuple[str, str]]] = {
    "auto_parts": [
        ("brands_stocked",   "Which brands do you stock? (e.g. Bosch, Brembo, OEM-only, etc.)"),
        ("vehicles",         "Which vehicle types — cars, bikes, trucks, specific makes?"),
        ("oem_or_after",     "OEM, aftermarket, or both?"),
    ],
    "restaurant": [
        ("cuisine",          "What cuisine? (e.g. South Indian, Chinese, multi-cuisine)"),
        ("hours",            "What are your hours? (e.g. 11am-10pm, closed Mondays)"),
        ("service_modes",    "Dine-in, takeaway, delivery — which of these?"),
        ("min_order_paise",  "Minimum order amount for delivery in ₹? (or 'no minimum')"),
    ],
    "yoga": [
        ("class_types",      "What kinds of classes? (Hatha, Ashtanga, Vinyasa, prenatal, etc.)"),
        ("session_length",   "Typical session length in minutes?"),
        ("pricing_model",    "Per-class drop-in, monthly subscription, or both?"),
        ("levels",           "What levels — beginners, intermediate, advanced, mixed?"),
    ],
    "salon": [
        ("services",         "Main services offered? (haircut, color, spa, threading, etc.)"),
        ("hours",            "Your operating hours?"),
        ("booking_window",   "How far in advance can customers book? (same-day / a week / a month)"),
    ],
    "fitness": [
        ("offerings",        "What do you offer — gym membership, personal training, classes?"),
        ("session_length",   "Typical session length in minutes?"),
        ("pricing_model",    "Monthly subscription, package, or per-session?"),
    ],
    "course": [
        ("format",           "Live, pre-recorded, or hybrid?"),
        ("duration",         "Total course duration? (e.g. 8 weeks, 30 hours, self-paced)"),
        ("cohort_or_dripped", "Cohort-based with a fixed start date, or always-on enrollment?"),
        ("level",            "Beginner, intermediate, or advanced?"),
    ],
    "consulting": [
        ("specialty",        "What's your specialty area? (tax, legal, strategy, etc.)"),
        ("session_length",   "Typical session length in minutes?"),
        ("delivery",         "In-person, video call, or both?"),
    ],
    "ecommerce": [
        ("product_types",    "What kinds of products?"),
        ("shipping_areas",   "Where do you ship? (city / India / international)"),
        ("return_window",    "Return policy in days? (or 'no returns')"),
    ],
    "clinic": [
        ("specialties",      "Which specialties? (dental, dermatology, GP, etc.)"),
        ("hours",            "Operating hours?"),
        ("appointment_or_walkin", "Appointments only, walk-ins, or both?"),
    ],
    "jobs": [
        ("industries",       "Which industries do you recruit for?"),
        ("locations_served", "Which cities?"),
        ("role_types",       "Permanent, contract, internships, or a mix?"),
    ],
}

# Verticals that share follow-up sets. Adapt loosely.
VERTICAL_ALIASES: dict[str, str] = {
    "product": "auto_parts",
    "retail": "ecommerce",
    "fmcg": "ecommerce",
    "fashion": "ecommerce",
    "electronics": "ecommerce",
    "salon_spa": "salon",
    "tutoring": "course",
    "saas": "course",
    "subscription": "course",
    "digital": "course",
    "video": "course",
    "ebook": "course",
    "service": "consulting",
    "wellness": "fitness",
    "repair": "consulting",
    "booking": "salon",
    "appointment": "salon",
    "reservation": "restaurant",
    "job_board": "jobs",
    "pottery": "yoga",  # studio-style hands-on classes
}


def _followup_fields_for(vertical: str) -> list[tuple[str, str]]:
    v = (vertical or "").lower()
    if v in VERTICAL_FOLLOWUPS:
        return VERTICAL_FOLLOWUPS[v]
    aliased = VERTICAL_ALIASES.get(v)
    if aliased and aliased in VERTICAL_FOLLOWUPS:
        return VERTICAL_FOLLOWUPS[aliased]
    return []

INTERVIEW_SYSTEM_PROMPT = """You are Veda, conducting a brief interview to set up a business on the platform.

Your job: build a Blueprint for the business by chatting naturally. Ask one
question at a time. Adapt to whatever kind of business the user describes —
auto parts, yoga studio, online course, restaurant, consultancy, anything.
There is no fixed script.

## Required to finalize (must collect all of these):
- business_name: what the business is called
- vertical: a short tag like 'auto_parts', 'salon', 'yoga', 'course', 'restaurant', 'consulting', 'ecommerce', 'job_board'. Pick the closest fit.
- description: one-line summary of what they do
- languages: list of language codes ['en','hi','kn','ta','te','mr','bn'] the agent will speak with their customers
- location: city / area, OR "online" if remote-only
- escalation_phone: owner's WhatsApp number in E.164 format (e.g. +919876543210), used for human handoff

## After the required fields, ask 3-5 vertical-specific follow-ups
Once all required fields are present, the platform will surface a curated list of
follow-up questions appropriate to the vertical (e.g. cuisine + hours for restaurants,
class types + session length for yoga, brands stocked for auto parts).

Ask them one at a time, in the order surfaced. Extract the user's answer into the
matching draft_updates key. If the user says 'skip', 'that's all', or similar,
finalize immediately.

## Tone
- Warm, direct, capable. Not effusive. No "Awesome!" or "Great!".
- Match the user's language (English / Hindi / Hinglish / etc).
- One question at a time. Don't bombard.
- If they answered something already, don't ask again.
- If their answer is vague, ask one focused follow-up.
- Validate phone format — if they give an Indian number without +91, infer it.

## Output format — STRICT JSON, nothing else
You MUST respond with a single JSON object, no prose around it:

{
  "draft_updates": { ... only fields you can confidently extract from the latest user message, can be empty {} },
  "next_action": "ask" | "finalize",
  "say": "what to say to the user next (the actual reply they'll see)"
}

- If `next_action` is "ask", `say` is the next interview question.
- If `next_action` is "finalize", `say` is a confirmation message like "Got it — setting up [business name] now. Your dashboard link will arrive in WhatsApp shortly."
- ONLY finalize when ALL required fields are present in the draft (after applying draft_updates).
- Never invent values. If unsure, leave the field out and ask.

## Examples of `vertical` inference
- "I sell brake pads" → auto_parts
- "I run a salon" → salon
- "I teach yoga online" → yoga
- "I make a course on React" → course
- "I take dental appointments" → clinic
- "I post jobs for engineers" → job_board
- "I sell handmade soaps" → ecommerce
- "I do tax consulting" → consulting
"""


@dataclass
class InterviewDecision:
    next_action: str  # "ask" | "finalize"
    say: str
    draft_updates: dict[str, Any]
    is_complete: bool


def _missing_fields(draft: dict[str, Any]) -> list[str]:
    missing = []
    for f in REQUIRED_FIELDS:
        v = draft.get(f)
        if v is None or v == "" or (isinstance(v, list) and not v):
            missing.append(f)
    return missing


def _missing_followups(draft: dict[str, Any]) -> list[tuple[str, str]]:
    """Returns the list of (field, question) follow-ups for the inferred
    vertical that haven't been answered yet. Empty list if all collected
    or no follow-ups defined for the vertical."""
    vertical = draft.get("vertical") or ""
    followups = _followup_fields_for(vertical)
    return [(k, q) for (k, q) in followups if not draft.get(k)]


def _extract_json(text: str) -> dict[str, Any] | None:
    """Robust JSON extraction — LLMs sometimes wrap in ```json or add prose."""
    # First try: direct parse
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip code fences
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass
    # Last resort: greedy match between first { and last }
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return None


async def drive_interview(
    *,
    history: list[dict[str, str]],
    current_draft: dict[str, Any],
    latest_user_message: str,
) -> InterviewDecision:
    """Single interview turn.

    Args:
        history: prior turns as [{"role": "user|veda", "text": "..."}, ...] —
            does NOT include the current user message.
        current_draft: blueprint fields collected so far.
        latest_user_message: the user's brand-new message we're responding to.

    Returns:
        InterviewDecision with next_action, say, draft_updates, is_complete.
    """
    missing = _missing_fields(current_draft)
    followups = _missing_followups(current_draft) if not missing else []
    convo_lines = []
    for turn in history[-12:]:
        speaker = "User" if turn["role"] == "user" else "Veda"
        convo_lines.append(f"{speaker}: {turn['text']}")
    convo_str = "\n".join(convo_lines) if convo_lines else "(no prior turns)"

    # If required fields are done, we may still have vertical-specific
    # follow-ups to ask. Surface those to the LLM so it asks them next.
    if missing:
        guidance = f"Still missing (you MUST eventually collect these): {missing}"
    elif followups:
        guidance = (
            "All REQUIRED fields collected. Now ask vertical-specific follow-ups to "
            f"flesh out the {current_draft.get('vertical')} business. Pending optional fields: "
            + ", ".join(k for k, _ in followups)
            + ". Ask one at a time, using these suggested questions: "
            + json.dumps(followups, ensure_ascii=False)
            + ". The user MAY say 'skip' or 'that's all' — if they do, finalize. "
            + "Otherwise, ask the next pending follow-up. Extract their answer into the matching key in draft_updates."
        )
    else:
        guidance = "All required and vertical-specific fields collected. You may finalize now."

    user_prompt = f"""Current draft (collected so far):
{json.dumps(current_draft, ensure_ascii=False, indent=2)}

{guidance}

Recent conversation:
{convo_str}

User just said: {latest_user_message!r}

Decide your next move. Return ONLY the JSON object."""

    resp = await get_router().complete(
        task="intake_question_generation",
        tenant_id=None,
        system=INTERVIEW_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
        max_tokens=400,
        temperature=0.3,
    )

    parsed = _extract_json(resp.text)
    if parsed is None:
        log.warning("interview.json_parse_failed", raw=resp.text[:200])
        # Fallback: don't finalize, ask user to repeat
        return InterviewDecision(
            next_action="ask",
            say="Sorry, I didn't quite catch that. Could you tell me again?",
            draft_updates={},
            is_complete=False,
        )

    draft_updates = parsed.get("draft_updates") or {}
    if not isinstance(draft_updates, dict):
        draft_updates = {}
    next_action = parsed.get("next_action", "ask")
    if next_action not in ("ask", "finalize"):
        next_action = "ask"
    say = parsed.get("say") or ""
    if not isinstance(say, str) or not say.strip():
        say = "Tell me a bit more about your business."

    # Apply updates and check completion gate
    merged = {**current_draft, **draft_updates}
    required_done = not _missing_fields(merged)
    pending_followups = _missing_followups(merged) if required_done else []

    # Allow user to skip remaining follow-ups by saying "skip" / "that's all" / etc.
    skip_signal = any(
        kw in latest_user_message.lower()
        for kw in ("skip", "that's all", "no thanks", "done with setup", "rather not", "i'm good", "no more", "go ahead")
    )

    is_complete = required_done and (not pending_followups or skip_signal)

    # Guard: if model says finalize but core fields are missing, force ask
    if next_action == "finalize" and not required_done:
        log.warning("interview.premature_finalize", missing=_missing_fields(merged))
        next_action = "ask"
        say = f"Almost there. I still need: {', '.join(_missing_fields(merged))}. Could you share one of those?"

    # Guard: model wants to finalize but optional follow-ups remain AND user
    # didn't signal skip — keep asking. This guarantees the LLM doesn't bail
    # out early on the optional fields it was asked to collect.
    elif next_action == "finalize" and pending_followups and not skip_signal:
        log.info("interview.deferring_finalize_for_followups", pending=[k for k, _ in pending_followups])
        next_action = "ask"
        # Pick the first pending follow-up as the next question
        _, next_q = pending_followups[0]
        say = next_q + "  (or say 'skip' if you'd rather move on)"

    return InterviewDecision(
        next_action=next_action,
        say=say.strip(),
        draft_updates=draft_updates,
        is_complete=is_complete,
    )


async def opening_message(latest_user_message: str) -> str:
    """First-turn greeting. Keeps Veda's identity but is open-ended."""
    resp = await get_router().complete(
        task="intake_question_generation",
        tenant_id=None,
        system=INTERVIEW_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f"User's first message: {latest_user_message!r}. Reply with ONLY a JSON object: "
                    '{"draft_updates": {}, "next_action": "ask", "say": "<your warm one-line greeting + one open question>"}'
                ),
            }
        ],
        max_tokens=200,
        temperature=0.5,
    )
    parsed = _extract_json(resp.text)
    if parsed and isinstance(parsed.get("say"), str):
        return parsed["say"].strip()
    return (
        "I'm Veda. I help businesses come alive on WhatsApp. "
        "What kind of business are you setting up?"
    )
