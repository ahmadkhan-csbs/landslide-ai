import { NextResponse } from "next/server";
import { prediction } from "@/lib/risk";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const month = Number(searchParams.get("month"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "lat, lon, and month (1–12) are required." }, { status: 400 });
  }
  const modelUrl = process.env.ML_MODEL_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${modelUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, month }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (response.ok) return NextResponse.json(await response.json());
  } catch {
    // Keep the dashboard usable while the optional local ML service is starting.
  }
  return NextResponse.json({ ...prediction(lat, lon, month), model_source: "javascript-fallback" });
}
