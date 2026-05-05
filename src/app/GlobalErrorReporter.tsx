"use client";
// Hooks the browser's global error handlers and forwards them to the
// /api/client-log endpoint so unhandled UI errors surface in CloudWatch.
// Mounted once from the root layout. Renders nothing.

import { useEffect } from "react";
import { reportClientError, errToFields } from "@/lib/client-log";

export default function GlobalErrorReporter() {
  useEffect(() => {
    function onError(ev: ErrorEvent) {
      reportClientError("client.window_error", {
        message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno,
        ...errToFields(ev.error),
      });
    }
    function onRejection(ev: PromiseRejectionEvent) {
      reportClientError("client.unhandled_rejection", errToFields(ev.reason));
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
