"""Shared LangGraph-friendly state types."""

from __future__ import annotations

from typing import Any, Literal, TypedDict


class CommonAgentState(TypedDict, total=False):
    """Shared between Veda and Business Agent graphs."""

    tenant_id: str | None
    thread_id: str | None
    principal_id: str
    channel: Literal["whatsapp", "twitter", "telegram", "instagram"]

    # Inbound
    last_message_text: str
    last_message_type: str
    sender_identifier: str

    # Conversation context
    recent_messages: list[dict[str, Any]]
    conversation_summary: str

    # Output
    draft_response: str | None
    outbound_content: dict[str, Any] | None  # serialised CanonicalContent

    # Diagnostics
    confidence: float
    current_node: str
