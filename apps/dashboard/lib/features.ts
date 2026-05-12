// Feature flags — single source of truth.
//
// Flags resolve in this order:
//   1. Per-tenant override in `core.tenants.metadata.feature_flags` (JSONB)
//   2. Global env var FEATURE_<FLAG_NAME>=true
//   3. Hardcoded default below
//
// Phase rollout strategy:
//   - Phase 1 (storefront, profile, payments) → ON by default once code lands
//   - Phase 2 (directory, search, geo, reviews) → OFF until 5+ live merchants
//   - Phase 3 (A2A) → OFF until real cross-agent demand
//
// Flip a phase: set FEATURE_PHASE_2=true in env and restart, or override on a
// tenant row to canary-release to one business first.

export type FeatureFlag =
  | 'phase_1_storefront'
  | 'phase_1_payments'
  | 'phase_2_directory'
  | 'phase_2_search'
  | 'phase_2_geo'
  | 'phase_2_reviews'
  | 'phase_2_cross_business_identity'
  | 'phase_3_a2a';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  phase_1_storefront: true,
  phase_1_payments: true,
  phase_2_directory: false,
  phase_2_search: false,
  phase_2_geo: false,
  phase_2_reviews: false,
  phase_2_cross_business_identity: false,
  phase_3_a2a: false,
};

function envFlag(flag: FeatureFlag): boolean | undefined {
  const v = process.env[`FEATURE_${flag.toUpperCase()}`];
  if (v === undefined) return undefined;
  return v.toLowerCase() === 'true' || v === '1';
}

export function isEnabled(flag: FeatureFlag, tenantOverrides?: Record<string, boolean> | null): boolean {
  if (tenantOverrides && flag in tenantOverrides) return tenantOverrides[flag] === true;
  const env = envFlag(flag);
  if (env !== undefined) return env;
  return DEFAULTS[flag];
}

export function allFlags(tenantOverrides?: Record<string, boolean> | null): Record<FeatureFlag, boolean> {
  const out = {} as Record<FeatureFlag, boolean>;
  (Object.keys(DEFAULTS) as FeatureFlag[]).forEach((k) => {
    out[k] = isEnabled(k, tenantOverrides);
  });
  return out;
}
