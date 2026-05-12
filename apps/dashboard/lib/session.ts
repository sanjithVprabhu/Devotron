// Iron-session-backed cookie session for the dashboard.
// Stores: user email, current tenant id, role.

import { type SessionOptions, getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface DashboardSession {
  email?: string;
  principal_id?: string;
  current_tenant_id?: string;
  current_tenant_name?: string;
  current_role?: 'owner' | 'admin' | 'operator' | 'viewer';
}

const password =
  process.env.SESSION_SECRET ??
  // 32-char default for local dev so we don't crash on `pnpm dev` with no .env.
  // NEVER use this in prod — set SESSION_SECRET to a random 32-byte hex string.
  'veda-dev-session-secret-change-me-32';

export const sessionOptions: SessionOptions = {
  password,
  cookieName: 'veda_dashboard_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  return getIronSession<DashboardSession>(await cookies(), sessionOptions);
}
