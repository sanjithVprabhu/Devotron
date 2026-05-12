"""Centralised environment configuration. Every Python service uses this to
fetch its config — no direct ``os.environ`` access in service code."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── runtime ──
    node_env: Literal["development", "staging", "production"] = Field(default="development", alias="NODE_ENV")
    log_level: Literal["debug", "info", "warning", "error"] = Field(default="info", alias="LOG_LEVEL")
    app_region: str = Field(default="in-south", alias="APP_REGION")
    app_base_url: str = Field(default="http://localhost:3000", alias="APP_BASE_URL")
    service_name: str = Field(default="veda-service", alias="SERVICE_NAME")

    # ── Default LLM provider ──
    # "openai" (default) | "anthropic" | "azure_openai" | "mock"
    # The mock provider returns canned harness XML — useful for end-to-end demos
    # without burning real credentials. See packages/llm-router/llm_router/mock.py.
    llm_default_provider: Literal["openai", "anthropic", "azure_openai", "mock"] = Field(
        default="openai", alias="LLM_DEFAULT_PROVIDER"
    )

    # ── OpenAI (direct) ──
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_base_url: str | None = Field(default=None, alias="OPENAI_BASE_URL")  # for proxies
    openai_reasoning_model: str = Field(default="gpt-4o", alias="OPENAI_REASONING_MODEL")
    openai_cheap_model: str = Field(default="gpt-4o-mini", alias="OPENAI_CHEAP_MODEL")
    openai_embedding_model: str = Field(default="text-embedding-3-small", alias="OPENAI_EMBEDDING_MODEL")

    # ── Anthropic (fallback / opt-in for some tasks) ──
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    anthropic_reasoning_model: str = Field(default="claude-sonnet-4-6", alias="ANTHROPIC_REASONING_MODEL")
    anthropic_cheap_model: str = Field(default="claude-haiku-4-5-20251001", alias="ANTHROPIC_CHEAP_MODEL")

    # ── Azure OpenAI (alternate fallback) ──
    azure_openai_api_key: str | None = Field(default=None, alias="AZURE_OPENAI_API_KEY")
    azure_openai_endpoint: str | None = Field(default=None, alias="AZURE_OPENAI_ENDPOINT")
    azure_openai_deployment_gpt4o: str = Field(default="gpt-4o", alias="AZURE_OPENAI_DEPLOYMENT_GPT4O")
    azure_openai_deployment_gpt4o_mini: str = Field(
        default="gpt-4o-mini", alias="AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI"
    )
    azure_openai_deployment_embed: str = Field(
        default="text-embedding-3-small", alias="AZURE_OPENAI_DEPLOYMENT_EMBED"
    )
    azure_openai_api_version: str = Field(default="2024-10-21", alias="AZURE_OPENAI_API_VERSION")

    # ── Sarvam ──
    sarvam_api_key: str | None = Field(default=None, alias="SARVAM_API_KEY")

    # ── databases ──
    postgres_url: str = Field(default="postgresql://veda:veda@localhost:5432/veda", alias="POSTGRES_URL")
    postgres_url_ro: str | None = Field(default=None, alias="POSTGRES_URL_RO")
    mongo_url: str = Field(default="mongodb://veda:veda@localhost:27017/?authSource=admin", alias="MONGO_URL")
    mongo_db_prefix: str = Field(default="tenant_", alias="MONGO_DB_PREFIX")
    qdrant_url: str = Field(default="http://localhost:6333", alias="QDRANT_URL")
    qdrant_api_key: str | None = Field(default=None, alias="QDRANT_API_KEY")
    redis_url: str = Field(default="redis://localhost:6379", alias="REDIS_URL")

    # ── kafka ──
    kafka_brokers: str = Field(default="localhost:19092", alias="KAFKA_BROKERS")
    kafka_client_id: str = Field(default="veda-python", alias="KAFKA_CLIENT_ID")
    kafka_sasl_mechanism: str | None = Field(default=None, alias="KAFKA_SASL_MECHANISM")
    kafka_sasl_username: str | None = Field(default=None, alias="KAFKA_SASL_USERNAME")
    kafka_sasl_password: str | None = Field(default=None, alias="KAFKA_SASL_PASSWORD")

    # ── azure blob ──
    azure_blob_connection_string: str | None = Field(default=None, alias="AZURE_BLOB_CONNECTION_STRING")
    azure_blob_container_media: str = Field(default="veda-media", alias="AZURE_BLOB_CONTAINER_MEDIA")
    azure_blob_container_uploads: str = Field(default="veda-uploads", alias="AZURE_BLOB_CONTAINER_UPLOADS")

    # ── WhatsApp provider ──
    # "aisensy" = pilot path (BSP). "meta_direct" = once we have direct Meta access.
    wa_provider: Literal["aisensy", "meta_direct"] = Field(default="aisensy", alias="WA_PROVIDER")

    # AiSensy (pilot BSP)
    aisensy_base_url: str = Field(default="https://apis.aisensy.com", alias="AISENSY_BASE_URL")
    aisensy_business_id: str | None = Field(default=None, alias="AISENSY_BUSINESS_ID")
    # API password for the *agency* business (used for non-project-scoped calls if any).
    # Per-project credentials live on each tenant's whatsapp_numbers row.
    aisensy_business_api_pwd: str | None = Field(default=None, alias="AISENSY_BUSINESS_API_PWD")

    # Meta direct (post-pilot)
    meta_app_id: str | None = Field(default=None, alias="META_APP_ID")
    meta_app_secret: str | None = Field(default=None, alias="META_APP_SECRET")
    meta_verify_token: str | None = Field(default=None, alias="META_VERIFY_TOKEN")
    meta_graph_version: str = Field(default="v22.0", alias="META_GRAPH_VERSION")
    meta_system_user_token: str | None = Field(default=None, alias="META_SYSTEM_USER_TOKEN")
    veda_waba_id: str | None = Field(default=None, alias="VEDA_WABA_ID")
    veda_phone_number_id: str | None = Field(default=None, alias="VEDA_PHONE_NUMBER_ID")
    veda_phone_number: str | None = Field(default=None, alias="VEDA_PHONE_NUMBER")

    # ── Tenant-secret encryption (used to encrypt aisensy_project_api_pwd at rest) ──
    # 32 raw bytes, base64-encoded. Generate with: openssl rand -base64 32
    tenant_secret_key_b64: str | None = Field(default=None, alias="TENANT_SECRET_KEY_B64")

    # ── twitter ──
    twitter_bearer_token: str | None = Field(default=None, alias="TWITTER_BEARER_TOKEN")
    twitter_handle: str = Field(default="veda_bot", alias="TWITTER_HANDLE")

    # ── razorpay ──
    razorpay_key_id: str | None = Field(default=None, alias="RAZORPAY_KEY_ID")
    razorpay_key_secret: str | None = Field(default=None, alias="RAZORPAY_KEY_SECRET")
    razorpay_webhook_secret: str | None = Field(default=None, alias="RAZORPAY_WEBHOOK_SECRET")

    # ── speech ──
    speech_provider: Literal["azure", "sarvam", "openai_whisper"] = Field(
        default="azure", alias="SPEECH_PROVIDER"
    )
    azure_speech_key: str | None = Field(default=None, alias="AZURE_SPEECH_KEY")
    azure_speech_region: str = Field(default="centralindia", alias="AZURE_SPEECH_REGION")

    # ── budgets ──
    default_daily_budget_inr: int = Field(default=50, alias="DEFAULT_DAILY_BUDGET_INR")
    daemon_default_daily_budget_inr: int = Field(default=15, alias="DAEMON_DEFAULT_DAILY_BUDGET_INR")

    # ── observability ──
    otel_endpoint: str | None = Field(default=None, alias="OTEL_EXPORTER_OTLP_ENDPOINT")
    otel_namespace: str = Field(default="veda", alias="OTEL_SERVICE_NAMESPACE")

    @property
    def kafka_brokers_list(self) -> list[str]:
        return [b.strip() for b in self.kafka_brokers.split(",") if b.strip()]

    @property
    def is_prod(self) -> bool:
        return self.node_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
