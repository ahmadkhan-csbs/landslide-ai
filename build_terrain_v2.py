"""
Terrain Builder v2 — REAL SRTM 30m elevation via Open-Topo-Data API
→ NER pe ~120 grid points, real elevation + calculated slope
→ data/ner_terrain_v2.csv
Usage: python build_terrain_v2.py
"""
import requests
import numpy as np
import pandas as pd
import time

OUT_CSV = "data/ner_terrain_v2.csv"

# NER bounding box grid: 12 x 10 = 120 points
LATS = np.linspace(22.0, 28.8, 12)
LONS = np.linspace(88.0, 97.0, 10)


def fetch_elevations(points):
    """Open-Topo-Data API — batches of 100, srtm30m dataset"""
    results = []
    for i in range(0, len(points), 100):
        batch = points[i:i+100]
        locs = "|".join(f"{lat},{lon}" for lat, lon in batch)
        url = f"https://api.opentopodata.org/v1/srtm30m?locations={locs}"
        for attempt in range(3):
            try:
                r = requests.get(url, timeout=30)
                data = r.json()
                for p, res in zip(batch, data["results"]):
                    results.append({
                        "lat": p[0], "lon": p[1],
                        "elevation_m": res["elevation"],
                    })
                break
            except Exception as e:
                print(f"  ⚠️ Attempt {attempt+1} failed: {e}, 5s wait...")
                time.sleep(5)
        time.sleep(1.5)  # API rate limit respect (1 call/sec)
        print(f"  ✅ Batch {i//100+1}: {len(results)} points done")
    return results


def main():
    # 1. Grid points banao
    points = [(round(lat, 3), round(lon, 3)) for lat in LATS for lon in LONS]
    print(f"📍 NER grid: {len(points)} points ({len(LATS)}x{len(LONS)})")

    # 2. REAL SRTM elevation fetch karo
    print("🛰️ Fetching REAL SRTM 30m elevations...")
    data = fetch_elevations(points)
    df = pd.DataFrame(data)
    print(f"✅ Elevation fetched: {len(df)} points")
    print(f"   Range: {df['elevation_m'].min():.0f}m - {df['elevation_m'].max():.0f}m")

    # 3. SLOPE calculate karo (adjacent grid points se)
    df = df.sort_values(["lat", "lon"]).reset_index(drop=True)
    lat_step = abs(LATS[1] - LATS[0])
    lon_step = abs(LONS[1] - LONS[0])

    slopes = []
    for _, row in df.iterrows():
        neighbors = df[
            (df["lat"].between(row["lat"] - lat_step*1.1, row["lat"] + lat_step*1.1)) &
            (df["lon"].between(row["lon"] - lon_step*1.1, row["lon"] + lon_step*1.1)) &
            ((df["lat"] != row["lat"]) | (df["lon"] != row["lon"]))
        ]
        if len(neighbors) == 0:
            slopes.append(0.5)
            continue
        max_diff = float((neighbors["elevation_m"] - row["elevation_m"]).abs().max())
        dist_km = lat_step * 111  # grid spacing in km
        slope_pct = (max_diff / 1000) / dist_km * 100  # rise/run * 100
        slopes.append(round(slope_pct, 3))

    df["slope_pct"] = slopes

    # 4. Save
    df.to_csv(OUT_CSV, index=False)
    print(f"\n🎉 DONE! {len(df)} points → {OUT_CSV}")
    print("\n📌 Top 5 steepest points:")
    print(df.nlargest(5, "slope_pct")[["lat", "lon", "elevation_m", "slope_pct"]])
    print("\n📌 Top 5 highest peaks:")
    print(df.nlargest(5, "elevation_m")[["lat", "lon", "elevation_m"]])


if __name__ == "__main__":
    main()
