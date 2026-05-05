"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const ACTIVITIES = [
  { id: "tennis",  label: "🎾 Tennis" },
  { id: "gym",     label: "🏋️ Gym" },
  { id: "running", label: "🏃 Running" },
  { id: "swim",    label: "🏊 Swimming" },
  { id: "hiking",  label: "🥾 Hiking" },
  { id: "ski",     label: "⛷ Skiing" },
  { id: "formal",  label: "🎩 Formal dinner" },
  { id: "biking",  label: "🚴 Biking" },
  { id: "work",    label: "💻 Working remotely" },
  { id: "photo",   label: "📷 Photography" },
];

type Props = {
  trip: any;
  onClose: () => void;
};

export default function EditTripModal({ trip, onClose }: Props) {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>(trip.startDate);
  const [endDate, setEndDate] = useState<string>(trip.endDate);
  const [tripType, setTripType] = useState<string>(trip.tripType || "leisure");
  const [travelers, setTravelers] = useState<number>(trip.travelers || 1);
  const [laundry, setLaundry] = useState<boolean>(!!trip.laundry);
  const [international, setIntl] = useState<boolean>(!!trip.international);
  const initialActs: string[] = Array.isArray(trip.activities) ? trip.activities : [];
  const [activities, setActivities] = useState<string[]>(initialActs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleActivity(id: string) {
    setActivities((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);
  }

  async function save() {
    setError(null);
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after start date.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/trips/${trip.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate, endDate, tripType, travelers,
          laundry, international, activities,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        setError(data?.message || data?.error || `HTTP ${r.status}`);
        return;
      }
      router.refresh();
      onClose();
    } catch (err: any) {
      const { reportClientError, errToFields } = await import("@/lib/client-log");
      reportClientError("trip.edit_save_failed", { tripId: trip.id, ...errToFields(err) });
      setError(err?.message || "Save failed. See logs.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 no-print" onClick={onClose}>
      <div className="glass rounded-2xl ring-1 ring-white/10 w-full max-w-xl max-h-[90vh] overflow-y-auto p-6"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold">Edit trip</h3>
            <p className="text-xs text-slate-400">{trip.cityFull}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-slate-400 text-xs mb-1">Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                   className="w-full px-3 py-2 rounded-lg bg-slate-900 ring-1 ring-slate-800" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-400 text-xs mb-1">End date</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                   className="w-full px-3 py-2 rounded-lg bg-slate-900 ring-1 ring-slate-800" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-400 text-xs mb-1">Trip type</span>
            <select value={tripType} onChange={(e) => setTripType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 ring-1 ring-slate-800">
              <option value="leisure">Leisure</option>
              <option value="business">Business</option>
              <option value="beach">Beach</option>
              <option value="adventure">Adventure</option>
              <option value="ski">Ski</option>
              <option value="city">City</option>
              <option value="family">Family</option>
              <option value="camping">Camping</option>
              <option value="hostel">Hostel / Backpacking</option>
              <option value="roadtrip">Road trip</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-400 text-xs mb-1">Travelers</span>
            <input type="number" min={1} max={20} value={travelers}
                   onChange={(e) => setTravelers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                   className="w-full px-3 py-2 rounded-lg bg-slate-900 ring-1 ring-slate-800" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={laundry} onChange={(e) => setLaundry(e.target.checked)}
                   className="h-4 w-4 accent-emerald-500" />
            Laundry available
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={international} onChange={(e) => setIntl(e.target.checked)}
                   className="h-4 w-4 accent-emerald-500" />
            International trip
          </label>
        </div>

        <div className="mt-4">
          <div className="text-slate-400 text-xs mb-2">Activities</div>
          <div className="flex flex-wrap gap-2">
            {ACTIVITIES.map((a) => {
              const on = activities.includes(a.id);
              return (
                <button type="button" key={a.id} onClick={() => toggleActivity(a.id)}
                  className={`px-3 py-1.5 rounded-full text-sm ring-1 ${
                    on ? "bg-sky-500/30 ring-sky-400 text-sky-100"
                       : "bg-slate-900 ring-slate-800 text-slate-300 hover:bg-slate-800"
                  }`}>
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-400 bg-slate-900/60 rounded-lg p-3 ring-1 ring-slate-800">
          Saving will recalculate the rule-based packing list (quantities, weather-driven items, etc).
          Items you added manually and items you've already checked off will be preserved.
        </div>

        {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">Cancel</button>
          <button onClick={save} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "Save & recalculate"}
          </button>
        </div>
      </div>
    </div>
  );
}
