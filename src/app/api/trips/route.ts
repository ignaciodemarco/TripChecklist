import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { fetchForecast } from "@/lib/weather";
import { buildPackingList } from "@/lib/packing";
import type { DefaultItem, UnitSystem } from "@/lib/types";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const trips = await prisma.trip.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    include: { items: true },
  });
  return NextResponse.json(trips.map(serializeTrip));
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { city, cityFull, lat, lon, startDate, endDate, tripType, travelers,
          laundry, international, activities } = body || {};
  if (!city || !cityFull || lat == null || lon == null || !startDate || !endDate) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 401 });
  const unitSystem = (user.unitSystem as UnitSystem) || "imperial";
  const defaults: DefaultItem[] = safeParse(user.defaults, []);

  let weather = null;
  try {
    weather = await fetchForecast(lat, lon, startDate, endDate, unitSystem);
  } catch { /* non-fatal */ }

  const tripInput = {
    city, cityFull, lat, lon, startDate, endDate,
    tripType: tripType || "leisure",
    travelers: Math.max(1, parseInt(travelers, 10) || 1),
    laundry: !!laundry,
    international: !!international,
    activities: Array.isArray(activities) ? activities : [],
  };
  const items = buildPackingList(tripInput, weather, defaults, unitSystem);

  const trip = await prisma.trip.create({
    data: {
      userId,
      ...tripInput,
      activities: JSON.stringify(tripInput.activities),
      weather: weather ? JSON.stringify(weather) : null,
      items: {
        create: items.map((it, i) => ({
          itemKey: it.itemKey,
          label: it.label,
          category: it.category,
          qty: it.qty,
          reasons: JSON.stringify(it.reasons),
          source: it.source,
          sortOrder: i,
        })),
      },
    },
    include: { items: true },
  });
  return NextResponse.json(serializeTrip(trip));
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
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
