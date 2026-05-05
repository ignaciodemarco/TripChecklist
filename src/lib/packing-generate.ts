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
    log.info("packing.ai_generated", {
      ...meta,
      itemCount: items.length,
      durationMs: Date.now() - t0,
      city: trip.city,
      days: ctx.days,
    });
    return { items, source: "ai" };
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
