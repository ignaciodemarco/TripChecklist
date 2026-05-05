import type { DefaultItem, PackingItem, TripInput, UnitSystem, WeatherSummary } from "./types";
import { unitLabels } from "./units";

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Quantity formulas come from the original "Ropa para Viajes" spreadsheet:
 *   Excel: MIN(ROUNDUP(days * mult [* season]), cap [* season])
 *
 * Season is a continuous factor in [1..2]:
 *   1.0 = full summer (warm)
 *   2.0 = full winter (cold)
 *   ~1.5 = shoulder
 * Derived from weather (min/max temp). When no weather is available, defaults to 1.5.
 */
export function buildPackingList(
  trip: TripInput,
  weather: WeatherSummary | null,
  defaults: DefaultItem[],
  unitSystem: UnitSystem
): PackingItem[] {
  const days = Math.max(
    1,
    Math.round((parseLocalDate(trip.endDate).getTime() - parseLocalDate(trip.startDate).getTime()) / 86400000) + 1
  );
  const N = trip.travelers || 1;
  const laundry = trip.laundry;
  const acts = new Set(trip.activities || []);
  const isType = (t: string) => trip.tripType === t;
  const lbl = unitLabels(unitSystem);

  const minC = weather?.minC ?? null;
  const maxC = weather?.maxC ?? null;
  const rainProb = weather?.rainProb ?? 0;
  const totalSnow = weather?.totalSnow ?? 0;
  const maxUV = weather?.maxUV ?? 0;
  const maxWind = weather?.maxWind ?? 0;

  // ----- season (1=summer, 2=winter, 1..2 in between) -----
  let season = 1.5;
  if (minC !== null && maxC !== null) {
    const avg = (minC + maxC) / 2;
    if (avg >= 22) season = 1.0;
    else if (avg <= 5) season = 2.0;
    else season = 2 - (avg - 5) / 17; // linear ramp 5°C..22°C -> 2.0..1.0
  } else if (isType("ski") || acts.has("ski")) {
    season = 2.0;
  } else if (isType("beach")) {
    season = 1.0;
  }
  const isWinter = season >= 1.66;
  const isSummer = season <= 1.34;

  // When laundry is available, treat the trip as effectively shorter for clothing rotation.
  const effDays = laundry ? Math.max(3, Math.ceil(days / 2)) : days;

  /** MIN(ROUNDUP(effDays * mult), cap) — direct port of the spreadsheet formula. */
  const qty = (mult: number, cap: number) => Math.min(Math.ceil(effDays * mult), cap);

  const pushed: PackingItem[] = [];
  const add = (
    itemKey: string, label: string, category: string, q: number,
    reasons: string | string[] = [], source: PackingItem["source"] = "rule"
  ) => {
    if (q <= 0) return;
    pushed.push({
      itemKey, label, category, qty: Math.max(1, q),
      reasons: Array.isArray(reasons) ? reasons.filter(Boolean) : (reasons ? [reasons] : []),
      source,
    });
  };

  const tFmt = (c: number) => `${Math.round(unitSystem === "imperial" ? (c * 9 / 5 + 32) : c)}${lbl.temp}`;
  const seasonNote = isWinter ? "winter mode" : isSummer ? "summer mode" : "shoulder mode";
  const dayNote = `${days} day${days > 1 ? "s" : ""}${laundry ? " (laundry)" : ""}, ${seasonNote}`;

  // ============================================================
  // SPREADSHEET FORMULAS — base wardrobe (always)
  // ============================================================

  // Sneakers: MIN(CEIL(days*0.27), 5)  — original formula in spreadsheet
  add("sneakers", "Sneakers / walking shoes", "Footwear",
      Math.max(1, qty(0.27, 5)) * N, [`${days} day${days>1?"s":""} → ×${Math.max(1, qty(0.27,5))}/person`]);

  // Socks: MIN(CEIL(days*0.6), 8)
  add("socks", "Socks (pairs)", "Clothing — Basics",
      Math.max(1, qty(0.6, 8)) * N, [dayNote]);

  // Underwear: MIN(CEIL(days*1.0), 10)
  add("underwear", "Underwear", "Clothing — Basics",
      Math.max(1, qty(1.0, 10)) * N, [dayNote]);

  // Pants: MIN(CEIL(days*0.3), 4)
  const pants = Math.max(1, qty(0.3, 4));
  add("pants", "Pants", "Clothing — Bottoms", pants * N, [dayNote]);

  // Belt: MIN(CEIL(pants/3), 2)
  add("belt", "Belt", "Clothing — Bottoms", Math.min(2, Math.ceil(pants / 3)) * N);

  // Shirts/T-shirts: MIN(CEIL(days*1.25), 10)
  add("tshirts", "T-shirts / shirts", "Clothing — Tops",
      Math.max(1, qty(1.25, 10)) * N, [dayNote]);

  // Pajamas: 1
  add("pajamas", "Pajamas / sleepwear", "Clothing — Basics", 1 * N);

  // ============================================================
  // SEASON-AWARE outerwear (spreadsheet formulas)
  // ============================================================

  // Sweater/hoodie: MIN(CEIL(days*0.2*season), 2*season). Skip if hot summer nights.
  if (!(isSummer && minC !== null && minC >= 18)) {
    const swQty = Math.max(1, Math.min(Math.ceil(2 * season), Math.ceil(effDays * 0.2 * season)));
    add("sweater", "Sweater / hoodie", "Clothing — Outerwear", swQty * N,
        minC !== null ? [`Min ${tFmt(minC)} · ${seasonNote}`] : [seasonNote]);
  }

  // Coat/jacket: MIN(CEIL(days*0.1*season), 2*season) + (1 if winter)
  if (minC === null || minC < 16) {
    const base = Math.min(Math.ceil(2 * season), Math.ceil(effDays * 0.1 * season));
    const coatQty = Math.max(1, base + (isWinter ? 1 : 0));
    const label = isWinter ? "Warm coat / parka" : "Light jacket";
    add("coat", label, "Clothing — Outerwear", coatQty * N,
        minC !== null ? [`Min ${tFmt(minC)}`] : [seasonNote]);
  }

  // Shorts & swim: MIN(CEIL(days*0.4/season), 5) — only when warm enough
  if (isSummer || (maxC !== null && maxC >= 22) || isType("beach") || acts.has("swim")) {
    const shQty = Math.max(1, qty(0.4 / season, 5));
    add("shorts", "Shorts (and swim trunks)", "Clothing — Bottoms", shQty * N,
        [maxC !== null ? `Max ${tFmt(maxC)}` : "Warm weather"]);
  }

  // Flip-flops: 1 if summer (+1 if days>30)
  if (isSummer || isType("beach") || acts.has("swim")) {
    add("flipflops", "Flip-flops", "Footwear", (1 + (days > 30 ? 1 : 0)) * N, ["Summer / beach"]);
  }

  // Cold-weather extras (only when really cold)
  if (minC !== null && minC < 2) {
    add("gloves", "Gloves", "Clothing — Outerwear", 1 * N, [`Min ${tFmt(minC)}`]);
    add("scarf",  "Scarf",  "Clothing — Outerwear", 1 * N, [`Min ${tFmt(minC)}`]);
    add("beanie", "Beanie / warm hat", "Clothing — Outerwear", 1 * N, [`Min ${tFmt(minC)}`]);
  }
  if (minC !== null && minC < 0) {
    add("thermals",   "Thermal base layer", "Clothing — Basics", 2 * N, ["Sub-zero forecast"]);
    add("handWarmer", "Hand warmers",       "Misc",              2 * N, ["Cold weather"]);
  }

  // Hot-weather extras
  if (maxC !== null && maxC >= 28) {
    add("lightShirts", "Light/breathable shirts", "Clothing — Tops",
        Math.max(1, qty(0.5, 4)) * N, [`Hot — max ${tFmt(maxC)}`]);
  }

  // ============================================================
  // RAIN
  // ============================================================
  if (rainProb >= 40 || (weather?.totalRain ?? 0) > (unitSystem === "imperial" ? 0.2 : 5)) {
    add("rainJacket", "Rain jacket / shell", "Clothing — Outerwear", 1 * N,
        [`Rain probability ${Math.round(rainProb)}%`]);
    add("umbrella", "Compact umbrella", "Misc", 1, ["Rain in forecast"]);
  }
  if (rainProb >= 60) {
    add("waterproofShoes", "Waterproof shoes / boots", "Footwear", 1 * N,
        [`Rain probability ${Math.round(rainProb)}%`]);
  }

  // ============================================================
  // SUN / UV
  // ============================================================
  if ((maxC !== null && maxC >= 22) || maxUV >= 6 || isType("beach") || isSummer) {
    add("sunscreen", "Sunscreen (SPF 30+)", "Toiletries",
        Math.max(1, Math.ceil(days / 7)),
        maxUV ? [`Max UV ${maxUV.toFixed(1)}`] : ["Sunny / hot"]);
    add("sunglasses", "Sunglasses", "Accessories", 1 * N, ["Sunny forecast"]);
  }
  if ((maxC !== null && maxC >= 28) || maxUV >= 7) {
    add("sunHat", "Sun hat / cap", "Accessories", 1 * N, ["High UV / heat"]);
    add("lipBalm", "Lip balm with SPF", "Toiletries", 1 * N, ["Sun protection"]);
  }
  if (maxWind >= (unitSystem === "imperial" ? 25 : 40)) {
    add("windbreaker", "Windbreaker", "Clothing — Outerwear", 1 * N,
        [`Wind up to ${Math.round(maxWind)} ${lbl.wind}`]);
  }

  // ============================================================
  // SNOW / SKI (only if snow forecast OR ski selected)
  // ============================================================
  if (totalSnow > 0 || isType("ski") || acts.has("ski")) {
    add("skiJacket",  "Ski jacket",            "Snow gear",            1 * N, ["Snow / ski trip"]);
    add("skiPants",   "Ski pants",             "Snow gear",            1 * N, ["Snow / ski trip"]);
    add("thermals",   "Thermal base layer",    "Clothing — Basics",    2 * N, ["Snow conditions"]);
    add("snowGloves", "Waterproof ski gloves", "Snow gear",            1 * N, ["Snow / ski trip"]);
    add("skiSocks",   "Wool ski socks",        "Snow gear",            Math.max(2, qty(0.5, 5)) * N, ["Snow / ski trip"]);
    add("goggles",    "Snow goggles",          "Snow gear",            1 * N, ["Snow / ski trip"]);
    add("beanie",     "Beanie / warm hat",     "Clothing — Outerwear", 1 * N, ["Snow conditions"]);
    add("snowBoots",  "Snow boots",            "Footwear",             1 * N, ["Snow conditions"]);
    if (acts.has("ski") || isType("ski")) {
      add("skiPasses", "Ski passes / lift tickets", "Documents", 1 * N, ["Skiing planned"]);
    }
  }

  // ============================================================
  // BEACH / SWIM (only if selected)
  // ============================================================
  if (isType("beach") || acts.has("swim")) {
    add("swimsuit",   "Swimsuit",              "Clothing — Bottoms",
        Math.min(3, 1 + Math.ceil(days / 4)) * N, ["Beach / swimming"]);
    add("beachTowel", "Quick-dry beach towel", "Misc", 1 * N, ["Beach / swimming"]);
    if (acts.has("swim")) add("swimGoggles", "Swim goggles", "Misc", 1 * N, ["Swimming"]);
  }

  // ============================================================
  // ACTIVITIES (only when chosen)
  // ============================================================
  if (acts.has("tennis")) {
    add("tennisShoes",  "Tennis shoes",   "Sports", 1 * N, ["Tennis"]);
    add("tennisOutfit", "Tennis outfit",  "Sports", Math.min(3, Math.max(1, Math.ceil(days / 3))) * N, ["Tennis"]);
    add("racquet",      "Tennis racquet", "Sports", 1 * N, ["Tennis"]);
    add("balls",        "Tennis balls",   "Sports", 1, ["Tennis"]);
  }
  if (acts.has("gym") || acts.has("running")) {
    const sportsKit = Math.min(4, Math.max(1, Math.ceil(effDays / 2)));
    add("sportsKit",    "Sports kit (shirt + shorts + socks)", "Sports", sportsKit * N, ["Gym / running"]);
    add("runningShoes", "Running shoes", "Footwear", 1 * N, ["Gym / running"]);
  }
  if (acts.has("hiking")) {
    add("hikingBoots", "Hiking boots",         "Footwear",          1 * N, ["Hiking"]);
    add("hikingPack",  "Daypack / backpack",   "Misc",              1 * N, ["Hiking"]);
    add("waterBottle", "Reusable water bottle","Misc",              1 * N, ["Hiking"]);
    add("hikingSocks", "Hiking wool socks",    "Clothing — Basics",
        Math.min(3, Math.max(1, Math.ceil(days / 3))) * N, ["Hiking"]);
  }
  if (acts.has("biking")) {
    add("bikeHelmet", "Bike helmet",        "Sports", 1 * N, ["Biking"]);
    add("bikeShorts", "Padded bike shorts", "Sports",
        Math.min(3, Math.max(1, Math.ceil(days / 3))) * N, ["Biking"]);
  }
  if (acts.has("photo")) {
    add("camera",     "Camera + lens",  "Electronics", 1, ["Photography"]);
    add("memCard",    "Spare SD cards", "Electronics", 2, ["Photography"]);
    add("camCharger", "Camera charger", "Electronics", 1, ["Photography"]);
  }

  // ============================================================
  // BUSINESS / FORMAL (only when chosen)
  // ============================================================
  if (isType("business") || acts.has("formal")) {
    add("suit",        "Suit / formal outfit", "Clothing — Formal", 1 * N, ["Business / formal"]);
    add("dressShirts", "Dress shirts",         "Clothing — Formal",
        Math.max(1, Math.min(5, Math.ceil(effDays / 1.5))) * N, ["Business / formal"]);
    add("dressShoes",  "Dress shoes",          "Footwear",          1 * N, ["Business / formal"]);
    add("tie",         "Ties / accessories",   "Clothing — Formal", 1 * N, ["Business / formal"]);
  }
  if (acts.has("work")) {
    add("laptop",        "Laptop",          "Electronics", 1, ["Working remotely"]);
    add("laptopCharger", "Laptop charger",  "Electronics", 1, ["Working remotely"]);
    add("mouse",         "Mouse / mousepad","Electronics", 1, ["Working remotely"]);
    add("headphones",    "Headphones",      "Electronics", 1, ["Working remotely"]);
    add("hdmi",          "HDMI cable",      "Electronics", 1, ["Working remotely"]);
  }

  // ============================================================
  // ALWAYS — minimal weather/activity-driven items only.
  // The original Excel master list lives in seed-defaults.ts and is merged in
  // via user defaults; the formula no longer invents toiletries / health /
  // electronics that weren't in the spreadsheet (Power bank, Earbuds, Sleep
  // mask, Shampoo, Band-aids, Travel insurance, Anti-diarrheal, Laundry bag
  // were all removed). Add them in Settings → Personal defaults if you want
  // them on every trip.
  // ============================================================
  if (minC !== null && minC < 10) add("lipBalm", "Lip balm", "Toiletries", 1 * N, ["Cold/dry weather"]);

  if (trip.international) {
    add("adapter", "Plug adapter", "Electronics", 1, ["International trip"]);
  }

  add("phoneCharger", "Phone charger", "Electronics", 1 * N);

  add("plasticBags", "Plastic bags (laundry / wet)", "Misc", 3);

  // Towel: only when accommodation likely won't provide one
  if (isType("camping") || isType("hostel") || isType("roadtrip") || acts.has("camping")) {
    add("towel", "Towel (Toalla)", "Misc", 1 * N, ["Camping / hostel / road trip — no hotel towels"]);
  }

  // ============================================================
  // USER DEFAULTS (merge in)
  // ============================================================
  for (const d of defaults) {
    add(d.itemKey, d.label, d.category, d.qty * N, ["From your defaults"], "user-default");
  }

  // ============================================================
  // MERGE BY itemKey (max qty wins; reasons union)
  // ============================================================
  const merged = new Map<string, PackingItem>();
  for (const it of pushed) {
    const prev = merged.get(it.itemKey);
    if (prev) {
      prev.qty = Math.max(prev.qty, it.qty);
      for (const r of it.reasons) if (r && !prev.reasons.includes(r)) prev.reasons.push(r);
      if (prev.source === "user-default" && it.source === "rule") prev.source = "rule";
    } else {
      merged.set(it.itemKey, { ...it });
    }
  }
  return Array.from(merged.values());
}
