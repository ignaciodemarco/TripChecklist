// Shared helpers for the /api/trips route handlers. Lives outside route.ts
// because Next.js 15 only allows specific named exports (GET, POST, etc.) from
// a route file — exporting `serializeTrip` from there fails the type check.

export function safeParse<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

export function serializeTrip(trip: any) {
  return {
    ...trip,
    activities: safeParse(trip.activities, []),
    weather: safeParse(trip.weather, null),
    items: (trip.items || [])
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      .map((it: any) => ({ ...it, reasons: safeParse(it.reasons, []) })),
  };
}
