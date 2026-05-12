// Seed the dev database with everything needed to demo the dashboard end-to-end:
//  - Veda's own Principal + identifiers (WhatsApp number from env, Twitter handle)
//  - Sample tenant: Acme Auto Parts (matches the spec's reference customer)
//  - A v1 Blueprint for that tenant
//  - The owner Principal (Rajesh) + an email identifier for dashboard login
//  - tenant_membership: Rajesh → owner of Acme
//  - Sample WhatsApp number row + business profile
//
// Idempotent: safe to run multiple times.

import postgres from 'postgres';

const VEDA_PRINCIPAL_ID = '00000000-0000-0000-0000-000000000001';
const ACME_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RAJESH_PRINCIPAL_ID = '22222222-2222-2222-2222-222222222222';

const ACME_BLUEPRINT_V1 = {
  schema_version: '1.0',
  identity: {
    tenant_id: ACME_TENANT_ID,
    business_name: 'Acme Auto Parts',
    legal_name: 'Acme Automobile Parts Pvt Ltd',
    vertical: 'auto_parts',
    sub_vertical: 'oem_aftermarket',
    description:
      "Bangalore's trusted auto spare parts shop. OEM and aftermarket parts for major Indian car brands. Walk-in, B2B, and delivery available.",
    founded_year: 2004,
    operating_since: 'over 20 years',
  },
  locations: [
    {
      id: 'loc_main',
      label: 'Main Store',
      address: '42, Hosur Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560095',
      country: 'IN',
      is_primary: true,
      hours: {
        monday: { open: '09:00', close: '20:00' },
        tuesday: { open: '09:00', close: '20:00' },
        wednesday: { open: '09:00', close: '20:00' },
        thursday: { open: '09:00', close: '20:00' },
        friday: { open: '09:00', close: '20:00' },
        saturday: { open: '09:00', close: '18:00' },
        sunday: { open: '10:00', close: '15:00' },
        holidays: [],
      },
      serves_radius_km: 10,
    },
  ],
  persona: {
    agent_name: 'Acme Assistant',
    base_tone: 'friendly',
    adapts_to_user_tone: true,
    languages: [
      { code: 'kn', name: 'Kannada', proficiency: 'primary', script: 'kannada' },
      { code: 'hi', name: 'Hindi', proficiency: 'primary', script: 'devanagari' },
      { code: 'en', name: 'English', proficiency: 'primary' },
    ],
    sign_off: '- Acme Auto Parts Team',
    persona_examples: [],
    prohibited_topics: ["competitors' pricing", 'politics'],
  },
  catalog: {
    item_count: 0,
    source: { type: 'manual', auto_sync: false },
    display_config: { items_per_page: 5, show_price: true, show_stock: true, show_images: false },
    search_config: {
      enable_semantic_search: true,
      enable_vehicle_compatibility: true,
      fuzzy_matching: true,
    },
    pricing_config: { currency: 'INR', include_gst: true, gst_rate: 18, show_mrp: false },
  },
  capabilities: {
    enabled: [
      'catalog.search',
      'catalog.update',
      'catalog.vehicle_compat_lookup',
      'payment.razorpay.create_link',
      'payment.razorpay.verify',
      'payment.upi_manual.get_details',
      'payment.cod.confirm',
      'broadcast.send',
      'support.faq.search',
      'support.faq.add',
      'support.escalation.create',
      'recommendations.similar_items',
      'media.transcribe',
      'media.image_analyze',
      'template.lookup',
    ],
    disabled: ['scheduling.calendar.book', 'a2a.transact'],
    config: {
      'payment.razorpay': { currency: 'INR' },
      'negotiation.bounded': { max_discount_pct: 10, approval_required_above_pct: 5 },
      'broadcast.send': { max_per_day: 500, require_approval: true },
    },
  },
  policies: {
    haggling: {
      mode: 'bounded',
      max_discount_pct: 10,
      approval_required_above_pct: 5,
      agent_can_remember_policy: true,
    },
    escalation: {
      triggers: [
        { condition: 'order_value_above', threshold: 10000, escalate_to: 'owner' },
        { condition: 'refund_request', escalate_to: 'owner' },
        { condition: 'complaint', escalate_to: 'operator' },
      ],
      escalation_message:
        "Let me connect you with our team for this. They'll respond within 30 minutes.",
      response_sla_minutes: 30,
    },
    returns: {
      accepts_returns: true,
      return_window_days: 7,
      conditions: 'Unused, in original packaging, with receipt',
    },
    delivery: {
      offers_delivery: true,
      delivery_radius_km: 10,
      delivery_fee_inr: 80,
      free_delivery_above_inr: 2000,
      estimated_time: '2-4 hours',
      cod_available: true,
    },
    payment: {
      accepted_methods: ['upi', 'razorpay', 'cash', 'cod'],
      auto_generate_invoice: true,
    },
    privacy: {
      data_retention_days: 730,
      share_with_third_parties: false,
      marketing_opt_in_default: true,
    },
    hours: {
      respond_outside_hours: true,
      outside_hours_message:
        "Hi! Our shop is currently closed. We'll respond first thing when we open. Mon-Fri 9-8, Sat 9-6, Sun 10-3.",
    },
  },
  integrations: {
    payments: { provider: 'razorpay', status: 'disconnected', config: {} },
  },
  daemon: {
    enabled: true,
    schedule_hours: 6,
    daily_budget_inr: 50,
    enabled_jobs: ['reengagement', 'faq_patterns', 'catalog_gaps', 'conversation_review'],
    reengagement_config: { dormancy_threshold_days: 60, max_per_run: 100 },
  },
  llm: { max_tokens_per_response: 500 },
  discovery: {
    visible: true,
    keywords: ['auto parts', 'car parts', 'brake pads', 'Maruti', 'Hyundai', 'spare parts', 'Bangalore'],
    service_area: { cities: ['Bengaluru'], states: ['Karnataka'], nationwide: false },
    specializations: ['Japanese cars', 'Korean cars', 'OEM compatibility lookup'],
  },
  _meta: {
    version: 1,
    is_current: true,
    created_at: new Date().toISOString(),
    mutated_by: RAJESH_PRINCIPAL_ID,
    mutation_source: 'migration',
    completion_pct: 92,
  },
};

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('POSTGRES_URL is required');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'rajesh@acme.local';

  await sql`
    INSERT INTO core.principals (id, display_name, metadata)
    VALUES (${VEDA_PRINCIPAL_ID}::uuid, 'Veda', '{"system": true}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
  if (process.env.VEDA_PHONE_NUMBER) {
    await sql`
      INSERT INTO core.identifiers (principal_id, channel, identifier, verified)
      VALUES (${VEDA_PRINCIPAL_ID}::uuid, 'whatsapp', ${process.env.VEDA_PHONE_NUMBER}, TRUE)
      ON CONFLICT (channel, identifier) DO NOTHING
    `;
  }
  await sql`
    INSERT INTO core.identifiers (principal_id, channel, identifier, verified)
    VALUES (${VEDA_PRINCIPAL_ID}::uuid, 'twitter', ${process.env.TWITTER_HANDLE ?? 'veda_bot'}, TRUE)
    ON CONFLICT (channel, identifier) DO NOTHING
  `;

  await sql`
    INSERT INTO core.tenants (id, name, slug, status, tier, vertical, country_code, currency_code)
    VALUES (${ACME_TENANT_ID}::uuid, 'Acme Auto Parts', 'acme-auto-parts', 'active', 'starter', 'auto_parts', 'IN', 'INR')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO business.profiles (tenant_id, legal_name, operating_address, verification_status)
    VALUES (${ACME_TENANT_ID}::uuid, 'Acme Automobile Parts Pvt Ltd', '42, Hosur Road, Bengaluru 560095', 'unverified')
    ON CONFLICT (tenant_id) DO NOTHING
  `;

  await sql`
    INSERT INTO core.principals (id, display_name, metadata)
    VALUES (${RAJESH_PRINCIPAL_ID}::uuid, 'Rajesh', '{"role": "owner"}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO core.identifiers (principal_id, channel, identifier, verified)
    VALUES (${RAJESH_PRINCIPAL_ID}::uuid, 'email', ${ownerEmail}, TRUE)
    ON CONFLICT (channel, identifier) DO NOTHING
  `;

  await sql`
    INSERT INTO core.tenant_memberships (tenant_id, principal_id, role, joined_at)
    VALUES (${ACME_TENANT_ID}::uuid, ${RAJESH_PRINCIPAL_ID}::uuid, 'owner', NOW())
    ON CONFLICT (tenant_id, principal_id) DO NOTHING
  `;

  await sql`
    INSERT INTO business.whatsapp_numbers (tenant_id, phone_number, display_name, status, waba_id, phone_number_id, is_primary)
    VALUES (${ACME_TENANT_ID}::uuid, '+910000000000', 'Acme Auto Parts', 'pending', 'placeholder_waba', 'placeholder_phone', TRUE)
    ON CONFLICT (phone_number) DO NOTHING
  `;

  const existing = await sql<Array<{ version: number }>>`
    SELECT version FROM blueprints.versions WHERE tenant_id = ${ACME_TENANT_ID}::uuid AND is_current = TRUE
  `;
  if (existing.length === 0) {
    await sql`
      INSERT INTO blueprints.versions
        (tenant_id, version, is_current, content, mutated_by, mutation_source, mutation_reason)
      VALUES (${ACME_TENANT_ID}::uuid, 1, TRUE, ${JSON.stringify(ACME_BLUEPRINT_V1)}::jsonb,
              ${RAJESH_PRINCIPAL_ID}::uuid, 'migration', 'initial seed')
    `;
    console.log('blueprint v1 created for acme-auto-parts');
  } else {
    console.log(`blueprint already exists at version ${existing[0]!.version}, skipping`);
  }

  console.log(`\nseed complete.\nlogin to dashboard with: ${ownerEmail}\n`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
