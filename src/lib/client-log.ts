// Lightweight client-side error reporter. Posts JSON to /api/client-log so
// browser-side failures show up in CloudWatch alongside server logs. Best
// effort — never throws, never blocks the caller.

export function reportClientError(event: string, fields: Record<string, unknown> = {}) {
  try {
    const body = JSON.stringify({
      event,
      ...fields,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      ts: new Date().toISOString(),
    });
    // sendBeacon survives page unloads; fall back to fetch.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/client-log", blob);
      return;
    }
    void fetch("/api/client-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => { /* logging must never throw */ });
  } catch {
    /* logging must never throw */
  }
}

export function errToFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { errorMessage: err.message, errorName: err.name, stack: err.stack?.slice(0, 2000) };
  }
  return { errorMessage: String(err) };
}
