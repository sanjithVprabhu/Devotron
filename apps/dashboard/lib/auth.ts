// Server-side auth helpers used by route handlers and protected pages.

import { redirect } from 'next/navigation';
import { type DashboardSession, getSession } from './session.js';

export async function requireSession(): Promise<DashboardSession & { email: string }> {
  const session = await getSession();
  if (!session.email) {
    redirect('/login');
  }
  return session as DashboardSession & { email: string };
}

export async function requireTenant(): Promise<DashboardSession & { email: string; current_tenant_id: string }> {
  const session = await requireSession();
  if (!session.current_tenant_id) {
    redirect('/tenant');
  }
  return session as DashboardSession & { email: string; current_tenant_id: string };
}
