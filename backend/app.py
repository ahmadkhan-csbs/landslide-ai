from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd

app = FastAPI(title="Landslide Early Warning API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
import os
model = joblib.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ml_model", "landslide_model.pkl"))


RAINFALL = {1: 10, 2: 15, 3: 30, 4: 50, 5: 120, 6: 320, 7: 380, 8: 340, 9: 250, 10: 120, 11: 120, 12: 12}
FEATURES = ["latitude", "longitude", "month", "rainfall", "terrain_risk"]

def make_input(lat, lon, month):
    rain = RAINFALL.get(month, 50)
    terr = 1 / (1 + abs(lat - 25.5) + abs(lon - 93.0))
    return pd.DataFrame([[lat, lon, month, rain, terr]], columns=FEATURES)

@app.get("/")
def home():
    return {"message": "Landslide Early Warning API - NER", "status": "running"}

@app.get("/predict")
def predict(lat: float, lon: float, month: int):
    prob = model.predict_proba(make_input(lat, lon, month))[0][1] * 100
    if prob > 60:
        level, color = "HIGH", "red"
    elif prob > 30:
        level, color = "MEDIUM", "orange"
    else:
        level, color = "LOW", "green"
    return {
        "location": {"lat": lat, "lon": lon},
        "month": month,
        "risk_probability": round(prob, 1),
        "risk_level": level,
        "color": color,
        "factors": {
            "rainfall_mm": RAINFALL.get(month, 50),
            "main_reason": "Heavy monsoon rainfall + fragile terrain" if month in [6,7,8,9] else "Dry season - low rainfall"
        }
    }

@app.get("/alerts")
def get_alerts():
    cities = [
        {"name": "Guwahati, Assam", "lat": 26.14, "lon": 91.73},
        {"name": "Shillong, Meghalaya", "lat": 25.57, "lon": 91.88},
        {"name": "Imphal, Manipur", "lat": 24.81, "lon": 93.94},
        {"name": "Kohima, Nagaland", "lat": 25.67, "lon": 94.11},
        {"name": "Aizawl, Mizoram", "lat": 23.73, "lon": 92.72},
        {"name": "Agartala, Tripura", "lat": 23.83, "lon": 91.28},
        {"name": "Itanagar, Arunachal", "lat": 27.08, "lon": 93.61},
        {"name": "Gangtok, Sikkim", "lat": 27.33, "lon": 88.61},
    ]
    alerts = []
    for c in cities:
        prob = model.predict_proba(make_input(c["lat"], c["lon"], 7))[0][1] * 100
        if prob > 60:
            level = "HIGH"
        elif prob > 30:
            level = "MEDIUM"
        else:
            level = "LOW"
        alerts.append({"name": c["name"], "lat": c["lat"], "lon": c["lon"], "risk": round(prob, 1), "level": level})
    return alerts

