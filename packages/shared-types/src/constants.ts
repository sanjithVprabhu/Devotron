// Cross-service constants. Anything tunable per-tenant lives in the Blueprint;
// these are platform invariants.

export const VEDA_PRINCIPAL_ID = '00000000-0000-0000-0000-000000000001';
export const VEDA_TENANT_SENTINEL = 'veda';

export const MESSAGE_MAX_TEXT_LENGTH = 4096; // WhatsApp text limit
export const TWITTER_TEXT_MAX = 280;
export const WA_BUTTON_MAX = 3;
export const WA_LIST_ITEMS_MAX = 10;

export const WHATSAPP_WINDOW_HOURS = 24;
export const IDEMPOTENCY_TTL_SECONDS = 86_400;
export const SESSION_TTL_SECONDS = 1_800;
export const BLUEPRINT_CACHE_TTL_SECONDS = 300;
export const LINKING_CODE_TTL_SECONDS = 900;
export const DAEMON_LOCK_TTL_SECONDS = 600;

export const KAFKA_TOPIC_PREFIX = 'veda';

export const KAFKA_TOPICS = {
  MESSAGES_INBOUND: 'veda.messages.inbound',
  MESSAGES_OUTBOUND: 'veda.messages.outbound',
  AGENT_ACTIONS: 'veda.agent.actions',
  BLUEPRINT_MUTATIONS: 'veda.blueprint.mutations',
  ORDERS: 'veda.orders',
  ESCALATIONS: 'veda.escalations',
  DAEMON_PROPOSALS: 'veda.daemon.proposals',
  A2A_TRANSACTIONS: 'veda.a2a.transactions',
  BILLING_USAGE: 'veda.billing.usage',
  AUDIT_LOG: 'veda.audit.log',
  INTEGRATIONS_EVENTS: 'veda.integrations.events',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

// Default cost guardrails (paise). Per-tenant Blueprint can override.
export const DEFAULTS = {
  DAILY_BUDGET_PAISE: 5_000_00, // ₹5,000
  DAEMON_DAILY_BUDGET_PAISE: 1_500_00, // ₹1,500
  MAX_TOKENS_PER_RESPONSE: 500,
  MAX_PROACTIVE_PER_DAY: 1,
  PROMPT_CACHE_HEADER: 'anthropic-beta',
} as const;

// Retention windows (days). Match spec/05_DATA_MODEL.md → "Data Retention Policy".
export const RETENTION_DAYS = {
  AUDIT_LOG: 7 * 365,
  CONVERSATION_MESSAGES: 2 * 365,
  ORDERS: 7 * 365,
  AGENT_CHECKPOINTS: 30,
  LLM_USAGE_DAILY: 3 * 365,
} as const;
