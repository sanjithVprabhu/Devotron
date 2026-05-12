'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Membership {
  tenant_id: string;
  tenant_name: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
}

export function TenantSwitcher({
  memberships,
  currentTenantId,
}: {
  memberships: Membership[];
  currentTenantId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function pick(tenantId: string) {
    setBusy(tenantId);
    try {
      const res = await fetch('/api/tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      if (res.ok) router.push('/');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 space-y-2">
      {memberships.map((m) => {
        const isCurrent = m.tenant_id === currentTenantId;
        return (
          <button
            key={m.tenant_id}
            disabled={busy === m.tenant_id}
            onClick={() => pick(m.tenant_id)}
            className={`w-full text-left rounded-md border px-4 py-3 transition ${
              isCurrent
                ? 'border-zinc-900 bg-zinc-50'
                : 'border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{m.tenant_name}</div>
                <div className="text-xs text-zinc-500">{m.role}</div>
              </div>
              {isCurrent && <span className="text-xs text-zinc-500">current</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
