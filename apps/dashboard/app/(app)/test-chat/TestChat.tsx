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

const STORAGE_KEY = 'veda.test-chat.v1';

type AgentMode = 'business' | 'veda';
type ChatMode = 'customer' | 'admin';

interface SessionState {
  phone: string;
  messages: Message[];
  agent: AgentMode;
  mode: ChatMode;
}

function loadSession(): SessionState {
  if (typeof window === 'undefined') return { phone: '', messages: [], agent: 'business', mode: 'customer' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { agent: 'business', mode: 'customer', ...JSON.parse(raw) };
  } catch {}
  return { phone: '', messages: [], agent: 'business', mode: 'customer' };
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

export function TestChat() {
  const [phone, setPhone] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [agent, setAgent] = useState<AgentMode>('business');
  const [mode, setMode] = useState<ChatMode>('customer');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = loadSession();
    setPhone(s.phone || `+9199${Math.floor(10000000 + Math.random() * 89999999)}`);
    setMessages(s.messages);
    setAgent(s.agent || 'business');
    setMode(s.mode || 'customer');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ phone, messages, agent, mode }));
    if (scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [phone, messages, agent, mode]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const me: Message = { id: crypto.randomUUID(), role: 'customer', text };
    setMessages((m) => [...m, me]);
    setInput('');

    try {
      const res = await fetch('/api/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sender_identifier: phone, agent, mode }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        reply_text: string | null;
        outbound_content: OutboundContent | null;
      };

      const display = renderOutbound(data.outbound_content) || data.reply_text || '(no reply — check harness journal)';
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
    setError(null);
    setPhone(`+9199${Math.floor(10000000 + Math.random() * 89999999)}`);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-500">
          <span>Talking to:</span>
          <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
            <button
              onClick={() => setAgent('business')}
              className={`px-2 py-0.5 text-xs ${
                agent === 'business' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
              title="Your business agent (uses current tenant's blueprint + catalog)"
            >
              Business agent
            </button>
            <button
              onClick={() => setAgent('veda')}
              className={`px-2 py-0.5 text-xs ${
                agent === 'veda' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
              title="Veda meta-agent (sets up new businesses by interview)"
            >
              Veda (setup)
            </button>
          </div>
          {agent === 'business' && (
            <>
              <span className="text-zinc-400">|</span>
              <span>As:</span>
              <div className="inline-flex rounded-md border border-zinc-300 overflow-hidden">
                <button
                  onClick={() => setMode('customer')}
                  className={`px-2 py-0.5 text-xs ${
                    mode === 'customer' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                  title="Talk as a customer (uses the phone below as your identity)"
                >
                  Customer
                </button>
                <button
                  onClick={() => setMode('admin')}
                  className={`px-2 py-0.5 text-xs ${
                    mode === 'admin' ? 'bg-emerald-700 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                  title="Talk as the owner of this tenant — unlocks catalog.add, broadcast, etc."
                >
                  Owner (admin)
                </button>
              </div>
            </>
          )}
          <span className="text-zinc-400">|</span>
          <span>Phone:</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-0.5 font-mono text-xs"
            style={{ width: '14ch' }}
          />
        </div>
        <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-900">
          New conversation
        </button>
      </div>

      <div ref={scroller} className="h-[60vh] overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-400 text-center pt-12 max-w-md mx-auto">
            {agent === 'business' && mode === 'customer' && (
              <>Try: <em>"Do you have Bosch brake pads?"</em> — or ask anything a customer might ask</>
            )}
            {agent === 'business' && mode === 'admin' && (
              <>You're talking as the business owner. Try: <em>"Add a product called Brembo Front Pads, ₹1900, 4 in stock"</em>, or <em>"list my items"</em>, or <em>"delete the Bosch rear shoe"</em></>
            )}
            {agent === 'veda' && (
              <>Say <em>"hi"</em> or describe your business — Veda will interview you and set up a new tenant. Try: <em>"I run a yoga studio in Indiranagar"</em></>
            )}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'customer'
                  ? 'bg-zinc-900 text-white rounded-br-sm'
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
              <span className="inline-block animate-pulse">thinking...</span>
            </div>
          </div>
        )}
      </div>

      {error && <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}

      <div className="border-t border-zinc-100 p-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Type a message..."
          disabled={busy}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
