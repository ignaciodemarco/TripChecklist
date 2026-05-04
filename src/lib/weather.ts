import type { UnitSystem, WeatherSummary, WeatherDay } from "./types";
import { cToF, kmhToMph, mmToInch } from "./units";

const SAFE_NUMS = (arr: (number | null)[]) =>
  arr.filter((v): v is number => typeof v === "number" && !isNaN(v));

function summarize(d: any, approximated: boolean, unitSystem: UnitSystem): WeatherSummary {
  const useImp = unitSystem === "imperial";
  const days: WeatherDay[] = (d?.time || []).map((t: string, i: number) => {
    const tMinC = d.temperature_2m_min?.[i] ?? null;
    const tMaxC = d.temperature_2m_max?.[i] ?? null;
    const rainMm = d.precipitation_sum?.[i] ?? 0;
    const snowCm = d.snowfall_sum?.[i] ?? 0;
    const windKmh = d.wind_speed_10m_max?.[i] ?? null;
    return {
      date: t,
      tMin: tMinC == null ? null : (useImp ? cToF(tMinC) : tMinC),
      tMax: tMaxC == null ? null : (useImp ? cToF(tMaxC) : tMaxC),
      rain: useImp ? mmToInch(rainMm) : rainMm,
      rainProb: d.precipitation_probability_max?.[i] ?? null,
      snow: useImp ? snowCm / 2.54 : snowCm,
      wind: windKmh == null ? null : (useImp ? kmhToMph(windKmh) : windKmh),
      uv: d.uv_index_max?.[i] ?? null,
      code: d.weather_code?.[i] ?? null,
    };
  });

  // Always-celsius for rules
  const minsC = SAFE_NUMS(d?.temperature_2m_min ?? []);
  const maxsC = SAFE_NUMS(d?.temperature_2m_max ?? []);
  const minC = minsC.length ? Math.min(...minsC) : null;
  const maxC = maxsC.length ? Math.max(...maxsC) : null;

  const probs = SAFE_NUMS(days.map(x => x.rainProb));
  return {
    approximated,
    units: useImp
      ? { temp: "F", precip: "inch", wind: "mph" }
      : { temp: "C", precip: "mm", wind: "kmh" },
    days,
    min: minC == null ? null : (useImp ? cToF(minC) : minC),
    max: maxC == null ? null : (useImp ? cToF(maxC) : maxC),
    rainProb: probs.length ? Math.max(...probs) : (days.some(x => x.rain > 0.05) ? 70 : 20),
    totalRain: days.reduce((s, x) => s + (x.rain || 0), 0),
    totalSnow: days.reduce((s, x) => s + (x.snow || 0), 0),
    maxUV:   SAFE_NUMS(days.map(x => x.uv)).reduce((a, b) => Math.max(a, b), 0),
    maxWind: SAFE_NUMS(days.map(x => x.wind)).reduce((a, b) => Math.max(a, b), 0),
    minC,
    maxC,
  };
}

// Parse "yyyy-mm-dd" as a date-only value (no timezone shift).
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function fetchForecast(
  lat: number, lon: number, startISO: string, endISO: string, unitSystem: UnitSystem
): Promise<WeatherSummary> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = parseLocalDate(startISO);
  const end = parseLocalDate(endISO);
  const sixteen = new Date(today.getTime() + 16 * 86400000);

  const fStart = start < today ? today : start;
  const fEnd = end < sixteen ? end : sixteen;

  if (fEnd < fStart) {
    return await fetchClimateFallback(lat, lon, start, end, unitSystem);
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: [
      "temperature_2m_max", "temperature_2m_min",
      "precipitation_sum", "precipitation_probability_max",
      "wind_speed_10m_max", "uv_index_max",
      "snowfall_sum", "weather_code",
    ].join(","),
    timezone: "auto",
    start_date: toISODate(fStart),
    end_date: toISODate(fEnd),
  });
  // We always request celsius/kmh/mm and convert ourselves so the rule engine
  // has a single source of truth.
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!r.ok) throw new Error("Weather request failed");
  const data = await r.json();
  if (!data.daily?.time?.length) {
    return await fetchClimateFallback(lat, lon, start, end, unitSystem);
  }
  return summarize(data.daily, false, unitSystem);
}

async function fetchClimateFallback(
  lat: number, lon: number, start: Date, end: Date, unitSystem: UnitSystem
): Promise<WeatherSummary> {
  const offset = (d: Date) => { const x = new Date(d); x.setFullYear(x.getFullYear() - 1); return x; };
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum",
    timezone: "auto",
    start_date: toISODate(offset(start)),
    end_date: toISODate(offset(end)),
  });
  try {
    const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`,
      { next: { revalidate: 86400 } });
    const data = await r.json();
    return summarize(data.daily, true, unitSystem);
  } catch {
    return summarize({ time: [] }, true, unitSystem);
  }
}
