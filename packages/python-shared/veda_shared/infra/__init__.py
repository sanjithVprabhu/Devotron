"""Async infrastructure clients. Each is a singleton per-process to keep
connection counts predictable on AKS."""

from veda_shared.infra.kafka import KafkaProducer, KafkaConsumer, get_producer
from veda_shared.infra.mongo import get_mongo_client, get_tenant_db
from veda_shared.infra.postgres import get_engine, get_session, with_tenant
from veda_shared.infra.qdrant import get_qdrant_client, tenant_collection_name
from veda_shared.infra.redis import get_redis

__all__ = [
    "KafkaProducer",
    "KafkaConsumer",
    "get_producer",
    "get_mongo_client",
    "get_tenant_db",
    "get_engine",
    "get_session",
    "with_tenant",
    "get_qdrant_client",
    "tenant_collection_name",
    "get_redis",
]
