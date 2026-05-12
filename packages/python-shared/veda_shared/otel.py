"""OpenTelemetry initialisation. Each service calls ``setup_otel(service_name)``
at startup. No-op when ``OTEL_EXPORTER_OTLP_ENDPOINT`` is unset (local dev)."""

from __future__ import annotations

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from veda_shared.settings import get_settings


def setup_otel(service_name: str) -> trace.Tracer:
    settings = get_settings()
    resource = Resource.create(
        {
            "service.name": service_name,
            "service.namespace": settings.otel_namespace,
            "deployment.environment": settings.node_env,
            "cloud.region": settings.app_region,
        }
    )
    provider = TracerProvider(resource=resource)
    if settings.otel_endpoint:
        exporter = OTLPSpanExporter(endpoint=settings.otel_endpoint, insecure=not settings.is_prod)
        provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    return trace.get_tracer(service_name)
