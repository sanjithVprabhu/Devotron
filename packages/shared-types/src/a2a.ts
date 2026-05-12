import { z } from 'zod';

// V2 hooks. The schemas are real; the runtime behind them is built later.

export const A2AMessageTypeSchema = z.enum([
  'rfq',
  'quote',
  'acceptance',
  'rejection',
  'clarification',
  'completion',
]);
export type A2AMessageType = z.infer<typeof A2AMessageTypeSchema>;

export const RFQPayloadSchema = z.object({
  category: z.string(),
  requirements: z.record(z.unknown()),
  quantity: z.number().int().positive().optional(),
  timeline: z.string().optional(),
  budget_max_inr: z.number().nonnegative().optional(),
  preferred_location: z.string().optional(),
});

export const QuotePayloadSchema = z.object({
  rfq_message_id: z.string().uuid(),
  price_inr: z.number().nonnegative(),
  terms: z.string(),
  validity_days: z.number().int().positive(),
  availability_from: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const AcceptancePayloadSchema = z.object({
  quote_message_id: z.string().uuid(),
  approved_by_principal: z.string().uuid(),
  human_signoff_required: z.boolean().default(true),
});

export const A2AMessageSchema = z.object({
  message_id: z.string().uuid(),
  from_tenant_id: z.string().uuid(),
  to_tenant_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  message_type: A2AMessageTypeSchema,
  payload: z.union([RFQPayloadSchema, QuotePayloadSchema, AcceptancePayloadSchema, z.record(z.unknown())]),
  requires_human_approval: z.boolean().default(true),
  created_at: z.string().datetime(),
});
export type A2AMessage = z.infer<typeof A2AMessageSchema>;
