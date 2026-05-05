// Request-logging middleware. Runs on every request (filtered by `matcher`
// below) and emits a structured JSON log line per request. Adds an
// `x-request-id` header so we can correlate client errors with server logs.
//
// Output goes to stdout, which AWS App Runner ships to CloudWatch Logs
// (group: /aws/apprunner/tripchecklist/.../application).
//
// To find a specific request later:
//   ./scripts/aws-logs.ps1 -RequestId <id>
//
// NOTE: Edge runtime — keep this file dependency-free (no prisma/openai/etc).
import { NextRequest, NextResponse } from "next/server";

function rid(): string {
  // crypto.randomUUID is available in the Edge runtime.
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

export function middleware(req: NextRequest) {
  const start = Date.now();
  const requestId = req.headers.get("x-request-id") || rid();
  const { pathname, search } = req.nextUrl;
  const method = req.method;

  const res = NextResponse.next();
  res.headers.set("x-request-id", requestId);

  // We can't await the response here, but we can log the inbound side
  // synchronously and the route handlers can log completion using the same id.
  // One JSON line per request keeps CloudWatch tidy.
  const line = {
    t: new Date().toISOString(),
    level: "info",
    event: "http.request",
    requestId,
    method,
    path: pathname,
    query: search || undefined,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    ua: req.headers.get("user-agent") || undefined,
    referer: req.headers.get("referer") || undefined,
    durationMs: Date.now() - start, // middleware-only timing (always near 0)
  };
  try { console.log(JSON.stringify(line)); } catch { /* ignore */ }
  return res;
}

export const config = {
  // Skip static assets and the Next.js internals; log everything else.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)"],
};
