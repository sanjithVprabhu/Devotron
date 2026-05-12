from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from veda_shared.schemas.canonical import CanonicalContent
from veda_shared.schemas.capabilities import CapabilityId
from veda_shared.schemas.identity import Channel


class _EventBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: str
    occurred_at: datetime
    trace_id: str | None = None
    span_id: str | None = None


class MessagesInboundEvent(_EventBase):
    tenant_id: str | None = None
    thread_id: str | None = None
    principal_id: str
    channel: Channel
    channel_message_id: str
    sender_identifier: str
    recipient_identifier: str
    content: CanonicalContent
    raw_payload: Any | None = None


class MessagesOutboundEvent(_EventBase):
    tenant_id: str | None = None
    thread_id: str | None = None
    target_channel: Channel
    target_identifier: str
    source_phone_number_id: str | None = None
    content: CanonicalContent
    template_name: str | None = None
    template_variables: dict[str, str] | None = None
    requires_window_check: bool = True
    priority: Literal["low", "normal", "high"] = "normal"


class _Tokens(BaseModel):
    input: int = 0
    output: int = 0
    cached: int = 0


class AgentActionEvent(_EventBase):
    tenant_id: str | None = None
    thread_id: str | None = None
    action_type: Literal[
        "sub_agent_dispatched",
        "tool_called",
        "escalation_triggered",
        "session_started",
        "session_ended",
        "confidence_assessed",
    ]
    sub_agent: str | None = None
    tool: CapabilityId | None = None
    tool_input: Any | None = None
    tool_output: Any | None = None
    duration_ms: int = 0
    model_used: str | None = None
    provider: str | None = None
    tokens: _Tokens = Field(default_factory=_Tokens)
    cost_paise: int = 0


class BlueprintMutationEvent(_EventBase):
    tenant_id: str
    version_from: int
    version_to: int
    mutated_by_principal: str | None = None
    mutation_source: Literal["veda", "dashboard", "api", "migration"]
    diff: dict[str, Any] = Field(default_factory=dict)
    full_blueprint: dict[str, Any]


class OrderEvent(_EventBase):
    tenant_id: str
    order_id: str
    order_number: str
    transition: str
    to_status: str
    total_paise: int
    principal_id: str
    line_items: list[dict[str, Any]] = Field(default_factory=list)


class EscalationEvent(_EventBase):
    tenant_id: str
    thread_id: str
    reason: str
    escalate_to: Literal["owner", "admin", "operator"]
    assigned_to: str | None = None


class DaemonProposalEvent(_EventBase):
    tenant_id: str
    proposal: dict[str, Any]


class BillingUsageEvent(_EventBase):
    tenant_id: str | None = None
    provider: Literal["anthropic", "azure_openai", "sarvam", "azure_speech"]
    model: str
    task_type: str
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    cost_paise: int


class AuditEvent(_EventBase):
    tenant_id: str | None = None
    principal_id: str | None = None
    event_type: str
    entity_type: str | None = None
    entity_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    ip_address: str | None = None
    user_agent: str | None = None


class IntegrationEvent(_EventBase):
    tenant_id: str
    integration: str
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
