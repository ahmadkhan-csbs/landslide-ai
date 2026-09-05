"""Create an auditable, India-only NER v3 training dataset.

Positive records are confirmed catalog events.  Controls are explicitly named
``background_no_record``: they are locations with no catalogued event in the
same year/month, not proof that a landslide was impossible.  Unlike v2, this
pipeline does not scale rainfall or inject label-specific terrain noise.

Usage: python prepare_training_data_v3.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd


EVENTS_CSV = Path("data/Global_Landslide_Catalog_Export.csv")
RAIN_CSV = Path("data/ner_rainfall_2007_2016.csv")
TERRAIN_CSV = Path("data/ner_terrain_v2.csv")
OUTPUT_CSV = Path("data/final_training_data_v3.csv")
REPORT_JSON = Path("data/v3_data_quality_report.json")

NER_BOUNDS = {"lat_min": 21.5, "lat_max": 29.5, "lon_min": 87.5, "lon_max": 97.5}
VALID_ACCURACY = {"exact", "1km", "5km", "10km", "25km", "50km"}
MIN_CONTROL_DISTANCE_KM = 50.0
RNG_SEED = 42

RAIN_CITIES = {
    "Guwahati": (26.14, 91.73),
    "Shillong": (25.57, 91.88),
    "Itanagar": (27.08, 93.60),
    "Kohima": (25.67, 94.11),
    "Imphal": (24.82, 93.94),
    "Aizawl": (23.73, 92.71),
    "Agartala": (23.83, 91.28),
    "Gangtok": (27.33, 88.61),
}


def haversine_km(lat1, lon1, lat2, lon2) -> np.ndarray:
    """Great-circle distance; supports scalar or NumPy-array inputs."""
    radius = 6371.0
    dlat = np.radians(np.asarray(lat2) - lat1)
    dlon = np.radians(np.asarray(lon2) - lon1)
    a = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2) ** 2
    return radius * 2 * np.arcsin(np.sqrt(a))


def nearest_name(lat: float, lon: float, points: dict[str, tuple[float, float]]) -> str:
    return min(points, key=lambda name: haversine_km(lat, lon, *points[name]))


def nearest_terrain(lat: float, lon: float, terrain: pd.DataFrame) -> tuple[float, float, float]:
    distances = haversine_km(lat, lon, terrain["lat"].to_numpy(), terrain["lon"].to_numpy())
    index = int(np.argmin(distances))
    row = terrain.iloc[index]
    return float(row["elevation_m"]), float(row["slope_pct"]), float(distances[index])


def load_confirmed_events() -> tuple[pd.DataFrame, dict[str, int]]:
    events = pd.read_csv(EVENTS_CSV)
    events["parsed_date"] = pd.to_datetime(
        events["event_date"], format="%m/%d/%Y %I:%M:%S %p", errors="coerce"
    )
    is_india_ner = (
        events["country_code"].eq("IN")
        & events["latitude"].between(NER_BOUNDS["lat_min"], NER_BOUNDS["lat_max"])
        & events["longitude"].between(NER_BOUNDS["lon_min"], NER_BOUNDS["lon_max"])
    )
    scoped = events.loc[is_india_ner].copy()
    accuracy = scoped["location_accuracy"].fillna("unknown").str.lower()
    usable = scoped.loc[scoped["parsed_date"].notna() & accuracy.isin(VALID_ACCURACY)].copy()
    usable["year"] = usable["parsed_date"].dt.year.astype(int)
    usable["month"] = usable["parsed_date"].dt.month.astype(int)
    usable = usable.drop_duplicates(subset=["event_id"])

    return usable, {
        "india_ner_bbox_events": int(len(scoped)),
        "excluded_low_or_unknown_accuracy": int((~accuracy.isin(VALID_ACCURACY)).sum()),
        "excluded_invalid_dates": int(scoped["parsed_date"].isna().sum()),
        "confirmed_events_after_filters": int(len(usable)),
    }


def make_feature_row(
    *, lat: float, lon: float, year: int, month: int, target: int, sample_type: str,
    event_id: int | None, rainfall_lookup: dict, terrain: pd.DataFrame,
) -> dict:
    rainfall_city = nearest_name(lat, lon, RAIN_CITIES)
    rainfall = rainfall_lookup.get((rainfall_city, year, month))
    if rainfall is None:
        raise KeyError(f"Missing rainfall for {rainfall_city}, {year}-{month:02d}")
    elevation, slope, terrain_distance_km = nearest_terrain(lat, lon, terrain)
    return {
        "event_id": event_id,
        "lat": round(float(lat), 6),
        "lon": round(float(lon), 6),
        "year": year,
        "month": month,
        "rainfall": round(float(rainfall), 3),
        "rainfall_unit": "mm/day monthly mean",
        "rainfall_city": rainfall_city,
        "elevation": round(elevation, 3),
        "slope": round(slope, 4),
        "terrain_distance_km": round(terrain_distance_km, 3),
        "event_observed": target,
        "sample_type": sample_type,
    }


def make_controls(events: pd.DataFrame, rainfall_lookup: dict, terrain: pd.DataFrame) -> list[dict]:
    """Create one distant background control per event in the same year/month."""
    rng = np.random.default_rng(RNG_SEED)
    by_period = {
        key: group[["latitude", "longitude"]].to_numpy()
        for key, group in events.groupby(["year", "month"])
    }
    controls = []
    for event in events.itertuples(index=False):
        period_events = by_period[(event.year, event.month)]
        for _ in range(10_000):
            lat = rng.uniform(NER_BOUNDS["lat_min"], NER_BOUNDS["lat_max"])
            lon = rng.uniform(NER_BOUNDS["lon_min"], NER_BOUNDS["lon_max"])
            if np.all(haversine_km(lat, lon, period_events[:, 0], period_events[:, 1]) >= MIN_CONTROL_DISTANCE_KM):
                controls.append(
                    make_feature_row(
                        lat=lat, lon=lon, year=event.year, month=event.month,
                        target=0, sample_type="background_no_record", event_id=None,
                        rainfall_lookup=rainfall_lookup, terrain=terrain,
                    )
                )
                break
        else:
            raise RuntimeError(f"Unable to find a {MIN_CONTROL_DISTANCE_KM} km control for event {event.event_id}.")
    return controls


def main() -> None:
    events, report = load_confirmed_events()
    rainfall = pd.read_csv(RAIN_CSV)
    terrain = pd.read_csv(TERRAIN_CSV)
    required_rain_columns = {"city", "year", "month", "avg_rainfall"}
    if not required_rain_columns.issubset(rainfall.columns):
        raise ValueError(f"Rainfall file must contain {sorted(required_rain_columns)}")
    if rainfall.duplicated(["city", "year", "month"]).any():
        raise ValueError("Rainfall data contains duplicate city/year/month rows.")

    rainfall_lookup = {
        (row.city, int(row.year), int(row.month)): float(row.avg_rainfall)
        for row in rainfall.itertuples(index=False)
    }
    positives = [
        make_feature_row(
            lat=row.latitude, lon=row.longitude, year=row.year, month=row.month,
            target=1, sample_type="catalogued_landslide", event_id=int(row.event_id),
            rainfall_lookup=rainfall_lookup, terrain=terrain,
        )
        for row in events.itertuples(index=False)
    ]
    controls = make_controls(events, rainfall_lookup, terrain)
    output = pd.DataFrame(positives + controls).sample(frac=1, random_state=RNG_SEED).reset_index(drop=True)

    if output["event_observed"].value_counts().to_dict() != {1: len(positives), 0: len(controls)}:
        raise RuntimeError("Unexpected class balance in generated data.")
    output.to_csv(OUTPUT_CSV, index=False)

    report.update(
        {
            "rainfall_period": [int(rainfall.year.min()), int(rainfall.year.max())],
            "positive_rows": len(positives),
            "background_control_rows": len(controls),
            "total_rows": len(output),
            "control_min_distance_km": MIN_CONTROL_DISTANCE_KM,
            "target_name": "event_observed",
            "control_interpretation": "No catalogued event in the same year/month; not a confirmed no-landslide label.",
            "training_warning": "Use spatial and temporal validation before training; do not present accuracy as operational warning performance.",
        }
    )
    REPORT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Saved {len(output)} rows to {OUTPUT_CSV}")
    print(f"Saved quality report to {REPORT_JSON}")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
