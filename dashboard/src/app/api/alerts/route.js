import { NextResponse } from "next/server";
import { cities, prediction } from "@/lib/risk";

export async function GET(request) {
  const simulation = new URL(request.url).searchParams.get("mode") === "simulation";
  const modelUrl = (process.env.ML_MODEL_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  try {
    const response = await fetch(`${modelUrl}/alerts?use_live=${!simulation}`, {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (response.ok) {
      return NextResponse.json({
        alerts: await response.json(),
        data_source: simulation ? "Simulation (seasonal climatology)" : "LIVE (FastAPI + Open-Meteo)",
        model_source: "fastapi-v2",
      });
    }
  } catch {
    // Return the local estimator only as an explicitly labelled demo fallback.
  }

  const alerts = cities.map(([name, lat, lon]) => {
    const result = prediction(lat, lon, 7);
    return { name, lat, lon, risk: result.risk_probability, level: result.risk_level };
  });
  return NextResponse.json({
    alerts,
    data_source: "Demo seasonal estimator (FastAPI unavailable)",
    model_source: "javascript-demo-fallback",
  });
}
