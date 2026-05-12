import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { TenantBadge } from '@/components/TenantBadge';
import { getSession } from '@/lib/session';

const NAV: Array<{ href: string; label: string }> = [
  { href: '/overview', label: 'Overview' },
  { href: '/test-chat', label: 'Test chat' },
  { href: '/conversations', label: 'Conversations' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/orders', label: 'Orders' },
  { href: '/veda', label: 'Veda proposals' },
  { href: '/blueprint', label: 'Blueprint' },
  { href: '/team', label: 'Team' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/integrations/payment', label: 'Payments' },
  { href: '/api-tools', label: 'API tools' },
  { href: '/agent-network', label: 'Agent network' },
];

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.email) redirect('/login');

  return (
    <div className="flex min-h-dvh">
      <aside className="w-60 border-r border-zinc-200 bg-white/60 backdrop-blur p-4 flex flex-col gap-2">
        <h1 className="text-sm font-semibold tracking-wide text-zinc-500 mb-1">VEDA</h1>
        <TenantBadge name={session.current_tenant_name} role={session.current_role} />
        <nav className="mt-2 flex-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 truncate">
          {session.email}
        </div>
        <LogoutButton />
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
