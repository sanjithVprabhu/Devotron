"""Pydantic mirrors of the TypeScript shared-types Zod schemas.

The TS package is the source of truth (drives DB schemas + frontend types). These
Pydantic models mirror the wire-format only — i.e. what comes out of Kafka or HTTP,
never the DB columns directly. Keep these in sync with packages/shared-types/src/*.
"""

from veda_shared.schemas.canonical import (
    CanonicalContent,
    CanonicalMessage,
    DeliveryStatus,
    DocumentContent,
    ImageContent,
    InteractiveReplyContent,
    LocationContent,
    OutboundButtonsContent,
    OutboundListContent,
    OutboundMessage,
    TemplateContent,
    TextContent,
    VoiceContent,
)
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId, CapabilityResult
from veda_shared.schemas.constants import (
    DEFAULTS,
    KAFKA_TOPICS,
    VEDA_PRINCIPAL_ID,
    VEDA_TENANT_SENTINEL,
)
from veda_shared.schemas.errors import ERROR_CODES, ErrorCode, VedaError
from veda_shared.schemas.events import (
    AgentActionEvent,
    AuditEvent,
    BillingUsageEvent,
    BlueprintMutationEvent,
    DaemonProposalEvent,
    EscalationEvent,
    IntegrationEvent,
    MessagesInboundEvent,
    MessagesOutboundEvent,
    OrderEvent,
)
from veda_shared.schemas.identity import (
    Channel,
    Identifier,
    LinkingCode,
    Principal,
    PrincipalRole,
    TenantMembership,
    TenantRole,
    TenantStatus,
    TenantTier,
    normalize_identifier,
)
from veda_shared.schemas.languages import LanguageCode, LanguageConfig, Script
from veda_shared.schemas.permissions import (
    Permission,
    ROLE_PERMISSIONS,
    has_permission,
)
from veda_shared.schemas.verticals import VERTICAL_CAPABILITY_BUNDLES, Vertical

__all__ = [
    "CanonicalContent",
    "CanonicalMessage",
    "DeliveryStatus",
    "DocumentContent",
    "ImageContent",
    "InteractiveReplyContent",
    "LocationContent",
    "OutboundButtonsContent",
    "OutboundListContent",
    "OutboundMessage",
    "TemplateContent",
    "TextContent",
    "VoiceContent",
    "CapabilityCall",
    "CapabilityId",
    "CapabilityResult",
    "DEFAULTS",
    "KAFKA_TOPICS",
    "VEDA_PRINCIPAL_ID",
    "VEDA_TENANT_SENTINEL",
    "ERROR_CODES",
    "ErrorCode",
    "VedaError",
    "AgentActionEvent",
    "AuditEvent",
    "BillingUsageEvent",
    "BlueprintMutationEvent",
    "DaemonProposalEvent",
    "EscalationEvent",
    "IntegrationEvent",
    "MessagesInboundEvent",
    "MessagesOutboundEvent",
    "OrderEvent",
    "Channel",
    "Identifier",
    "LinkingCode",
    "Principal",
    "PrincipalRole",
    "TenantMembership",
    "TenantRole",
    "TenantStatus",
    "TenantTier",
    "normalize_identifier",
    "LanguageCode",
    "LanguageConfig",
    "Script",
    "Permission",
    "ROLE_PERMISSIONS",
    "has_permission",
    "VERTICAL_CAPABILITY_BUNDLES",
    "Vertical",
]
