"""Auditable data refresh commands; safe for a scheduler or manual execution.

Examples:
  python pipeline.py weather
  python pipeline.py nasa-power --start 20250101 --end 20260905
  python pipeline.py coolr
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests

from backend.config import DATABASE_PATH, ROOT_DIR
from backend.providers import ProviderUnavailable, fetch_preferred_weather
from backend.store import ObservationStore, utc_now
from backend.app import CITIES

RAW = ROOT_DIR / "data" / "raw"
PROCESSED = ROOT_DIR / "data" / "processed"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
# NASA's current public directory exposes this collection as MapServer. The
# earlier FeatureServer address is retained as an optional override, but returns
# 404 at the time this pipeline was verified.
COOLR_SERVICE_URL = "https://gis.earthdata.nasa.gov/gis05/rest/services/Landslides/COOLR_Events_Points/MapServer"
COOLR_URL = os.getenv("COOLR_QUERY_URL", COOLR_SERVICE_URL + "/0/query")


def snapshot_path(source: str, suffix: str) -> Path:
    directory = RAW / source / date.today().isoformat()
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{source}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.{suffix}"


def refresh_weather() -> dict[str, int]:
    store = ObservationStore(DATABASE_PATH); store.initialise()
    successes = failures = 0
    for city in CITIES:
        try:
            observation = fetch_preferred_weather(city["name"], city["lat"], city["lon"])
            store.save_observation(observation); successes += 1
        except ProviderUnavailable as exc:
            failures += 1; print(f"weather failed for {city['name']}: {exc}")
    return {"saved": successes, "failed": failures}


def power_daily(lat: float, lon: float, start: str, end: str) -> dict[str, float]:
    response = requests.get(POWER_URL, params={"parameters": "PRECTOTCORR", "community": "AG", "longitude": lon, "latitude": lat, "start": start, "end": end, "format": "JSON"}, timeout=90)
    response.raise_for_status()
    values = response.json()["properties"]["parameter"]["PRECTOTCORR"]
    if not isinstance(values, dict) or not values:
        raise ValueError("NASA POWER returned no daily PRECTOTCORR values")
    return values


def refresh_nasa_power(start: str, end: str) -> Path:
    """Fetch 2025+ separately, preserve a raw dated snapshot, then make a merged processed CSV."""
    if not (start.isdigit() and end.isdigit() and len(start) == len(end) == 8):
        raise ValueError("dates must be YYYYMMDD")
    if start < "20250101":
        raise ValueError("This command is deliberately limited to the 2025+ backfill; it will not overwrite 2015–2024.")
    if end > date.today().strftime("%Y%m%d"):
        raise ValueError("end date cannot be in the future")
    stations = pd.read_csv(ROOT_DIR / "data" / "ner_rainfall_2015_2024.csv").groupby("city", as_index=False).first()[["city", "lat", "lon"]]
    rows: list[dict[str, Any]] = []
    station_audit: list[dict[str, Any]] = []
    failures: list[str] = []
    for _, station in stations.iterrows():
        try:
            values = power_daily(float(station.lat), float(station.lon), start, end)
            valid = 0
            for stamp, rain in values.items():
                if isinstance(rain, (int, float)) and rain >= 0:
                    parsed = datetime.strptime(stamp, "%Y%m%d")
                    rows.append({"city": station.city, "lat": station.lat, "lon": station.lon, "date": stamp, "year": parsed.year, "month": parsed.month, "rainfall_mm_day": rain, "source": "NASA POWER Daily PRECTOTCORR"})
                    valid += 1
            station_audit.append({"city": station.city, "lat": station.lat, "lon": station.lon, "valid_daily_records": valid})
            if not valid:
                failures.append(f"{station.city}: no valid daily values")
        except (requests.RequestException, KeyError, ValueError) as exc:
            failures.append(f"{station.city}: {exc}")
        time.sleep(1.2)  # polite sequential rate limit
    if failures:
        # Preserve an error audit, but never publish a partial merged climate file.
        failure_snapshot = snapshot_path("nasa_power", "failure.json")
        failure_snapshot.write_text(json.dumps({"source": "NASA POWER Daily API", "fetched_at_utc": utc_now(), "requested_range": [start, end], "failures": failures, "station_audit": station_audit}, indent=2), encoding="utf-8")
        raise RuntimeError("NASA POWER backfill incomplete; processed dataset was not changed: " + "; ".join(failures))
    snapshot = snapshot_path("nasa_power", "csv")
    pd.DataFrame(rows).to_csv(snapshot, index=False)
    raw_out = RAW / "nasa_power" / "ner_rainfall_2025_2026.csv"; raw_out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(raw_out, index=False)
    monthly = pd.DataFrame(rows).groupby(["city", "lat", "lon", "year", "month"], as_index=False)["rainfall_mm_day"].mean().rename(columns={"rainfall_mm_day": "avg_rainfall"})
    legacy = pd.read_csv(ROOT_DIR / "data" / "ner_rainfall_2015_2024.csv")
    combined = pd.concat([legacy, monthly], ignore_index=True).drop_duplicates(["city", "year", "month"], keep="first").sort_values(["city", "year", "month"])
    PROCESSED.mkdir(parents=True, exist_ok=True)
    combined.to_csv(PROCESSED / "ner_rainfall_2015_2026.csv", index=False)
    provenance = {"source": "NASA POWER Daily API", "fetched_at_utc": utc_now(), "requested_range": [start, end], "raw_snapshot": str(snapshot.relative_to(ROOT_DIR)), "record_count": len(rows), "station_audit": station_audit, "sha256": hashlib.sha256(snapshot.read_bytes()).hexdigest(), "note": "Original data/ner_rainfall_2015_2024.csv was not modified. A processed output is written only after all source stations succeed."}
    snapshot.with_suffix(".json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    return snapshot


def _attr(attributes: dict[str, Any], *names: str) -> Any:
    lower = {str(key).lower(): value for key, value in attributes.items()}
    return next((lower[name.lower()] for name in names if name.lower() in lower), None)


def coolr_query_url() -> str:
    """Resolve the point layer if the provider's layer id changes from /0."""
    if os.getenv("COOLR_QUERY_URL"):
        return COOLR_URL
    try:
        service = requests.get(COOLR_SERVICE_URL, params={"f": "json"}, timeout=30)
        service.raise_for_status()
        layers = service.json().get("layers", [])
        point_layer = next((layer for layer in layers if "point" in str(layer.get("geometryType", "")).lower()), None)
        if point_layer and isinstance(point_layer.get("id"), int):
            return f"{COOLR_SERVICE_URL}/{point_layer['id']}/query"
    except (requests.RequestException, ValueError):
        pass
    return COOLR_URL


def valid_event_date(value: Any) -> str | None:
    """Return a stable date prefix or reject unusable/malformed event dates."""
    if value is None:
        return None
    text = str(value).strip()
    # ArcGIS date fields are frequently delivered as Unix milliseconds.
    try:
        numeric = float(text)
        if numeric > 10_000_000_000:
            return datetime.fromtimestamp(numeric / 1000, timezone.utc).date().isoformat()
        if numeric > 1_000_000_000:
            return datetime.fromtimestamp(numeric, timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError):
        pass
    for parser in (lambda: datetime.fromisoformat(text.replace("Z", "+00:00")), lambda: datetime.strptime(text[:10], "%Y-%m-%d"), lambda: datetime.strptime(text[:10], "%m/%d/%Y")):
        try:
            return parser().date().isoformat()
        except ValueError:
            continue
    return None


def refresh_coolr() -> dict[str, int]:
    """Ingest NER-area COOLR candidates only. All records remain unverified."""
    query_url = coolr_query_url()
    params = {"where": "1=1", "geometry": "87.5,21.5,97.5,29.5", "geometryType": "esriGeometryEnvelope", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "returnGeometry": "true", "f": "json", "resultRecordCount": 2000}
    try:
        response = requests.get(query_url, params=params, timeout=60)
        response.raise_for_status(); raw = response.json()
        if raw.get("error"):
            raise RuntimeError("COOLR service error: " + str(raw["error"]))
    except (requests.RequestException, RuntimeError, ValueError) as exc:
        failed = snapshot_path("coolr", "failure.json")
        failed.write_text(json.dumps({"source": "NASA COOLR", "fetched_at_utc": utc_now(), "query_url": query_url, "error": str(exc), "note": "No event candidates were added."}, indent=2), encoding="utf-8")
        raise RuntimeError(f"COOLR refresh failed; failure audit saved at {failed.relative_to(ROOT_DIR)}") from exc
    snapshot = snapshot_path("coolr", "json"); snapshot.write_text(json.dumps(raw, indent=2), encoding="utf-8")
    store = ObservationStore(DATABASE_PATH); store.initialise(); kept = inserted = rejected = 0
    export_rows: list[dict[str, Any]] = []
    for feature in raw.get("features", []):
        attrs, geom = feature.get("attributes", {}), feature.get("geometry", {})
        lat, lon = geom.get("y"), geom.get("x")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not (21.5 <= lat <= 29.5 and 87.5 <= lon <= 97.5):
            continue
        country = _attr(attrs, "country", "country_name")
        if country and str(country).strip().lower() != "india":
            continue
        event_date = valid_event_date(_attr(attrs, "event_date", "date", "eventdate"))
        if not event_date:
            rejected += 1
            continue
        # Date + ~110m coordinate cell prevents duplicate imports when a source changes its object id.
        stable = f"{event_date}|{lat:.3f}|{lon:.3f}"
        raw_metadata = {"feature": feature, "validation": {"country": "India", "coordinates": "within_NER_envelope", "event_date": "parseable", "source": "NASA COOLR", "manual_verification_required": True}}
        event = {"event_key": hashlib.sha256(("COOLR|" + stable).encode()).hexdigest(), "event_date": event_date, "lat": lat, "lon": lon, "country": country, "source": "NASA COOLR", "fetched_at_utc": utc_now(), "raw_metadata": raw_metadata}
        kept += 1; inserted += int(store.save_event(event))
        export_rows.append({"event_key": event["event_key"], "event_date": event["event_date"], "lat": lat, "lon": lon, "country": country, "source": "NASA COOLR", "verification_status": "unverified"})
    # Convenience monthly candidate list; raw response remains in the dated JSON snapshot above.
    monthly = RAW / "coolr" / f"coolr_{date.today().strftime('%Y_%m')}.csv"
    monthly.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(export_rows, columns=["event_key", "event_date", "lat", "lon", "country", "source", "verification_status"]).to_csv(monthly, index=False)
    return {"candidates": kept, "new_unverified": inserted, "rejected_invalid_date": rejected}


def main() -> None:
    parser = argparse.ArgumentParser(description="Auditable Landslide AI data refresh")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("weather", help="Refresh current weather for 53 locations")
    sub.add_parser("data-health", help="Print an auditable weather-store coverage/freshness summary")
    power = sub.add_parser("nasa-power", help="Fetch 2025+ NASA POWER daily rainfall")
    power.add_argument("--start", default="20250101"); power.add_argument("--end", default=date.today().strftime("%Y%m%d"))
    sub.add_parser("coolr", help="Fetch COOLR NER event candidates as unverified")
    args = parser.parse_args()
    if args.command == "weather":
        result = refresh_weather()
    elif args.command == "data-health":
        from backend.app import data_health
        result = data_health()
    elif args.command == "nasa-power":
        result = refresh_nasa_power(args.start, args.end)
    else:
        result = refresh_coolr()
    print(result)
    if args.command == "weather" and result["failed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
