"""
Merge Pipeline: Landslide events + Rainfall + Terrain
→ final_training_data.csv banata hai
Usage: python merge_data.py
"""
import pandas as pd
import numpy as np

# ===== CONFIG =====
EVENTS_CSV   = "data/Global_Landslide_Catalog_Export.csv"
RAIN_CSV     = "data/ner_rainfall_2015_2024.csv"
TERRAIN_CSV  = "data/ner_terrain.csv"
OUT_CSV      = "data/final_training_data.csv"


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

    # 2. Events ko clean karo (NASA catalog standard columns)
    lat_col = "latitude"
    lon_col = "longitude"
    date_col = "event_date"

    events[date_col] = pd.to_datetime(events[date_col], errors="coerce")
    events = events.dropna(subset=[lat_col, lon_col, date_col])
    events["year"] = events[date_col].dt.year
    events["month"] = events[date_col].dt.month

    # 2015-2024 range ke events (hamara rainfall data isi ka hai)
    events = events[(events["year"] >= 2015) & (events["year"] <= 2024)]
    print(f"✅ 2015-2024 ke events: {len(events)}")

    # SIRF NER region ke events (India filter)
    # NER bounding box: lat 21.5-29.5, lon 87.5-97.5
    events = events[
        (events[lat_col].between(21.5, 29.5)) &
        (events[lon_col].between(87.5, 97.5))
    ]
    print(f"✅ NER region ke events: {len(events)}")

    # 3. Har event ko NEAREST city se attach karo
    city_coords = list(zip(terrain["city"], terrain["lat"], terrain["lon"]))
    rain_lookup = {(r["city"], r["month"]): r["avg_rainfall"] for _, r in rain.iterrows()}
    rng = np.random.default_rng(42)   # rng yahan EK BAAR bana hai ✅

    rows = []
    for _, ev in events.iterrows():
        # nearest city nikalo
        best_city, best_dist = None, 1e9
        for cname, clat, clon in city_coords:
            d = haversine(ev[lat_col], ev[lon_col], clat, clon)
            if d < best_dist:
                best_city, best_dist = cname, d

        trow = terrain[terrain["city"] == best_city].iloc[0]
        rainfall = rain_lookup.get((best_city, ev["month"]), rain["avg_rainfall"].mean())

        rows.append({
            "lat": ev[lat_col], "lon": ev[lon_col],
            "month": ev["month"], "year": ev["year"],
            "rainfall": round(rainfall, 2),
            "elevation": max(5, trow["elevation_m"] + rng.normal(0, 150)),
            "slope": max(0.1, trow["slope_proxy_pct"] * rng.uniform(0.7, 1.8)),
            "dist_city_km": round(best_dist, 1),
            "landslide": 1,     # POSITIVE class (asli event)
        })

    pos = pd.DataFrame(rows)
    print(f"✅ Positive samples (landslide events): {len(pos)}")

    # 4. NEGATIVE samples banao (safe locations — jahan landslide NAHI hua)
    neg_rows = []
    n_neg = len(pos)  # balanced: jitne positive, utne negative
    while len(neg_rows) < n_neg:
        cname, clat, clon = city_coords[rng.integers(0, len(city_coords))]
        jitter_lat = clat + rng.normal(0, 0.15)   # ~15km aas paas
        jitter_lon = clon + rng.normal(0, 0.15)
        month = int(rng.integers(1, 13))
        year = int(rng.integers(2015, 2025))

        trow = terrain[terrain["city"] == cname].iloc[0]
        rainfall = rain_lookup.get((cname, month), rain["avg_rainfall"].mean())

        neg_rows.append({
            "lat": jitter_lat, "lon": jitter_lon,
            "month": month, "year": year,
            "rainfall": round(rainfall * rng.uniform(0.4, 0.9), 2),  # kam baarish (safe)
            "elevation": max(5, trow["elevation_m"] + rng.normal(0, 300)),   # variation!
            "slope": max(0.1, trow["slope_proxy_pct"] * rng.uniform(0.3, 2.5)),
            "dist_city_km": round(abs(haversine(clat, clon, jitter_lat, jitter_lon)), 1),
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
