import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { DefaultItem, UnitSystem } from "@/lib/types";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: u.id, name: u.name, email: u.email, image: u.image,
    unitSystem: (u.unitSystem as UnitSystem) || "imperial",
    defaults: safeParse<DefaultItem[]>(u.defaults, []),
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const data: any = {};
  if (body.unitSystem === "imperial" || body.unitSystem === "metric")
    data.unitSystem = body.unitSystem;
  if (Array.isArray(body.defaults)) {
    const cleaned: DefaultItem[] = body.defaults
      .filter((x: any) => x && typeof x.label === "string")
      .map((x: any) => ({
        itemKey: String(x.itemKey || `def-${Math.random().toString(36).slice(2, 8)}`),
        label: String(x.label).slice(0, 200),
        category: String(x.category || "Misc").slice(0, 80),
        qty: Math.max(1, parseInt(x.qty, 10) || 1),
      }));
    data.defaults = JSON.stringify(cleaned);
  }
  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true });
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
