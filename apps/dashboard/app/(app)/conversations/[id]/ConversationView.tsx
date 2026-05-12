'use client';

import { useEffect, useState } from 'react';

interface Msg {
  direction: 'inbound' | 'outbound';
  content: { type: string; text?: string; media_url?: string; transcription?: string };
  created_at: string;
  agent_metadata?: Record<string, unknown>;
}

export function ConversationView({ threadId }: { threadId: string }) {
  const [data, setData] = useState<{
    thread: { id: string; status: string; channel: string };
    messages: Msg[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/conversations/${threadId}`);
        if (!res.ok) throw new Error(await res.text());
        if (!cancelled) setData(await res.json());
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };
    tick();
    const id = setInterval(tick, 4000); // simple polling — SSE later
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [threadId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Thread</h1>
          <div className="text-xs text-zinc-500">
            {data.thread.channel} · {data.thread.status}
          </div>
        </div>
        <a className="text-xs text-zinc-500 underline" href="/conversations">
          ← back
        </a>
      </div>
      <ul className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
        {data.messages.map((m, i) => (
          <li
            key={i}
            className={`flex ${m.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                m.direction === 'inbound'
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'bg-zinc-900 text-white'
              }`}
            >
              <div>{m.content.text ?? m.content.transcription ?? `[${m.content.type}]`}</div>
              <div
                className={`mt-1 text-[10px] ${
                  m.direction === 'inbound' ? 'text-zinc-500' : 'text-zinc-400'
                }`}
              >
                {new Date(m.created_at).toLocaleTimeString()}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
