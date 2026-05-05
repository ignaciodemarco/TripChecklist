// Builds the packing list for a trip. Tries AI first (richer, context-aware
// reasoning), falls back to the deterministic formula in lib/packing.ts if
// AI is unavailable / fails / disabled. Trip creation must never be blocked
// by an OpenAI outage, so the fallback is always wired in.
//
// Toggle behavior with env:
//   PACKING_USE_AI=false  → skip AI, use formula only
//   (unset / "true")      → AI first, formula on failure

import { aiGeneratePackingList, buildAiContextFromTrip } from "./ai";
import { buildPackingList } from "./packing";
import { log } from "./logger";
import type { DefaultItem, PackingItem, TripInput, UnitSystem, WeatherSummary } from "./types";

export type PackingSource = "ai" | "formula";

export type PackingResult = {
  items: PackingItem[];
  source: PackingSource;
  /** Present when source === "formula" and AI was attempted. */
  aiError?: string;
};

export async function generatePackingItems(
  trip: TripInput,
  weather: WeatherSummary | null,
  defaults: DefaultItem[],
  unitSystem: UnitSystem,
  meta: { userId?: string; tripId?: string } = {}
): Promise<PackingResult> {
  const useAi = process.env.PACKING_USE_AI !== "false";
  if (!useAi) {
    return { items: buildPackingList(trip, weather, defaults, unitSystem), source: "formula" };
  }

  const ctx = buildAiContextFromTrip(
    {
      cityFull: trip.cityFull, city: trip.city,
      startDate: trip.startDate, endDate: trip.endDate,
      tripType: trip.tripType, travelers: trip.travelers,
      laundry: trip.laundry, international: trip.international,
      activities: JSON.stringify(trip.activities),
      weather: weather ? JSON.stringify(weather) : null,
    },
    unitSystem
  );

  const t0 = Date.now();
  try {
    const items = await aiGeneratePackingList(ctx, defaults);
    // Backstop: the AI sometimes drops obvious weather-driven items
    // (sunscreen for an 86°F trip, gloves for snow, etc.). Run the
    // deterministic formula too and inject any items the AI missed,
    // matching by itemKey OR by token overlap on the label.
    const formulaItems = buildPackingList(trip, weather, defaults, unitSystem);
    const merged = mergeMissingFormula(items, formulaItems);
    log.info("packing.ai_generated", {
      ...meta,
      itemCount: merged.length,
      aiCount: items.length,
      injectedFromFormula: merged.length - items.length,
      durationMs: Date.now() - t0,
      city: trip.city,
      days: ctx.days,
    });
    return { items: merged, source: "ai" };
  } catch (err: any) {
    log.warn("packing.ai_fallback_to_formula", {
      ...meta,
      error: err?.message,
      durationMs: Date.now() - t0,
    });
    return {
      items: buildPackingList(trip, weather, defaults, unitSystem),
      source: "formula",
      aiError: err?.message,
    };
  }
}

// Token-based label fingerprint: split on slash/comma, strip parens, keep
// alnum tokens of length >= 3. Used to consider "T-shirts / shirts" and
// "T-Shirts" the same item without false-matching short words like "and".
function labelTokens(s: string): Set<string> {
  const stripped = s.toLowerCase().replace(/\([^)]*\)/g, " ");
  const out = new Set<string>();
  for (const part of stripped.split(/[\/,]+/)) {
    const t = part.replace(/[^a-z0-9]+/g, "").trim();
    if (t.length >= 3) out.add(t);
  }
  return out;
}

function mergeMissingFormula(aiItems: PackingItem[], formulaItems: PackingItem[]): PackingItem[] {
  const aiKeys = new Set(aiItems.map((i) => i.itemKey));
  const aiTokens = aiItems.map((i) => labelTokens(i.label));
  const out = [...aiItems];
  for (const f of formulaItems) {
    if (aiKeys.has(f.itemKey)) continue;
    const ft = labelTokens(f.label);
    let dup = false;
    for (const at of aiTokens) {
      for (const t of ft) { if (at.has(t)) { dup = true; break; } }
      if (dup) break;
    }
    if (dup) continue;
    out.push({
      ...f,
      reasons: [...(f.reasons || []), "Auto-added: AI missed this weather-driven item"],
    });
  }
  return out;
}
