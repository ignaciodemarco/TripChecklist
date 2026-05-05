// Side-by-side compare: runs BOTH the AI generator and the deterministic
// formula against this trip's current context and returns the two lists
// plus per-category counts. No DB writes — pure inspection endpoint.
//
// Used by the "Compare AI vs Formula" button in TripView so you can see
// what each generator would produce for the same trip.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { aiGeneratePackingList, buildAiContextFromTrip } from "@/lib/ai";
import { buildPackingList } from "@/lib/packing";
import { withApiLog } from "@/lib/api-log";
import { log } from "@/lib/logger";
import type { DefaultItem, PackingItem, UnitSystem } from "@/lib/types";

export const dynamic = "force-dynamic";

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function summarize(items: PackingItem[]) {
  const byCategory: Record<string, { count: number; totalQty: number }> = {};
  let totalItems = 0;
  let totalQty = 0;
  for (const it of items) {
    totalItems++;
    totalQty += it.qty;
    const c = (byCategory[it.category] ||= { count: 0, totalQty: 0 });
    c.count++;
    c.totalQty += it.qty;
  }
  return { totalItems, totalQty, byCategory };
}

export const GET = withApiLog("trip.compare", async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const trip = await prisma.trip.findFirst({ where: { id, userId } });
  if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const unitSystem = (user?.unitSystem as UnitSystem) || "imperial";
  const defaults: DefaultItem[] = safeParse(user?.defaults, []);

  const tripInput = {
    city: trip.city,
    cityFull: trip.cityFull,
    lat: trip.lat,
    lon: trip.lon,
    startDate: trip.startDate,
    endDate: trip.endDate,
    tripType: trip.tripType,
    travelers: trip.travelers,
    laundry: trip.laundry,
    international: trip.international,
    activities: safeParse<string[]>(trip.activities, []),
  };
  const weather = safeParse<any>(trip.weather, null);

  // Run formula synchronously (cheap).
  const tF0 = Date.now();
  const formulaItems = buildPackingList(tripInput, weather, defaults, unitSystem);
  const formulaMs = Date.now() - tF0;

  // Run AI in parallel-friendly fashion. Capture errors but don't fail the
  // whole endpoint — the user still wants to see the formula side.
  const aiCtx = buildAiContextFromTrip(
    {
      cityFull: trip.cityFull, city: trip.city,
      startDate: trip.startDate, endDate: trip.endDate,
      tripType: trip.tripType, travelers: trip.travelers,
      laundry: trip.laundry, international: trip.international,
      activities: trip.activities,
      weather: trip.weather,
    },
    unitSystem
  );

  const tA0 = Date.now();
  let aiItems: PackingItem[] = [];
  let aiError: string | null = null;
  try {
    aiItems = await aiGeneratePackingList(aiCtx, defaults);
  } catch (err: any) {
    aiError = err?.message || String(err);
    log.warn("trip.compare_ai_failed", { userId, tripId: id, error: aiError });
  }
  const aiMs = Date.now() - tA0;

  return NextResponse.json({
    tripId: id,
    context: {
      city: trip.cityFull,
      days: aiCtx.days,
      travelers: trip.travelers,
      tripType: trip.tripType,
      laundry: trip.laundry,
      international: trip.international,
      activities: tripInput.activities,
      weather: weather ? { minC: weather.minC, maxC: weather.maxC, rainProb: weather.rainProb } : null,
    },
    ai: {
      ok: !aiError,
      error: aiError,
      durationMs: aiMs,
      summary: summarize(aiItems),
      items: aiItems,
    },
    formula: {
      ok: true,
      durationMs: formulaMs,
      summary: summarize(formulaItems),
      items: formulaItems,
    },
  });
});
