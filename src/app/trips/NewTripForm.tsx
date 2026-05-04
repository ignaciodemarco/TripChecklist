"use client";
import { useEffect, useRef, useState } from "react";
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

type City = { name: string; admin1?: string; country?: string; latitude: number; longitude: number };

export default function NewTripForm() {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [picked, setPicked] = useState<City | null>(null);
  const [results, setResults] = useState<City[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tRef = useRef<any>(null);
  const justPickedRef = useRef(false);

  // default dates
  const today = new Date();
  const def1 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const def2 = new Date(today.getTime() + 10 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(def1);
  const [endDate, setEndDate] = useState(def2);
  const [tripType, setTripType] = useState("leisure");
  const [travelers, setTravelers] = useState(1);
  const [activities, setActivities] = useState<string[]>([]);
  const [laundry, setLaundry] = useState(false);
  const [international, setIntl] = useState(true);

  useEffect(() => {
    // If the input change came from clicking a suggestion, keep the pick.
    if (justPickedRef.current) {
      justPickedRef.current = false;
      setResults([]);
      setShowSuggest(false);
      return;
    }
    setPicked(null);
    if (city.trim().length < 2) { setResults([]); return; }
    clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(city)}`);
        const data = await r.json();
        setResults(data.results || []);
        setShowSuggest(true);
      } catch { /* ignore */ }
    }, 250);
  }, [city]);

  const toggleAct = (id: string) =>
    setActivities((xs) => xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let chosen = picked;
    if (!chosen) {
      // resolve typed text
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(city)}`);
        const data = await r.json();
        if (data.results?.[0]) chosen = data.results[0];
      } catch {}
    }
    if (!chosen) { setError("Could not find that city."); return; }
    if (new Date(endDate) < new Date(startDate)) { setError("End date must be after start date."); return; }

    setSubmitting(true);
    try {
      const cityFull = [chosen.name, chosen.admin1, chosen.country].filter(Boolean).join(", ");
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city: chosen.name, cityFull,
          lat: chosen.latitude, lon: chosen.longitude,
          startDate, endDate, tripType, travelers,
          activities, laundry, international,
        }),
      });
      if (!res.ok) throw new Error("Failed to create trip");
      const trip = await res.json();
      router.push(`/trips/${trip.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-5 sm:p-7 ring-1 ring-white/5">
      <h2 className="text-lg font-semibold mb-4">Plan a new trip</h2>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 relative">
          <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Destination city</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} required placeholder="e.g. Lake Tahoe, Tokyo, Aspen"
            autoComplete="off"
            className="w-full bg-slate-900/80 ring-1 ring-slate-700 rounded-lg px-3 py-2 focus:ring-sky-500 focus:outline-none" />
          {showSuggest && results.length > 0 && !picked && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-slate-900 ring-1 ring-slate-700 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              {results.map((c, i) => (
                <li key={i} className="px-3 py-2 hover:bg-slate-800 cursor-pointer text-sm"
                    onClick={() => {
                      justPickedRef.current = true;
                      setPicked(c);
                      setCity([c.name, c.admin1, c.country].filter(Boolean).join(", "));
                      setShowSuggest(false);
                    }}>
                  <span className="font-medium">{c.name}</span>{" "}
                  <span className="text-slate-400">{[c.admin1, c.country].filter(Boolean).join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Start date</label>
          <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-slate-900/80 ring-1 ring-slate-700 rounded-lg px-3 py-2 focus:ring-sky-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">End date</label>
          <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-slate-900/80 ring-1 ring-slate-700 rounded-lg px-3 py-2 focus:ring-sky-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Trip type</label>
          <select value={tripType} onChange={(e) => setTripType(e.target.value)}
            className="w-full bg-slate-900/80 ring-1 ring-slate-700 rounded-lg px-3 py-2 focus:ring-sky-500 focus:outline-none">
            <option value="leisure">Leisure</option>
            <option value="business">Business</option>
            <option value="beach">Beach</option>
            <option value="ski">Ski / Snow</option>
            <option value="sports">Sports / Adventure</option>
            <option value="city">City break</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Travelers</label>
          <input type="number" min={1} max={20} value={travelers}
            onChange={(e) => setTravelers(parseInt(e.target.value, 10) || 1)}
            className="w-full bg-slate-900/80 ring-1 ring-slate-700 rounded-lg px-3 py-2 focus:ring-sky-500 focus:outline-none" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs uppercase tracking-wide text-slate-400 mb-2">Activities</label>
          <div className="flex flex-wrap gap-2">
            {ACTIVITIES.map((a) => {
              const on = activities.includes(a.id);
              return (
                <button key={a.id} type="button" onClick={() => toggleAct(a.id)}
                  className={`px-3 py-1.5 rounded-full text-sm ring-1 transition ${
                    on ? "bg-sky-500 text-slate-950 ring-sky-400" : "bg-slate-900/60 ring-slate-700 hover:bg-slate-800"
                  }`}>{a.label}</button>
              );
            })}
          </div>
        </div>

        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={laundry} onChange={(e) => setLaundry(e.target.checked)}
            className="h-4 w-4 rounded accent-sky-500" />
          Laundry available at destination (caps clothing quantities)
        </label>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={international} onChange={(e) => setIntl(e.target.checked)}
            className="h-4 w-4 rounded accent-sky-500" />
          International trip (passport, plug adapter, etc.)
        </label>

        <div className="sm:col-span-2 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          {error && <p className="text-rose-400 text-sm">{error}</p>}
          <button disabled={submitting} type="submit"
            className="ml-auto px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold disabled:opacity-50">
            {submitting ? "Generating…" : "Generate packing list →"}
          </button>
        </div>
      </form>
    </section>
  );
}
