"""Validate the manually curated contemporary NER landslide-event registry.

This is deliberately a gate, not an auto-ingestion or model-training script.
Only an authorised reviewer may add a row to the registry after checking the
source, date, and coordinates. A successful validation does not retrain or
promote any model.

Usage:
  python event_registry.py template
  python event_registry.py validate
  python event_registry.py validate --input path\\to\\events.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
REGISTRY_DIR = ROOT / "data" / "verified_events"
DEFAULT_REGISTRY = REGISTRY_DIR / "ner_verified_events.csv"
TEMPLATE = REGISTRY_DIR / "ner_verified_events_template.csv"
REQUIRED_FIELDS = [
    "event_id", "event_date", "lat", "lon", "state", "district", "event_type",
    "coordinate_accuracy_km", "source_name", "source_url", "source_record_id",
    "verification_status", "verified_by", "verified_at_utc", "verification_notes",
]
NER_STATES = {"Assam", "Arunachal Pradesh", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Sikkim", "Tripura"}
VALID_TYPES = {"LANDSLIDE", "MUDSLIDE", "ROCKFALL", "DEBRIS_FLOW", "OTHER"}


def haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    radius = 6371.0
    lat_delta, lon_delta = math.radians(b_lat - a_lat), math.radians(b_lon - a_lon)
    value = math.sin(lat_delta / 2) ** 2 + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(lon_delta / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(value))


def parse_iso_date(value: str) -> date | None:
    try:
        parsed = date.fromisoformat(value.strip())
        return parsed if parsed <= date.today() else None
    except ValueError:
        return None


def parse_utc(value: str) -> bool:
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        return parsed.tzinfo is not None and parsed <= datetime.now(timezone.utc)
    except ValueError:
        return False


def validate_rows(rows: list[dict[str, str]]) -> dict:
    errors: list[dict[str, str | int]] = []
    accepted: list[tuple[int, float, float, date]] = []
    ids: set[str] = set()
    for number, row in enumerate(rows, start=2):
        missing = [field for field in REQUIRED_FIELDS if not row.get(field, "").strip()]
        if missing:
            errors.append({"row": number, "error": "missing required fields: " + ", ".join(missing)})
            continue
        event_id = row["event_id"].strip()
        if event_id in ids:
            errors.append({"row": number, "error": "duplicate event_id"})
            continue
        ids.add(event_id)
        event_date = parse_iso_date(row["event_date"])
        try:
            lat, lon = float(row["lat"]), float(row["lon"])
            accuracy = float(row["coordinate_accuracy_km"])
        except ValueError:
            errors.append({"row": number, "error": "lat, lon, and coordinate_accuracy_km must be numeric"})
            continue
        if not event_date:
            errors.append({"row": number, "error": "event_date must be ISO YYYY-MM-DD and not in the future"})
        if not (21.5 <= lat <= 29.5 and 87.5 <= lon <= 97.5):
            errors.append({"row": number, "error": "coordinates outside NER registry bounds"})
        if row["state"].strip() not in NER_STATES:
            errors.append({"row": number, "error": "state is not one of the eight NER states"})
        if row["event_type"].strip().upper() not in VALID_TYPES:
            errors.append({"row": number, "error": "unsupported event_type"})
        if not 0 <= accuracy <= 50:
            errors.append({"row": number, "error": "coordinate_accuracy_km must be between 0 and 50"})
        parsed_url = urlparse(row["source_url"].strip())
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            errors.append({"row": number, "error": "source_url must be a complete http(s) URL"})
        if row["verification_status"].strip().upper() != "VERIFIED":
            errors.append({"row": number, "error": "registry accepts only manually VERIFIED events"})
        if len(row["verified_by"].strip()) < 3 or not parse_utc(row["verified_at_utc"]):
            errors.append({"row": number, "error": "verified_by and past UTC verification time are required"})
        if len(row["verification_notes"].strip()) < 20:
            errors.append({"row": number, "error": "verification_notes must explain the manual evidence review (20+ characters)"})
        if event_date:
            for earlier_row, earlier_lat, earlier_lon, earlier_date in accepted:
                if event_date == earlier_date and haversine_km(lat, lon, earlier_lat, earlier_lon) <= 1.0:
                    errors.append({"row": number, "error": f"possible duplicate of row {earlier_row}: same date within 1 km"})
            accepted.append((number, lat, lon, event_date))
    return {
        "checked_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "rows_read": len(rows), "valid_rows": len(rows) - len({error["row"] for error in errors}),
        "error_count": len(errors), "errors": errors,
        "decision": "VALID_FOR_MANUAL_RESEARCH_USE" if not errors else "REJECTED_NEEDS_REVIEW",
        "training_action": "NONE — this validation command never retrains or promotes a model.",
    }


def read_registry(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames is None or set(REQUIRED_FIELDS).difference(reader.fieldnames):
            missing = sorted(set(REQUIRED_FIELDS).difference(reader.fieldnames or []))
            raise ValueError("registry header missing: " + ", ".join(missing))
        return list(reader)


def main() -> None:
    parser = argparse.ArgumentParser(description="Manual verified NER landslide-event registry gate")
    sub = parser.add_subparsers(dest="command", required=True)
    template = sub.add_parser("template", help="Create an empty registry template")
    template.add_argument("--force", action="store_true")
    validate = sub.add_parser("validate", help="Validate manually reviewed event records; does not train")
    validate.add_argument("--input", type=Path, default=DEFAULT_REGISTRY)
    args = parser.parse_args()
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    if args.command == "template":
        if TEMPLATE.exists() and not args.force:
            raise SystemExit(f"Template already exists: {TEMPLATE}. Use --force to replace the empty template.")
        with TEMPLATE.open("w", encoding="utf-8", newline="") as stream:
            csv.DictWriter(stream, fieldnames=REQUIRED_FIELDS).writeheader()
        print(TEMPLATE)
        return
    if not args.input.exists():
        raise SystemExit(f"Registry not found: {args.input}. Copy the template and add only manually verified records.")
    result = validate_rows(read_registry(args.input))
    report = REGISTRY_DIR / f"validation_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    report.write_text(json.dumps({"input": str(args.input), **result}, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print("audit:", report)
    if result["error_count"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
