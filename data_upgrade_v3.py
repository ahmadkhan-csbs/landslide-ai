"""Download reproducible historical rainfall for the v3 training window.

The NASA landslide catalog available in this project covers usable NER events
from 2007 through 2016.  This script downloads NASA POWER daily precipitation
for the same period and stores month-level daily means for the eight reference
cities.  It deliberately writes a new file and never replaces v2 data.

Usage: python data_upgrade_v3.py
"""

from pathlib import Path
import time

import pandas as pd
import requests


START_DATE = "20070101"
END_DATE = "20161231"
OUTPUT_CSV = Path("data/ner_rainfall_2007_2016.csv")
CITIES = {
    "Guwahati": (26.14, 91.73),
    "Shillong": (25.57, 91.88),
    "Itanagar": (27.08, 93.60),
    "Kohima": (25.67, 94.11),
    "Imphal": (24.82, 93.94),
    "Aizawl": (23.73, 92.71),
    "Agartala": (23.83, 91.28),
    "Gangtok": (27.33, 88.61),
}


def download_daily_rainfall(lat: float, lon: float) -> dict[str, float]:
    """Return valid NASA POWER PRECTOTCORR observations in mm/day."""
    response = requests.get(
        "https://power.larc.nasa.gov/api/temporal/daily/point",
        params={
            "parameters": "PRECTOTCORR",
            "community": "AG",
            "longitude": lon,
            "latitude": lat,
            "start": START_DATE,
            "end": END_DATE,
            "format": "JSON",
        },
        timeout=60,
    )
    response.raise_for_status()
    observations = response.json()["properties"]["parameter"]["PRECTOTCORR"]
    return {date: value for date, value in observations.items() if value >= 0}


def main() -> None:
    rows = []
    expected_rows = len(CITIES) * 10 * 12

    for city, (lat, lon) in CITIES.items():
        print(f"Downloading {city}…")
        daily = download_daily_rainfall(lat, lon)
        if not daily:
            raise RuntimeError(f"No valid rainfall observations returned for {city}.")

        frame = pd.DataFrame(daily.items(), columns=["date", "avg_rainfall"])
        frame["date"] = pd.to_datetime(frame["date"], format="%Y%m%d", errors="raise")
        frame["year"] = frame["date"].dt.year
        frame["month"] = frame["date"].dt.month
        monthly = frame.groupby(["year", "month"], as_index=False)["avg_rainfall"].mean()

        if len(monthly) != 120:
            raise RuntimeError(f"Expected 120 monthly values for {city}; received {len(monthly)}.")
        for row in monthly.itertuples(index=False):
            rows.append(
                {
                    "city": city,
                    "lat": lat,
                    "lon": lon,
                    "year": int(row.year),
                    "month": int(row.month),
                    "avg_rainfall": round(float(row.avg_rainfall), 3),
                }
            )
        time.sleep(1)

    output = pd.DataFrame(rows).sort_values(["city", "year", "month"])
    if len(output) != expected_rows:
        raise RuntimeError(f"Expected {expected_rows} rows; produced {len(output)}.")
    if output.duplicated(["city", "year", "month"]).any():
        raise RuntimeError("Duplicate city/year/month rainfall rows found.")

    output.to_csv(OUTPUT_CSV, index=False)
    print(f"Saved {len(output)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
