'use client';

import { useEffect, useRef, useState } from 'react';

interface OutboundContent {
  type: string;
  body_text?: string;
  text?: string;
  buttons?: Array<{ id: string; title: string }>;
  list_sections?: Array<{ items: Array<{ title: string; description?: string }> }>;
}

interface Message {
  id: string;
  role: 'customer' | 'agent';
  text: string;
}

function storageKey(slug: string) {
  return `veda.public-chat.${slug}.v1`;
}

interface Persisted {
  identifier: string;
  messages: Message[];
}

function loadSession(slug: string): Persisted {
  if (typeof window === 'undefined') return { identifier: '', messages: [] };
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { identifier: '', messages: [] };
}

// Mints a stable per-browser anonymous id so a customer's conversation persists
// across reloads even if they don't share their phone number.
function newAnonId(): string {
  const rand = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `anon-${rand.slice(0, 12)}`;
}

function renderOutbound(content: OutboundContent | null | undefined): string {
  if (!content) return '';
  if (content.type === 'text') return content.text || '';
  if (content.type === 'buttons') {
    const body = content.body_text || '';
    const buttons = (content.buttons || []).map((b) => `[${b.title}]`).join(' ');
    return buttons ? `${body}\n\n${buttons}` : body;
  }
  if (content.type === 'list') {
    const body = content.body_text || '';
    const items = (content.list_sections || [])
      .flatMap((s) => s.items || [])
      .map((it) => `• ${it.title}${it.description ? ` — ${it.description}` : ''}`)
      .join('\n');
    return items ? `${body}\n\n${items}` : body;
  }
  return JSON.stringify(content);
}

interface CustomerStatus {
  exists: boolean;
  opt_in?: boolean;
  business_count?: number;
}

export function PublicChat({ slug, businessName }: { slug: string; businessName: string }) {
  const [identifier, setIdentifier] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = loadSession(slug);
    setIdentifier(s.identifier || newAnonId());
    setMessages(s.messages);
  }, [slug]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(storageKey(slug), JSON.stringify({ identifier, messages }));
    if (scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [slug, identifier, messages]);

  // Cross-business identity check — only renders a badge if the feature is on
  // and the customer has opted in. 404 from the API (feature disabled) is
  // silently swallowed.
  useEffect(() => {
    if (!identifier) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/customer-status/${encodeURIComponent(identifier)}`);
        if (res.status === 404) return;
        if (!res.ok) return;
        const data = (await res.json()) as CustomerStatus;
        if (!cancelled) setCustomerStatus(data);
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, [identifier]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const me: Message = { id: crypto.randomUUID(), role: 'customer', text };
    setMessages((m) => [...m, me]);
    setInput('');

    try {
      const res = await fetch(`/api/c/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sender_identifier: identifier }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        reply_text: string | null;
        outbound_content: OutboundContent | null;
      };

      const display =
        renderOutbound(data.outbound_content) ||
        data.reply_text ||
        '(no reply — please try again)';
      const reply: Message = { id: crypto.randomUUID(), role: 'agent', text: display };
      setMessages((m) => [...m, reply]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([]);
    setIdentifier(newAnonId());
    setError(null);
  }

  return (
    <>
      {customerStatus?.opt_in && (customerStatus.business_count ?? 0) > 1 && (
        <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-1.5 text-xs text-emerald-800 text-center">
          Welcome back — you've connected with {customerStatus.business_count} business{(customerStatus.business_count ?? 0) === 1 ? '' : 'es'} on VEDA.
        </div>
      )}

      <div ref={scroller} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-400 text-center pt-12 max-w-md mx-auto">
            <p className="mb-2">Hi — I'm {businessName}'s agent.</p>
            <p>Ask me anything: prices, availability, bookings, what we offer.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'customer'
                  ? 'bg-emerald-600 text-white rounded-br-sm'
                  : 'bg-zinc-100 text-zinc-900 rounded-bl-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm text-zinc-500">
              <span className="inline-block animate-pulse">typing…</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}{' '}
          <button onClick={() => setError(null)} className="underline">
            dismiss
          </button>
        </div>
      )}

      <div className="border-t border-zinc-100 p-2 flex gap-2 bg-white">
        <button
          onClick={reset}
          title="Start a new conversation"
          className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-50"
        >
          ↺
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Type a message…"
          disabled={busy}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </>
  );
}
