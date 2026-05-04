"use client";
import { useState } from "react";
import type { DefaultItem, UnitSystem } from "@/lib/types";

const CATEGORIES = [
  "Footwear", "Clothing — Basics", "Clothing — Tops", "Clothing — Bottoms",
  "Clothing — Outerwear", "Clothing — Formal", "Snow gear", "Sports",
  "Accessories", "Toiletries", "Health", "Documents", "Electronics", "Misc",
];

export default function SettingsForm({
  email, name, unitSystem: initUnit, defaults: initDefaults, seedTemplate,
}: {
  email: string; name: string;
  unitSystem: UnitSystem;
  defaults: DefaultItem[];
  seedTemplate: DefaultItem[];
}) {
  const [unitSystem, setUnit] = useState<UnitSystem>(initUnit);
  const [defaults, setDefaults] = useState<DefaultItem[]>(initDefaults);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newCat, setNewCat] = useState("Misc");
  const [newQty, setNewQty] = useState(1);

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    setDefaults((xs) => [
      ...xs,
      { itemKey: `def-${Date.now().toString(36)}`, label, category: newCat, qty: Math.max(1, newQty) },
    ]);
    setNewLabel(""); setNewQty(1);
  }
  function remove(key: string) { setDefaults((xs) => xs.filter((x) => x.itemKey !== key)); }
  function update(key: string, patch: Partial<DefaultItem>) {
    setDefaults((xs) => xs.map((x) => x.itemKey === key ? { ...x, ...patch } : x));
  }
  function loadSeed() {
    if (!confirm("Replace your current defaults with the spreadsheet template?")) return;
    setDefaults(seedTemplate.map((x) => ({ ...x })));
  }
  function clearAll() {
    if (!confirm("Remove all default items?")) return;
    setDefaults([]);
  }

  async function save() {
    setSaving(true);
    const r = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitSystem, defaults }),
    });
    setSaving(false);
    if (r.ok) setSavedAt(Date.now());
  }

  // group by category
  const grouped: Record<string, DefaultItem[]> = {};
  for (const d of defaults) (grouped[d.category] ||= []).push(d);
  const cats = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <section className="glass rounded-2xl p-5 sm:p-7 ring-1 ring-white/5">
        <h2 className="text-lg font-semibold mb-1">Account</h2>
        <p className="text-sm text-slate-400">{name} · {email}</p>
      </section>

      <section className="glass rounded-2xl p-5 sm:p-7 ring-1 ring-white/5">
        <h2 className="text-lg font-semibold mb-3">Units</h2>
        <div className="flex gap-2">
          <button onClick={() => setUnit("imperial")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ring-1 ${
              unitSystem === "imperial" ? "bg-sky-500 text-slate-950 ring-sky-400" : "bg-slate-900/60 ring-slate-700"
            }`}>
            Imperial · °F · mph · in
          </button>
          <button onClick={() => setUnit("metric")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ring-1 ${
              unitSystem === "metric" ? "bg-sky-500 text-slate-950 ring-sky-400" : "bg-slate-900/60 ring-slate-700"
            }`}>
            Metric · °C · km/h · mm
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">Switching one switches all. Applies to new trip generations.</p>
      </section>

      <section className="glass rounded-2xl p-5 sm:p-7 ring-1 ring-white/5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold">Personal defaults</h2>
            <p className="text-xs text-slate-400">These items are added to every trip you generate.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadSeed} className="text-xs px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700">Load spreadsheet template</button>
            <button onClick={clearAll} className="text-xs px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700">Clear all</button>
          </div>
        </div>

        {/* Add row */}
        <div className="grid grid-cols-12 gap-2 mb-4">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Item name (e.g. AirPods)"
            className="col-span-12 sm:col-span-6 bg-slate-900/80 ring-1 ring-slate-700 rounded-lg px-3 py-2 focus:ring-sky-500 focus:outline-none" />
          <select value={newCat} onChange={(e) => setNewCat(e.target.value)}
            className="col-span-7 sm:col-span-3 bg-slate-900/80 ring-1 ring-slate-700 rounded-lg px-3 py-2">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="number" min={1} value={newQty} onChange={(e) => setNewQty(parseInt(e.target.value, 10) || 1)}
            className="col-span-3 sm:col-span-1 bg-slate-900/80 ring-1 ring-slate-700 rounded-lg px-3 py-2" />
          <button onClick={add} className="col-span-2 sm:col-span-2 px-3 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold hover:bg-sky-400">Add</button>
        </div>

        {/* List */}
        {defaults.length === 0 ? (
          <p className="text-sm text-slate-500">No defaults yet. Add some above, or load the spreadsheet template.</p>
        ) : (
          <div className="space-y-4">
            {cats.map((cat) => (
              <div key={cat}>
                <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-1">{cat}</h3>
                <ul className="divide-y divide-slate-800/70">
                  {grouped[cat].map((d) => (
                    <li key={d.itemKey} className="py-2 flex items-center gap-2">
                      <input value={d.label} onChange={(e) => update(d.itemKey, { label: e.target.value })}
                        className="flex-1 bg-transparent ring-1 ring-slate-800 rounded px-2 py-1 text-sm focus:ring-sky-500 focus:outline-none" />
                      <select value={d.category} onChange={(e) => update(d.itemKey, { category: e.target.value })}
                        className="bg-slate-900/80 ring-1 ring-slate-800 rounded px-2 py-1 text-sm">
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <input type="number" min={1} value={d.qty}
                        onChange={(e) => update(d.itemKey, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-16 bg-slate-900/80 ring-1 ring-slate-800 rounded px-2 py-1 text-sm" />
                      <button onClick={() => remove(d.itemKey)} className="text-slate-500 hover:text-rose-400 px-2">✕</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-end gap-3">
        {savedAt && <span className="text-xs text-emerald-400">Saved ✓</span>}
        <button onClick={save} disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold disabled:opacity-50">
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
