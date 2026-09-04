"""
Data Upgrade Pipeline — NASA POWER Rainfall (2015-2024)
Usage: python data_upgrade.py
"""
import requests
import pandas as pd
import time

# 8 NER cities (wahi jo backend mein hain)
CITIES = {
    "Guwahati":   (26.14, 91.73),
    "Shillong":   (25.57, 91.88),
    "Itanagar":   (27.08, 93.60),
    "Kohima":     (25.67, 94.11),
    "Imphal": (24.82, 93.94),
    "Aizawl":     (23.73, 92.71),
    "Agartala":   (23.83, 91.28),
    "Gangtok":    (27.33, 88.61),
}

def get_rainfall(lat, lon, start=20150101, end=20241231):
    """NASA POWER se daily rainfall nikalta hai (mm/day)"""
    url = "https://power.larc.nasa.gov/api/temporal/daily/point"
    params = {
        "parameters": "PRECTOTCORR",          # corrected rainfall (mm)
        "community": "AG",
        "longitude": lon,
        "latitude": lat,
        "start": start,
        "end": end,
        "format": "JSON",
    }
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()["properties"]["parameter"]["PRECTOTCORR"]
    # {-99 values = missing data, unko hatao}
    return {d: v for d, v in data.items() if v >= 0}


def main():
    rows = []
    for name, (lat, lon) in CITIES.items():
        print(f"⏳ Downloading rainfall: {name} ...")
        try:
            daily = get_rainfall(lat, lon)
        except Exception as e:
            print(f"   ❌ Fail: {name} — {e}")
            continue

        # Daily → Monthly average (har saal ka)
        df = pd.DataFrame(
            [(d, v) for d, v in daily.items()],
            columns=["date", "rainfall"]
        )
        df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")
        df["year"] = df["date"].dt.year
        df["month"] = df["date"].dt.month

        monthly = df.groupby(["year", "month"])["rainfall"].mean().reset_index()
        for _, row in monthly.iterrows():
            rows.append({
                "city": name, "lat": lat, "lon": lon,
                "year": int(row["year"]), "month": int(row["month"]),
                "avg_rainfall": round(row["rainfall"], 2),
            })
        print(f"   ✅ {name}: {len(daily)} days ka data mila")
        time.sleep(2)   # API ko bhookha mat rakhdo 😄

    out = pd.DataFrame(rows)
    out.to_csv("data/ner_rainfall_2015_2024.csv", index=False)
    print(f"\n🎉 DONE! {len(out)} rows saved → data/ner_rainfall_2015_2024.csv")
    print(out.head(10))

# data_upgrade.py mein ye ADD karo (main() ke upar)

def get_elevations(points):
    """Open-Elevation API — ek call mein 100 points tak
    points = [(lat, lon), ...] → returns [(lat, lon, elevation), ...]"""
    url = "https://api.open-elevation.com/api/v1/lookup"
    payload = {"locations": [{"latitude": la, "longitude": lo} for la, lo in points]}
    r = requests.post(url, json=payload, timeout=60)
    r.raise_for_status()
    results = r.json()["results"]
    return [(x["latitude"], x["longitude"], x["elevation"]) for x in results]


def get_terrain_table():
    """Har city ka elevation nikalo + neighbour points se slope estimate"""
    rows = []
    for name, (lat, lon) in CITIES.items():
        # City + 4 directions mein 5km dur ke points (slope estimate ke liye)
        d = 0.05  # ~5.5 km
        points = [
            (lat, lon),
            (lat + d, lon), (lat - d, lon),
            (lat, lon + d), (lat, lon - d),
        ]
        try:
            res = get_elevations(points)
        except Exception as e:
            print(f"   ❌ {name}: {e}")
            continue

        center_elev = res[0][2]
        elevs = [x[2] for x in res[1:]]
        # Slope estimate: avg elevation difference (meters over .5km)
        avg_diff = sum(abs(e - center_elev) for e in elevs) / 4
        slope_proxy = round(avg_diff / 5500 * 100, 3)   # % grade

        rows.append({
            "city": name, "lat": lat, "lon": lon,
            "elevation_m": center_elev,
            "slope_proxy_pct": slope_proxy,
        })
        print(f"   ✅ {name}: {center_elev}m elevation, slope ~{slope_proxy}%")

    df = pd.DataFrame(rows)
    df.to_csv("data/ner_terrain.csv", index=False)
    print(f"\n🎉 Terrain data saved → data/ner_terrain.csv")
    print(df)

if __name__ == "__main__":
    main()
    print("\n⛰️ Downloading terrain data (elevation/slope)...")
    get_terrain_table()
