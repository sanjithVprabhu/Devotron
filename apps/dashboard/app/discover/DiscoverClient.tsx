'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Item {
  slug: string;
  name: string;
  vertical: string;
  description: string;
  locations: string[];
  city: string | null;
  distance_km: number | null;
}

const VERTICAL_LABELS: Record<string, string> = {
  auto_parts: 'Auto parts',
  yoga: 'Yoga',
  salon: 'Salon',
  course: 'Online course',
  service: 'Service',
  booking: 'Bookings',
  digital: 'Digital content',
  jobs: 'Jobs',
  consulting: 'Consulting',
  restaurant: 'Restaurant',
  ecommerce: 'E-commerce',
  retail: 'Retail',
  fitness: 'Fitness',
  generic: 'Business',
};

const VERTICAL_FILTER_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'auto_parts', label: 'Products' },
  { value: 'service', label: 'Services' },
  { value: 'salon', label: 'Salons' },
  { value: 'yoga', label: 'Yoga / Fitness' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'course', label: 'Courses' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'jobs', label: 'Jobs' },
];

export function DiscoverClient() {
  const [q, setQ] = useState('');
  const [vertical, setVertical] = useState('');
  const [city, setCity] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(overrideCoords?: { lat: number; lng: number } | null) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (vertical) params.set('vertical', vertical);
      if (city) params.set('city', city);
      const c = overrideCoords ?? coords;
      if (c) {
        params.set('lat', String(c.lat));
        params.set('lng', String(c.lng));
        params.set('radius_km', '25');
      }
      const res = await fetch(`/api/discover?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { items: Item[] };
      setItems(data.items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported in this browser');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setCity(''); // clear city if doing geo
        search(c);
      },
      (err) => {
        setError(`Location denied: ${err.message}`);
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  function clearLocation() {
    setCoords(null);
    search(null);
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="rounded-2xl bg-white border border-zinc-200 p-4 mb-6 space-y-2"
      >
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-[1fr_180px_180px_120px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What are you looking for? (e.g. brake pads, yoga, dosa)"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {VERTICAL_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={!!coords}
            placeholder="City (e.g. Bangalore)"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          {coords ? (
            <>
              <span>📍 Showing results within 25 km of you</span>
              <button
                type="button"
                onClick={clearLocation}
                className="text-zinc-500 underline hover:text-zinc-900"
              >
                clear
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={useMyLocation}
              className="rounded-full border border-zinc-300 px-3 py-1 hover:border-emerald-400 hover:text-emerald-700"
            >
              📍 Use my location
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-zinc-500">
          No businesses match your filters yet. Try a broader search.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((b) => (
          <Link
            key={b.slug}
            href={`/biz/${b.slug}`}
            className="group rounded-2xl border border-zinc-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold">
                {b.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-zinc-900 truncate">{b.name}</div>
                <div className="text-xs uppercase tracking-wide text-emerald-700">
                  {VERTICAL_LABELS[b.vertical] ?? b.vertical}
                </div>
              </div>
            </div>
            {b.description && (
              <p className="text-sm text-zinc-600 line-clamp-3">{b.description}</p>
            )}
            <div className="mt-2 text-xs text-zinc-500 flex items-center gap-2">
              {b.city && <span>{b.city}</span>}
              {!b.city && b.locations[0] && <span>{b.locations[0]}</span>}
              {b.distance_km !== null && (
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                  {b.distance_km < 1 ? '<1 km' : `${b.distance_km} km`}
                </span>
              )}
            </div>
            <div className="mt-3 text-xs text-emerald-700 group-hover:translate-x-0.5 transition">
              Talk to agent →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
