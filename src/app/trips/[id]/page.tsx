import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import TripView from "./TripView";
import { unitLabels } from "@/lib/units";

export default async function TripDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id;

  const trip = await prisma.trip.findFirst({
    where: { id, userId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!trip) notFound();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const unitSystem = (user?.unitSystem as "imperial" | "metric") || "imperial";

  const trip2 = {
    ...trip,
    activities: safeParse<string[]>(trip.activities, []),
    weather: safeParse<any>(trip.weather, null),
    items: trip.items.map((it) => ({ ...it, reasons: safeParse<string[]>(it.reasons, []) })),
  };

  return <TripView trip={trip2} unitLabels={unitLabels(unitSystem)} unitSystem={unitSystem} />;
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
