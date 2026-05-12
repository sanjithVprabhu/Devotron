import { ProposalsList } from './ProposalsList';

export default function VedaProposalsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Veda proposals</h1>
      <p className="text-sm text-zinc-500 max-w-2xl">
        Veda watches your business in the background and proposes actions — re-engagement, new FAQs,
        catalog gaps, conversation reviews. Approve, edit, or dismiss each card.
      </p>
      <ProposalsList />
    </div>
  );
}
