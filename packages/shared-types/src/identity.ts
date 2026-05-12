import { z } from 'zod';

export const ChannelSchema = z.enum(['whatsapp', 'twitter', 'telegram', 'instagram', 'email', 'internal']);
export type Channel = z.infer<typeof ChannelSchema>;

export const PrincipalRoleSchema = z.enum(['end_user', 'business_owner', 'business_team_member', 'business_agent']);
export type PrincipalRole = z.infer<typeof PrincipalRoleSchema>;

export const TenantRoleSchema = z.enum(['owner', 'admin', 'operator', 'viewer']);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

export const TenantStatusSchema = z.enum(['pending', 'active', 'suspended', 'churned']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantTierSchema = z.enum(['free', 'starter', 'growth', 'pro', 'enterprise']);
export type TenantTier = z.infer<typeof TenantTierSchema>;

export const PrincipalSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});
export type Principal = z.infer<typeof PrincipalSchema>;

export const IdentifierSchema = z.object({
  id: z.string().uuid(),
  principal_id: z.string().uuid(),
  channel: ChannelSchema,
  identifier: z.string().min(1),
  verified: z.boolean(),
  created_at: z.string().datetime(),
});
export type Identifier = z.infer<typeof IdentifierSchema>;

export const TenantMembershipSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  principal_id: z.string().uuid(),
  role: TenantRoleSchema,
  permissions: z.array(z.string()).default([]),
  invited_by: z.string().uuid().nullable(),
  joined_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type TenantMembership = z.infer<typeof TenantMembershipSchema>;

export const LinkingCodeSchema = z.object({
  code: z.string().min(4).max(32),
  principal_id: z.string().uuid(),
  source_channel: ChannelSchema,
  expires_at: z.string().datetime(),
  used_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type LinkingCode = z.infer<typeof LinkingCodeSchema>;

// E.164 phone number normalisation.
const E164 = /^\+[1-9]\d{6,14}$/;

export function normalizeIdentifier(channel: Channel, raw: string): string {
  if (channel === 'whatsapp') {
    const digits = raw.replace(/[^\d+]/g, '');
    const candidate = digits.startsWith('+') ? digits : `+${digits}`;
    if (!E164.test(candidate)) {
      throw new Error(`invalid E.164 phone number: ${raw}`);
    }
    return candidate;
  }
  if (channel === 'twitter') {
    return raw.replace(/^@/, '').toLowerCase();
  }
  if (channel === 'email') {
    return raw.trim().toLowerCase();
  }
  return raw;
}
