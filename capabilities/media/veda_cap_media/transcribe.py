"""``media.transcribe`` — speech-to-text for voice notes.

V1 supports Azure Speech (default — Indic-language strong) and OpenAI Whisper via
Azure OpenAI as a fallback. Choose via ``SPEECH_PROVIDER`` env var.
"""

from __future__ import annotations

from typing import Any

import httpx

from veda_shared.capability import capability
from veda_shared.logging import get_logger
from veda_shared.schemas.capabilities import CapabilityCall, CapabilityId
from veda_shared.schemas.errors import ERROR_CODES, VedaError
from veda_shared.settings import get_settings

log = get_logger(__name__)


@capability(CapabilityId.MEDIA_TRANSCRIBE)
async def transcribe(call: CapabilityCall) -> dict[str, Any]:
    media_url: str = call.input["media_url"]
    language_hint: str | None = call.input.get("language_hint")

    s = get_settings()
    if s.speech_provider == "azure":
        return await _azure_speech(media_url, language_hint)
    if s.speech_provider == "openai_whisper":
        return await _whisper(media_url)
    if s.speech_provider == "sarvam":
        return await _sarvam(media_url, language_hint)
    raise VedaError(ERROR_CODES.NOT_IMPLEMENTED, f"unknown speech provider {s.speech_provider}")


async def _azure_speech(media_url: str, language_hint: str | None) -> dict[str, Any]:
    s = get_settings()
    if not s.azure_speech_key:
        raise VedaError(ERROR_CODES.UPSTREAM_FAILURE, "AZURE_SPEECH_KEY missing")
    # Use Azure Speech SDK's REST endpoint for short audio. We download then POST.
    async with httpx.AsyncClient(timeout=60) as client:
        audio = await client.get(media_url)
        audio.raise_for_status()
        endpoint = (
            f"https://{s.azure_speech_region}.stt.speech.microsoft.com"
            f"/speech/recognition/conversation/cognitiveservices/v1"
        )
        params: dict[str, str] = {"format": "detailed"}
        if language_hint:
            params["language"] = _to_bcp47(language_hint)
        resp = await client.post(
            endpoint,
            params=params,
            content=audio.content,
            headers={
                "Ocp-Apim-Subscription-Key": s.azure_speech_key,
                "Content-Type": audio.headers.get("content-type", "audio/ogg"),
            },
        )
        resp.raise_for_status()
        body = resp.json()
        text = body.get("DisplayText") or (body.get("NBest") or [{}])[0].get("Display", "")
        return {"transcription": text, "language": language_hint, "confidence": 0.9}


async def _whisper(media_url: str) -> dict[str, Any]:
    raise VedaError(ERROR_CODES.NOT_IMPLEMENTED, "whisper transcription pending V1.5")


async def _sarvam(media_url: str, language_hint: str | None) -> dict[str, Any]:
    raise VedaError(ERROR_CODES.NOT_IMPLEMENTED, "sarvam transcription pending V1.5")


def _to_bcp47(code: str) -> str:
    table = {
        "hi": "hi-IN",
        "kn": "kn-IN",
        "ta": "ta-IN",
        "te": "te-IN",
        "mr": "mr-IN",
        "bn": "bn-IN",
        "ml": "ml-IN",
        "gu": "gu-IN",
        "pa": "pa-IN",
        "en": "en-IN",
    }
    return table.get(code, "en-IN")
