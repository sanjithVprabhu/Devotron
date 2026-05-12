import { z } from 'zod';
import { CanonicalContentSchema } from './canonical.js';
import { CapabilityIdSchema } from './capabilities.js';
import { ChannelSchema } from './identity.js';
import { OrderStatusSchema } from './order.js';
import { DaemonProposalSchema } from './daemon.js';

// Every event carries this base envelope. Producers fill it; consumers validate.
// Optional fields are *also* nullable so Python publishers (Pydantic) can serialise
// `None` → `null` without tripping Zod validation on the consumer side.
const EventBaseSchema = z.object({
  event_id: z.string().uuid(),
  occurred_at: z.string().datetime(),
  trace_id: z.string().nullable().optional(),
  span_id: z.string().nullable().optional(),
});

// ── messages.inbound ─────────────────────────────────────────────────────
export const MessagesInboundEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid().nullable(),
  thread_id: z.string().uuid().nullable(),
  principal_id: z.string().uuid(),
  channel: ChannelSchema,
  channel_message_id: z.string(),
  sender_identifier: z.string(),
  recipient_identifier: z.string(),
  content: CanonicalContentSchema,
  raw_payload: z.unknown().nullable().optional(),
});
export type MessagesInboundEvent = z.infer<typeof MessagesInboundEventSchema>;

// ── messages.outbound ────────────────────────────────────────────────────
export const MessagesOutboundEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid().nullable(),
  thread_id: z.string().uuid().nullable(),
  target_channel: ChannelSchema,
  target_identifier: z.string(),
  source_phone_number_id: z.string().nullable().optional(),
  content: CanonicalContentSchema,
  template_name: z.string().nullable().optional(),
  template_variables: z.record(z.string()).nullable().optional(),
  requires_window_check: z.boolean().default(true),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});
export type MessagesOutboundEvent = z.infer<typeof MessagesOutboundEventSchema>;

// ── agent.actions ────────────────────────────────────────────────────────
export const AgentActionEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid().nullable(),
  thread_id: z.string().uuid().nullable(),
  action_type: z.enum([
    'sub_agent_dispatched',
    'tool_called',
    'escalation_triggered',
    'session_started',
    'session_ended',
    'confidence_assessed',
  ]),
  sub_agent: z.string().optional(),
  tool: CapabilityIdSchema.optional(),
  tool_input: z.unknown().optional(),
  tool_output: z.unknown().optional(),
  duration_ms: z.number().int().nonnegative().default(0),
  model_used: z.string().optional(),
  provider: z.string().optional(),
  tokens: z
    .object({
      input: z.number().int().nonnegative().default(0),
      output: z.number().int().nonnegative().default(0),
      cached: z.number().int().nonnegative().default(0),
    })
    .default({ input: 0, output: 0, cached: 0 }),
  cost_paise: z.number().int().nonnegative().default(0),
});
export type AgentActionEvent = z.infer<typeof AgentActionEventSchema>;

// ── blueprint.mutations ──────────────────────────────────────────────────
export const BlueprintMutationEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid(),
  version_from: z.number().int().nonnegative(),
  version_to: z.number().int().positive(),
  mutated_by_principal: z.string().uuid().nullable(),
  mutation_source: z.enum(['veda', 'dashboard', 'api', 'migration']),
  diff: z.record(z.unknown()).default({}),
  full_blueprint: z.record(z.unknown()),
});
export type BlueprintMutationEvent = z.infer<typeof BlueprintMutationEventSchema>;

// ── orders ───────────────────────────────────────────────────────────────
export const OrderEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid(),
  order_id: z.string().uuid(),
  order_number: z.string(),
  transition: z.string(), // e.g. "created->confirmed"
  to_status: OrderStatusSchema,
  total_paise: z.number().int().nonnegative(),
  principal_id: z.string().uuid(),
  line_items: z.array(z.record(z.unknown())).default([]),
});
export type OrderEvent = z.infer<typeof OrderEventSchema>;

// ── escalations ──────────────────────────────────────────────────────────
export const EscalationEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  reason: z.string(),
  escalate_to: z.enum(['owner', 'admin', 'operator']),
  assigned_to: z.string().uuid().nullable().optional(),
});
export type EscalationEvent = z.infer<typeof EscalationEventSchema>;

// ── daemon.proposals ─────────────────────────────────────────────────────
export const DaemonProposalEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid(),
  proposal: DaemonProposalSchema,
});
export type DaemonProposalEvent = z.infer<typeof DaemonProposalEventSchema>;

// ── billing.usage ────────────────────────────────────────────────────────
export const BillingUsageEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid().nullable(),
  provider: z.enum(['anthropic', 'azure_openai', 'sarvam', 'azure_speech']),
  model: z.string(),
  task_type: z.string(),
  input_tokens: z.number().int().nonnegative().default(0),
  output_tokens: z.number().int().nonnegative().default(0),
  cached_tokens: z.number().int().nonnegative().default(0),
  cost_paise: z.number().int().nonnegative(),
});
export type BillingUsageEvent = z.infer<typeof BillingUsageEventSchema>;

// ── audit.log ────────────────────────────────────────────────────────────
export const AuditEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid().nullable(),
  principal_id: z.string().uuid().nullable(),
  event_type: z.string(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// ── integrations.events ──────────────────────────────────────────────────
export const IntegrationEventSchema = EventBaseSchema.extend({
  tenant_id: z.string().uuid(),
  integration: z.string(),
  event_type: z.string(),
  payload: z.record(z.unknown()).default({}),
});
export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;
