import Link from 'next/link';

export function TenantBadge({
  name,
  role,
}: {
  name?: string;
  role?: 'owner' | 'admin' | 'operator' | 'viewer';
}) {
  if (!name) {
    return (
      <Link
        href="/tenant"
        className="block rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900 hover:bg-amber-100"
      >
        Choose a business →
      </Link>
    );
  }
  return (
    <Link
      href="/tenant"
      className="block rounded-md border border-zinc-200 bg-white px-2 py-2 hover:bg-zinc-50"
      title="Switch business"
    >
      <div className="text-xs text-zinc-500 uppercase tracking-wide">Business</div>
      <div className="text-sm font-medium truncate">{name}</div>
      {role && <div className="text-[11px] text-zinc-500">{role}</div>}
    </Link>
  );
}
