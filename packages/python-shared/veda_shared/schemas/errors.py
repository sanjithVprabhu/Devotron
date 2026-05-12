from __future__ import annotations

from typing import Any, Final


class _ErrorCodes:
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    TENANT_NOT_FOUND = "tenant_not_found"
    PRINCIPAL_NOT_FOUND = "principal_not_found"
    INVALID_INPUT = "invalid_input"
    SCHEMA_MISMATCH = "schema_mismatch"
    WINDOW_EXPIRED = "whatsapp_window_expired"
    TEMPLATE_NOT_APPROVED = "template_not_approved"
    CHANNEL_RATE_LIMITED = "channel_rate_limited"
    CHANNEL_QUALITY_RED = "channel_quality_red"
    BLUEPRINT_NOT_FOUND = "blueprint_not_found"
    BLUEPRINT_VALIDATION_FAILED = "blueprint_validation_failed"
    BLUEPRINT_VERSION_CONFLICT = "blueprint_version_conflict"
    CAPABILITY_NOT_ENABLED = "capability_not_enabled"
    CAPABILITY_DEGRADED = "capability_degraded"
    CAPABILITY_TIMEOUT = "capability_timeout"
    BUDGET_EXCEEDED = "budget_exceeded"
    DAEMON_BUDGET_EXCEEDED = "daemon_budget_exceeded"
    LLM_PROVIDER_UNAVAILABLE = "llm_provider_unavailable"
    LLM_BAD_OUTPUT = "llm_bad_output"
    INTERNAL = "internal_error"
    NOT_IMPLEMENTED = "not_implemented"
    UPSTREAM_FAILURE = "upstream_failure"


ERROR_CODES: Final[type[_ErrorCodes]] = _ErrorCodes
ErrorCode = str  # codes are stable strings, intentionally not an Enum to ease cross-language use


class VedaError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        details: Any | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details
        self.retryable = retryable

    def __repr__(self) -> str:  # pragma: no cover
        return f"VedaError({self.code!r}, {self.message!r})"
