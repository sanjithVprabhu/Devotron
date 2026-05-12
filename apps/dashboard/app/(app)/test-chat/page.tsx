import { TestChat } from './TestChat';

export default function TestChatPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Test chat</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Talk to the agent directly. Bypasses WhatsApp / AiSensy — runs the full
        harness loop, calls real capabilities (catalog, payment, etc), persists
        to MongoDB. Same code path that customers will hit when WhatsApp goes live.
      </p>
      <TestChat />
    </div>
  );
}
