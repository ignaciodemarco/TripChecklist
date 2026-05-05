import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { aiSuggestForItem, aiReevaluateAll, buildAiContextFromTrip } from "@/lib/ai";
import { withApiLog } from "@/lib/api-log";
import { log } from "@/lib/logger";

// Toggle a single item's checked state, or add a manual item, or delete one.
// Body shapes:
//   { op: "toggle", itemId, checked }
//   { op: "add", label, category?, qty? }
//   { op: "delete", itemId }
//   { op: "update", itemId, qty?, label? }
//   { op: "ai-reevaluate" }
export const POST = withApiLog("trip.items", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const trip = await prisma.trip.findFirst({ where: { id, userId } });
  if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { unitSystem: true } });
  const unitSystem = (user?.unitSystem as "imperial" | "metric") || "imperial";

  const body = await req.json();
  switch (body.op) {
    case "toggle": {
      await prisma.tripItem.update({
        where: { id: body.itemId },
        data: { checked: !!body.checked },
      });
      break;
    }
    case "add": {
      const label = String(body.label || "Item").slice(0, 200);
      // If caller provided explicit qty + category (e.g. adding a known
      // default or a Formula-suggested item from the compare panel), skip
      // the AI round-trip entirely. This makes the "+ Add" buttons feel
      // instant and avoids burning OpenAI credits on items we already know.
      const explicitQty = Number.isFinite(Number(body.qty)) ? Math.max(1, Math.floor(Number(body.qty))) : null;
      const explicitCategory = typeof body.category === "string" && body.category.trim() ? String(body.category).slice(0, 80) : null;
      let suggestion: { qty: number; category: string; reason: string };
      if (explicitQty && explicitCategory) {
        suggestion = { qty: explicitQty, category: explicitCategory, reason: "Added manually" };
      } else {
        try {
          suggestion = await aiSuggestForItem(label, buildAiContextFromTrip(trip, unitSystem));
        } catch (err: any) {
          log.error("ai.suggest_failed", { userId, tripId: id, label, error: err?.message, stack: err?.stack });
          return NextResponse.json(
            { error: "ai_failed", message: err?.message || "AI suggestion failed" },
            { status: 502 }
          );
        }
      }
      const max = await prisma.tripItem.findFirst({
        where: { tripId: id }, orderBy: { sortOrder: "desc" },
      });
      const created = await prisma.tripItem.create({
        data: {
          tripId: id,
          itemKey: `manual-${Date.now()}`,
          label,
          category: suggestion.category,
          qty: suggestion.qty,
          reasons: JSON.stringify([suggestion.reason]),
          source: "manual",
          sortOrder: (max?.sortOrder ?? 0) + 1,
        },
      });
      return NextResponse.json({ ok: true, item: created });
    }
    case "ai-reevaluate": {
      const items = await prisma.tripItem.findMany({ where: { tripId: id } });
      if (items.length === 0) return NextResponse.json({ ok: true, updated: [] });
      let results;
      try {
        results = await aiReevaluateAll(
          items.map((i) => ({ id: i.id, label: i.label, category: i.category, currentQty: i.qty })),
          buildAiContextFromTrip(trip, unitSystem)
        );
      } catch (err: any) {
        log.error("ai.reevaluate_failed", { userId, tripId: id, itemCount: items.length, error: err?.message, stack: err?.stack });
        return NextResponse.json(
          { error: "ai_failed", message: err?.message || "AI re-evaluation failed" },
          { status: 502 }
        );
      }
      const byId = new Map(items.map((i) => [i.id, i]));
      const updated: any[] = [];
      await prisma.$transaction(async (tx) => {
        for (const r of results) {
          const orig = byId.get(r.id);
          if (!orig) continue;
          const u = await tx.tripItem.update({
            where: { id: r.id },
            data: { qty: r.qty, category: r.category, reasons: JSON.stringify([r.reason]) },
          });
          updated.push(u);
        }
      });
      return NextResponse.json({ ok: true, updated });
    }
    case "update": {
      const data: any = {};
      if (body.qty != null) data.qty = Math.max(1, parseInt(body.qty, 10) || 1);
      if (body.label != null) data.label = String(body.label).slice(0, 200);
      await prisma.tripItem.update({ where: { id: body.itemId }, data });
      break;
    }
    case "delete": {
      await prisma.tripItem.delete({ where: { id: body.itemId } });
      break;
    }
    case "reset": {
      await prisma.tripItem.updateMany({ where: { tripId: id }, data: { checked: false } });
      break;
    }
    default:
      return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
});
