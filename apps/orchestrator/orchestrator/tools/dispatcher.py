"""HTTP dispatcher for tenant-registered tools.

Joins ``api_config.base_url`` with ``api_tool.path``, applies the shared auth,
templates path + body with the agent-supplied args, fires the HTTP request,
returns a structured result.

Safety:
- http:// and https:// schemes only
- 15s timeout
- 100KB response cap
- Schema validation before firing
- No redirect following (could leak credentials to a different host)
"""

from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from orchestrator.tools.loader import ApiConfig, ApiTool
from veda_shared.logging import get_logger

log = get_logger(__name__)

REQUEST_TIMEOUT_SECONDS = 15.0
MAX_RESPONSE_BYTES = 100_000

_TEMPLATE_VAR_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
_BODY_TEMPLATE_VAR_RE = re.compile(r"\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}")


def _validate_url_scheme(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"unsafe url scheme: {parsed.scheme}")
    if not parsed.netloc:
        raise ValueError(f"url has no host: {url}")


def _template_path(path: str, args: dict[str, Any]) -> str:
    """Replace {var} placeholders with URL-encoded arg values. Missing args
    become empty strings — schema validation should have caught those."""
    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        val = args.get(key, "")
        return quote(str(val), safe="")
    return _TEMPLATE_VAR_RE.sub(_replace, path)


def _template_body(body_template: str | None, args: dict[str, Any]) -> str | None:
    if not body_template:
        return None
    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        val = args.get(key)
        if val is None:
            return ""
        if isinstance(val, (dict, list, bool, int, float)):
            return json.dumps(val)
        return str(val)
    return _BODY_TEMPLATE_VAR_RE.sub(_replace, body_template)


def _build_headers(
    config: ApiConfig,
    tool: ApiTool,
    acting_user_id: str | None,
) -> dict[str, str]:
    headers: dict[str, str] = {"User-Agent": "VEDA-Agent/0.1"}
    for k, v in (tool.static_headers or {}).items():
        headers[k] = str(v)
    # Tenant-level auth applies to all tools
    if config.auth_type == "bearer" and config.auth_secret_plaintext:
        headers["Authorization"] = f"Bearer {config.auth_secret_plaintext}"
    elif config.auth_type == "api_key_header" and config.auth_secret_plaintext and config.auth_header_name:
        headers[config.auth_header_name] = config.auth_secret_plaintext
    elif config.auth_type == "basic" and config.auth_secret_plaintext:
        headers["Authorization"] = f"Basic {config.auth_secret_plaintext}"
    # Per-tool override on the acting-user injection (default from config)
    pass_user = (
        tool.pass_acting_user_override
        if tool.pass_acting_user_override is not None
        else config.pass_acting_user_default
    )
    if pass_user and acting_user_id:
        headers[config.acting_user_header] = acting_user_id
    return headers


def _validate_required_args(tool: ApiTool, args: dict[str, Any]) -> list[str]:
    schema = tool.input_schema or {}
    required = schema.get("required") or []
    return [r for r in required if r not in args or args[r] in (None, "")]


def _join_url(base_url: str, path: str) -> str:
    base = base_url.rstrip("/")
    p = path if path.startswith("/") else "/" + path
    return base + p


async def invoke_dynamic_tool(
    tool: ApiTool,
    args: dict[str, Any],
    *,
    config: ApiConfig,
    acting_user_id: str | None = None,
) -> dict[str, Any]:
    """Execute a tool against api_config.base_url + tool.path.

    The caller must have already loaded the ApiConfig (via load_api_config) —
    we don't fetch it here so the harness can short-circuit at the gate if
    the tenant has no config.
    """
    if not config.base_url_locked:
        return {
            "ok": False, "output": None,
            "error": "api_config.base_url not locked yet — tools can't run until owner locks it",
            "duration_ms": 0, "status": None,
        }

    missing = _validate_required_args(tool, args)
    if missing:
        return {"ok": False, "output": None, "error": f"missing required args: {missing}", "duration_ms": 0, "status": None}

    templated_path = _template_path(tool.path, args)
    url = _join_url(config.base_url, templated_path)
    try:
        _validate_url_scheme(url)
    except ValueError as e:
        return {"ok": False, "output": None, "error": str(e), "duration_ms": 0, "status": None}

    headers = _build_headers(config, tool, acting_user_id)
    body = _template_body(tool.body_template, args)
    if body is not None and "content-type" not in {k.lower() for k in headers}:
        headers["Content-Type"] = "application/json"

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = await client.request(
                method=tool.http_method,
                url=url,
                headers=headers,
                content=body.encode("utf-8") if body else None,
            )
    except httpx.TimeoutException:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.warning("api_tool.timeout", tool=tool.name, url=url, elapsed_ms=elapsed_ms)
        return {"ok": False, "output": None, "error": "timeout", "duration_ms": elapsed_ms, "status": None}
    except httpx.HTTPError as e:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.warning("api_tool.http_error", tool=tool.name, url=url, error=str(e))
        return {"ok": False, "output": None, "error": f"http_error: {e}", "duration_ms": elapsed_ms, "status": None}
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    raw = response.content[:MAX_RESPONSE_BYTES]
    truncated = len(response.content) > MAX_RESPONSE_BYTES
    content_type = response.headers.get("content-type", "").lower()

    output: Any
    if "json" in content_type:
        try:
            output = json.loads(raw)
        except json.JSONDecodeError:
            output = raw.decode("utf-8", errors="replace")
    else:
        output = raw.decode("utf-8", errors="replace")

    ok = 200 <= response.status_code < 300
    if not ok:
        log.warning(
            "api_tool.bad_status",
            tool=tool.name, status=response.status_code, url=url,
            body_preview=str(output)[:200],
        )

    result: dict[str, Any] = {
        "ok": ok,
        "output": output,
        "error": None if ok else f"http {response.status_code}",
        "duration_ms": elapsed_ms,
        "status": response.status_code,
    }
    if truncated:
        result["truncated"] = True
    return result


def classify_risk(tool: ApiTool) -> str:
    """Risk level for the harness's permission gate."""
    if tool.risk_override:
        return tool.risk_override
    if tool.side_effect:
        return "high"
    method = (tool.http_method or "GET").upper()
    if method == "GET":
        return "low"
    if method == "DELETE":
        return "high"
    return "medium"
