from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from veda_shared.schemas.identity import Channel


class TextContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["text"]
    text: str = Field(min_length=1, max_length=4096)


class VoiceContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["voice"]
    media_url: str
    duration_seconds: int | None = None
    transcription: str | None = None
    transcription_language: str | None = None


class ImageContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["image"]
    media_url: str
    caption: str | None = None
    analysis: str | None = None


class DocumentContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["document"]
    media_url: str
    filename: str | None = None
    mime_type: str | None = None


class LocationContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["location"]
    lat: float
    lng: float
    name: str | None = None
    address: str | None = None


class InteractiveReplyContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["button_reply", "list_reply"]
    selected_id: str
    selected_title: str
    context_message_id: str | None = None


class TemplateComponent(BaseModel):
    type: Literal["header", "body", "button"]
    parameters: list[dict[str, str]] = Field(default_factory=list)


class TemplateContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["template"]
    template_name: str
    language: str
    components: list[TemplateComponent]


class OutboundButton(BaseModel):
    id: str
    title: str = Field(max_length=20)


class OutboundButtonsContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["buttons"]
    body_text: str = Field(min_length=1)
    header_text: str | None = None
    footer_text: str | None = None
    buttons: list[OutboundButton] = Field(min_length=1, max_length=3)


class OutboundListItem(BaseModel):
    id: str
    title: str = Field(max_length=24)
    description: str | None = Field(default=None, max_length=72)


class OutboundListSection(BaseModel):
    title: str
    items: list[OutboundListItem] = Field(min_length=1, max_length=10)


class OutboundListContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: Literal["list"]
    body_text: str = Field(min_length=1)
    header_text: str | None = None
    footer_text: str | None = None
    button_text: str = Field(default="Choose", max_length=20)
    list_sections: list[OutboundListSection]


CanonicalContent = Annotated[
    TextContent
    | VoiceContent
    | ImageContent
    | DocumentContent
    | LocationContent
    | InteractiveReplyContent
    | TemplateContent
    | OutboundButtonsContent
    | OutboundListContent,
    Field(discriminator="type"),
]


class DeliveryStatus(str):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class CanonicalMessageDelivery(BaseModel):
    status: Literal["queued", "sent", "delivered", "read", "failed"]
    error: str | None = None
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    read_at: datetime | None = None


class CanonicalMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message_id: str
    direction: Literal["inbound", "outbound"]
    channel: Channel
    tenant_id: str | None = None
    thread_id: str | None = None
    sender_principal_id: str | None = None
    sender_identifier: str
    recipient_identifier: str
    timestamp: datetime
    content: CanonicalContent
    delivery: CanonicalMessageDelivery | None = None
    raw_payload: Any | None = None


class OutboundMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: str
    occurred_at: datetime
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
    trace_context: dict[str, str] | None = None
