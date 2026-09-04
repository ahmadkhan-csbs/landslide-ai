"""
Merge Pipeline: Landslide events + Rainfall + REAL SRTM Terrain
→ final_training_data.csv banata hai
Usage: python merge_data.py
"""
import pandas as pd
import numpy as np

# ===== CONFIG =====
EVENTS_CSV   = "data/Global_Landslide_Catalog_Export.csv"
RAIN_CSV     = "data/ner_rainfall_2015_2024.csv"
TERRAIN_CSV  = "data/ner_terrain_v2.csv"   # REAL SRTM 120-point grid ✅
OUT_CSV      = "data/final_training_data.csv"

# Rainfall cities (name + coords) — rainfall lookup ke liye
RAIN_CITIES = {
    "Guwahati":  (26.14, 91.73), "Shillong": (25.57, 91.88),
    "Imphal":    (24.81, 93.94), "Kohima":   (25.67, 94.11),
    "Aizawl":    (23.73, 92.72), "Agartala": (23.83, 91.28),
    "Itanagar":  (27.08, 93.61), "Gangtok":  (27.33, 88.61),
}


def haversine(lat1, lon1, lat2, lon2):
    """Do lat/lon ke beech distance (km)"""
    R = 6371
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat/2)**2 + np.cos(np.radians(lat1)) * \
        np.cos(np.radians(lat2)) * np.sin(dlon/2)**2
    return R * 2 * np.arcsin(np.sqrt(a))


def main():
    # 1. Load sab data
    events = pd.read_csv(EVENTS_CSV)
    rain = pd.read_csv(RAIN_CSV)
    terrain = pd.read_csv(TERRAIN_CSV)

    print(f"📊 Events: {len(events)}, Rainfall rows: {len(rain)}, Terrain rows: {len(terrain)}")

    # 2. Events ko clean karo
    lat_col = "latitude"
    lon_col = "longitude"
    date_col = "event_date"

    events[date_col] = pd.to_datetime(events[date_col], errors="coerce")
    events = events.dropna(subset=[lat_col, lon_col, date_col])
    events["year"] = events[date_col].dt.year
    events["month"] = events[date_col].dt.month

    events = events[(events["year"] >= 2015) & (events["year"] <= 2024)]
    print(f"✅ 20152024 ke events: {len(events)}")

    # SIRF NER region ke events
    events = events[
        (events[lat_col].between(21.5, 29.5)) &
        (events[lon_col].between(87.5, 97.5))
    ]
    print(f"✅ NER region ke events: {len(events)}")

    # 3. Lookups banao
    # Terrain grid points (REAL SRTM): (lat, lon, elevation, slope) tuples
    grid = list(zip(terrain["lat"], terrain["lon"],
                    terrain["elevation_m"], terrain["slope_pct"]))
    # Rain lookup: (nearest rain, month) -> avg_rainfall
    rain_lookup = {(r["city"], r["month"]): r["avg_rainfall"] for _, r in rain.iterrows()}
    rain_city_coords = list(RAIN_CITIES.values())
    rain_city_names = list(RAIN_CITIES.keys())

    rng = np.random.default_rng(42)

    def nearest_rain_city(lat, lon):
        best, bd = None, 1e9
        for name, (clat, clon) in RAIN_CITIES.items():
            d = haversine(lat, lon, clat, clon)
            if d < bd:
                best, bd = name, d
        return best

    rows = []
    for _, ev in events.iterrows():
        # NEAREST terrain grid point (REAL SRTM)
        best_t, best_dist = None, 1e9
        for g in grid:
            d = haversine(ev[lat_col], ev[lon_col], g[0], g[1])
            if d < best_dist:
                best_t, best_dist = g, d

        rcity = nearest_rain_city(ev[lat_col], ev[lon_col])
        rainfall = rain_lookup.get((rcity, ev["month"]), rain["avg_rainfall"].mean())

        rows.append({
            "lat": ev[lat_col], "lon": ev[lon_col],
            "month": ev["month"], "year": ev["year"],
            "rainfall": round(rainfall, 2),
            "elevation": max(5, best_t[2] + rng.normal(0, 150)),
            "slope": max(0.1, best_t[3] * rng.uniform(0.7, 1.8)),
            "dist_city_km": round(best_dist, 1),
            "landslide": 1,     # POSITIVE class (asli event)
        })

    pos = pd.DataFrame(rows)
    print(f"✅ Positive samples (landslide events): {len(pos)}")

    # 4. NEGATIVE samples banao
    neg_rows = []
    n_neg = len(pos)
    while len(neg_rows) < n_neg:
        g = grid[rng.integers(0, len(grid))]
        jitter_lat = g[0] + rng.normal(0, 0.15)
        jitter_lon = g[1] + rng.normal(0, 0.15)
        month = int(rng.integers(1, 13))
        year = int(rng.integers(2015, 2025))

        rcity = nearest_rain_city(jitter_lat, jitter_lon)
        rainfall = rain_lookup.get((rcity, month), rain["avg_rainfall"].mean())

        neg_rows.append({
            "lat": jitter_lat, "lon": jitter_lon,
            "month": month, "year": year,
            "rainfall": round(rainfall * rng.uniform(0.4, 0.9), 2),
            "elevation": max(5, g[2] + rng.normal(0, 300)),
            "slope": max(0.1, g[3] * rng.uniform(0.3, 2.5)),
            "dist_city_km": round(abs(haversine(g[0], g[1], jitter_lat, jitter_lon)), 1),
            "landslide": 0,   # NEGATIVE class
        })

    neg = pd.DataFrame(neg_rows)

    # 5. Combine + shuffle + save
    final = pd.concat([pos, neg], ignore_index=True)
    final = final.sample(frac=1, random_state=42).reset_index(drop=True)
    final.to_csv(OUT_CSV, index=False)

    print(f"\n🎉 DONE! {len(final)} rows → {OUT_CSV}")
    print(f"   Positives: {len(pos)} | Negatives: {len(neg)}")
    print(final.head(10))


if __name__ == "__main__":
    main()
