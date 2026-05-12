import { notFound } from 'next/navigation';
import { isEnabled } from '@/lib/features';
import { AgentNetworkSettings } from './AgentNetworkSettings';

export default function AgentNetworkPage() {
  if (!isEnabled('phase_3_a2a')) notFound();
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Agent network</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Settings for cross-agent communication on VEDA. List your agent so other
        agents can find and call it (with your approval), and review pending inbound
        requests.
      </p>
      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 mb-6">
        <strong>Phase 3 primitives.</strong> The cross-agent wire format isn't
        live yet — what's here today is the registry, the capability slot, and
        owner-approval gates. Real cross-agent calls will ship once enough merchants
        are on the platform to drive concrete demand.
      </div>
      <AgentNetworkSettings />
    </div>
  );
}
