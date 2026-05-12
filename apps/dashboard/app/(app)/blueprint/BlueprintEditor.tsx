'use client';

import { useEffect, useState } from 'react';

export function BlueprintEditor() {
  const [version, setVersion] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/blueprint');
      if (!res.ok) {
        setError('No current blueprint for this tenant.');
        return;
      }
      const data = (await res.json()) as { version: number; content: unknown };
      setVersion(data.version);
      const pretty = JSON.stringify(data.content, null, 2);
      setText(pretty);
      setOriginal(pretty);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = JSON.parse(text);
      const res = await fetch('/api/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mutation_reason: reason }),
      });
      if (!res.ok) {
        setError(await res.text());
      } else {
        const data = (await res.json()) as { version: number };
        setInfo(`Saved as version ${data.version}.`);
        setReason('');
        load();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const dirty = text !== original;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Current version: {version ?? '—'}</span>
        {dirty && <span className="text-amber-700">Unsaved changes</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="w-full h-[60vh] rounded-2xl border border-zinc-200 bg-white p-4 font-mono text-xs"
      />
      <div className="flex gap-2">
        <input
          placeholder="Reason for this change (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save new version'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-emerald-700">{info}</p>}
    </div>
  );
}
