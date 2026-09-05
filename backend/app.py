from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
import numpy as np
import os
import urllib.request
import json as jsonlib
import math
import requests
from datetime import datetime, timedelta, timezone
from time import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Literal
from pydantic import BaseModel, Field
try:
    from .config import ADMIN_PASSWORD, ADMIN_SESSION_SECRET, DATABASE_PATH, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USERNAME, FAST2SMS_API_KEY
    from .providers import ProviderUnavailable, fetch_preferred_weather
    from .store import ObservationStore, is_fresh
except ImportError:  # supports `cd backend; uvicorn app:app --reload`
    from config import ADMIN_PASSWORD, ADMIN_SESSION_SECRET, DATABASE_PATH, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USERNAME, FAST2SMS_API_KEY
    from providers import ProviderUnavailable, fetch_preferred_weather
    from store import ObservationStore, is_fresh

app = FastAPI(title="Landslide Early Warning API")
# Configuration, including local admin credentials, is read when this process starts.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# MODEL v2 — Rainfall + Terrain (Elevation, Slope)
model = joblib.load(os.path.join(BASE_DIR, "..", "ml_model", "landslide_model_v2.pkl"))

# Terrain grid data (elevation + slope used for nearest-point lookup)
terrain_df = pd.read_csv(os.path.join(BASE_DIR, "..", "data", "ner_terrain_v2.csv"))

# NASA POWER monthly daily-rainfall observations for the eight source stations.
# They are used only for historical climate simulation and for a labelled
# fallback when the live weather service cannot be reached.
rainfall_history_df = pd.read_csv(os.path.join(BASE_DIR, "..", "data", "ner_rainfall_2015_2024.csv"))
RAIN_STATIONS = rainfall_history_df.groupby("city", as_index=False).agg(lat=("lat", "first"), lon=("lon", "first"))
RAINFALL_CLIMATOLOGY = rainfall_history_df.groupby(["city", "month"])["avg_rainfall"].mean().to_dict()
RAINFALL_CLIMATOLOGY_PERIOD = f"{int(rainfall_history_df['year'].min())}–{int(rainfall_history_df['year'].max())}"

RAIN_CACHE_TTL_SECONDS = 15 * 60
_rain_cache = {}
_reports_lock = Lock()
_report_attempts = {}
weather_store = ObservationStore(DATABASE_PATH)
weather_store.initialise()

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


def get_climate_rainfall(lat: float, lon: float, month: int):
    """Nearest-station NASA POWER monthly climate normal in mm/day."""
    distances = haversine(lat, lon, RAIN_STATIONS["lat"].values, RAIN_STATIONS["lon"].values)
    station = RAIN_STATIONS.iloc[int(np.argmin(distances))]
    station_name = str(station["city"])
    rainfall = RAINFALL_CLIMATOLOGY[(station_name, month)]
    return float(rainfall), station_name, round(float(np.min(distances)), 1)


def validate_ner_location(lat: float, lon: float):
    """Keep predictions inside the terrain data's demonstrated NER coverage."""
    if not (21.0 <= lat <= 29.5 and 88.0 <= lon <= 97.0):
        raise HTTPException(
            status_code=422,
            detail="This prototype currently supports North East India only (lat 21–29.5, lon 88–97).",
        )


def validate_month(month: int | None) -> int | None:
    if month is not None and not 1 <= month <= 12:
        raise HTTPException(status_code=422, detail="month must be an integer from 1 to 12.")
    return month



def get_live_rainfall(lat: float, lon: float, location_name: str | None = None):
    """Return observed 7-day rain statistics, or None if Open-Meteo fails.

    The model input is average daily rain (mm/day), the same unit used during
    v2 training. The seven-day total is returned separately for explanation.
    """
    cache_key = (round(lat, 3), round(lon, 3))
    cached = _rain_cache.get(cache_key)
    if cached and time() - cached["saved_at"] < RAIN_CACHE_TTL_SECONDS:
        return cached["value"]

    # A scheduler/manual refresh may already have a recent, auditable record.
    # Reuse it immediately rather than making the dashboard wait for 53 calls.
    saved = weather_store.latest(location_name or f"{lat:.4f},{lon:.4f}", lat, lon)
    if is_fresh(saved):
        seven_total = saved.get("rainfall_7d_mm")
        if seven_total is not None:
            value = {
                "rainfall": float(seven_total) / 7,
                "seven_day_total": float(seven_total), "window_days": 7,
                "rainfall_1h": saved.get("rainfall_1h_mm"), "rainfall_24h": saved.get("rainfall_24h_mm"),
                "forecast_rainfall": saved.get("forecast_rainfall_mm"), "source": saved["source"],
                "status": f"cached_{saved['status']}", "fetched_at_utc": saved["fetched_at_utc"],
            }
            _rain_cache[cache_key] = {"saved_at": time(), "value": value}
            return value

    try:
        observation = fetch_preferred_weather(location_name or f"{lat:.4f},{lon:.4f}", lat, lon)
        weather_store.save_observation(observation)
        seven_total = observation.get("rainfall_7d_mm")
        if seven_total is None:
            return None
        value = {
            "rainfall": float(seven_total) / 7,
            "seven_day_total": float(seven_total),
            "window_days": 7,
            "rainfall_1h": observation.get("rainfall_1h_mm"),
            "rainfall_24h": observation.get("rainfall_24h_mm"),
            "forecast_rainfall": observation.get("forecast_rainfall_mm"),
            "source": observation["source"],
            "status": observation["status"],
            "fetched_at_utc": observation["fetched_at_utc"],
        }
        _rain_cache[cache_key] = {"saved_at": time(), "value": value}
        return value
    except (ProviderUnavailable, OSError, ValueError) as e:
        print(f"Rainfall API failed for ({lat}, {lon}):", e)
        return None


def make_input(lat, lon, month, rainfall):
    elevation, slope, _ = get_terrain(lat, lon)
    return pd.DataFrame([[lat, lon, month, rainfall, elevation, slope]], columns=FEATURES)


def screening_level(risk_score: float, rainfall: float, slope: float):
    """Conservative, transparent display policy; not an official warning."""
    if rainfall >= 20 or (rainfall >= 12 and slope >= 2):
        return "HIGH", "red"
    if rainfall >= 6 or (risk_score > 60 and slope >= 2):
        return "MEDIUM", "orange"
    return "LOW", "green"


def get_risk(lat, lon, month=None, use_live=True):
    """Single source of truth for risk — used by /predict and /alerts."""
    # Month decide karo: diya hai to wo, warna AAJ KA REAL month
    if month is None:
        month = datetime.now().month

    seasonal_rainfall, rain_station, rain_station_distance = get_climate_rainfall(lat, lon, month)
    data_source = f"SIMULATION (NASA POWER {RAINFALL_CLIMATOLOGY_PERIOD} monthly climate normal)"
    rainfall_window_days = None
    rainfall_window_total = None
    rainfall_source = f"NASA POWER {RAINFALL_CLIMATOLOGY_PERIOD}; nearest station {rain_station} ({rain_station_distance} km)"
    if use_live:
        live_rain = get_live_rainfall(lat, lon)
        if live_rain is not None:
            rainfall = live_rain["rainfall"]
            rainfall_window_days = live_rain["window_days"]
            rainfall_window_total = live_rain["seven_day_total"]
            data_source = f"LIVE ({live_rain['source']}; 7-day daily average)"
            rainfall_source = f"{live_rain['source']} observed rainfall; status: {live_rain['status']}"
        else:
            rainfall = seasonal_rainfall
            data_source = f"LIVE unavailable — fallback: NASA POWER {RAINFALL_CLIMATOLOGY_PERIOD} climate normal"
    else:
        rainfall = seasonal_rainfall

    elevation, slope, nearest_city = get_terrain(lat, lon)
    prob = model.predict_proba(make_input(lat, lon, month, rainfall))[0][1] * 100

    level, color = screening_level(prob, rainfall, slope)

    if rainfall >= 20:
        main_reason = "Heavy rainfall + steep fragile terrain" if slope > 2 else "Heavy monsoon rainfall"
    elif rainfall >= 12:
        main_reason = "Sustained monsoon rainfall; monitor local slopes"
    elif prob > 60 and slope > 2:
        main_reason = "High terrain vulnerability (steep slope/elevation)" if slope > 2 else "Elevated seasonal risk"
    elif rainfall > 6:
        main_reason = "Moderate rainfall, monitor conditions"
    else:
        main_reason = "Low rainfall, baseline terrain risk" if prob > 30 else "Dry conditions - low risk"



    return {
        "risk": round(prob, 1),
        "level": level,
        "screening_level_label": "Current rainfall-and-terrain screening level",
        "color": color,
        "rainfall": round(rainfall, 1),
        "rainfall_feature": "7-day average daily rainfall (mm/day)",
        "rainfall_source": rainfall_source,
        "rainfall_station": rain_station,
        "rainfall_station_distance_km": rain_station_distance,
        "risk_interpretation": "Experimental screening score; not an official landslide-warning probability.",
        "rainfall_window_days": rainfall_window_days,
        "rainfall_window_total": round(rainfall_window_total, 1) if rainfall_window_total is not None else None,
        "rainfall_1h": live_rain.get("rainfall_1h") if use_live and live_rain else None,
        "rainfall_24h": live_rain.get("rainfall_24h") if use_live and live_rain else None,
        "forecast_rainfall": live_rain.get("forecast_rainfall") if use_live and live_rain else None,
        "weather_status": live_rain.get("status") if use_live and live_rain else "climate_fallback",
        "weather_fetched_at_utc": live_rain.get("fetched_at_utc") if use_live and live_rain else None,
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


@app.get("/data-health")
def data_health():
    """Auditable current-data readiness; an absence of freshness is never described as live."""
    observations = weather_store.latest_all()
    current = [item for item in observations if is_fresh(item, 60 * 60)]
    stale = [item for item in observations if item not in current]
    provider_counts = {}
    fallback_count = 0
    for item in observations:
        provider_counts[item["source"]] = provider_counts.get(item["source"], 0) + 1
        if "fallback" in item.get("status", "").lower():
            fallback_count += 1
    newest = max((item["fetched_at_utc"] for item in observations), default=None)
    return {
        "monitored_locations": len(CITIES), "locations_with_observations": len(observations),
        "fresh_within_minutes": 60, "fresh_locations": len(current), "stale_locations": len(stale),
        "missing_locations": max(0, len(CITIES) - len(observations)), "provider_counts": provider_counts,
        "fallback_locations": fallback_count, "newest_fetch_at_utc": newest,
        "overall_status": "LIVE_READY" if len(current) == len(CITIES) else "PARTIAL_OR_STALE",
        "note": "Experimental dashboard data quality only. This is not an official warning-service availability metric.",
    }


@app.get("/weather-history")
def weather_history(location_name: str, lat: float, lon: float, limit: int = 6):
    """Small public provenance trail for a listed NER screening location."""
    validate_ner_location(lat, lon)
    if not 1 <= limit <= 10:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 10.")
    listed_location = next((city for city in CITIES if city["name"] == location_name
                            and abs(city["lat"] - lat) < 0.0001 and abs(city["lon"] - lon) < 0.0001), None)
    if not listed_location:
        raise HTTPException(status_code=404, detail="Location is not in the demonstrated 53-location coverage list.")
    records = weather_store.history(location_name, lat, lon, limit)
    return {
        "location_name": location_name,
        "records": records,
        "note": "Stored observation provenance. Forecast is separate from observed rainfall; this is not an official warning feed.",
    }


@app.get("/predict")
def predict(lat: float, lon: float, month: int = None, use_live: bool = True):
    validate_ner_location(lat, lon)
    validate_month(month)
    r = get_risk(lat, lon, month, use_live=use_live)
    return {
        "location": {"lat": lat, "lon": lon},
        "month": r["month"],
        "risk_probability": r["risk"],
        "risk_level": r["level"],
        "screening_level_label": r["screening_level_label"],
        "color": r["color"],
        "data_source": r["data_source"],
        "risk_interpretation": r["risk_interpretation"],
        "factors": {
            "rainfall_mm": r["rainfall"],
            "rainfall_feature": r["rainfall_feature"],
            "rainfall_window_days": r["rainfall_window_days"],
            "rainfall_window_total_mm": r["rainfall_window_total"],
            "rainfall_1h_mm": r["rainfall_1h"],
            "rainfall_24h_mm": r["rainfall_24h"],
            "forecast_rainfall_mm": r["forecast_rainfall"],
            "weather_status": r["weather_status"],
            "weather_fetched_at_utc": r["weather_fetched_at_utc"],
            "rainfall_source": r["rainfall_source"],
            "rainfall_station": r["rainfall_station"],
            "rainfall_station_distance_km": r["rainfall_station_distance_km"],
            "elevation_m": r["elevation"],
            "slope_pct": r["slope"],
            "nearest_city": r["nearest_city"],
            "main_reason": r["main_reason"]
        }
    }


# Demonstrated risk-screening coverage: 53 NER locations selected from the
# project's disaster-prone location list. The nearest available terrain-grid
# point is disclosed in every prediction response.
CITIES = [
    {"name": "Guwahati, Assam", "lat": 26.14, "lon": 91.73, "state": "Assam"},
    {"name": "Silchar, Assam", "lat": 24.83, "lon": 92.77, "state": "Assam"},
    {"name": "Haflong, Assam", "lat": 25.10, "lon": 93.20, "state": "Assam"},
    {"name": "Diphu, Assam", "lat": 25.83, "lon": 93.43, "state": "Assam"},
    {"name": "Dibrugarh, Assam", "lat": 27.48, "lon": 95.00, "state": "Assam"},
    {"name": "Tinsukia, Assam", "lat": 27.50, "lon": 95.36, "state": "Assam"},
    {"name": "Tezpur, Assam", "lat": 26.63, "lon": 92.80, "state": "Assam"},
    {"name": "Nagaon, Assam", "lat": 26.35, "lon": 92.68, "state": "Assam"},
    {"name": "Karimganj, Assam", "lat": 24.87, "lon": 92.35, "state": "Assam"},
    {"name": "Shillong, Meghalaya", "lat": 25.57, "lon": 91.88, "state": "Meghalaya"},
    {"name": "Cherrapunji, Meghalaya", "lat": 25.30, "lon": 91.70, "state": "Meghalaya"},
    {"name": "Tura, Meghalaya", "lat": 25.51, "lon": 90.20, "state": "Meghalaya"},
    {"name": "Jowai, Meghalaya", "lat": 25.45, "lon": 92.20, "state": "Meghalaya"},
    {"name": "Williamnagar, Meghalaya", "lat": 25.48, "lon": 90.69, "state": "Meghalaya"},
    {"name": "Nongstoin, Meghalaya", "lat": 25.52, "lon": 91.26, "state": "Meghalaya"},
    {"name": "Imphal, Manipur", "lat": 24.81, "lon": 93.94, "state": "Manipur"},
    {"name": "Churachandpur, Manipur", "lat": 24.33, "lon": 93.68, "state": "Manipur"},
    {"name": "Ukhrul, Manipur", "lat": 25.05, "lon": 94.36, "state": "Manipur"},
    {"name": "Senapati, Manipur", "lat": 25.29, "lon": 94.02, "state": "Manipur"},
    {"name": "Tamenglong, Manipur", "lat": 24.87, "lon": 93.51, "state": "Manipur"},
    {"name": "Thoubal, Manipur", "lat": 24.63, "lon": 94.01, "state": "Manipur"},
    {"name": "Kohima, Nagaland", "lat": 25.67, "lon": 94.11, "state": "Nagaland"},
    {"name": "Dimapur, Nagaland", "lat": 25.91, "lon": 93.73, "state": "Nagaland"},
    {"name": "Mokokchung, Nagaland", "lat": 26.32, "lon": 94.52, "state": "Nagaland"},
    {"name": "Wokha, Nagaland", "lat": 26.10, "lon": 94.26, "state": "Nagaland"},
    {"name": "Mon, Nagaland", "lat": 27.20, "lon": 95.15, "state": "Nagaland"},
    {"name": "Phek, Nagaland", "lat": 25.57, "lon": 94.42, "state": "Nagaland"},
    {"name": "Aizawl, Mizoram", "lat": 23.73, "lon": 92.72, "state": "Mizoram"},
    {"name": "Lunglei, Mizoram", "lat": 22.88, "lon": 92.73, "state": "Mizoram"},
    {"name": "Champhai, Mizoram", "lat": 23.97, "lon": 93.33, "state": "Mizoram"},
    {"name": "Serchhip, Mizoram", "lat": 23.26, "lon": 92.88, "state": "Mizoram"},
    {"name": "Lawngtlai, Mizoram", "lat": 22.55, "lon": 92.90, "state": "Mizoram"},
    {"name": "Agartala, Tripura", "lat": 23.83, "lon": 91.28, "state": "Tripura"},
    {"name": "Udaipur, Tripura", "lat": 23.53, "lon": 91.48, "state": "Tripura"},
    {"name": "Dharmanagar, Tripura", "lat": 24.36, "lon": 92.17, "state": "Tripura"},
    {"name": "Ambassa, Tripura", "lat": 23.80, "lon": 91.84, "state": "Tripura"},
    {"name": "Kailashahar, Tripura", "lat": 24.33, "lon": 92.00, "state": "Tripura"},
    {"name": "Itanagar, Arunachal Pradesh", "lat": 27.08, "lon": 93.61, "state": "Arunachal Pradesh"},
    {"name": "Naharlagun, Arunachal Pradesh", "lat": 27.10, "lon": 93.69, "state": "Arunachal Pradesh"},
    {"name": "Tawang, Arunachal Pradesh", "lat": 27.59, "lon": 91.87, "state": "Arunachal Pradesh"},
    {"name": "Bomdila, Arunachal Pradesh", "lat": 27.26, "lon": 92.42, "state": "Arunachal Pradesh"},
    {"name": "Pasighat, Arunachal Pradesh", "lat": 28.07, "lon": 95.33, "state": "Arunachal Pradesh"},
    {"name": "Ziro, Arunachal Pradesh", "lat": 27.54, "lon": 93.83, "state": "Arunachal Pradesh"},
    {"name": "Bhalukpong, Arunachal Pradesh", "lat": 27.14, "lon": 92.71, "state": "Arunachal Pradesh"},
    {"name": "Roing, Arunachal Pradesh", "lat": 28.14, "lon": 95.39, "state": "Arunachal Pradesh"},
    {"name": "Anini, Arunachal Pradesh", "lat": 28.22, "lon": 95.89, "state": "Arunachal Pradesh"},
    {"name": "Yingkiong, Arunachal Pradesh", "lat": 28.61, "lon": 95.89, "state": "Arunachal Pradesh"},
    {"name": "Seppa, Arunachal Pradesh", "lat": 27.33, "lon": 93.08, "state": "Arunachal Pradesh"},
    {"name": "Gangtok, Sikkim", "lat": 27.33, "lon": 88.61, "state": "Sikkim"},
    {"name": "Namchi, Sikkim", "lat": 27.17, "lon": 88.36, "state": "Sikkim"},
    {"name": "Mangan, Sikkim", "lat": 27.51, "lon": 88.53, "state": "Sikkim"},
    {"name": "Chungthang, Sikkim", "lat": 27.60, "lon": 88.65, "state": "Sikkim"},
    {"name": "Gyalshing, Sikkim", "lat": 27.29, "lon": 88.25, "state": "Sikkim"},
]



@app.get("/alerts")
def get_alerts(use_live: bool = True, month: int = None):
    """Live alerts for 53 disaster-prone NER locations.
    use_live=true  -> real rainfall from Open-Meteo (default)
    use_live=false -> seasonal monsoon simulation (demo mode)
    """
    validate_month(month)
    simulation_month = month or datetime.now().month
    # Fetch weather concurrently once per city. Individual risk calculations
    # below then use the short-lived rainfall cache instead of serial requests.
    if use_live:
        with ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(lambda city: get_live_rainfall(city["lat"], city["lon"], city["name"]), CITIES))

    alerts = []
    for c in CITIES:
        r = get_risk(c["lat"], c["lon"], month=simulation_month, use_live=use_live)
        alerts.append({
            "name": c["name"], "lat": c["lat"], "lon": c["lon"],
             "state": c.get("state", ""), 
            "risk": r["risk"], "level": r["level"],
            "screening_level_label": r["screening_level_label"],
            "rainfall_mm": r["rainfall"],
            "elevation_m": r["elevation"],
            "slope_pct": r["slope"],
            "data_source": r["data_source"],
            "rainfall_source": r["rainfall_source"],
            "rainfall_station": r["rainfall_station"],
            "rainfall_1h_mm": r["rainfall_1h"], "rainfall_24h_mm": r["rainfall_24h"],
            "forecast_rainfall_mm": r["forecast_rainfall"], "weather_status": r["weather_status"],
            "weather_fetched_at_utc": r["weather_fetched_at_utc"],
            "simulation_month": simulation_month if not use_live else None,
            "risk_interpretation": r["risk_interpretation"],
        })
    return alerts

import json
import base64
import binascii
import uuid
import hmac
import hashlib
import smtplib
from email.message import EmailMessage

REPORTS_FILE = os.path.join(BASE_DIR, "reports.json")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
AUDIT_FILE = os.path.join(BASE_DIR, "audit.json")
CONNECTIVITY_SEED_FILE = os.path.join(BASE_DIR, "..", "data", "ner_connectivity_demo.json")


class CitizenReport(BaseModel):
    lat: float = Field(ge=21.0, le=29.5, description="Latitude within demonstrated NER coverage")
    lon: float = Field(ge=88.0, le=97.0, description="Longitude within demonstrated NER coverage")
    description: str = Field(default="", max_length=500)
    severity: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"
    reporter: str = Field(default="Anonymous", max_length=80)
    reporter_phone: str = Field(default="", max_length=25)
    incident_type: Literal["LANDSLIDE", "ROAD_BLOCKED", "SLOPE_CRACK", "PROPERTY_DAMAGE", "DEBRIS_FLOW", "OTHER"] = "LANDSLIDE"
    people_at_risk: int = Field(default=0, ge=0, le=10000)
    photo_data_url: str = Field(default="", max_length=7_000_000)

def load_reports():
    if os.path.exists(REPORTS_FILE):
        try:
            with open(REPORTS_FILE, "r", encoding="utf-8") as f:
                reports = json.load(f)
            return reports if isinstance(reports, list) else []
        except (OSError, json.JSONDecodeError):
            raise HTTPException(status_code=500, detail="Stored reports could not be read.")
    return []

def save_photo(data_url: str) -> str | None:
    """Accept only a small, browser-produced image data URL; never execute uploads."""
    if not data_url:
        return None
    allowed = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    try:
        header, encoded = data_url.split(",", 1)
        media_type = header.split(";", 1)[0].replace("data:", "")
        if media_type not in allowed or ";base64" not in header:
            raise ValueError("Only JPG, PNG, or WebP photos are accepted.")
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=422, detail="Invalid photo upload.") from exc
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Photo must be 5 MB or smaller.")
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{allowed[media_type]}"
    path = os.path.join(UPLOADS_DIR, filename)
    with open(path, "xb") as image_file:
        image_file.write(content)
    return filename


@app.post("/report")
def add_report(report: CitizenReport, request: Request):
    """Save an unverified local incident report. It is not authority dispatch."""
    address = request.client.host if request.client else "unknown"
    now = time()
    recent_attempts = [stamp for stamp in _report_attempts.get(address, []) if now - stamp < 3600]
    if len(recent_attempts) >= 5:
        raise HTTPException(status_code=429, detail="Too many reports from this network. For immediate danger, call 112.")
    recent_attempts.append(now)
    _report_attempts[address] = recent_attempts
    r = get_risk(report.lat, report.lon)
    photo_filename = save_photo(report.photo_data_url)
    with _reports_lock:
        reports = load_reports()
        next_id = max((item.get("id", 0) for item in reports), default=0) + 1
        new_report = {
            "id": next_id,
            "lat": report.lat,
            "lon": report.lon,
            "description": report.description.strip(),
            "severity": report.severity,
            "reporter": report.reporter.strip() or "Anonymous",
            "reporter_phone": report.reporter_phone.strip(),
            "incident_type": report.incident_type,
            "people_at_risk": report.people_at_risk,
            "photo_filename": photo_filename,
            "reference_id": f"NER-{datetime.now().strftime('%Y%m%d')}-{next_id:05d}",
            "verification_status": "UNVERIFIED",
            "delivery_status": "RECEIVED_LOCALLY_NOT_DISPATCHED",
            "time": datetime.now().astimezone().isoformat(timespec="seconds"),
            "ml_risk": r["risk"],
            "ml_level": r["level"],
        }
        reports.append(new_report)
        temp_file = f"{REPORTS_FILE}.tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(reports, f, indent=2, ensure_ascii=False)
        os.replace(temp_file, REPORTS_FILE)
    return {"status": "received", "message": "Report received by this website. It has not been dispatched to authorities.", "report": new_report}


@app.get("/reports")
def get_reports():
    """Public map feed: never expose reporter phone or uploaded photo filename."""
    hidden = {"reporter_phone", "photo_filename", "reporter"}
    return [{key: value for key, value in report.items() if key not in hidden} for report in load_reports()]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(a))


def _distance_to_corridor_km(lat: float, lon: float, points: list[list[float]]) -> float:
    """Nearest seed-corridor vertex distance; never used as lane-level routing."""
    return min(_haversine_km(lat, lon, point[0], point[1]) for point in points)


def _connectivity_seed() -> dict:
    try:
        with open(CONNECTIVITY_SEED_FILE, encoding="utf-8") as stream:
            data = jsonlib.load(stream)
        if not isinstance(data.get("corridors"), list) or not isinstance(data.get("service_points"), list):
            raise ValueError("required arrays are missing")
        return data
    except (OSError, ValueError, jsonlib.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Connectivity seed data is unavailable.") from exc


def connectivity_impact() -> dict:
    """Report-evidence impact view; never represents an official road status."""
    seed = _connectivity_seed()
    reports = [report for report in load_reports() if report.get("verification_status") != "REJECTED"]
    corridors = []
    for corridor in seed["corridors"]:
        points = corridor["points"]
        nearby = [report for report in reports if _distance_to_corridor_km(float(report["lat"]), float(report["lon"]), points) <= 8]
        verified_blockage = [report for report in nearby if report.get("verification_status") == "VERIFIED" and report.get("incident_type") == "ROAD_BLOCKED"]
        verified_hazard = [report for report in nearby if report.get("verification_status") == "VERIFIED"]
        people_at_risk = sum(int(report.get("people_at_risk", 0)) for report in nearby)
        midpoint = points[len(points) // 2]
        nearby_services = [service for service in seed["service_points"] if _haversine_km(midpoint[0], midpoint[1], service["lat"], service["lon"]) <= 35]
        if verified_blockage:
            status, confidence = "CONFIRMED_BLOCKED", "reviewer_confirmed_report"
        elif verified_hazard:
            status, confidence = "CONFIRMED_HAZARD_NEARBY", "reviewer_confirmed_hazard_nearby"
        elif nearby:
            status, confidence = "UNVERIFIED_INCIDENT_NEARBY", "citizen_report_unverified"
        else:
            status, confidence = "NO_REPORTED_DISRUPTION", "no_nearby_report"
        severity_weight = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
        priority = min(100, len(nearby) * 12 + people_at_risk // 5 + len(nearby_services) * 6 + max((severity_weight.get(report.get("severity"), 1) for report in nearby), default=0) * 8)
        corridors.append({
            **corridor, "status": status, "confidence": confidence,
            "nearby_report_count": len(nearby), "nearby_report_references": [report.get("reference_id") for report in nearby],
            "reported_people_at_risk": people_at_risk, "nearby_essential_services": nearby_services,
            "priority_score": priority,
            "action": "Confirm with road authority before route or closure decisions." if status != "NO_REPORTED_DISRUPTION" else "No nearby website report; this is not confirmation that the road is open.",
        })
    corridors.sort(key=lambda item: item["priority_score"], reverse=True)
    return {
        "network_source": seed["source"], "updated_at_utc": seed["updated_at_utc"], "demonstration_only": True,
        "notice": "Corridors and service points are an SIH demonstration seed, not an official road authority feed. Status is derived only from local incident reports and reviewer state.",
        "alternate_route_status": "NOT_AVAILABLE — requires authoritative routable road network plus road-authority closure data.",
        "corridors": corridors,
    }


@app.get("/connectivity-impact")
def get_connectivity_impact():
    return connectivity_impact()


@app.get("/reports/{reference_id}")
def get_report_status(reference_id: str):
    """Reference lookup returns status only; it does not disclose reporter data."""
    normalized = reference_id.strip().upper()
    for report in load_reports():
        if report.get("reference_id", "").upper() == normalized:
            return {
                "reference_id": report["reference_id"],
                "incident_type": report.get("incident_type", "LANDSLIDE"),
                "severity": report["severity"],
                "verification_status": report.get("verification_status", "UNVERIFIED"),
                "delivery_status": report.get("delivery_status", "RECEIVED_LOCALLY_NOT_DISPATCHED"),
                "submitted_at": report["time"],
                "message": "This website has received the report. It is not a confirmation of an authority response.",
            }
    raise HTTPException(status_code=404, detail="Report reference not found.")


class AdminLogin(BaseModel):
    password: str = Field(min_length=1, max_length=500)


class ReportStatusUpdate(BaseModel):
    status: Literal["UNVERIFIED", "VERIFIED", "REJECTED", "RESOLVED"]
    note: str = Field(default="", max_length=500)


class DispatchQueueRequest(BaseModel):
    state: Literal["Assam", "Arunachal Pradesh", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Sikkim", "Tripura"]
    note: str = Field(default="", max_length=500)


def admin_enabled() -> bool:
    return len(ADMIN_PASSWORD) >= 12 and len(ADMIN_SESSION_SECRET) >= 24


def make_admin_token() -> str:
    expires = int((datetime.now(timezone.utc) + timedelta(hours=8)).timestamp())
    payload = str(expires).encode()
    signature = hmac.new(ADMIN_SESSION_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=") + "." + signature


def require_admin(authorization: str | None) -> None:
    if not admin_enabled():
        raise HTTPException(status_code=503, detail="Admin panel is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in .env, then restart the backend.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Admin authentication required.")
    try:
        encoded, signature = authorization[7:].split(".", 1)
        payload = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        expected = hmac.new(ADMIN_SESSION_SECRET.encode(), payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected) or int(payload.decode()) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("invalid token")
    except (ValueError, UnicodeDecodeError, binascii.Error):
        raise HTTPException(status_code=401, detail="Invalid or expired admin session.")


def write_audit(entry: dict) -> None:
    audit = []
    if os.path.exists(AUDIT_FILE):
        try:
            with open(AUDIT_FILE, encoding="utf-8") as audit_file:
                audit = json.load(audit_file)
        except (OSError, json.JSONDecodeError):
            audit = []
    audit.append(entry)
    temp_file = AUDIT_FILE + ".tmp"
    with open(temp_file, "w", encoding="utf-8") as audit_file:
        json.dump(audit, audit_file, indent=2)
    os.replace(temp_file, AUDIT_FILE)


def authority_email_for(state: str) -> str:
    key = "AUTHORITY_EMAIL_" + state.upper().replace(" ", "_")
    return os.getenv(key, "").strip()


def save_reports(reports: list[dict]) -> None:
    temp_file = REPORTS_FILE + ".tmp"
    with open(temp_file, "w", encoding="utf-8") as reports_file:
        json.dump(reports, reports_file, indent=2, ensure_ascii=False)
    os.replace(temp_file, REPORTS_FILE)


@app.post("/admin/login")
def admin_login(credentials: AdminLogin):
    if not admin_enabled():
        raise HTTPException(status_code=503, detail="Admin is not configured. Add secure ADMIN_PASSWORD and ADMIN_SESSION_SECRET values to .env.")
    if not hmac.compare_digest(credentials.password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid password.")
    return {"token": make_admin_token(), "expires_in_seconds": 28800}


@app.get("/admin/reports")
def admin_reports(authorization: str | None = Header(default=None)):
    require_admin(authorization)
    return load_reports()


@app.get("/admin/reports/{reference_id}/photo")
def admin_report_photo(reference_id: str, authorization: str | None = Header(default=None)):
    """Serve a report photo only to an authenticated local administrator."""
    require_admin(authorization)
    report = next((item for item in load_reports() if item.get("reference_id", "").upper() == reference_id.upper()), None)
    if not report or not report.get("photo_filename"):
        raise HTTPException(status_code=404, detail="No photo for this report.")
    filename = os.path.basename(report["photo_filename"])
    path = os.path.join(UPLOADS_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Stored photo is unavailable.")
    return FileResponse(path)


@app.patch("/admin/reports/{reference_id}")
def update_report_status(reference_id: str, update: ReportStatusUpdate, authorization: str | None = Header(default=None)):
    require_admin(authorization)
    with _reports_lock:
        reports = load_reports()
        for report in reports:
            if report.get("reference_id", "").upper() == reference_id.upper():
                old_status = report.get("verification_status", "UNVERIFIED")
                report["verification_status"] = update.status
                report["admin_note"] = update.note.strip()
                report["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                temp_file = REPORTS_FILE + ".tmp"
                with open(temp_file, "w", encoding="utf-8") as reports_file:
                    json.dump(reports, reports_file, indent=2, ensure_ascii=False)
                os.replace(temp_file, REPORTS_FILE)
                write_audit({"at_utc": report["updated_at"], "action": "report_status_changed", "reference_id": report["reference_id"], "from": old_status, "to": update.status, "note": report["admin_note"]})
                return {"status": "updated", "report": report}
    raise HTTPException(status_code=404, detail="Report reference not found.")


@app.post("/admin/reports/{reference_id}/queue-dispatch")
def queue_authority_dispatch(reference_id: str, queue: DispatchQueueRequest, authorization: str | None = Header(default=None)):
    """Stage a reviewed report; this endpoint never sends an external message."""
    require_admin(authorization)
    with _reports_lock:
        reports = load_reports()
        for report in reports:
            if report.get("reference_id", "").upper() == reference_id.upper():
                report["dispatch_state"] = queue.state
                report["dispatch_note"] = queue.note.strip()
                report["delivery_status"] = "QUEUED_FOR_ADMIN_DISPATCH"
                report["queued_at_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                save_reports(reports)
                write_audit({"at_utc": report["queued_at_utc"], "action": "dispatch_queued", "reference_id": report["reference_id"], "state": queue.state, "note": report["dispatch_note"]})
                return {"status": "queued", "message": "Queued locally. No authority was contacted.", "recipient_configured": bool(authority_email_for(queue.state))}
    raise HTTPException(status_code=404, detail="Report reference not found.")


@app.post("/admin/reports/{reference_id}/dispatch")
def dispatch_queued_report(reference_id: str, authorization: str | None = Header(default=None)):
    """Explicit admin dispatch by configured SMTP only; never auto-dispatches reports."""
    require_admin(authorization)
    with _reports_lock:
        reports = load_reports()
        report = next((item for item in reports if item.get("reference_id", "").upper() == reference_id.upper()), None)
        if not report:
            raise HTTPException(status_code=404, detail="Report reference not found.")
        if report.get("delivery_status") != "QUEUED_FOR_ADMIN_DISPATCH":
            raise HTTPException(status_code=409, detail="Queue this report before dispatching it.")
        state = report.get("dispatch_state", "")
        recipient = authority_email_for(state)
        if not recipient:
            raise HTTPException(status_code=409, detail=f"No approved authority recipient configured for {state}. Report remains queued; nothing was sent.")
        if not all([SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM]):
            raise HTTPException(status_code=409, detail="SMTP is not configured. Report remains queued; nothing was sent.")
        message = EmailMessage()
        message["Subject"] = f"[Landslide AI — unverified report] {report['reference_id']}"
        message["From"] = SMTP_FROM
        message["To"] = recipient
        message.set_content(
            "This is an UNVERIFIED citizen incident report from the Landslide AI experimental dashboard.\n\n"
            f"Reference: {report['reference_id']}\nState routing selected by local admin: {state}\n"
            f"Incident type: {report.get('incident_type', 'LANDSLIDE')}\nSeverity: {report['severity']}\n"
            f"People reported at risk: {report.get('people_at_risk', 0)}\n"
            f"Coordinates: {report['lat']}, {report['lon']}\nDescription: {report['description']}\n"
            f"Submitted: {report['time']}\n\n"
            "This email is for situational awareness only and is not an official warning. Please independently verify before action."
        )
        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
                smtp.starttls()
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as exc:
            report["delivery_status"] = "DISPATCH_FAILED"
            report["dispatch_error"] = str(exc)[:300]
            report["dispatch_attempted_at_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            save_reports(reports)
            write_audit({"at_utc": report["dispatch_attempted_at_utc"], "action": "dispatch_failed", "reference_id": report["reference_id"], "state": state})
            raise HTTPException(status_code=502, detail="Dispatch failed. The report was not confirmed delivered; see the local audit log.") from exc
        report["delivery_status"] = "SENT_TO_CONFIGURED_AUTHORITY_RECIPIENT"
        report["recipient_state"] = state
        report["dispatch_attempted_at_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        save_reports(reports)
        write_audit({"at_utc": report["dispatch_attempted_at_utc"], "action": "dispatch_sent", "reference_id": report["reference_id"], "state": state})
        return {"status": "sent", "message": "SMTP accepted the message for delivery. This is not an authority acknowledgement."}

class SendSmsRequest(BaseModel):
    phone_numbers: list[str] = Field(..., description="List of phone numbers to send SMS to")
    message: str = Field(default="", description="Message content")

@app.post("/admin/reports/{reference_id}/send-sms")
def dispatch_sms_alert(reference_id: str, payload: SendSmsRequest, authorization: str | None = Header(default=None)):
    """Dispatch an SMS alert via Fast2SMS to specified numbers."""
    require_admin(authorization)
    
    with _reports_lock:
        reports = load_reports()
        report = next((item for item in reports if item.get("reference_id", "").upper() == reference_id.upper()), None)
        if not report:
            raise HTTPException(status_code=404, detail="Report reference not found.")
            
        if not FAST2SMS_API_KEY:
            raise HTTPException(status_code=503, detail="FAST2SMS_API_KEY is not configured in .env.")
            
        url = "https://www.fast2sms.com/dev/bulkV2"
        numbers = ",".join([num.strip() for num in payload.phone_numbers if num.strip()])
        if not numbers:
             raise HTTPException(status_code=400, detail="No valid phone numbers provided.")
             
        sms_text = f"Landslide Alert ({report.get('severity')}): {report.get('incident_type')} at Lat: {report.get('lat')}, Lon: {report.get('lon')}. Ref: {report.get('reference_id')}"
        if payload.message.strip():
             sms_text = payload.message.strip()

        querystring = {
            "authorization": FAST2SMS_API_KEY,
            "message": sms_text[:160], # fast2sms has character limits on some routes
            "language": "english",
            "route": "q",
            "numbers": numbers
        }
        
        headers = {'cache-control': "no-cache"}
        
        try:
            response = requests.request("GET", url, headers=headers, params=querystring, timeout=10)
            res_data = response.json()
            if not res_data.get("return"):
                raise HTTPException(status_code=502, detail=f"SMS API Error: {res_data.get('message')}")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to send SMS: {str(exc)}")
            
        report["sms_sent_at_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        save_reports(reports)
        write_audit({"at_utc": report["sms_sent_at_utc"], "action": "sms_sent", "reference_id": report["reference_id"], "numbers": numbers})
        
        return {"status": "sent", "message": "SMS dispatched successfully."}


@app.get("/emergency-contacts")
def emergency_contacts(state: str = ""):
    """Officially sourced state-level emergency operation contacts only."""
    state_contacts = {
        "Assam": [{"name": "Assam State Emergency Operation Centre", "number": "1070", "type": "Disaster-control room", "verified_source": "https://onlineasdma.assam.gov.in/emergency.html", "scope": "State"}],
        "Meghalaya": [{"name": "Meghalaya State Emergency Operation Centre", "number": "1070", "type": "Disaster-control room", "verified_source": "https://msdma.gov.in/contact-us.html", "scope": "State"}],
        "Manipur": [{"name": "Manipur State Emergency Operation Centre", "number": "1070", "type": "Disaster-control room", "verified_source": "https://msdma.mn.gov.in/contact_us", "scope": "State"}, {"name": "Manipur SEOC control room", "number": "03852443441", "type": "Disaster-control room", "verified_source": "https://msdma.mn.gov.in/contact_us", "scope": "State"}],
        "Nagaland": [{"name": "Nagaland State Emergency Operation Centre", "number": "03702291122", "type": "Disaster-control room", "verified_source": "https://nsdma.nagaland.gov.in/index.php/contact-us", "scope": "State"}],
        "Arunachal Pradesh": [{"name": "Arunachal Pradesh State Emergency Operation Centre", "number": "1070", "type": "Disaster-control room", "verified_source": "https://sdma-arunachal.in/", "scope": "State"}],
        "Mizoram": [{"name": "Mizoram State Emergency Operation Centre", "number": "1070", "type": "Disaster-control room", "verified_source": "https://dipr.mizoram.gov.in/post/dmr-issues-precautionary-public-notice-for-the-forecasted-heavy-rainfall-in-mizoram", "scope": "State"}, {"name": "Mizoram SEOC control room", "number": "03892342520", "type": "Disaster-control room", "verified_source": "https://dipr.mizoram.gov.in/post/dmr-issues-precautionary-public-notice-for-the-forecasted-heavy-rainfall-in-mizoram", "scope": "State"}],
        "Tripura": [{"name": "Tripura State Emergency Operation Centre", "number": "03812416045", "type": "State Emergency Operation Centre", "verified_source": "https://dit.tripura.gov.in/sites/default/files/2024-09/IP_PHONE_DIR_13-09-2024.pdf", "scope": "State"}],
        "Sikkim": [{"name": "Sikkim State Emergency Operation Centre", "number": "1070", "type": "Disaster-control room", "verified_source": "https://ssdma.nic.in/", "scope": "State"}, {"name": "Sikkim SEOC control room", "number": "03592201145", "type": "Disaster-control room", "verified_source": "https://ssdma.nic.in/", "scope": "State"}],
    }
    contacts = [{"name": "India Emergency Response Support System", "number": "112", "type": "Police, fire, medical and disaster emergency", "verified_source": "https://112.gov.in/", "scope": "Pan-India"}]
    contacts.extend(state_contacts.get(state, []))
    return {
        "location_state": state,
        "contacts": contacts,
        "notice": "For an immediate threat to life, call 112. Contacts are state-level official control rooms; district/hospital listings require further official verification.",
        "authority_dispatch_configured": False,
    }
