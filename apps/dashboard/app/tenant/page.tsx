import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSql } from '@/lib/db';
import { TenantSwitcher } from './TenantSwitcher';

interface MembershipRow {
  tenant_id: string;
  tenant_name: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
}

export default async function TenantPickerPage() {
  const session = await getSession();
  if (!session.email || !session.principal_id) redirect('/login');

  const sql = getSql();
  const memberships = await sql<MembershipRow[]>`
    SELECT m.tenant_id::text, t.name AS tenant_name, m.role
    FROM core.tenant_memberships m
    JOIN core.tenants t ON t.id = m.tenant_id
    WHERE m.principal_id = ${session.principal_id}::uuid
    ORDER BY t.name ASC
  `;

  if (memberships.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">No business yet</h1>
        <p className="mt-3 text-zinc-500">
          You aren&apos;t a member of any business on VEDA. Set one up by texting Veda on
          WhatsApp, or ask the owner of an existing business to invite you.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold">Choose a business</h1>
      <p className="mt-2 text-sm text-zinc-500">
        You belong to {memberships.length} business{memberships.length === 1 ? '' : 'es'}.
      </p>
      <TenantSwitcher
        memberships={memberships}
        currentTenantId={session.current_tenant_id ?? null}
      />
    </main>
  );
}
