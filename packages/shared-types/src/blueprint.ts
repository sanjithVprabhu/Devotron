import { z } from 'zod';
import { CapabilityIdSchema } from './capabilities.js';
import { LanguageConfigSchema } from './languages.js';
import { VerticalSchema } from './verticals.js';

// ── Identity / Locations / Persona ──────────────────────────────────────

export const IdentityBlockSchema = z.object({
  tenant_id: z.string().uuid(),
  business_name: z.string().min(1),
  legal_name: z.string().optional(),
  vertical: VerticalSchema,
  sub_vertical: z.string().optional(),
  description: z.string().min(1),
  logo_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  founded_year: z.number().int().optional(),
  operating_since: z.string().optional(),
});

const TimeStringSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const OperatingHoursSchema = z.object({
  monday: z.object({ open: TimeStringSchema, close: TimeStringSchema }).nullable().optional(),
  tuesday: z.object({ open: TimeStringSchema, close: TimeStringSchema }).nullable().optional(),
  wednesday: z.object({ open: TimeStringSchema, close: TimeStringSchema }).nullable().optional(),
  thursday: z.object({ open: TimeStringSchema, close: TimeStringSchema }).nullable().optional(),
  friday: z.object({ open: TimeStringSchema, close: TimeStringSchema }).nullable().optional(),
  saturday: z.object({ open: TimeStringSchema, close: TimeStringSchema }).nullable().optional(),
  sunday: z.object({ open: TimeStringSchema, close: TimeStringSchema }).nullable().optional(),
  holidays: z.array(z.string()).default([]),
});

export const LocationSchema = z.object({
  id: z.string(),
  label: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  country: z.string().default('IN'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  is_primary: z.boolean(),
  hours: OperatingHoursSchema,
  serves_radius_km: z.number().nonnegative().optional(),
});

export const PersonaSchema = z.object({
  agent_name: z.string().min(1),
  base_tone: z.enum(['formal', 'friendly', 'casual', 'stoic', 'supportive']).default('friendly'),
  custom_tone_description: z.string().optional(),
  adapts_to_user_tone: z.boolean().default(true),
  languages: z.array(LanguageConfigSchema).min(1),
  greeting_message: z.string().optional(),
  sign_off: z.string().optional(),
  persona_examples: z
    .array(z.object({ user_message: z.string(), ideal_response: z.string() }))
    .default([]),
  prohibited_topics: z.array(z.string()).default([]),
});

// ── Catalog config ───────────────────────────────────────────────────────

export const CatalogSourceSchema = z.object({
  type: z.enum(['manual', 'csv_upload', 'shopify', 'api', 'crawl', 'ats_api']),
  last_import_at: z.string().datetime().optional(),
  auto_sync: z.boolean().default(false),
  sync_frequency_hours: z.number().int().positive().optional(),
});

export const CatalogConfigSchema = z.object({
  item_count: z.number().int().nonnegative().default(0),
  last_synced_at: z.string().datetime().optional(),
  source: CatalogSourceSchema.default({ type: 'manual', auto_sync: false }),
  display_config: z
    .object({
      items_per_page: z.number().int().positive().default(5),
      show_price: z.boolean().default(true),
      show_stock: z.boolean().default(true),
      show_images: z.boolean().default(false),
    })
    .default({}),
  search_config: z
    .object({
      enable_semantic_search: z.boolean().default(true),
      enable_vehicle_compatibility: z.boolean().default(false),
      fuzzy_matching: z.boolean().default(true),
    })
    .default({}),
  pricing_config: z
    .object({
      currency: z.literal('INR').default('INR'),
      include_gst: z.boolean().default(true),
      gst_rate: z.number().nonnegative().optional(),
      show_mrp: z.boolean().default(false),
    })
    .default({}),
});

// ── Capabilities ─────────────────────────────────────────────────────────

export const CapabilitiesBlockSchema = z.object({
  enabled: z.array(CapabilityIdSchema).default([]),
  disabled: z.array(CapabilityIdSchema).default([]),
  config: z.record(z.record(z.unknown())).default({}),
});

// ── Policies ─────────────────────────────────────────────────────────────

export const HagglingPolicySchema = z.object({
  mode: z.enum(['off', 'escalate', 'bounded', 'free']).default('escalate'),
  max_discount_pct: z.number().nonnegative().optional(),
  approval_required_above_pct: z.number().nonnegative().optional(),
  policy_is_one_time: z.boolean().default(false),
  agent_can_remember_policy: z.boolean().default(false),
});

export const EscalationTriggerSchema = z.object({
  condition: z.string(),
  threshold: z.number().optional(),
  escalate_to: z.enum(['owner', 'admin', 'operator']).default('operator'),
});

export const EscalationPolicySchema = z.object({
  triggers: z.array(EscalationTriggerSchema).default([]),
  escalation_message: z.string().optional(),
  response_sla_minutes: z.number().int().positive().optional(),
});

export const ReturnPolicySchema = z.object({
  accepts_returns: z.boolean().default(false),
  return_window_days: z.number().int().nonnegative().optional(),
  conditions: z.string().optional(),
  process_description: z.string().optional(),
});

export const DeliveryPolicySchema = z.object({
  offers_delivery: z.boolean().default(false),
  delivery_radius_km: z.number().nonnegative().optional(),
  delivery_fee_inr: z.number().nonnegative().optional(),
  free_delivery_above_inr: z.number().nonnegative().optional(),
  estimated_time: z.string().optional(),
  cod_available: z.boolean().default(false),
});

export const PaymentPolicySchema = z.object({
  accepted_methods: z
    .array(z.enum(['upi', 'razorpay', 'cash', 'cod', 'bank_transfer', 'credit_30d']))
    .min(1),
  auto_generate_invoice: z.boolean().default(false),
  require_advance_pct: z.number().min(0).max(100).optional(),
});

export const PrivacyPolicySchema = z.object({
  data_retention_days: z.number().int().positive().default(730),
  share_with_third_parties: z.boolean().default(false),
  marketing_opt_in_default: z.boolean().default(false),
});

export const HoursPolicySchema = z.object({
  respond_outside_hours: z.boolean().default(true),
  outside_hours_message: z.string().optional(),
});

export const PoliciesBlockSchema = z.object({
  haggling: HagglingPolicySchema.default({ mode: 'escalate' }),
  escalation: EscalationPolicySchema.default({ triggers: [] }),
  returns: ReturnPolicySchema.default({ accepts_returns: false }),
  delivery: DeliveryPolicySchema.default({ offers_delivery: false }),
  payment: PaymentPolicySchema,
  privacy: PrivacyPolicySchema.default({}),
  hours: HoursPolicySchema.default({ respond_outside_hours: true }),
});

// ── Integrations ─────────────────────────────────────────────────────────

export const IntegrationConfigSchema = z.object({
  provider: z.string(),
  status: z.enum(['connected', 'disconnected', 'error']).default('disconnected'),
  connected_at: z.string().datetime().optional(),
  config: z.record(z.unknown()).default({}),
});

export const CustomApiEndpointSchema = z.object({
  path: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  purpose: z.string(),
  schema: z.record(z.unknown()).default({}),
});

export const IntegrationsBlockSchema = z.object({
  crm: IntegrationConfigSchema.optional(),
  ats: IntegrationConfigSchema.optional(),
  inventory: IntegrationConfigSchema.optional(),
  payments: IntegrationConfigSchema,
  calendar: IntegrationConfigSchema.optional(),
  custom_apis: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        purpose: z.string(),
        base_url: z.string().url(),
        auth_type: z.enum(['bearer', 'api_key', 'basic', 'none']),
        endpoints: z.array(CustomApiEndpointSchema),
      }),
    )
    .default([]),
});

// ── Daemon config ────────────────────────────────────────────────────────

export const DaemonConfigSchema = z.object({
  enabled: z.boolean().default(true),
  schedule_hours: z.number().int().positive().default(6),
  daily_budget_inr: z.number().nonnegative().default(50),
  enabled_jobs: z
    .array(
      z.enum(['reengagement', 'faq_patterns', 'catalog_gaps', 'conversation_review', 'weekly_digest']),
    )
    .default(['reengagement', 'faq_patterns', 'catalog_gaps', 'conversation_review']),
  reengagement_config: z
    .object({
      dormancy_threshold_days: z.number().int().positive().default(60),
      max_per_run: z.number().int().positive().default(100),
    })
    .optional(),
});

// ── LLM config ───────────────────────────────────────────────────────────

export const LLMConfigSchema = z.object({
  preferred_reasoning_model: z.string().optional(),
  max_tokens_per_response: z.number().int().positive().default(500),
});

// ── Discovery ────────────────────────────────────────────────────────────

export const DiscoveryBlockSchema = z.object({
  visible: z.boolean().default(false),
  keywords: z.array(z.string()).default([]),
  service_area: z.object({
    cities: z.array(z.string()).default([]),
    states: z.array(z.string()).default([]),
    nationwide: z.boolean().default(false),
  }),
  specializations: z.array(z.string()).default([]),
});

// ── Meta block ───────────────────────────────────────────────────────────

export const BlueprintMetaSchema = z.object({
  version: z.number().int().nonnegative(),
  is_current: z.boolean().default(true),
  created_at: z.string().datetime(),
  mutated_by: z.string().uuid().nullable(),
  mutation_source: z.enum(['veda', 'dashboard', 'api', 'migration']),
  mutation_reason: z.string().optional(),
  completion_pct: z.number().int().min(0).max(100).default(0),
});

// ── BUSINESS BLUEPRINT ───────────────────────────────────────────────────

export const BusinessBlueprintSchema = z.object({
  schema_version: z.literal('1.0'),
  identity: IdentityBlockSchema,
  locations: z.array(LocationSchema).default([]),
  persona: PersonaSchema,
  catalog: CatalogConfigSchema.default({}),
  capabilities: CapabilitiesBlockSchema.default({ enabled: [], disabled: [], config: {} }),
  policies: PoliciesBlockSchema,
  integrations: IntegrationsBlockSchema,
  daemon: DaemonConfigSchema.default({}),
  llm: LLMConfigSchema.default({}),
  discovery: DiscoveryBlockSchema.default({
    visible: false,
    keywords: [],
    service_area: { cities: [], states: [], nationwide: false },
  }),
  _meta: BlueprintMetaSchema,
});
export type BusinessBlueprint = z.infer<typeof BusinessBlueprintSchema>;

// Partial draft used during onboarding (most blocks optional).
export const BlueprintDraftSchema = BusinessBlueprintSchema.deepPartial();
export type BlueprintDraft = z.infer<typeof BlueprintDraftSchema>;
