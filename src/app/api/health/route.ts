// Public health endpoint. No auth — safe to expose. Useful for:
//   - Verifying which build is running (sha, buildTime)
//   - Checking DB connectivity from outside
//   - Smoke-testing after a deployment
//
// Example: curl https://<host>/api/health
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BUILD_SHA, BUILD_SHORT_SHA, BUILD_TIME, APP_ENV } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;
  try {
    const t0 = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch (err: any) {
    dbError = err?.message || String(err);
  }

  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      sha: BUILD_SHA,
      shortSha: BUILD_SHORT_SHA,
      buildTime: BUILD_TIME,
      env: APP_ENV,
      now: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
      tookMs: Date.now() - startedAt,
    },
    { status: dbOk ? 200 : 503 }
  );
}
