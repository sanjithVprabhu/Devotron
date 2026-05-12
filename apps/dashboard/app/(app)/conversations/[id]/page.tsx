import { ConversationView } from './ConversationView';

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConversationView threadId={id} />;
}
