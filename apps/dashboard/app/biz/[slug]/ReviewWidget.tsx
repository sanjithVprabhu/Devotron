'use client';

import { useEffect, useState } from 'react';

interface Review {
  id: string;
  rating: number;
  tags: string[] | null;
  collected_at: string;
}

interface ReviewData {
  count: number;
  average: number | null;
  reviews: Review[];
}

const STORAGE_KEY = 'veda.public-reviewer';

function getOrMintIdentifier(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    const rand = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
    id = `anon-${rand}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function ReviewWidget({ slug, businessName }: { slug: string; businessName: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(slug)}`);
      if (res.status === 404) {
        // Either business not found OR feature disabled — silent
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ReviewData;
      setData(json);
    } catch (e) {
      console.warn('reviews load failed', e);
    }
  }

  useEffect(() => {
    load();
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6);
      const res = await fetch(`/api/reviews/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, tags, sender_identifier: getOrMintIdentifier() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setThanks(true);
      setShowForm(false);
      setRating(0);
      setTagsInput('');
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Don't render anything if reviews feature is disabled (404 from API gives null data + no errors)
  if (data === null) return null;

  return (
    <div className="border-t border-zinc-100 pt-4 mt-2">
      {data.count > 0 ? (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Stars value={data.average ?? 0} />
            <span className="text-sm font-medium">
              {data.average?.toFixed(1)} <span className="text-zinc-400">· {data.count} review{data.count === 1 ? '' : 's'}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-400 mb-3 text-center">
          No reviews yet. Be the first.
        </div>
      )}

      {thanks && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 text-center mb-2">
          Thanks for your review!
        </div>
      )}

      {!showForm && !thanks && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full text-xs text-zinc-600 hover:text-zinc-900 underline"
        >
          Leave a review
        </button>
      )}

      {showForm && (
        <form onSubmit={submit} className="space-y-2">
          <div className="text-xs text-zinc-600 text-center">
            How was your experience with {businessName}?
          </div>
          <div className="flex justify-center">
            <RatingPicker value={rating} onChange={setRating} />
          </div>
          <input
            type="text"
            placeholder="Tags (optional, comma-separated): fast, friendly"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-xs"
          />
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || rating < 1}
              className="flex-1 rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      )}

      {data.reviews.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.reviews.slice(0, 5).map((r) => (
            <li key={r.id} className="text-xs flex items-center justify-between">
              <Stars value={r.rating} small />
              {r.tags && r.tags.length > 0 && (
                <span className="text-zinc-500 truncate ml-2">{r.tags.join(' · ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stars({ value, small }: { value: number; small?: boolean }) {
  const full = Math.round(value);
  const size = small ? 'text-sm' : 'text-base';
  return (
    <span className={`${size} text-amber-500 leading-none`}>
      {'★'.repeat(Math.max(0, Math.min(5, full)))}
      <span className="text-zinc-300">{'★'.repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

function RatingPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-2xl leading-none ${n <= value ? 'text-amber-500' : 'text-zinc-300 hover:text-amber-300'}`}
          aria-label={`${n} stars`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
