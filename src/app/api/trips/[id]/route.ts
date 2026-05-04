import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { serializeTrip } from "../route";
import { fetchForecast } from "@/lib/weather";
import { buildPackingList } from "@/lib/packing";
import type { DefaultItem, UnitSystem } from "@/lib/types";

async function ownTrip(id: string) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return { trip: null, userId: null };
  const trip = await prisma.trip.findFirst({ where: { id, userId }, include: { items: true } });
  return { trip, userId };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { trip } = await ownTrip(id);
  if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(serializeTrip(trip));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { trip } = await ownTrip(id);
  if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.trip.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

// PATCH: edit trip fields. If anything that affects packing changes
// (dates, laundry, activities, tripType, travelers, international, or lat/lon),
// re-fetch weather and rebuild the rule-generated items.
// Manual items (source="manual") are preserved untouched.
// Rule items keep their `checked` state when their itemKey still exists.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { trip, userId } = await ownTrip(id);
  if (!trip || !userId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const next = {
    city: typeof body.city === "string" ? body.city : trip.city,
    cityFull: typeof body.cityFull === "string" ? body.cityFull : trip.cityFull,
    lat: typeof body.lat === "number" ? body.lat : trip.lat,
    lon: typeof body.lon === "number" ? body.lon : trip.lon,
    startDate: typeof body.startDate === "string" ? body.startDate : trip.startDate,
    endDate: typeof body.endDate === "string" ? body.endDate : trip.endDate,
    tripType: typeof body.tripType === "string" ? body.tripType : trip.tripType,
    travelers: body.travelers != null ? Math.max(1, parseInt(body.travelers, 10) || 1) : trip.travelers,
    laundry: typeof body.laundry === "boolean" ? body.laundry : trip.laundry,
    international: typeof body.international === "boolean" ? body.international : trip.international,
    activities: Array.isArray(body.activities) ? body.activities : safeParse<string[]>(trip.activities, []),
  };

  if (new Date(next.endDate) < new Date(next.startDate)) {
    return NextResponse.json({ error: "endDate before startDate" }, { status: 400 });
  }

  const packingAffected =
    next.startDate !== trip.startDate ||
    next.endDate !== trip.endDate ||
    next.tripType !== trip.tripType ||
    next.travelers !== trip.travelers ||
    next.laundry !== trip.laundry ||
    next.international !== trip.international ||
    next.lat !== trip.lat ||
    next.lon !== trip.lon ||
    JSON.stringify(next.activities) !== trip.activities;

  let weatherJson: string | null = trip.weather;
  if (packingAffected) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const unitSystem = (user?.unitSystem as UnitSystem) || "imperial";
      const defaults: DefaultItem[] = safeParse(user?.defaults, []);
      let weather = null;
      try {
        weather = await fetchForecast(next.lat, next.lon, next.startDate, next.endDate, unitSystem);
      } catch { /* non-fatal */ }
      weatherJson = weather ? JSON.stringify(weather) : null;

      const newItems = buildPackingList(next, weather, defaults, unitSystem);

      // Preserve checked state of rule items by itemKey.
      const checkedByKey = new Map<string, boolean>();
      for (const it of trip.items) {
        if (it.source !== "manual") checkedByKey.set(it.itemKey, it.checked);
      }

      // Wipe rule items, keep manual.
      await prisma.tripItem.deleteMany({ where: { tripId: id, source: { not: "manual" } } });

      const maxManual = await prisma.tripItem.findFirst({
        where: { tripId: id, source: "manual" },
        orderBy: { sortOrder: "desc" },
      });
      const baseSort = (maxManual?.sortOrder ?? 0) + 1;

      await prisma.tripItem.createMany({
        data: newItems.map((it, i) => ({
          tripId: id,
          itemKey: it.itemKey,
          label: it.label,
          category: it.category,
          qty: it.qty,
          reasons: JSON.stringify(it.reasons),
          source: it.source,
          sortOrder: baseSort + i,
          checked: checkedByKey.get(it.itemKey) ?? false,
        })),
      });
    } catch (err: any) {
      return NextResponse.json({ error: "rebuild_failed", message: err?.message }, { status: 500 });
    }
  }

  await prisma.trip.update({
    where: { id },
    data: {
      city: next.city,
      cityFull: next.cityFull,
      lat: next.lat,
      lon: next.lon,
      startDate: next.startDate,
      endDate: next.endDate,
      tripType: next.tripType,
      travelers: next.travelers,
      laundry: next.laundry,
      international: next.international,
      activities: JSON.stringify(next.activities),
      weather: weatherJson,
    },
  });

  const fresh = await prisma.trip.findUnique({ where: { id }, include: { items: true } });
  return NextResponse.json(serializeTrip(fresh));
}
