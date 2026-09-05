import { NextResponse } from "next/server";
import { prediction } from "@/lib/risk";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const month = Number(searchParams.get("month"));
  const useLive = searchParams.get("mode") !== "simulation";
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "lat, lon, and month (1–12) are required." }, { status: 400 });
  }
  const modelUrl = (process.env.ML_MODEL_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  try {
    const backendQuery = new URLSearchParams({ lat: String(lat), lon: String(lon), month: String(month), use_live: String(useLive) });
    const response = await fetch(`${modelUrl}/predict?${backendQuery}`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (response.ok) return NextResponse.json({ ...(await response.json()), model_source: "fastapi-v2" });
  } catch {
    // The UI remains usable, but labels the result clearly as a demo fallback.
  }
  return NextResponse.json({
    ...prediction(lat, lon, month),
    data_source: "Demo seasonal estimator (FastAPI unavailable)",
    model_source: "javascript-demo-fallback",
  });
}
