import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewTripForm from "./NewTripForm";

export default async function TripsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const trips = await prisma.trip.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    include: { items: true },
  });

  return (
    <div className="space-y-6">
      <NewTripForm />

      {trips.length > 0 && (
        <section className="glass rounded-2xl p-5 sm:p-7 ring-1 ring-white/5">
          <h2 className="text-lg font-semibold mb-3">Your trips</h2>
          <ul className="divide-y divide-slate-800">
            {trips.map((t) => {
              const total = t.items.length;
              const done = t.items.filter((i) => i.checked).length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              return (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <Link href={`/trips/${t.id}`} className="flex-1 hover:bg-white/5 -mx-2 px-2 py-1 rounded-lg">
                    <div className="font-medium">{t.cityFull}</div>
                    <div className="text-xs text-slate-400">
                      {fmtDate(t.startDate)} → {fmtDate(t.endDate)} · {done}/{total} packed ({pct}%)
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {user && (
        <p className="text-xs text-slate-500 text-center">
          Units: {user.unitSystem === "imperial" ? "°F · mph · in" : "°C · km/h · mm"} ·{" "}
          <Link href="/settings" className="underline hover:text-slate-300">Change in Settings</Link>
        </p>
      )}
    </div>
  );
}

function fmtDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
