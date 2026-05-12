import { z } from 'zod';
import type { TenantRole } from './identity.js';

export const PermissionSchema = z.enum([
  'blueprint.read',
  'blueprint.mutate',
  'conversation.read',
  'conversation.takeover',
  'conversation.assign',
  'order.read',
  'order.update',
  'order.refund',
  'catalog.read',
  'catalog.add',
  'catalog.update',
  'catalog.delete',
  'team.invite',
  'team.remove',
  'team.role_change',
  'billing.read',
  'billing.manage',
  'daemon.proposals.read',
  'daemon.proposals.approve',
  'analytics.read',
  'broadcast.send',
  'integrations.manage',
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const ROLE_PERMISSIONS: Record<TenantRole, Permission[] | '*'> = {
  owner: '*',
  admin: [
    'blueprint.read',
    'blueprint.mutate',
    'conversation.read',
    'conversation.takeover',
    'conversation.assign',
    'order.read',
    'order.update',
    'order.refund',
    'catalog.read',
    'catalog.add',
    'catalog.update',
    'catalog.delete',
    'team.invite',
    'team.remove',
    'team.role_change',
    'daemon.proposals.read',
    'daemon.proposals.approve',
    'analytics.read',
    'broadcast.send',
    'integrations.manage',
  ],
  operator: [
    'blueprint.read',
    'conversation.read',
    'conversation.takeover',
    'order.read',
    'order.update',
    'catalog.read',
    'catalog.update',
    'daemon.proposals.read',
    'analytics.read',
  ],
  viewer: [
    'blueprint.read',
    'conversation.read',
    'order.read',
    'catalog.read',
    'analytics.read',
  ],
};

export function hasPermission(
  role: TenantRole,
  granted: Permission[] | undefined,
  required: Permission,
): boolean {
  const base = ROLE_PERMISSIONS[role];
  if (base === '*') return true;
  if (base.includes(required)) return true;
  return Boolean(granted?.includes(required));
}
