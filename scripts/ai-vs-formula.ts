// Test harness: runs the AI generator and the formula generator against a
// battery of synthetic trip scenarios, prints a diff report.
// Run: npx tsx scripts/ai-vs-formula.ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { aiGeneratePackingList, buildAiContextFromTrip } from "../src/lib/ai";
import { buildPackingList } from "../src/lib/packing";
import type { PackingItem, TripInput, WeatherSummary } from "../src/lib/types";

type Scenario = { name: string; trip: TripInput; weather: WeatherSummary | null };

function mkWeather(minC: number, maxC: number, rainProb = 10, snow = 0): WeatherSummary {
  return {
    approximated: false,
    units: { temp: "C", precip: "mm", wind: "kmh" },
    days: [], min: minC, max: maxC,
    rainProb, totalRain: 0, totalSnow: snow, maxUV: 5, maxWind: 15,
    minC, maxC,
  };
}
function dr(start: string, days: number) {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(s.getTime() + (days - 1) * 86400000);
  return { startDate: start, endDate: e.toISOString().slice(0, 10) };
}

const SCENARIOS: Scenario[] = [
  { name: "Weekend Paris (3d, mild, 1pax)",
    trip: { city: "Paris", cityFull: "Paris, France", lat: 48.85, lon: 2.35,
      ...dr("2026-06-01", 3), tripType: "leisure", travelers: 1, laundry: false, international: true, activities: [] },
    weather: mkWeather(14, 22, 20) },
  { name: "Family beach Cancun (7d, hot, 4pax, laundry)",
    trip: { city: "Cancun", cityFull: "Cancún, Mexico", lat: 21.16, lon: -86.85,
      ...dr("2026-07-15", 7), tripType: "beach", travelers: 4, laundry: true, international: true, activities: ["beach", "swim"] },
    weather: mkWeather(25, 32, 30) },
  { name: "Solo ski Aspen (5d, freezing, 1pax)",
    trip: { city: "Aspen", cityFull: "Aspen, USA", lat: 39.19, lon: -106.82,
      ...dr("2026-12-10", 5), tripType: "ski", travelers: 1, laundry: false, international: false, activities: ["ski"] },
    weather: mkWeather(-12, -2, 30, 50) },
  { name: "Backpacking Bangkok (21d, hot, 2pax, laundry)",
    trip: { city: "Bangkok", cityFull: "Bangkok, Thailand", lat: 13.75, lon: 100.5,
      ...dr("2026-02-01", 21), tripType: "leisure", travelers: 2, laundry: true, international: true, activities: ["hike"] },
    weather: mkWeather(24, 33, 60) },
  { name: "Business NYC (4d, cool, 1pax)",
    trip: { city: "New York", cityFull: "New York, USA", lat: 40.71, lon: -74,
      ...dr("2026-10-15", 4), tripType: "business", travelers: 1, laundry: false, international: false, activities: ["formal"] },
    weather: mkWeather(8, 16, 40) },
  { name: "Couple road trip (10d, no weather, 2pax, laundry)",
    trip: { city: "Various", cityFull: "Various, USA", lat: 0, lon: 0,
      ...dr("2026-08-01", 10), tripType: "leisure", travelers: 2, laundry: true, international: false, activities: ["hike"] },
    weather: null },
  { name: "Istanbul summer (13d, mild-hot, 1pax) — should NOT include hand warmers",
    trip: { city: "Istanbul", cityFull: "Istanbul, Türkiye", lat: 41.01, lon: 28.98,
      ...dr("2026-05-07", 13), tripType: "leisure", travelers: 1, laundry: false, international: true, activities: [] },
    weather: mkWeather(11, 30, 33) },
];

function summarize(items: PackingItem[]) {
  const byCat: Record<string, { count: number; qty: number }> = {};
  for (const it of items) {
    const c = (byCat[it.category] ||= { count: 0, qty: 0 });
    c.count++; c.qty += it.qty;
  }
  return { totalItems: items.length, totalQty: items.reduce((s, i) => s + i.qty, 0), byCat };
}
function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function pad(s: string, n: number) { return (s + " ".repeat(n)).slice(0, n); }

(async () => {
  const out: any[] = [];
  for (const s of SCENARIOS) {
    process.stdout.write(`\n=== ${s.name} ===\n`);
    const fItems = buildPackingList(s.trip, s.weather, [], "metric");
    const ctx = buildAiContextFromTrip({
      cityFull: s.trip.cityFull, city: s.trip.city,
      startDate: s.trip.startDate, endDate: s.trip.endDate,
      tripType: s.trip.tripType, travelers: s.trip.travelers,
      laundry: s.trip.laundry, international: s.trip.international,
      activities: JSON.stringify(s.trip.activities),
      weather: s.weather ? JSON.stringify(s.weather) : null,
    }, "metric");

    let aItems: PackingItem[] = [];
    let aErr: string | null = null;
    const t0 = Date.now();
    try { aItems = await aiGeneratePackingList(ctx, []); }
    catch (e: any) { aErr = e?.message || String(e); }
    const ms = Date.now() - t0;

    if (aErr) { console.log(`  AI ERROR: ${aErr}`); continue; }
    const fSum = summarize(fItems), aSum = summarize(aItems);
    console.log(`  AI:      ${pad(aSum.totalItems + " items", 10)} qty ${aSum.totalQty}   (${ms}ms)`);
    console.log(`  Formula: ${pad(fSum.totalItems + " items", 10)} qty ${fSum.totalQty}`);
    const cats = Array.from(new Set([...Object.keys(aSum.byCat), ...Object.keys(fSum.byCat)])).sort();
    for (const c of cats) {
      const a = aSum.byCat[c], f = fSum.byCat[c];
      console.log(`    ${pad(c, 28)} AI ${pad(a ? `${a.count}/${a.qty}` : "—", 10)} F ${f ? `${f.count}/${f.qty}` : "—"}`);
    }
    const fLab = new Set(fItems.map(i => norm(i.label)));
    const aLab = new Set(aItems.map(i => norm(i.label)));
    const fByLab = new Map(fItems.map(i => [norm(i.label), i]));
    const onlyA = aItems.filter(i => !fLab.has(norm(i.label))).map(i => `${i.label}×${i.qty}`);
    const onlyF = fItems.filter(i => !aLab.has(norm(i.label))).map(i => `${i.label}×${i.qty}`);
    const qtyD = aItems.map(a => ({ a, f: fByLab.get(norm(a.label)) })).filter(p => p.f && p.f.qty !== p.a.qty);
    if (onlyA.length) console.log(`    only-AI:      ${onlyA.join(", ")}`);
    if (onlyF.length) console.log(`    only-formula: ${onlyF.join(", ")}`);
    if (qtyD.length) console.log(`    qty diffs:    ${qtyD.map(p => `${p.a.label} A×${p.a.qty}/F×${p.f!.qty}`).join(", ")}`);
    out.push({ name: s.name, ai: { ms, summary: aSum, items: aItems }, formula: { summary: fSum, items: fItems } });
  }
  fs.writeFileSync(path.join(__dirname, "compare-results.json"), JSON.stringify(out, null, 2));
})();
