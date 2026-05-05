"use client";
import { useEffect, useState } from "react";

type Item = { itemKey: string; label: string; category: string; qty: number; reasons?: string[]; source?: string };

type CompareData = {
  tripId: string;
  context: any;
  ai: { ok: boolean; error: string | null; durationMs: number; summary: { totalItems: number; totalQty: number; byCategory: Record<string, { count: number; totalQty: number }> }; items: Item[] };
  formula: { ok: boolean; durationMs: number; summary: { totalItems: number; totalQty: number; byCategory: Record<string, { count: number; totalQty: number }> }; items: Item[] };
};

export default function CompareModal({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [data, setData] = useState<CompareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trips/${tripId}/compare`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e?.message || "Failed to load comparison"));
  }, [tripId]);

  // Match the sorting used in TripView so the modal mirrors the trip layout.
  const CATEGORY_ORDER = [
    "Footwear", "Clothing — Basics", "Clothing — Tops", "Clothing — Bottoms",
    "Clothing — Outerwear", "Clothing — Formal", "Snow gear", "Sports",
    "Accessories", "Toiletries", "Health", "Documents", "Electronics", "Misc",
  ];
  const cats = data
    ? Array.from(new Set([
        ...Object.keys(data.ai.summary.byCategory),
        ...Object.keys(data.formula.summary.byCategory),
      ])).sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      })
    : [];

  // Group items by category for the side-by-side detail view.
  const groupBy = (items: Item[]) => {
    const g: Record<string, Item[]> = {};
    for (const it of items) (g[it.category] ||= []).push(it);
    return g;
  };
  const aiByCat = data ? groupBy(data.ai.items) : {};
  const formulaByCat = data ? groupBy(data.formula.items) : {};

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-slate-900 ring-1 ring-slate-700 rounded-2xl w-full max-w-5xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">Compare: Saved trip vs Formula</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {!data && !error && (
          <div className="p-8 text-center text-slate-400">Loading…</div>
        )}
        {error && (
          <div className="p-6 text-rose-300">Error: {error}</div>
        )}

        {data && (
          <div className="p-5 space-y-5">
            {/* Headline counts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-violet-500/10 ring-1 ring-violet-500/40 p-4">
                <div className="text-xs uppercase tracking-wider text-violet-300">Saved (current trip)</div>
                <div className="text-3xl font-bold mt-1">{data.ai.summary.totalItems}</div>
                <div className="text-xs text-slate-400 mt-1">
                  items · total qty {data.ai.summary.totalQty} · {data.ai.durationMs} ms
                </div>
                {!data.ai.ok && (
                  <div className="text-xs text-rose-300 mt-2">⚠️ AI failed: {data.ai.error}</div>
                )}
              </div>
              <div className="rounded-xl bg-sky-500/10 ring-1 ring-sky-500/40 p-4">
                <div className="text-xs uppercase tracking-wider text-sky-300">Formula</div>
                <div className="text-3xl font-bold mt-1">{data.formula.summary.totalItems}</div>
                <div className="text-xs text-slate-400 mt-1">
                  items · total qty {data.formula.summary.totalQty} · {data.formula.durationMs} ms
                </div>
              </div>
            </div>

            {/* Per-category counts */}
            <div className="rounded-xl ring-1 ring-slate-800 overflow-hidden">
              <div className="px-4 py-2 bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400 grid grid-cols-[1fr_auto_auto] gap-4">
                <span>Category</span>
                <span className="text-violet-300">Saved (items / qty)</span>
                <span className="text-sky-300">Formula (items / qty)</span>
              </div>
              <ul className="divide-y divide-slate-800/70">
                {cats.map((cat) => {
                  const a = data.ai.summary.byCategory[cat];
                  const f = data.formula.summary.byCategory[cat];
                  return (
                    <li key={cat} className="px-4 py-2 grid grid-cols-[1fr_auto_auto] gap-4 items-center text-sm">
                      <span>{cat}</span>
                      <span className="text-violet-200 tabular-nums">
                        {a ? `${a.count} / ${a.totalQty}` : "—"}
                      </span>
                      <span className="text-sky-200 tabular-nums">
                        {f ? `${f.count} / ${f.totalQty}` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Detailed lists — paired by category so both sides line up */}
            <details className="rounded-xl ring-1 ring-slate-800">
              <summary className="px-4 py-3 cursor-pointer hover:bg-white/5 text-sm font-semibold">
                Show full item lists
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs uppercase tracking-wider sticky top-0 bg-slate-900 py-1 z-10">
                  <div className="text-violet-300">Saved (current trip)</div>
                  <div className="text-sky-300">Formula</div>
                </div>
                {cats.map((cat) => {
                  const a = aiByCat[cat] || [];
                  const f = formulaByCat[cat] || [];
                  if (a.length === 0 && f.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div className="text-xs font-semibold text-slate-400 mb-1 border-b border-slate-800 pb-1">{cat}</div>
                      <div className="grid grid-cols-2 gap-4 items-start">
                        <ItemList items={a} accent="violet" />
                        <ItemList items={f} accent="sky" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>

            <div className="text-xs text-slate-500">
              Trip context: {data.context.city} · {data.context.days} day(s) · {data.context.travelers} traveler(s) ·{" "}
              {data.context.tripType}
              {data.context.weather && data.context.weather.minC != null && (
                <> · {Math.round(data.context.weather.minC)}°C–{Math.round(data.context.weather.maxC)}°C</>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemList({ items, accent }: { items: Item[]; accent: "violet" | "sky" }) {
  const qtyClass = accent === "violet" ? "text-violet-300" : "text-sky-300";
  if (items.length === 0) {
    return <div className="text-xs text-slate-600 italic">—</div>;
  }
  return (
    <ul className="text-sm space-y-0.5 min-w-0">
      {items.map((it, i) => (
        <li key={`${it.itemKey}-${i}`} className="flex items-baseline gap-2">
          <span className={`tabular-nums shrink-0 ${qtyClass}`}>×{it.qty}</span>
          <span className="break-words min-w-0">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
