import { NextResponse } from "next/server";
import { cities, prediction } from "@/lib/risk";

export function GET() {
  return NextResponse.json(cities.map(([name, lat, lon]) => {
    const result = prediction(lat, lon, 7);
    return { name, lat, lon, risk: result.risk_probability, level: result.risk_level };
  }));
}
