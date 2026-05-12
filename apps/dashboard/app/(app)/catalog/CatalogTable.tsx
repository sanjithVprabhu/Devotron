'use client';

import { useEffect, useState } from 'react';

interface Item {
  item_id: string;
  vertical: string;
  status: string;
  data: Record<string, unknown>;
}

type VerticalKey = 'product' | 'service' | 'booking' | 'digital' | 'job';

const VERTICAL_OPTIONS: { value: string; label: VerticalKey; description: string }[] = [
  { value: 'auto_parts', label: 'product', description: 'Physical product (auto parts, retail, FMCG, electronics)' },
  { value: 'service', label: 'service', description: 'Service with a duration (consulting, repair, salon, fitness)' },
  { value: 'booking', label: 'booking', description: 'Time-slotted booking (clinic, restaurant, appointment)' },
  { value: 'digital', label: 'digital', description: 'Digital content (course, video, ebook, subscription)' },
  { value: 'jobs', label: 'job', description: 'Job listing (recruiting vertical)' },
];

function verticalKind(v: string): VerticalKey {
  const x = (v || '').toLowerCase();
  if (['auto_parts', 'product', 'retail', 'fmcg', 'fashion', 'electronics'].includes(x)) return 'product';
  if (['service', 'salon', 'consulting', 'repair', 'fitness', 'tutoring', 'wellness'].includes(x)) return 'service';
  if (['booking', 'appointment', 'reservation', 'clinic', 'restaurant'].includes(x)) return 'booking';
  if (['digital', 'course', 'video', 'ebook', 'subscription', 'saas'].includes(x)) return 'digital';
  if (['job', 'jobs'].includes(x)) return 'job';
  return 'product';
}

function formatPrice(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

function detailFor(item: Item): string {
  const k = verticalKind(item.vertical);
  const d = item.data;
  if (k === 'product') {
    const stock = d.stock_qty as number | undefined;
    const brand = d.brand as string | undefined;
    return [brand, stock !== undefined ? `${stock} in stock` : undefined].filter(Boolean).join(' · ') || '—';
  }
  if (k === 'service') {
    const dur = d.duration_minutes as number | undefined;
    const loc = d.location as string | undefined;
    return [dur ? `${dur} min` : undefined, loc].filter(Boolean).join(' · ') || '—';
  }
  if (k === 'booking') {
    const dur = d.duration_minutes as number | undefined;
    const cap = d.capacity as number | undefined;
    return [dur ? `${dur} min` : undefined, cap ? `cap ${cap}` : undefined].filter(Boolean).join(' · ') || '—';
  }
  if (k === 'digital') {
    const len = (d.length_minutes ?? d.duration_minutes) as number | undefined;
    const modules = d.module_count as number | undefined;
    return [len ? `${len} min` : undefined, modules ? `${modules} modules` : undefined].filter(Boolean).join(' · ') || '—';
  }
  if (k === 'job') {
    const loc = d.location as string | undefined;
    const mode = d.work_mode as string | undefined;
    return [loc, mode].filter(Boolean).join(' · ') || '—';
  }
  return '—';
}

export function CatalogTable() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<VerticalKey | 'all'>('all');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/catalog');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { items: Item[] };
      setItems(data.items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return;
    await fetch(`/api/catalog/${id}`, { method: 'DELETE' });
    load();
  }

  const visible = filter === 'all' ? items : items.filter((it) => verticalKind(it.vertical) === filter);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-600">{visible.length} items</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as VerticalKey | 'all')}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          >
            <option value="all">All types</option>
            <option value="product">Products</option>
            <option value="service">Services</option>
            <option value="booking">Bookings</option>
            <option value="digital">Digital</option>
            <option value="job">Jobs</option>
          </select>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm"
        >
          {showForm ? 'Cancel' : 'Add item'}
        </button>
      </div>
      {showForm && (
        <AddItemForm
          onAdded={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-zinc-500">
          No items yet. Click "Add item" to get started.
        </div>
      ) : (
        <table className="w-full rounded-2xl border border-zinc-200 bg-white text-sm overflow-hidden">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 bg-zinc-50">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3">Type</th>
              <th className="p-3">Details</th>
              <th className="p-3 text-right">Price</th>
              <th className="p-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.map((it) => {
              const k = verticalKind(it.vertical);
              const name = (it.data.name as string | undefined) ?? (it.data.title as string | undefined) ?? it.item_id;
              const imageUrl = (it.data.image_url as string | undefined) ?? ((it.data.images as string[] | undefined) ?? [])[0];
              return (
                <tr key={it.item_id}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="h-9 w-9 rounded object-cover border border-zinc-200" />
                      ) : (
                        <div className="h-9 w-9 rounded bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 text-[10px]">
                          —
                        </div>
                      )}
                      <span className="font-medium">{name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-700">
                      {k}
                    </span>
                  </td>
                  <td className="p-3 text-zinc-600">{detailFor(it)}</td>
                  <td className="p-3 text-right">{formatPrice(it.data.price_inr)}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => deleteItem(it.item_id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AddItemForm({ onAdded }: { onAdded: () => void }) {
  const [vertical, setVertical] = useState<string>('auto_parts');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Common fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Product
  const [brand, setBrand] = useState('');
  const [stock, setStock] = useState('');
  const [mrp, setMrp] = useState('');

  // Service / booking / digital
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [moduleCount, setModuleCount] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  // Job
  const [company, setCompany] = useState('');
  const [workMode, setWorkMode] = useState('onsite');
  const [ctcMin, setCtcMin] = useState('');
  const [ctcMax, setCtcMax] = useState('');

  const kind = verticalKind(vertical);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const data: Record<string, unknown> = { name };
      if (description) data.description = description;
      if (price) data.price_inr = Number(price);
      if (imageUrl) data.image_url = imageUrl;

      if (kind === 'product') {
        if (brand) data.brand = brand;
        if (stock) data.stock_qty = Number(stock);
        if (mrp) data.mrp_inr = Number(mrp);
      } else if (kind === 'service') {
        if (duration) data.duration_minutes = Number(duration);
        if (location) data.location = location;
      } else if (kind === 'booking') {
        if (duration) data.duration_minutes = Number(duration);
        if (capacity) data.capacity = Number(capacity);
      } else if (kind === 'digital') {
        if (duration) data.length_minutes = Number(duration);
        if (moduleCount) data.module_count = Number(moduleCount);
        if (previewUrl) data.preview_url = previewUrl;
      } else if (kind === 'job') {
        if (company) data.company = company;
        if (location) data.location = location;
        if (workMode) data.work_mode = workMode;
        if (ctcMin) data.ctc_min = Number(ctcMin);
        if (ctcMax) data.ctc_max = Number(ctcMax);
        data.title = name;
      }

      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical, data }),
      });
      if (!res.ok) throw new Error(await res.text());
      onAdded();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
      <div>
        <label className="text-xs uppercase tracking-wide text-zinc-500">Type</label>
        <select
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        >
          {VERTICAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} — {opt.description}
            </option>
          ))}
        </select>
      </div>

      <Field label={kind === 'job' ? 'Job title' : 'Name'} value={name} onChange={setName} required />
      <Field label="Description (optional)" value={description} onChange={setDescription} />
      <Field label="Image URL (optional)" value={imageUrl} onChange={setImageUrl} placeholder="https://..." />

      {kind !== 'job' && <Field label="Price ₹" type="number" value={price} onChange={setPrice} />}

      {kind === 'product' && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Brand" value={brand} onChange={setBrand} />
          <Field label="MRP ₹" type="number" value={mrp} onChange={setMrp} />
          <Field label="Stock qty" type="number" value={stock} onChange={setStock} />
        </div>
      )}

      {kind === 'service' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Duration (min)" type="number" value={duration} onChange={setDuration} />
          <Field label="Location" value={location} onChange={setLocation} />
        </div>
      )}

      {kind === 'booking' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Slot duration (min)" type="number" value={duration} onChange={setDuration} />
          <Field label="Capacity" type="number" value={capacity} onChange={setCapacity} />
        </div>
      )}

      {kind === 'digital' && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Length (min)" type="number" value={duration} onChange={setDuration} />
          <Field label="# modules" type="number" value={moduleCount} onChange={setModuleCount} />
          <Field label="Preview URL" value={previewUrl} onChange={setPreviewUrl} />
        </div>
      )}

      {kind === 'job' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Company" value={company} onChange={setCompany} />
            <Field label="Location" value={location} onChange={setLocation} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-zinc-600">Work mode</label>
              <select
                value={workMode}
                onChange={(e) => setWorkMode(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="onsite">Onsite</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <Field label="CTC min ₹" type="number" value={ctcMin} onChange={setCtcMin} />
            <Field label="CTC max ₹" type="number" value={ctcMax} onChange={setCtcMax} />
          </div>
        </>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        disabled={busy || !name}
        className="w-full rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {busy ? 'Adding…' : `Add ${kind}`}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
      />
    </label>
  );
}
