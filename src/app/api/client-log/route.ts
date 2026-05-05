// Receives client-side error reports and logs them to CloudWatch via the
// shared structured logger. Public endpoint (no auth) — anyone can POST and
// pollute logs, but the same is true of every public route, and these reports
// are invaluable for diagnosing UI bugs.

import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { auth } from "@/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    payload = { raw: await req.text().catch(() => "") };
  }
  const session = await auth().catch(() => null);
  const userId = (session?.user as any)?.id;
  log.warn("client.error", {
    userId,
    requestId: req.headers.get("x-request-id"),
    referer: req.headers.get("referer"),
    ...payload,
  });
  return NextResponse.json({ ok: true });
}
