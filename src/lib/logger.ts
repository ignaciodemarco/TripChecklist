// Tiny structured JSON logger. Writes single-line JSON to stdout so AWS App
// Runner / CloudWatch picks it up cleanly. Use sparingly — call `log.info`,
// `log.warn`, `log.error` from server code (route handlers, lib functions).
//
// Usage:
//   import { log } from "@/lib/logger";
//   log.info("trip.rebuild", { tripId, userId, itemsBefore, itemsAfter });

import { BUILD_SHORT_SHA } from "./version";

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, event: string, fields?: Record<string, unknown>) {
  const line = {
    t: new Date().toISOString(),
    level,
    event,
    sha: BUILD_SHORT_SHA,
    ...fields,
  };
  // Use the matching console method so log levels map cleanly downstream.
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  try {
    fn(JSON.stringify(line));
  } catch {
    fn(`[${level}] ${event}`);
  }
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info:  (event: string, fields?: Record<string, unknown>) => emit("info",  event, fields),
  warn:  (event: string, fields?: Record<string, unknown>) => emit("warn",  event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
