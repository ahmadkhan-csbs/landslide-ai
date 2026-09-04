from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
import numpy as np
import os
import urllib.request
import json as jsonlib
from datetime import datetime

app = FastAPI(title="Landslide Early Warning API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# MODEL v2 — Rainfall + Terrain (Elevation, Slope)
model = joblib.load(os.path.join(BASE_DIR, "..", "ml_model", "landslide_model_v2.pkl"))

# Terrain data (elevation + slope of 8 NER cities)
terrain_df = pd.read_csv(os.path.join(BASE_DIR, "..", "data", "ner_terrain_v2.csv"))

# Seasonal fallback rainfall (mm) — sirf tab use hoga jab live API fail ho
RAINFALL = {1: 10, 2: 15, 3: 30, 4: 50, 5: 120, 6: 320, 7: 380, 8: 340, 9: 250, 10: 120, 11: 120, 12: 12}

FEATURES = ["lat", "lon", "month", "rainfall", "elevation", "slope"]


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat/2)**2 + np.cos(np.radians(lat1)) * \
        np.cos(np.radians(lat2)) * np.sin(dlon/2)**2
    return R * 2 * np.arcsin(np.sqrt(a))


def get_terrain(lat: float, lon: float):
    """Nearest SRTM grid point ka REAL elevation + slope (120-pt NASA DEM)"""
    best_i, best_dist = 0, 1e9
    tlat = terrain_df["lat"].values
    tlon = terrain_df["lon"].values
    for i in range(len(terrain_df)):
        d = haversine(lat, lon, tlat[i], tlon[i])
        if d < best_dist:
            best_i, best_dist = i, d
    trow = terrain_df.iloc[best_i]
    return float(trow["elevation_m"]), float(trow["slope_pct"]), f"SRTM({tlat[best_i]:.1f},{tlon[best_i]:.1f})"



def get_live_rainfall(lat: float, lon: float):
    """Real rainfall from Open-Meteo API (avg of last 3 days + next 3 days). Returns None if API fails."""
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
            f"&daily=rain_sum&past_days=3&forecast_days=3&timezone=auto"
        )
        with urllib.request.urlopen(url, timeout=10) as r:
            data = jsonlib.loads(r.read())
        rains = data["daily"]["rain_sum"]
        valid = [x for x in rains if x is not None]
        if not valid:
            return None
        return sum(valid) / len(valid)  # avg daily mm
    except Exception as e:
        print(f"Rainfall API failed for ({lat}, {lon}):", e)
        return None


def make_input(lat, lon, month, rainfall):
    elevation, slope, _ = get_terrain(lat, lon)
    return pd.DataFrame([[lat, lon, month, rainfall, elevation, slope]], columns=FEATURES)


def get_risk(lat, lon, month=None, use_live=True):
    """Single source of truth for risk — used by /predict and /alerts."""
    # Month decide karo: diya hai to wo, warna AAJ KA REAL month
    if month is None:
        month = datetime.now().month

    data_source = "Seasonal estimate"
    if use_live:
        live_daily = get_live_rainfall(lat, lon)
        if live_daily is not None:
            rainfall = live_daily * 7          # weekly total mm (model ke scale pe)
            data_source = "LIVE (Open-Meteo)"
        else:
            rainfall = RAINFALL.get(month, 50)  # fallback
    else:
        rainfall = RAINFALL.get(month, 50)

    elevation, slope, nearest_city = get_terrain(lat, lon)
    prob = model.predict_proba(make_input(lat, lon, month, rainfall))[0][1] * 100

    if prob > 60:
        level, color = "HIGH", "red"
    elif prob > 30:
        level, color = "MEDIUM", "orange"
    else:
        level, color = "LOW", "green"

    if rainfall > 200:
        main_reason = "Heavy rainfall + steep fragile terrain" if slope > 2 else "Heavy monsoon rainfall"
    elif prob > 60:
        main_reason = "High terrain vulnerability (steep slope/elevation)" if slope > 2 else "Elevated seasonal risk"
    elif rainfall > 60:
        main_reason = "Moderate rainfall, monitor conditions"
    else:
        main_reason = "Low rainfall, baseline terrain risk" if prob > 30 else "Dry conditions - low risk"



    return {
        "risk": round(prob, 1),
        "level": level,
        "color": color,
        "rainfall": round(rainfall, 1),
        "month": month,
        "elevation": round(elevation, 1),
        "slope": round(slope, 2),
        "nearest_city": nearest_city,
        "data_source": data_source,
        "main_reason": main_reason,
    }


@app.get("/")
def home():
    return {"message": "Landslide Early Warning API - NER (Model v2)", "status": "running"}


@app.get("/predict")
def predict(lat: float, lon: float, month: int = None):
    r = get_risk(lat, lon, month)
    return {
        "location": {"lat": lat, "lon": lon},
        "month": r["month"],
        "risk_probability": r["risk"],
        "risk_level": r["level"],
        "color": r["color"],
        "data_source": r["data_source"],
        "factors": {
            "rainfall_mm": r["rainfall"],
            "elevation_m": r["elevation"],
            "slope_pct": r["slope"],
            "nearest_city": r["nearest_city"],
            "main_reason": r["main_reason"]
        }
    }


# 45 disaster-prone locations (landslide + flood hotspots, har saal)
CITIES = [
    # SIKKIM
    {"name": "Gangtok, Sikkim",       "lat": 27.33, "lon": 88.61, "state": "Sikkim"},
    {"name": "Namchi, Sikkim",        "lat": 27.17, "lon": 88.36, "state": "Sikkim"},
    {"name": "Mangan, Sikkim",        "lat": 27.51, "lon": 88.53, "state": "Sikkim"},
    {"name": "Chungthang, Sikkim",    "lat": 27.60, "lon": 88.65, "state": "Sikkim"},
    # MEGHALAYA
    {"name": "Shillong, Meghalaya",   "lat": 25.57, "lon": 91.88, "state": "Meghalaya"},
    {"name": "Cherrapunji, Meghalaya","lat": 25.30, "lon": 91.70, "state": "Meghalaya"},
    {"name": "Tura, Meghalaya",       "lat": 25.51, "lon": 90.20, "state": "Meghalaya"},
    {"name": "Jowai, Meghalaya",      "lat": 25.45, "lon": 92.20, "state": "Meghalaya"},
    {"name": "Williamnagar, Meghalaya","lat": 25.48, "lon": 90.69, "state": "Meghalaya"},
    # ARUNACHAL PRADESH
    {"name": "Itanagar, Arunachal",   "lat": 27.08, "lon": 93.61, "state": "Arunachal Pradesh"},
    {"name": "Naharlagun, Arunachal", "lat": 27.10, "lon": 93.69, "state": "Arunachal Pradesh"},
    {"name": "Tawang, Arunachal",     "lat": 27.59, "lon": 91.87, "state": "Arunachal Pradesh"},
    {"name": "Bomdila, Arunachal",    "lat": 27.26, "lon": 92.42, "state": "Arunachal Pradesh"},
    {"name": "Pasighat, Arunachal",   "lat": 28.07, "lon": 95.33, "state": "Arunachal Pradesh"},
    {"name": "Ziro, Arunachal",       "lat": 27.54, "lon": 93.83, "state": "Arunachal Pradesh"},
    {"name": "Bhalukpong, Arunachal", "lat": 27.14, "lon": 92.71, "state": "Arunachal Pradesh"},
    {"name": "Roing, Arunachal",      "lat": 28.14, "lon": 95.39, "state": "Arunachal Pradesh"},
    {"name": "Anini, Arunachal",      "lat": 28.22, "lon": 95.89, "state": "Arunachal Pradesh"},
    # NAGALAND
    {"name": "Kohima, Nagaland",      "lat": 25.67, "lon": 94.11, "state": "Nagaland"},
    {"name": "Dimapur, Nagaland",     "lat": 25.91, "lon": 93.73, "state": "Nagaland"},
    {"name": "Mokokchung, Nagaland",  "lat": 26.32, "lon": 94.52, "state": "Nagaland"},
    {"name": "Wokha, Nagaland",       "lat": 26.10, "lon": 94.26, "state": "Nagaland"},
    {"name": "Mon, Nagaland",         "lat": 27.20, "lon": 95.15, "state": "Nagaland"},
    {"name": "Phek, Nagaland",        "lat": 25.57, "lon": 94.42, "state": "Nagaland"},
    # MANIPUR
    {"name": "Imphal, Manipur",       "lat": 24.81, "lon": 93.94, "state": "Manipur"},
    {"name": "Churachandpur, Manipur","lat": 24.33, "lon": 93.68, "state": "Manipur"},
    {"name": "Ukhrul, Manipur",       "lat": 25.05, "lon": 94.36, "state": "Manipur"},
    {"name": "Senapati, Manipur",     "lat": 25.29, "lon": 94.02, "state": "Manipur"},
    {"name": "Tamenglong, Manipur",   "lat": 24.87, "lon": 93.51, "state": "Manipur"},
    {"name": "Thoubal, Manipur",      "lat": 24.63, "lon": 94.01, "state": "Manipur"},
    # MIZORAM
    {"name": "Aizawl, Mizoram",       "lat": 23.73, "lon": 92.72, "state": "Mizoram"},
    {"name": "Lunglei, Mizoram",      "lat": 22.88, "lon": 92.73, "state": "Mizoram"},
    {"name": "Champhai, Mizoram",     "lat": 23.97, "lon": 93.33, "state": "Mizoram"},
    {"name": "Serchhip, Mizoram",     "lat": 23.26, "lon": 92.88, "state": "Mizoram"},
    {"name": "Lawngtlai, Mizoram",    "lat": 22.55, "lon": 92.90, "state": "Mizoram"},
    # TRIPURA
    {"name": "Agartala, Tripura",     "lat": 23.83, "lon": 91.28, "state": "Tripura"},
    {"name": "Udaipur, Tripura",      "lat": 23.53, "lon": 91.48, "state": "Tripura"},
    {"name": "Dharmanagar, Tripura",  "lat": 24.36, "lon": 92.17, "state": "Tripura"},
    {"name": "Ambassa, Tripura",      "lat": 23.80, "lon": 91.84, "state": "Tripura"},
    {"name": "Kailashahar, Tripura",  "lat": 24.33, "lon": 92.00, "state": "Tripura"},
    # ASSAM (Brahmaputra flood belt + landslide zones)
    {"name": "Guwahati, Assam",       "lat": 26.14, "lon": 91.73, "state": "Assam"},
    {"name": "Silchar, Assam",        "lat": 24.83, "lon": 92.77, "state": "Assam"},
    {"name": "Dibrugarh, Assam",      "lat": 27.48, "lon": 95.00, "state": "Assam"},
    {"name": "Tinsukia, Assam",       "lat": 27.50, "lon": 95.36, "state": "Assam"},
    {"name": "Haflong, Assam",        "lat": 25.10, "lon": 93.20, "state": "Assam"},
    {"name": "Diphu, Assam",          "lat": 25.83, "lon": 93.43, "state": "Assam"},
    {"name": "Jorhat, Assam",         "lat": 26.75, "lon": 94.22, "state": "Assam"},
    {"name": "Dhemaji, Assam",        "lat": 27.48, "lon": 94.58, "state": "Assam"},
    {"name": "Majuli, Assam",         "lat": 26.95, "lon": 94.17, "state": "Assam"},
    {"name": "Karimganj, Assam",      "lat": 24.87, "lon": 92.35, "state": "Assam"},
    {"name": "Tezpur, Assam",         "lat": 26.63, "lon": 92.80, "state": "Assam"},
    {"name": "Nagaon, Assam",         "lat": 26.35, "lon": 92.68, "state": "Assam"},
    {"name": "Karimganj, Assam",      "lat": 24.87, "lon": 92.35, "state": "Assam"},
]



@app.get("/alerts")
def get_alerts(use_live: bool = True):
    """Live alerts for 8 NER cities.
    use_live=true  -> real rainfall from Open-Meteo (default)
    use_live=false -> seasonal monsoon simulation (demo mode)
    """
    alerts = []
    for c in CITIES:
        r = get_risk(c["lat"], c["lon"], use_live=use_live)
        alerts.append({
            "name": c["name"], "lat": c["lat"], "lon": c["lon"],
             "state": c.get("state", ""), 
            "risk": r["risk"], "level": r["level"],
            "rainfall_mm": r["rainfall"],
            "elevation_m": r["elevation"],
            "slope_pct": r["slope"],
            "data_source": r["data_source"],
        })
    return alerts

from fastapi import Body
import json

REPORTS_FILE = os.path.join(BASE_DIR, "reports.json")

def load_reports():
    if os.path.exists(REPORTS_FILE):
        with open(REPORTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

@app.post("/report")
def add_report(report: dict = Body(...)):
    """Citizen report: {lat, lon, description, severity, reporter}"""
    reports = load_reports()
    
    # Us location ka ML risk bhi nikaalo!
    r = get_risk(report["lat"], report["lon"])
    
    new_report = {
        "id": len(reports) + 1,
        "lat": report["lat"],
        "lon": report["lon"],
        "description": report.get("description", ""),
        "severity": report.get("severity", "MEDIUM"),
        "reporter": report.get("reporter", "Anonymous"),
        "time": datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "ml_risk": r["risk"],
        "ml_level": r["level"],
    }
    reports.append(new_report)
    with open(REPORTS_FILE, "w", encoding="utf-8") as f:
        json.dump(reports, f, indent=2, ensure_ascii=False)
    return {"status": "saved", "report": new_report}


@app.get("/reports")
def get_reports():
    return load_reports()
