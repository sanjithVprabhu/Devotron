import { z } from 'zod';

// Source of truth for every capability the agent layer can invoke.
// New capabilities MUST be added here AND get a worker implementation under capabilities/.
export const CapabilityIdSchema = z.enum([
  // catalog
  'catalog.search',
  'catalog.add',
  'catalog.update',
  'catalog.delete',
  'catalog.bulk_import',
  'catalog.vehicle_compat_lookup',
  // payment
  'payment.razorpay.create_link',
  'payment.razorpay.verify',
  'payment.razorpay.refund',
  'payment.upi_manual.get_details',
  'payment.cod.confirm',
  // broadcast
  'broadcast.send',
  'broadcast.schedule',
  'broadcast.preview',
  // scheduling
  'scheduling.calendar.check_availability',
  'scheduling.calendar.book',
  'scheduling.calendar.cancel',
  // support
  'support.faq.search',
  'support.faq.add',
  'support.escalation.create',
  // recommendations
  'recommendations.similar_items',
  'recommendations.personalized',
  // media
  'media.transcribe',
  'media.image_analyze',
  // negotiation
  'negotiation.bounded',
  // template
  'template.lookup',
  'template.submit',
  // integration
  'integration.shopify.sync_catalog',
  'integration.ats.search_jobs',
  'integration.ats.get_candidate_profile',
  'integration.ats.submit_application',
  'integration.ats.get_application_status',
  'integration.crawl.extract_catalog',
  'integration.api_sandbox.call',
  // a2a (V2 hooks; disabled by default)
  'a2a.transact',
]);
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;

export const CapabilityCallSchema = z.object({
  capability: CapabilityIdSchema,
  tenant_id: z.string().uuid(),
  thread_id: z.string().uuid().nullable().optional(),
  invoked_by_principal_id: z.string().uuid().nullable().optional(),
  input: z.record(z.unknown()),
  trace_context: z.record(z.string()).optional(),
});
export type CapabilityCall = z.infer<typeof CapabilityCallSchema>;

export const CapabilityResultSchema = z.object({
  capability: CapabilityIdSchema,
  ok: z.boolean(),
  output: z.unknown(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
  duration_ms: z.number().int().nonnegative(),
  cost_paise: z.number().int().nonnegative().default(0),
});
export type CapabilityResult = z.infer<typeof CapabilityResultSchema>;
