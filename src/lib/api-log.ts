// Helper to wrap Next.js route handlers with structured request/response logs.
//
// Why: middleware.ts logs the inbound side from the Edge, but it can't see
// the final status code, the authenticated user, or thrown errors. This
// wrapper runs in the Node runtime around each route handler and emits a
// single `http.response` line including duration, status, userId, and any
// error stack.
//
// Usage in a route file:
//
//   import { withApiLog } from "@/lib/api-log";
//   export const GET = withApiLog("trips.list", async (req) => { ... });
//
// The handler signature stays the same as a normal Next.js route handler.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { log } from "@/lib/logger";

type Handler = (req: Request, ctx: any) => Promise<Response> | Response;

export function withApiLog(event: string, handler: Handler): Handler {
  return async (req, ctx) => {
    const start = Date.now();
    const requestId = req.headers.get("x-request-id") || undefined;
    let userId: string | null = null;
    try {
      const session = await auth().catch(() => null);
      userId = (session?.user as any)?.id ?? null;
    } catch { /* auth() can throw on edge cases — ignore for logging only */ }

    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (err: any) {
      log.error("http.handler_error", {
        event,
        requestId,
        userId,
        method: req.method,
        url: safeUrl(req.url),
        durationMs: Date.now() - start,
        error: err?.message || String(err),
        stack: err?.stack,
      });
      return NextResponse.json(
        { error: "internal_error", requestId },
        { status: 500, headers: requestId ? { "x-request-id": requestId } : undefined }
      );
    }

    log.info("http.response", {
      event,
      requestId,
      userId,
      method: req.method,
      url: safeUrl(req.url),
      status: res.status,
      durationMs: Date.now() - start,
    });
    return res;
  };
}

function safeUrl(u: string): string {
  try { const x = new URL(u); return x.pathname + (x.search || ""); } catch { return u; }
}
