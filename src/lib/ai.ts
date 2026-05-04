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
