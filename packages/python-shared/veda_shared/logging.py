"""Structured logging with PII guardrails.

Usage:
    from veda_shared.logging import get_logger
    log = get_logger(__name__)
    log.info("message_received", tenant_id=tenant_id, channel=channel)

PII rule: never pass raw phone numbers, names, emails to log calls. Pass
``principal_id`` (UUID) instead. The ``redact_pii`` helper redacts common patterns
defensively, but the right thing is to not log them in the first place.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import structlog

from veda_shared.settings import get_settings

_PHONE_RE = re.compile(r"\+?\d[\d\s\-]{7,}\d")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def redact_pii(value: Any) -> Any:
    if isinstance(value, str):
        v = _PHONE_RE.sub("[REDACTED_PHONE]", value)
        v = _EMAIL_RE.sub("[REDACTED_EMAIL]", v)
        return v
    if isinstance(value, dict):
        return {k: redact_pii(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_pii(v) for v in value]
    return value


def _redact_processor(_logger: Any, _name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    return {k: redact_pii(v) if k != "principal_id" else v for k, v in event_dict.items()}


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")

    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _redact_processor,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    if settings.is_prod:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


_configured = False


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    global _configured
    if not _configured:
        configure_logging()
        _configured = True
    return structlog.get_logger(name)
