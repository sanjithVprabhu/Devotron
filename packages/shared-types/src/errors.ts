// Canonical error codes used across services. Strings, not enum, so Python and other
// languages can produce them without a shared dependency.

export const ERROR_CODES = {
  // Auth / identity
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  TENANT_NOT_FOUND: 'tenant_not_found',
  PRINCIPAL_NOT_FOUND: 'principal_not_found',

  // Validation
  INVALID_INPUT: 'invalid_input',
  SCHEMA_MISMATCH: 'schema_mismatch',

  // Channel / WhatsApp
  WINDOW_EXPIRED: 'whatsapp_window_expired',
  TEMPLATE_NOT_APPROVED: 'template_not_approved',
  CHANNEL_RATE_LIMITED: 'channel_rate_limited',
  CHANNEL_QUALITY_RED: 'channel_quality_red',

  // Blueprint
  BLUEPRINT_NOT_FOUND: 'blueprint_not_found',
  BLUEPRINT_VALIDATION_FAILED: 'blueprint_validation_failed',
  BLUEPRINT_VERSION_CONFLICT: 'blueprint_version_conflict',

  // Capability
  CAPABILITY_NOT_ENABLED: 'capability_not_enabled',
  CAPABILITY_DEGRADED: 'capability_degraded',
  CAPABILITY_TIMEOUT: 'capability_timeout',

  // Cost
  BUDGET_EXCEEDED: 'budget_exceeded',
  DAEMON_BUDGET_EXCEEDED: 'daemon_budget_exceeded',

  // LLM
  LLM_PROVIDER_UNAVAILABLE: 'llm_provider_unavailable',
  LLM_BAD_OUTPUT: 'llm_bad_output',

  // Generic
  INTERNAL: 'internal_error',
  NOT_IMPLEMENTED: 'not_implemented',
  UPSTREAM_FAILURE: 'upstream_failure',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class VedaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'VedaError';
  }
}
