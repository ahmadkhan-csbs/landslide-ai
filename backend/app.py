from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
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

model = joblib.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ml_model", "landslide_model.pkl"))

# Seasonal fallback rainfall (mm) — sirf tab use hoga jab live API fail ho
RAINFALL = {1: 10, 2: 15, 3: 30, 4: 50, 5: 120, 6: 320, 7: 380, 8: 340, 9: 250, 10: 120, 11: 120, 12: 12}

FEATURES = ["latitude", "longitude", "month", "rainfall", "terrain_risk"]


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
    terr = 1 / (1 + abs(lat - 25.5) + abs(lon - 93.0))
    return pd.DataFrame([[lat, lon, month, rainfall, terr]], columns=FEATURES)


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

    prob = model.predict_proba(make_input(lat, lon, month, rainfall))[0][1] * 100

    if prob > 60:
        level, color = "HIGH", "red"
    elif prob > 30:
        level, color = "MEDIUM", "orange"
    else:
        level, color = "LOW", "green"

    main_reason = (
        "Heavy monsoon rainfall + fragile terrain"
        if rainfall > 200
        else ("Moderate rainfall, monitor conditions" if rainfall > 60 else "Dry conditions - low risk")
    )

    return {
        "risk": round(prob, 1),
        "level": level,
        "color": color,
        "rainfall": round(rainfall, 1),
        "month": month,
        "data_source": data_source,
        "main_reason": main_reason,
    }


@app.get("/")
def home():
    return {"message": "Landslide Early Warning API - NER", "status": "running"}


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
            "main_reason": r["main_reason"]
        }
    }


CITIES = [
    {"name": "Guwahati, Assam",     "lat": 26.14, "lon": 91.73},
    {"name": "Shillong, Meghalaya", "lat": 25.57, "lon": 91.88},
    {"name": "Imphal, Manipur",     "lat": 24.81, "lon": 93.94},
    {"name": "Kohima, Nagaland",    "lat": 25.67, "lon": 94.11},
    {"name": "Aizawl, Mizoram",     "lat": 23.73, "lon": 92.72},
    {"name": "Agartala, Tripura",   "lat": 23.83, "lon": 91.28},
    {"name": "Itanagar, Arunachal", "lat": 27.08, "lon": 93.61},
    {"name": "Gangtok, Sikkim",     "lat": 27.33, "lon": 88.61},
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
            "risk": r["risk"], "level": r["level"],
            "rainfall_mm": r["rainfall"],
            "data_source": r["data_source"],
        })
    return alerts

from fastapi import Body
from datetime import datetime
import json

REPORTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports.json")

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
