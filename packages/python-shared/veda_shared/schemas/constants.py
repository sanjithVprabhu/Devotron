"""Mirrors packages/shared-types/src/constants.ts. Keep in sync."""

from __future__ import annotations

from typing import Final

VEDA_PRINCIPAL_ID: Final[str] = "00000000-0000-0000-0000-000000000001"
VEDA_TENANT_SENTINEL: Final[str] = "veda"

MESSAGE_MAX_TEXT_LENGTH: Final[int] = 4096
TWITTER_TEXT_MAX: Final[int] = 280
WA_BUTTON_MAX: Final[int] = 3
WA_LIST_ITEMS_MAX: Final[int] = 10

WHATSAPP_WINDOW_HOURS: Final[int] = 24
IDEMPOTENCY_TTL_SECONDS: Final[int] = 86_400
SESSION_TTL_SECONDS: Final[int] = 1_800
BLUEPRINT_CACHE_TTL_SECONDS: Final[int] = 300
LINKING_CODE_TTL_SECONDS: Final[int] = 900
DAEMON_LOCK_TTL_SECONDS: Final[int] = 600

KAFKA_TOPIC_PREFIX: Final[str] = "veda"


class KAFKA_TOPICS:  # noqa: N801 — module-level constants namespace
    MESSAGES_INBOUND = "veda.messages.inbound"
    MESSAGES_OUTBOUND = "veda.messages.outbound"
    AGENT_ACTIONS = "veda.agent.actions"
    BLUEPRINT_MUTATIONS = "veda.blueprint.mutations"
    ORDERS = "veda.orders"
    ESCALATIONS = "veda.escalations"
    DAEMON_PROPOSALS = "veda.daemon.proposals"
    A2A_TRANSACTIONS = "veda.a2a.transactions"
    BILLING_USAGE = "veda.billing.usage"
    AUDIT_LOG = "veda.audit.log"
    INTEGRATIONS_EVENTS = "veda.integrations.events"


DEFAULTS: Final[dict[str, int]] = {
    "DAILY_BUDGET_PAISE": 5_000_00,
    "DAEMON_DAILY_BUDGET_PAISE": 1_500_00,
    "MAX_TOKENS_PER_RESPONSE": 500,
    "MAX_PROACTIVE_PER_DAY": 1,
}
