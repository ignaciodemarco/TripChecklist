// AI helpers for packing-list quantity & category suggestions.
// Uses OpenAI Chat Completions with JSON response_format.

const CATEGORIES = [
  "Footwear", "Clothing — Basics", "Clothing — Tops", "Clothing — Bottoms",
  "Clothing — Outerwear", "Clothing — Formal", "Snow gear", "Sports",
  "Accessories", "Toiletries", "Health", "Documents", "Electronics", "Misc",
] as const;

export type AiTripContext = {
  city: string;
  days: number;
  tripType: string;
  travelers: number;
  laundry: boolean;
  international: boolean;
  activities: string[];
  unitSystem: "imperial" | "metric";
  weather?: {
    minC?: number; maxC?: number;
    rainProb?: number; snowProb?: number;
    minLabel?: string; maxLabel?: string; // already-formatted with units
  } | null;
};

export type AiItemSuggestion = {
  qty: number;
  category: string;
  reason: string;
};

export type AiBulkItem = {
  id: string;
  label: string;
  category: string;
  currentQty: number;
};

export type AiBulkResult = {
  id: string;
  qty: number;
  category: string;
  reason: string;
};

function getKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY not configured");
  return k;
}

function model(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function tripContextLine(ctx: AiTripContext): string {
  const parts: string[] = [];
  parts.push(`Destination: ${ctx.city}`);
  parts.push(`Duration: ${ctx.days} day(s)`);
  parts.push(`Travelers: ${ctx.travelers}`);
  parts.push(`Trip type: ${ctx.tripType}`);
  parts.push(`International: ${ctx.international ? "yes" : "no"}`);
  parts.push(`Laundry available: ${ctx.laundry ? "yes (clothing can be re-worn)" : "no (full count needed)"}`);
  if (ctx.activities.length) parts.push(`Activities: ${ctx.activities.join(", ")}`);
  else parts.push("Activities: none specified");
  if (ctx.weather) {
    const w = ctx.weather;
    const range = (w.minLabel && w.maxLabel) ? `${w.minLabel} to ${w.maxLabel}` :
      (w.minC != null && w.maxC != null ? `${Math.round(w.minC)}°C to ${Math.round(w.maxC)}°C` : "unknown");
    parts.push(`Weather: ${range}, rain prob ${Math.round(w.rainProb ?? 0)}%, snow prob ${Math.round(w.snowProb ?? 0)}%`);
  } else {
    parts.push("Weather: unknown");
  }
  parts.push(`Units: ${ctx.unitSystem}`);
  return parts.join(" | ");
}

const SYSTEM_PROMPT = `You are a meticulous travel packing assistant. Given a trip's context (destination, duration, weather, activities, laundry availability) and an item the user wants to pack, you decide:
- the right quantity (per traveler unless the item is shared like a phone charger);
- the correct category from this fixed list: ${CATEGORIES.join(", ")};
- a one-line reason that mentions the drivers (e.g. "5 days, summer mode, laundry").

Rules of thumb:
- Clothing rotation with laundry: assume rewearing every 2-3 days; without laundry: 1 per day up to caps.
- Caps: socks/underwear cap ~10, t-shirts ~10, pants ~4, sweaters ~2, shoes ~3 pairs.
- Weather drives outerwear: warm coat only if min < 10°C; rain jacket if rain prob > 40%; shorts/swimwear only if max > 22°C or beach/swim activity.
- Skirts/dresses: count similar to pants when warm (laundry-aware), 0-1 if cold/winter.
- Shared items (toiletries kit, charger, adapter, first aid) are 1 per group, not per traveler.
- Never return 0; minimum is 1.

Always respond in strict JSON.`;

export async function aiSuggestForItem(label: string, ctx: AiTripContext): Promise<AiItemSuggestion> {
  const key = getKey();
  const userMsg = `Trip context: ${tripContextLine(ctx)}\n\nItem to pack: "${label}"\n\nReturn JSON: {"qty": number, "category": one of [${CATEGORIES.join(", ")}], "reason": short string}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");
  const parsed = JSON.parse(raw);
  const qty = Math.max(1, Math.round(Number(parsed.qty) || 1));
  const category = (CATEGORIES as readonly string[]).includes(parsed.category) ? parsed.category : "Misc";
  const reason = String(parsed.reason || "AI suggestion").slice(0, 200);
  return { qty, category, reason };
}

export async function aiReevaluateAll(items: AiBulkItem[], ctx: AiTripContext): Promise<AiBulkResult[]> {
  const key = getKey();
  const list = items.map((i) => `- id=${i.id} label="${i.label}" currentCategory="${i.category}" currentQty=${i.currentQty}`).join("\n");
  const userMsg = `Trip context: ${tripContextLine(ctx)}\n\nRe-evaluate every item below. Adjust quantity and category if appropriate. Keep ids identical.\n\nItems:\n${list}\n\nReturn JSON: {"items": [{"id": "...", "qty": number, "category": one of [${CATEGORIES.join(", ")}], "reason": short string}, ...]}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");
  const parsed = JSON.parse(raw);
  const arr = Array.isArray(parsed.items) ? parsed.items : [];
  const out: AiBulkResult[] = [];
  for (const it of arr) {
    if (!it?.id) continue;
    out.push({
      id: String(it.id),
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
      category: (CATEGORIES as readonly string[]).includes(it.category) ? it.category : "Misc",
      reason: String(it.reason || "AI re-evaluated").slice(0, 200),
    });
  }
  return out;
}

export function buildAiContextFromTrip(trip: any, unitSystem: "imperial" | "metric"): AiTripContext {
  const start = new Date(trip.startDate + "T00:00:00");
  const end = new Date(trip.endDate + "T00:00:00");
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  let activities: string[] = [];
  try { activities = JSON.parse(trip.activities || "[]"); } catch { /* ignore */ }
  let weather: AiTripContext["weather"] = null;
  try {
    const w = trip.weather ? JSON.parse(trip.weather) : null;
    if (w) weather = {
      minC: w.minC, maxC: w.maxC,
      rainProb: w.rainProb, snowProb: w.snowProb,
      minLabel: w.min != null ? `${Math.round(w.min)}°` : undefined,
      maxLabel: w.max != null ? `${Math.round(w.max)}°` : undefined,
    };
  } catch { /* ignore */ }
  return {
    city: trip.cityFull || trip.city || "unknown",
    days,
    tripType: trip.tripType || "leisure",
    travelers: trip.travelers || 1,
    laundry: !!trip.laundry,
    international: !!trip.international,
    activities,
    unitSystem,
    weather,
  };
}

// ============================================================
// FULL PACKING LIST GENERATION (AI-first)
// ============================================================
//
// Replaces the rule-based formula in src/lib/packing.ts as the primary
// way to build a trip's packing list. Falls back to the formula when
// the AI call fails so trip creation never blocks on OpenAI being up.
//
// Returns items in the same shape as buildPackingList() so the rest of
// the app (DB save, UI render, re-evaluate) doesn't need changes.

import type { DefaultItem, PackingItem } from "./types";

export type AiGeneratedItem = {
  itemKey: string;
  label: string;
  category: string;
  qty: number;
  reason: string;
};

const FULL_LIST_SYSTEM_PROMPT = `You are an expert travel packing assistant. Given a trip's full context, generate a COMPLETE packing list tailored to the destination, weather, duration, activities, group size, and laundry availability.

CATEGORIES (must use exactly one of):
${CATEGORIES.join(", ")}

QUANTITY RULES:
- Per-traveler items (clothing, toiletries used individually, footwear): multiply by the number of travelers.
- Shared items (chargers, adapter, first aid kit, laundry bag, plastic bags): qty = 1 regardless of group size, unless duplicates are clearly useful (e.g. multiple chargers for a couple).
- Clothing rotation:
    * With laundry: assume rewearing every 2-3 days (effective days = ceil(days / 2), min 3).
    * Without laundry: 1 outfit/day, capped per item type.
- Caps per traveler (do not exceed): underwear 10, socks 10, t-shirts 10, pants 4, shorts 4, sweaters 2, sneakers 3 pairs, dress shoes 1 pair.
- Minimum is 1 (never return 0).
- For trips < 3 days, keep counts modest; for trips > 14 days, hit the caps but don't exceed them.

WEATHER RULES (use the provided min/max in Celsius):
- minC < 0: include heavy coat, warm hat, gloves, thermals, boots.
- minC < 10: include warm jacket, sweater(s), long pants only.
- maxC > 25: include shorts, t-shirts, sun hat, sunglasses, sunscreen.
- maxC > 30: light fabrics only, extra hydration items.
- rainProb > 40%: include rain jacket / umbrella.
- snowProb > 20% or activities include "ski"/"snowboard": include snow gear.

ACTIVITY RULES:
- "beach" / "swim": swimwear, beach towel, flip-flops, sunscreen.
- "hike" / "hiking": hiking boots, daypack, water bottle.
- "ski" / "snowboard": ski jacket, ski pants, goggles, gloves, thermals.
- "gym": workout clothes, gym shoes.
- "formal" / "business": dress shirt(s), dress shoes, blazer.
- "running": running shoes, running shorts.

ALWAYS INCLUDE (baseline, regardless of trip):
- Underwear, socks, pants/shorts, t-shirts, sleepwear, walking shoes.
- Phone charger, earbuds.
- Toothbrush, toothpaste, deodorant, shampoo (travel size).
- ID/driver license, credit cards, cash.
- For international trips: passport, plug adapter, travel insurance card.

ITEM KEY: short camelCase identifier unique within the list (e.g. "tShirts", "rainJacket", "phoneCharger"). Use the SAME key for the same concept across trips so user toggles can be preserved when rebuilt.

REASON: one short phrase explaining WHY (e.g. "5 days, laundry", "rain prob 65%", "beach activity", "international trip"). Keep under 60 chars.

Respond in strict JSON only.`;

/**
 * Generate a full packing list using AI. Returns PackingItem[] in the same
 * shape as buildPackingList(). Caller is responsible for merging with user
 * defaults if desired (we pass them into the prompt as context so the model
 * can include them with proper quantities).
 */
export async function aiGeneratePackingList(
  ctx: AiTripContext,
  defaults: DefaultItem[] = []
): Promise<PackingItem[]> {
  const key = getKey();
  const defaultsBlock = defaults.length
    ? `\n\nUSER'S PERSONAL DEFAULTS (always include these, scale qty by travelers if appropriate):\n${defaults.map((d) => `- ${d.label} (category: ${d.category}, baseQty: ${d.qty})`).join("\n")}`
    : "";

  const userMsg = `Trip context: ${tripContextLine(ctx)}${defaultsBlock}

Generate the COMPLETE packing list for this trip. Include EVERY item the traveler(s) should bring, organized into the fixed categories above. Be thorough but not redundant — do not include both "extra shoes" and a multi-pair sneakers entry; bump the qty on the existing item instead.

Return JSON: {"items": [{"itemKey": "camelCase", "label": "Display Name", "category": one of [${CATEGORIES.join(", ")}], "qty": number, "reason": "short why"}, ...]}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model(),
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: FULL_LIST_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");
  const parsed = JSON.parse(raw);
  const arr = Array.isArray(parsed.items) ? parsed.items : [];
  if (arr.length === 0) throw new Error("AI returned empty list");

  const seenKeys = new Set<string>();
  const out: PackingItem[] = [];
  // Map default itemKeys so we can mark AI items that came from defaults.
  const defaultKeys = new Set(defaults.map((d) => d.itemKey));
  for (const it of arr) {
    if (!it?.label) continue;
    let itemKey = String(it.itemKey || "").trim();
    if (!itemKey) {
      itemKey = String(it.label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `item-${out.length}`;
    }
    // De-dup by key (AI sometimes repeats).
    if (seenKeys.has(itemKey)) continue;
    seenKeys.add(itemKey);

    const category = (CATEGORIES as readonly string[]).includes(it.category) ? it.category : "Misc";
    const qty = Math.max(1, Math.round(Number(it.qty) || 1));
    const reason = String(it.reason || "AI generated").slice(0, 200);
    out.push({
      itemKey,
      label: String(it.label).slice(0, 200),
      category,
      qty,
      reasons: [reason],
      source: defaultKeys.has(itemKey) ? "user-default" : "rule",
    });
  }
  return out;
}

