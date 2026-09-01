import { NextResponse } from "next/server";
import { prediction } from "@/lib/risk";

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const month = Number(searchParams.get("month"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "lat, lon, and month (1–12) are required." }, { status: 400 });
  }
  return NextResponse.json(prediction(lat, lon, month));
}
