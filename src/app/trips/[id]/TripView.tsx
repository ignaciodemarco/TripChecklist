"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import EditTripModal from "./EditTripModal";
import CompareModal from "./CompareModal";
import { reportClientError, errToFields } from "@/lib/client-log";

type Item = {
  id: string; itemKey: string; label: string; category: string;
  qty: number; reasons: string[]; checked: boolean; source: string;
};

type DefaultItem = { itemKey: string; label: string; category: string; qty: number };

type Props = {
  trip: any;
  unitLabels: { temp: string; wind: string; precip: string; snow: string };
  unitSystem: "imperial" | "metric";
  userDefaults?: DefaultItem[];
};

const CATEGORY_ORDER = [
  "Footwear", "Clothing — Basics", "Clothing — Tops", "Clothing — Bottoms",
  "Clothing — Outerwear", "Clothing — Formal", "Snow gear", "Sports",
  "Accessories", "Toiletries", "Health", "Documents", "Electronics", "Misc",
];

export default function TripView({ trip, unitLabels: lbl, userDefaults = [] }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(trip.items);
  const [pending, startTransition] = useTransition();
  const [aiBusy, setAiBusy] = useState<"add" | "reeval" | null>(null);
  const [editing, setEditing] = useState(false);
  const [comparing, setComparing] = useState(false);

  // Inline AI vs Formula comparison: when toggled on, fetch /compare and
  // build itemKey -> qty maps so we can render both numbers next to each item.
  const [compareInline, setCompareInline] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareData, setCompareData] = useState<{
    aiByKey: Record<string, number>;
    formulaByKey: Record<string, number>;
    aiByLabel: Record<string, number>;
    formulaByLabel: Record<string, number>;
    aiOnly: { itemKey: string; label: string; category: string; qty: number }[];
    formulaOnly: { itemKey: string; label: string; category: string; qty: number }[];
  } | null>(null);

  async function toggleCompareInline() {
    if (compareInline) { setCompareInline(false); return; }
    if (!compareData) {
      setCompareLoading(true);
      try {
        const r = await fetch(`/api/trips/${trip.id}/compare`);
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} ${txt.slice(0, 120)}`);
        }
        const d = await r.json();
        const aiByKey: Record<string, number> = {};
        const aiByLabel: Record<string, number> = {};
        for (const it of d.ai.items || []) {
          aiByKey[it.itemKey] = it.qty;
          aiByLabel[normLabel(it.label)] = it.qty;
        }
        const formulaByKey: Record<string, number> = {};
        const formulaByLabel: Record<string, number> = {};
        for (const it of d.formula.items || []) {
          formulaByKey[it.itemKey] = it.qty;
          formulaByLabel[normLabel(it.label)] = it.qty;
        }
        const tripKeys = new Set(items.map((i) => i.itemKey));
        const tripLabels = new Set(items.map((i) => normLabel(i.label)));
        const aiOnly = (d.ai.items || []).filter((it: any) =>
          !tripKeys.has(it.itemKey) && !tripLabels.has(normLabel(it.label))
        );
        const formulaOnly = (d.formula.items || []).filter((it: any) =>
          !tripKeys.has(it.itemKey) && !tripLabels.has(normLabel(it.label))
        );
        setCompareData({ aiByKey, formulaByKey, aiByLabel, formulaByLabel, aiOnly, formulaOnly });
        setCompareInline(true);
      } catch (err) {
        reportClientError("trip.compare_failed", { tripId: trip.id, ...errToFields(err) });
        alert(`Compare failed: ${(err as Error).message || err}`);
      } finally {
        setCompareLoading(false);
      }
    } else {
      setCompareInline(true);
    }
  }

  function compareQtys(it: Item): { ai?: number; formula?: number } {
    if (!compareData) return {};
    const lk = normLabel(it.label);
    return {
      ai: compareData.aiByKey[it.itemKey] ?? compareData.aiByLabel[lk],
      formula: compareData.formulaByKey[it.itemKey] ?? compareData.formulaByLabel[lk],
    };
  }

  // Personal defaults that are NOT currently in the trip — show them so the
  // user can re-add anything the AI / formula skipped. Match by itemKey first,
  // then fall back to a normalized label compare.
  const missingDefaults = useMemo(() => {
    if (!userDefaults?.length) return [] as DefaultItem[];
    const tripKeys = new Set(items.map((i) => i.itemKey));
    const tripLabels = new Set(items.map((i) => normLabel(i.label)));
    return userDefaults.filter((d) =>
      !tripKeys.has(d.itemKey) && !tripLabels.has(normLabel(d.label))
    );
  }, [items, userDefaults]);
  const missingByCat = useMemo(() => {
    const g: Record<string, DefaultItem[]> = {};
    for (const d of missingDefaults) (g[d.category] ||= []).push(d);
    return g;
  }, [missingDefaults]);

  async function addDefault(d: DefaultItem) {
    setAiBusy("add");
    try {
      const r = await api({ op: "add", label: d.label, category: d.category, qty: 1 });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        alert(`Could not add item:\n${data?.message || data?.error || r.statusText}`);
        return;
      }
      const created = data?.item;
      if (created) {
        setItems((xs) => [...xs, {
          id: created.id,
          itemKey: created.itemKey,
          label: created.label,
          category: created.category,
          qty: created.qty,
          reasons: (() => { try { return JSON.parse(created.reasons || "[]"); } catch { return []; } })(),
          checked: !!created.checked,
          source: created.source,
        }]);
      }
    } catch (err) {
      reportClientError("trip.add_default_failed", { tripId: trip.id, itemKey: d.itemKey, label: d.label, ...errToFields(err) });
      alert(`Could not add "${d.label}". See console / logs.`);
    } finally {
      setAiBusy(null);
    }
  }

  async function addAllMissingDefaults() {
    if (!confirm(`Add all ${missingDefaults.length} missing default items to this trip? AI will pick qty + category for each.`)) return;
    for (const d of missingDefaults) {
      // Sequential — keeps server load reasonable and lets users see progress.
      // eslint-disable-next-line no-await-in-loop
      await addDefault(d);
    }
  }

  const grouped = useMemo(() => {
    const g: Record<string, Item[]> = {};
    for (const it of items) (g[it.category] ||= []).push(it);
    return g;
  }, [items]);

  const cats = useMemo(() => Object.keys(grouped).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }), [grouped]);

  const total = items.length;
  const done = items.filter((i) => i.checked).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  async function api(op: any) {
    return fetch(`/api/trips/${trip.id}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(op),
    });
  }

  function toggle(it: Item) {
    const checked = !it.checked;
    const prev = it.checked;
    setItems((xs) => xs.map((x) => x.id === it.id ? { ...x, checked } : x));
    startTransition(async () => {
      try {
        const r = await api({ op: "toggle", itemId: it.id, checked });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } catch (err) {
        // Roll back optimistic toggle so UI matches reality.
        setItems((xs) => xs.map((x) => x.id === it.id ? { ...x, checked: prev } : x));
        reportClientError("trip.toggle_failed", { tripId: trip.id, itemId: it.id, ...errToFields(err) });
        alert("Could not save check state. Please try again.");
      }
    });
  }
  function remove(it: Item) {
    const snapshot = items;
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    startTransition(async () => {
      try {
        const r = await api({ op: "delete", itemId: it.id });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } catch (err) {
        setItems(snapshot);
        reportClientError("trip.delete_failed", { tripId: trip.id, itemId: it.id, ...errToFields(err) });
        alert("Could not delete item. Please try again.");
      }
    });
  }
  async function addItem(category: string) {
    const label = window.prompt("Add item (AI will pick quantity & category):")?.trim();
    if (!label) return;
    setAiBusy("add");
    try {
      const r = await api({ op: "add", label, category, qty: 1 });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        alert(`Could not add item:\n${data?.message || data?.error || r.statusText}`);
        return;
      }
      const created = data?.item;
      if (created) {
        setItems((xs) => [...xs, {
          id: created.id,
          itemKey: created.itemKey,
          label: created.label,
          category: created.category,
          qty: created.qty,
          reasons: (() => { try { return JSON.parse(created.reasons || "[]"); } catch { return []; } })(),
          checked: !!created.checked,
          source: created.source,
        }]);
      } else {
        router.refresh();
      }
    } catch (err) {
      reportClientError("trip.add_item_failed", { tripId: trip.id, ...errToFields(err) });
      alert(`Could not add item. See logs.`);
    } finally {
      setAiBusy(null);
    }
  }
  async function reevaluateAI() {
    if (!confirm("Re-evaluate every item with AI? This will update quantities, categories, and reasons based on the trip context.")) return;
    setAiBusy("reeval");
    try {
      const r = await api({ op: "ai-reevaluate" });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        alert(`AI re-evaluation failed:\n${data?.message || data?.error || r.statusText}`);
        return;
      }
      const updated: any[] = data?.updated || [];
      const byId = new Map(updated.map((u) => [u.id, u]));
      setItems((xs) => xs.map((x) => {
        const u = byId.get(x.id);
        if (!u) return x;
        let reasons: string[] = [];
        try { reasons = JSON.parse(u.reasons || "[]"); } catch (parseErr) {
          reportClientError("trip.reevaluate_reasons_parse", { tripId: trip.id, itemId: x.id, raw: String(u.reasons).slice(0, 200), ...errToFields(parseErr) });
        }
        return { ...x, qty: u.qty, category: u.category, reasons };
      }));
    } catch (err) {
      reportClientError("trip.reevaluate_failed", { tripId: trip.id, ...errToFields(err) });
      alert(`Re-evaluate failed: ${(err as Error).message || err}`);
    } finally {
      setAiBusy(null);
    }
  }
  async function reset() {
    if (!confirm("Uncheck all items?")) return;
    try {
      const r = await api({ op: "reset" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems((xs) => xs.map((x) => ({ ...x, checked: false })));
    } catch (err) {
      reportClientError("trip.reset_failed", { tripId: trip.id, ...errToFields(err) });
      alert("Could not reset.");
    }
  }
  async function deleteTrip() {
    if (!confirm("Delete this trip permanently?")) return;
    try {
      const r = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      router.push("/trips"); router.refresh();
    } catch (err) {
      reportClientError("trip.delete_failed", { tripId: trip.id, ...errToFields(err) });
      alert("Could not delete trip.");
    }
  }

  const w = trip.weather;
  const days = Math.round((parseLocalDate(trip.endDate).getTime() - parseLocalDate(trip.startDate).getTime()) / 86400000) + 1;

  return (
    <div className="space-y-4">
      <section className="glass rounded-2xl p-5 sm:p-7 ring-1 ring-white/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">{trip.cityFull}</h2>
            <p className="text-slate-400 text-sm mt-1">
              {fmt(trip.startDate)} → {fmt(trip.endDate)} · {days} day{days > 1 ? "s" : ""} ·{" "}
              {cap1(trip.tripType)} · {trip.travelers} traveler{trip.travelers > 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg bg-sky-700/40 ring-1 ring-sky-500 hover:bg-sky-700/60 text-sky-100 text-sm">✏️ Edit trip</button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">🖨 Print</button>
            <button onClick={reset} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">Uncheck all</button>
            <button onClick={reevaluateAI} disabled={aiBusy !== null}
              className="px-3 py-2 rounded-lg bg-violet-700/40 ring-1 ring-violet-500 hover:bg-violet-700/60 text-violet-100 text-sm disabled:opacity-50">
              {aiBusy === "reeval" ? "Re-evaluating…" : "✨ Re-evaluate with AI"}
            </button>
            <button onClick={() => setComparing(true)} className="px-3 py-2 rounded-lg bg-amber-700/30 ring-1 ring-amber-500 hover:bg-amber-700/50 text-amber-100 text-sm">⚖️ Compare Saved vs Formula</button>
            <button onClick={toggleCompareInline} disabled={compareLoading}
              className={`px-3 py-2 rounded-lg ring-1 text-sm disabled:opacity-50 ${compareInline ? "bg-amber-600/40 ring-amber-400 text-amber-50" : "bg-amber-700/20 ring-amber-600 hover:bg-amber-700/40 text-amber-200"}`}>
              {compareLoading ? "Loading…" : compareInline ? "Hide inline counts" : "🔢 Show Saved/Formula counts"}
            </button>
            <button onClick={deleteTrip} className="px-3 py-2 rounded-lg bg-rose-900/40 ring-1 ring-rose-700 hover:bg-rose-900/60 text-rose-200 text-sm">Delete trip</button>
          </div>
        </div>

        {w ? (
          <>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Temperature"
                value={w.min != null ? `${Math.round(w.min)}° – ${Math.round(w.max)}°${lbl.temp.replace("°","")}` : "—"}
                hint={tempHint(w.minC, w.maxC)} />
              <Stat label="Rain chance" value={`${Math.round(w.rainProb)}%`}
                hint={w.totalRain ? `~${w.totalRain.toFixed(2)} ${lbl.precip} total` : "Mostly dry"} />
              <Stat label="Max UV" value={w.maxUV ? w.maxUV.toFixed(1) : "—"} hint={uvHint(w.maxUV)} />
              <Stat label="Wind / Snow"
                value={`${Math.round(w.maxWind || 0)} ${lbl.wind}`}
                hint={w.totalSnow > 0 ? `❄️ ${w.totalSnow.toFixed(1)} ${lbl.snow}` : ""} />
            </div>
            {w.approximated && (
              <p className="mt-3 text-xs text-amber-300">
                ⚠️ Forecast beyond range — using same dates last year as approximation.
              </p>
            )}
            {w.days?.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <div className="flex gap-2 min-w-max pb-2">
                  {w.days.map((d: any) => (
                    <div key={d.date} className="w-20 shrink-0 p-2 rounded-lg bg-slate-900/60 ring-1 ring-slate-800 text-center">
                      <div className="text-[10px] text-slate-400">
                        {parseLocalDate(d.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                      </div>
                      <div className="text-sm font-semibold mt-1">{d.tMax != null ? Math.round(d.tMax) + "°" : "—"}</div>
                      <div className="text-[11px] text-slate-400">{d.tMin != null ? Math.round(d.tMin) + "°" : ""}</div>
                      <div className="text-[11px] mt-1">{emoji(d)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mt-5 p-3 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 text-amber-200 text-sm">
            ⚠️ Weather unavailable. Recommendations are based on trip type & activities only.
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-4 ring-1 ring-white/5 no-print">
        <div className="flex justify-between text-sm mb-2">
          <span>Packing progress {pending && <span className="text-slate-500 text-xs">(saving…)</span>}</span>
          <span>{done} / {total}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <div className="space-y-3">
        {cats.map((cat) => (
          <details key={cat} open className="glass rounded-2xl ring-1 ring-white/5 overflow-hidden">
            <summary className="px-5 py-3 flex items-center justify-between hover:bg-white/5 cursor-pointer list-none">
              <span className="font-semibold">{cat}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{grouped[cat].length} items</span>
                <button onClick={(e) => { e.preventDefault(); addItem(cat); }} disabled={aiBusy !== null}
                  className="no-print text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50">
                  {aiBusy === "add" ? "…" : "+ add"}
                </button>
              </span>
            </summary>
            <ul className="divide-y divide-slate-800/70">
              {grouped[cat].map((it) => (
                <li key={it.id} className={`px-5 py-3 flex items-start gap-3 ${it.checked ? "opacity-60" : ""}`}>
                  <input type="checkbox" checked={it.checked} onChange={() => toggle(it)}
                    className="mt-1 h-4 w-4 rounded accent-emerald-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium ${it.checked ? "line-through" : ""}`}>{it.label}</span>
                      <span title={compareInline ? "Saved quantity (what's actually in your list)" : undefined} className={`text-xs px-1.5 py-0.5 rounded ${compareInline ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-300"}`}>
                        {compareInline ? `Saved ×${it.qty}` : `×${it.qty}`}
                      </span>
                      {compareInline && (() => {
                        const c = compareQtys(it);
                        return (
                          <span title="Formula suggestion" className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${c.formula != null ? "bg-sky-500/20 text-sky-200" : "bg-slate-800 text-slate-500"}`}>
                            Formula {c.formula != null ? `×${c.formula}` : "—"}
                          </span>
                        );
                      })()}
                      {it.source === "user-default" && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">default</span>
                      )}
                      {it.source === "manual" && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">manual</span>
                      )}
                    </div>
                    {it.reasons.length > 0 && (
                      <div className="mt-0.5 text-xs text-slate-500">{it.reasons.join(" · ")}</div>
                    )}
                  </div>
                  <button onClick={() => remove(it)} title="Remove"
                    className="no-print text-slate-500 hover:text-rose-400 px-2">✕</button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      {compareInline && compareData && (compareData.aiOnly.length > 0 || compareData.formulaOnly.length > 0) && (
        <section className="glass rounded-2xl p-5 ring-1 ring-amber-500/20 no-print">
          <h3 className="font-semibold text-amber-200">Items not in this trip</h3>
          <p className="text-xs text-slate-400 mt-1">Suggested by the formula but not currently in your saved list.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-violet-300 mb-1">Saved only ({compareData.aiOnly.length})</div>
              <ul className="text-sm space-y-1">
                {compareData.aiOnly.map((it) => (
                  <li key={it.itemKey + it.label} className="flex justify-between gap-2">
                    <span>{it.label} <span className="text-slate-500 text-xs">({it.category})</span></span>
                    <span className="text-violet-200 tabular-nums">×{it.qty}</span>
                  </li>
                ))}
                {compareData.aiOnly.length === 0 && <li className="text-slate-500">—</li>}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-sky-300 mb-1">Formula only ({compareData.formulaOnly.length})</div>
              <ul className="text-sm space-y-1">
                {compareData.formulaOnly.map((it) => (
                  <li key={it.itemKey + it.label} className="flex justify-between gap-2">
                    <span>{it.label} <span className="text-slate-500 text-xs">({it.category})</span></span>
                    <span className="text-sky-200 tabular-nums">×{it.qty}</span>
                  </li>
                ))}
                {compareData.formulaOnly.length === 0 && <li className="text-slate-500">—</li>}
              </ul>
            </div>
          </div>
        </section>
      )}
      {missingDefaults.length > 0 && (
        <section className="glass rounded-2xl p-5 ring-1 ring-violet-500/20 no-print">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-violet-200">From your defaults — not in this trip</h3>
              <p className="text-xs text-slate-400 mt-1">
                {missingDefaults.length} item{missingDefaults.length === 1 ? "" : "s"} from your Settings → Personal defaults that the AI / formula didn't include for this trip context. Click any to add it.
              </p>
            </div>
            <button onClick={addAllMissingDefaults} disabled={aiBusy !== null}
              className="px-3 py-2 rounded-lg bg-violet-700/30 ring-1 ring-violet-500 hover:bg-violet-700/50 text-violet-100 text-xs disabled:opacity-50">
              {aiBusy === "add" ? "Adding…" : `+ Add all (${missingDefaults.length})`}
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {Object.keys(missingByCat).sort((a, b) => {
              const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
              return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            }).map((cat) => (
              <div key={cat}>
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">{cat}</div>
                <ul className="flex flex-wrap gap-2">
                  {missingByCat[cat].map((d) => (
                    <li key={d.itemKey}>
                      <button onClick={() => addDefault(d)} disabled={aiBusy !== null}
                        className="text-sm px-2.5 py-1 rounded-lg bg-slate-900/80 ring-1 ring-slate-700 hover:ring-violet-500 hover:bg-violet-900/30 disabled:opacity-50">
                        + {d.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      {editing && <EditTripModal trip={trip} onClose={() => setEditing(false)} />}
      {comparing && <CompareModal tripId={trip.id} onClose={() => setComparing(false)} />}
    </div>
  );
}

function normLabel(s: string): string {
  return s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, "").trim();
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 rounded-xl bg-slate-900/70 ring-1 ring-slate-800">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
function fmt(s: string) { return parseLocalDate(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function parseLocalDate(s: string): Date {
  // Treat "yyyy-mm-dd" as a local date (avoid UTC midnight shift).
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function cap1(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function tempHint(minC: number | null, maxC: number | null) {
  if (minC == null) return "";
  if (minC < 0) return "Freezing — pack warm";
  if (minC < 10) return "Chilly — bring layers";
  if ((maxC ?? 0) > 30) return "Hot — light fabrics";
  if ((maxC ?? 0) > 25) return "Warm";
  return "Mild";
}
function uvHint(uv: number) {
  if (!uv) return "";
  if (uv >= 8) return "Very high — sun protection!";
  if (uv >= 6) return "High — sunscreen needed";
  if (uv >= 3) return "Moderate";
  return "Low";
}
function emoji(d: any) {
  if (d.snow > 0) return "❄️";
  if ((d.rainProb ?? 0) >= 60 || (d.rain ?? 0) > 0.1) return "🌧";
  if ((d.rainProb ?? 0) >= 30) return "⛅";
  if ((d.tMax ?? 0) >= 28) return "☀️";
  return "🌤";
}
