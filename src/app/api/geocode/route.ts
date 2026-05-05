import { NextResponse } from "next/server";
import { withApiLog } from "@/lib/api-log";

export const GET = withApiLog("geocode", async (req: Request) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`,
    { next: { revalidate: 86400 } }
  );
  const data = await r.json();
  return NextResponse.json({ results: data.results || [] });
});
