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
    rainProb?: number;
    /** Total accumulated snow over the trip, in cm. >0 implies snow on at least one day. */
    totalSnowCm?: number;
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
    // ALWAYS send Celsius to the AI regardless of user's display preference,
    // because the prompt's weather rules are written in Celsius. Sending
    // Fahrenheit labels caused the AI to misread "51°" as Celsius and
    // over-pack winter gear (e.g. hand warmers for an Istanbul summer trip).
    const range = (w.minC != null && w.maxC != null)
      ? `${Math.round(w.minC)}°C to ${Math.round(w.maxC)}°C`
      : "unknown";
    parts.push(`Weather: ${range}, rain prob ${Math.round(w.rainProb ?? 0)}%, total snow ${(w.totalSnowCm ?? 0).toFixed(1)} cm`);
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
      rainProb: w.rainProb,
      // Convert totalSnow (in user units: mm or inch) to cm for the prompt.
      totalSnowCm: w.totalSnow != null
        ? (unitSystem === "imperial" ? w.totalSnow * 2.54 : w.totalSnow / 10)
        : 0,
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

const FULL_LIST_SYSTEM_PROMPT = `You are an expert travel packing assistant. Given a trip's full context, generate a COMPLETE, EXHAUSTIVE packing list tailored to the destination, weather, duration, activities, group size, and laundry availability.

CATEGORIES (must use exactly one of):
${CATEGORIES.join(", ")}

═══════════════════════════════════════════════════════════════
QUANTITY RULES — read carefully, errors here are the most common:
═══════════════════════════════════════════════════════════════

PER-TRAVELER items (multiply final qty by N = number of travelers):
  Clothing (underwear, socks, t-shirts, pants, shorts, sweaters, sleepwear, swimwear),
  Footwear, individually-used toiletries (toothbrush, deodorant, razor),
  Documents (ID, passport — one per person), thermal layers, sun hat, sunglasses.

SHARED items (qty does NOT multiply by travelers, usually 1):
  Plug adapter, first aid kit, laundry bag, plastic bags, eye mask (1 per person actually),
  Sunscreen tube, shampoo bottle, toothpaste tube, beach towel (1 per person).
  EXCEPTIONS that scale with travelers: phone charger (1 per traveler), earbuds (1 per traveler),
  water bottle (1 per traveler), power bank (1 per 2 travelers, min 1).

CLOTHING ROTATION FORMULA (per traveler, BEFORE multiplying by N):
  effDays = laundry ? max(3, ceil(days / 2)) : days
  underwear = min(effDays, 10)        // per person, then × N
  socks     = min(effDays, 10)        // per person, then × N
  tShirts   = min(ceil(effDays * 0.7), 10)
  pants     = min(ceil(effDays * 0.3), 4)
  shorts    = min(ceil(effDays * 0.3), 4)   // only if maxC > 22 or beach
  sweaters  = min(ceil(effDays * 0.2), 2)   // only if minC < 18
  sleepwear = min(ceil(effDays * 0.5), 3)
  Sneakers  = min(ceil(days * 0.27 + 1), 3) pairs
  Worked example: 4 travelers, 7 days, laundry → effDays=4 → underwear=4 per person × 4 travelers = 16 total.

═══════════════════════════════════════════════════════════════
ALWAYS-INCLUDE BASELINE (every trip, regardless of context):
═══════════════════════════════════════════════════════════════

Clothing — Basics: underwear, socks, t-shirts, sleepwear/pajamas
Clothing — Bottoms: pants
Footwear: walking shoes / sneakers
Toiletries: toothbrush, toothpaste, deodorant, shampoo, body wash/soap, moisturizer, razor, comb/brush, nail clipper, lip balm
Health: aspirin/ibuprofen, band-aids, basic first aid. ALSO antibiotic (Azithro/Cipro) AND anti-diarrheal (Pepto/Imodium) for ANY international trip — list them in Health, qty=1 each. Do not skip these.
Documents: ID/driver license, credit cards, cash. NOTE: qty here means count of physical items (1 wallet of cash, 1-2 cards, 1 ID), NEVER a currency amount or document page count. All Documents items should have qty between 1 and N (travelers).
Electronics: phone charger, earbuds, power bank
Misc: plastic bags (laundry / wet items), sleep / eye mask

INTERNATIONAL TRIPS — also include: passport, plug adapter, travel insurance card, antibiotic (Azithro/Cipro), anti-diarrheal (Pepto/Imodium). DO NOT skip the meds even for first-world destinations — they are part of every international kit.

═══════════════════════════════════════════════════════════════
WEATHER ADD-ONS (use the provided min/max in Celsius):
═══════════════════════════════════════════════════════════════
  minC < 0:  heavy coat, warm hat (beanie), gloves, thermal base layer, snow boots, scarf, hand warmers
  minC < 10: warm jacket, sweater(s), long pants only, lip balm
  minC < 18: light jacket / sweater
  maxC > 22: shorts, t-shirts, sun hat, sunglasses, sunscreen
  maxC > 30: light/breathable fabrics only, extra hydration, sunscreen
  rainProb > 40%: rain jacket / shell, compact umbrella
  totalSnowCm > 1 OR activities include ski/snowboard: full snow gear (see below)

═══════════════════════════════════════════════════════════════
ACTIVITY ADD-ONS (these are NON-NEGOTIABLE — include every listed item):
═══════════════════════════════════════════════════════════════
  beach / swim:        swimwear, beach towel, flip-flops, sunscreen, swim goggles
  hike / hiking:       hiking boots, daypack, water bottle, hiking socks
  ski / snowboard:     ski jacket, ski pants, snow goggles, ski gloves, thermal base layer, snow boots, hand warmers, wool ski socks, lift tickets / passes, scarf
  gym:                 workout clothes, gym shoes
  formal / business:   USE CATEGORY "Clothing — Formal" for these — dress shirts (1 per 1.5 days, cap 5), dress shoes (1 pair), blazer, ties (2-3), suit / formal outfit (1). Do NOT lump these into Outerwear.
  running:             running shoes, running shorts, moisture-wicking shirts

TRIP TYPE === "business" implies the formal activity even if not listed.
TRIP TYPE === "ski" implies the ski activity even if not listed.
TRIP TYPE === "beach" implies beach + swim activities even if not listed.

═══════════════════════════════════════════════════════════════
ACCOMMODATION-DEPENDENT ITEMS:
═══════════════════════════════════════════════════════════════
  Bath towel ("Towel"): ONLY include for tripType in {camping, hostel, roadtrip} or activity "camping". Hotels and most rentals provide towels — do NOT add a bath towel for leisure/business/beach/ski/city trips. (Beach towel is separate and follows the beach/swim activity rule above.)

═══════════════════════════════════════════════════════════════
ANTI-REDUNDANCY:
═══════════════════════════════════════════════════════════════
- Don't include both "extra shoes" and "sneakers" — bump qty on the existing item.
- Don't include "first aid kit" if you list its components separately (band-aids, aspirin).
- Use ONE label per concept (don't list "T-Shirts" and "Light shirts" separately unless context truly differs).

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT:
═══════════════════════════════════════════════════════════════
- itemKey: short camelCase identifier, REUSE the same keys across trips for the same concept:
    underwear, socks, tShirts, pants, shorts, sweater, sleepwear, sneakers, hikingBoots, dressShoes, flipFlops,
    rainJacket, warmJacket, heavyCoat, gloves, beanie, scarf, thermalBase, snowBoots, snowGoggles, skiJacket, skiPants,
    swimwear, beachTowel, sunHat, sunglasses, sunscreen, lipBalm,
    toothbrush, toothpaste, deodorant, shampoo, bodyWash, moisturizer, razor, combBrush, nailClipper,
    aspirin, bandaids, antibiotic, antiDiarrheal,
    id, cards, cash, passport, adapter, insurance,
    phoneCharger, earbuds, powerBank, waterBottle, daypack,
    plasticBags, eyeMask, laundryBag
- reason: short phrase WITH qty math when relevant (e.g. "7 days, laundry → 4/person × 4 travelers", "rain prob 65%", "international trip"). Max 80 chars.
- Be EXHAUSTIVE — aim for 30-50 items typical, MORE for longer trips. Don't skip Health, Toiletries, or Misc baselines.

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
    ? `\n\nUSER'S PERSONAL DEFAULTS — these are concepts the user wants to ALWAYS see in their packing list. You MUST include an item for each one (using the same itemKey and a similar label so it merges correctly), but DECIDE THE QTY YOURSELF based on trip length, travelers, and activity rules above. The "baseQty" below is just the user's minimum personal preference for a single short trip — for longer trips you should bump it up using the same logic you'd use for any other item (e.g. sneakers / walking shoes for a 13-day trip = 3-4 pairs, not 1). Never go below baseQty × travelers.\n${defaults.map((d) => `- itemKey: ${d.itemKey} | label: ${d.label} | category: ${d.category} | baseQty (per person, minimum): ${d.qty}`).join("\n")}`
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

