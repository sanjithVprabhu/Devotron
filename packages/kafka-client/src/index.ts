import { KAFKA_TOPICS, type KafkaTopic } from '@veda/shared-types/constants';
import {
  type AgentActionEvent,
  AgentActionEventSchema,
  type AuditEvent,
  AuditEventSchema,
  type BillingUsageEvent,
  BillingUsageEventSchema,
  type BlueprintMutationEvent,
  BlueprintMutationEventSchema,
  type DaemonProposalEvent,
  DaemonProposalEventSchema,
  type EscalationEvent,
  EscalationEventSchema,
  type IntegrationEvent,
  IntegrationEventSchema,
  type MessagesInboundEvent,
  MessagesInboundEventSchema,
  type MessagesOutboundEvent,
  MessagesOutboundEventSchema,
  type OrderEvent,
  OrderEventSchema,
} from '@veda/shared-types/events';
import { Kafka, type Producer, type Consumer, type EachMessagePayload, logLevel } from 'kafkajs';
import pino from 'pino';
import type { z } from 'zod';

const log = pino({ name: 'veda.kafka' });

// Mapping from topic → its event Zod schema. Producers and consumers both validate against this.
type TopicSchemaMap = {
  [KAFKA_TOPICS.MESSAGES_INBOUND]: typeof MessagesInboundEventSchema;
  [KAFKA_TOPICS.MESSAGES_OUTBOUND]: typeof MessagesOutboundEventSchema;
  [KAFKA_TOPICS.AGENT_ACTIONS]: typeof AgentActionEventSchema;
  [KAFKA_TOPICS.BLUEPRINT_MUTATIONS]: typeof BlueprintMutationEventSchema;
  [KAFKA_TOPICS.ORDERS]: typeof OrderEventSchema;
  [KAFKA_TOPICS.ESCALATIONS]: typeof EscalationEventSchema;
  [KAFKA_TOPICS.DAEMON_PROPOSALS]: typeof DaemonProposalEventSchema;
  [KAFKA_TOPICS.BILLING_USAGE]: typeof BillingUsageEventSchema;
  [KAFKA_TOPICS.AUDIT_LOG]: typeof AuditEventSchema;
  [KAFKA_TOPICS.INTEGRATIONS_EVENTS]: typeof IntegrationEventSchema;
  [KAFKA_TOPICS.A2A_TRANSACTIONS]: typeof IntegrationEventSchema; // placeholder until A2A schema lands
};

export type TopicEventMap = {
  [KAFKA_TOPICS.MESSAGES_INBOUND]: MessagesInboundEvent;
  [KAFKA_TOPICS.MESSAGES_OUTBOUND]: MessagesOutboundEvent;
  [KAFKA_TOPICS.AGENT_ACTIONS]: AgentActionEvent;
  [KAFKA_TOPICS.BLUEPRINT_MUTATIONS]: BlueprintMutationEvent;
  [KAFKA_TOPICS.ORDERS]: OrderEvent;
  [KAFKA_TOPICS.ESCALATIONS]: EscalationEvent;
  [KAFKA_TOPICS.DAEMON_PROPOSALS]: DaemonProposalEvent;
  [KAFKA_TOPICS.BILLING_USAGE]: BillingUsageEvent;
  [KAFKA_TOPICS.AUDIT_LOG]: AuditEvent;
  [KAFKA_TOPICS.INTEGRATIONS_EVENTS]: IntegrationEvent;
  [KAFKA_TOPICS.A2A_TRANSACTIONS]: IntegrationEvent;
};

const TOPIC_SCHEMA: TopicSchemaMap = {
  [KAFKA_TOPICS.MESSAGES_INBOUND]: MessagesInboundEventSchema,
  [KAFKA_TOPICS.MESSAGES_OUTBOUND]: MessagesOutboundEventSchema,
  [KAFKA_TOPICS.AGENT_ACTIONS]: AgentActionEventSchema,
  [KAFKA_TOPICS.BLUEPRINT_MUTATIONS]: BlueprintMutationEventSchema,
  [KAFKA_TOPICS.ORDERS]: OrderEventSchema,
  [KAFKA_TOPICS.ESCALATIONS]: EscalationEventSchema,
  [KAFKA_TOPICS.DAEMON_PROPOSALS]: DaemonProposalEventSchema,
  [KAFKA_TOPICS.BILLING_USAGE]: BillingUsageEventSchema,
  [KAFKA_TOPICS.AUDIT_LOG]: AuditEventSchema,
  [KAFKA_TOPICS.INTEGRATIONS_EVENTS]: IntegrationEventSchema,
  [KAFKA_TOPICS.A2A_TRANSACTIONS]: IntegrationEventSchema,
};

export type SaslMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  sasl?:
    | { mechanism: 'plain'; username: string; password: string }
    | { mechanism: 'scram-sha-256'; username: string; password: string }
    | { mechanism: 'scram-sha-512'; username: string; password: string };
  ssl?: boolean;
}

export function buildKafkaConfigFromEnv(clientId: string): KafkaConfig {
  const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(',').map((s) => s.trim());
  const cfg: KafkaConfig = { brokers, clientId };
  const mechRaw = process.env.KAFKA_SASL_MECHANISM;
  const username = process.env.KAFKA_SASL_USERNAME;
  if (mechRaw && username) {
    const password = process.env.KAFKA_SASL_PASSWORD ?? '';
    const mech = mechRaw.toLowerCase();
    if (mech === 'plain') {
      cfg.sasl = { mechanism: 'plain', username, password };
    } else if (mech === 'scram-sha-256') {
      cfg.sasl = { mechanism: 'scram-sha-256', username, password };
    } else if (mech === 'scram-sha-512') {
      cfg.sasl = { mechanism: 'scram-sha-512', username, password };
    }
    cfg.ssl = true;
  }
  return cfg;
}

export class VedaKafka {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers = new Set<Consumer>();

  constructor(cfg: KafkaConfig) {
    this.kafka = new Kafka({
      clientId: cfg.clientId,
      brokers: cfg.brokers,
      ssl: cfg.ssl,
      sasl: cfg.sasl,
      logLevel: logLevel.NOTHING,
    });
  }

  async getProducer(): Promise<Producer> {
    if (this.producer) return this.producer;
    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      transactionTimeout: 30_000,
    });
    await this.producer.connect();
    log.info('kafka producer connected');
    return this.producer;
  }

  /**
   * Publish a typed event to a known topic. Validates with Zod before sending.
   * Partitioning: by tenant_id when present (ensures per-tenant ordering); else by event_id.
   */
  async publish<T extends KafkaTopic>(topic: T, event: TopicEventMap[T]): Promise<void> {
    const schema = TOPIC_SCHEMA[topic] as unknown as z.ZodType<TopicEventMap[T]>;
    const parsed = schema.parse(event);
    const producer = await this.getProducer();
    const key =
      'tenant_id' in parsed && typeof (parsed as { tenant_id?: unknown }).tenant_id === 'string'
        ? ((parsed as { tenant_id: string }).tenant_id ?? parsed.event_id)
        : parsed.event_id;
    await producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(parsed),
          headers: parsed.trace_id ? { 'trace-id': parsed.trace_id } : undefined,
        },
      ],
    });
  }

  /**
   * Subscribe to a single topic with typed handler. Validates each message;
   * malformed messages are logged and acknowledged (DLQ wiring lives in V2).
   */
  async consume<T extends KafkaTopic>(
    topic: T,
    groupId: string,
    handler: (event: TopicEventMap[T], raw: EachMessagePayload) => Promise<void>,
  ): Promise<Consumer> {
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30_000,
      heartbeatInterval: 5_000,
    });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    this.consumers.add(consumer);

    const schema = TOPIC_SCHEMA[topic] as unknown as z.ZodType<TopicEventMap[T]>;

    await consumer.run({
      eachMessage: async (payload) => {
        if (!payload.message.value) return;
        let parsed: TopicEventMap[T];
        try {
          parsed = schema.parse(JSON.parse(payload.message.value.toString()));
        } catch (err) {
          log.error({ err, topic, offset: payload.message.offset }, 'malformed event, skipping');
          return;
        }
        try {
          await handler(parsed, payload);
        } catch (err) {
          log.error({ err, topic, offset: payload.message.offset }, 'handler failed');
          throw err;
        }
      },
    });

    log.info({ topic, groupId }, 'kafka consumer started');
    return consumer;
  }

  async disconnect(): Promise<void> {
    await Promise.allSettled([...this.consumers].map((c) => c.disconnect()));
    if (this.producer) await this.producer.disconnect();
  }
}
