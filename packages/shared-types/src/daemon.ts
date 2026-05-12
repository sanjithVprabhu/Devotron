import { z } from 'zod';

export const DaemonJobTypeSchema = z.enum([
  'reengagement',
  'faq_patterns',
  'catalog_gaps',
  'conversation_review',
  'weekly_digest',
]);
export type DaemonJobType = z.infer<typeof DaemonJobTypeSchema>;

export const DaemonProposalTypeSchema = z.enum([
  'reengagement',
  'faq_update',
  'catalog_gap',
  'conversation_review',
  'broadcast',
]);
export type DaemonProposalType = z.infer<typeof DaemonProposalTypeSchema>;

export const DaemonProposalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'executed',
  'expired',
]);
export type DaemonProposalStatus = z.infer<typeof DaemonProposalStatusSchema>;

export const DaemonProposalSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  proposal_type: DaemonProposalTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  action: z.record(z.unknown()),
  estimated_impact: z.string().nullable().optional(),
  status: DaemonProposalStatusSchema.default('pending'),
  reviewed_by: z.string().uuid().nullable().optional(),
  reviewed_at: z.string().datetime().nullable().optional(),
  executed_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
});
export type DaemonProposal = z.infer<typeof DaemonProposalSchema>;
