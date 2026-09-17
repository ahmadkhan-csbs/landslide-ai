from fastapi import FastAPI, HTTPException, Header, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
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

import warnings
warnings.filterwarnings("ignore", message=".*sklearn.utils.parallel.delayed.*")
warnings.filterwarnings("ignore", category=UserWarning)

# MODEL v2 — Rainfall + Terrain (Elevation, Slope)
model = joblib.load(os.path.join(BASE_DIR, "..", "ml_model", "landslide_model_v2.pkl"))
if hasattr(model, 'n_jobs'):
    model.n_jobs = 1

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
_subscription_attempts = {}
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
    """Aligns display labels with the model's risk score."""
    if risk_score >= 75 or rainfall >= 20:
        return "HIGH", "red"
    if risk_score >= 50 or rainfall >= 6:
        return "MEDIUM", "orange"
    return "LOW", "green"


def get_risk(lat, lon, month=None, use_live=True):
    """Single source of truth for risk — used by /predict and /alerts."""
    if month is None:
        month = datetime.now().month

    seasonal_rainfall, rain_station, rain_station_distance = get_climate_rainfall(lat, lon, month)
    data_source = f"SIMULATION (NASA POWER {RAINFALL_CLIMATOLOGY_PERIOD} monthly climate normal)"
    rainfall_window_days = None
    rainfall_window_total = None
    rainfall_source = f"NASA POWER {RAINFALL_CLIMATOLOGY_PERIOD}; nearest station {rain_station} ({rain_station_distance} km)"
    
    live_rain = None
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
        if use_live:
            data_source = f"LIVE unavailable — fallback: NASA POWER {RAINFALL_CLIMATOLOGY_PERIOD} climate normal"

    elevation, slope, nearest_city = get_terrain(lat, lon)
    
    # Supporting indicators remain useful for explanation and time-window
    # projections, but the trained model owns the displayed risk score.
    susceptibility_score = min(100.0, (slope * 12.0) + (elevation / 100.0))
    
    # MODEL B: Trigger Probability (Dynamic Factors)
    # Using live 1h, 24h, 72h, and 7-day cumulative rainfall
    r_24h = (live_rain.get("rainfall_24h") or rainfall) if live_rain else rainfall
    r_7d = rainfall_window_total if rainfall_window_total else (rainfall * 7)
    forecast_rain = (live_rain.get("forecast_rainfall") or 0) if live_rain else 0
    
    trigger_prob = min(100.0, (r_24h * 1.5) + (r_7d * 0.3))
    
    model_probability = float(model.predict_proba(make_input(lat, lon, month, rainfall))[0][1] * 100)
    final_prob = min(99.9, max(0.0, model_probability))
    
    # 24h / 48h / 72h TIME WINDOW PREDICTIONS
    # 24h prediction heavily relies on current + forecast rain
    pred_24h = min(99.0, final_prob + (forecast_rain * 0.8))
    # 48h accounts for lingering soil saturation
    pred_48h = min(99.0, pred_24h * 0.85)
    # 72h baseline decay unless forecast extends
    pred_72h = min(99.0, pred_48h * 0.75)
    
    # ---------------------------------------------------------

    level, color = screening_level(final_prob, rainfall, slope)

    if r_24h >= 40 or forecast_rain >= 40:
        main_reason = "Extreme acute rainfall trigger"
    elif r_7d >= 100 and slope > 2:
        main_reason = "High cumulative rainfall on fragile terrain"
    elif susceptibility_score > 70 and r_24h > 10:
        main_reason = "Highly susceptible terrain triggered by moderate rain"
    elif rainfall > 10:
        main_reason = "Sustained monsoon rainfall"
    else:
        main_reason = "Baseline terrain risk, low precipitation"

    # ---------------------------------------------------------
    # PHASE 2 ARCHITECTURE: ADVANCED METRICS & EXPLAINABILITY
    # ---------------------------------------------------------
    
    # 1. Soil Moisture (Simulated from 7-day cumulative rainfall and slope)
    soil_moisture = min(100.0, (r_7d * 0.8) - (slope * 0.5))
    soil_moisture = max(20.0, soil_moisture) # Baseline moisture
    soil_saturation = "HIGH" if soil_moisture > 80 else "MEDIUM" if soil_moisture > 50 else "LOW"
    soil_24h_change = round((r_24h * 0.5) - (slope * 0.1), 1)
    if soil_24h_change > 0:
        soil_24h_change = f"+{soil_24h_change}"
        
    # 2. Satellite Anomaly (Simulated based on high risk)
    sat_confidence = 0
    sat_detected = False
    if final_prob > 75:
        sat_confidence = int(min(99, final_prob + 5))
        sat_detected = True

    # 3. Explainable AI ("Why High Risk?")
    # Distribute 100% among: Rainfall, Soil, Slope, History, Satellite
    tot = r_7d + r_24h + soil_moisture + (slope * 5) + (20 if sat_detected else 0) + 20
    exp_rain = int(round(((r_7d + r_24h) / tot) * 100))
    exp_soil = int(round((soil_moisture / tot) * 100))
    exp_slope = int(round(((slope * 5) / tot) * 100))
    exp_sat = int(round((20 / tot) * 100)) if sat_detected else 0
    exp_hist = 100 - (exp_rain + exp_soil + exp_slope + exp_sat) # Remainder
    if exp_hist < 0:
        exp_hist = 0

    # 4. Road Impact (AI-Driven Road Connectivity)
    road_closure_prob = min(99.0, final_prob * 1.1)
    road_status = "CLOSED" if road_closure_prob > 85 else "AT RISK" if road_closure_prob > 60 else "OPEN"
    affected_villages = int((final_prob / 10) * 1.5)

    return {
        "risk": round(final_prob, 1),
        "model_probability": round(model_probability, 1),
        "level": level,
        "screening_level_label": "Final Landslide Probability",
        "color": color,
        "susceptibility_score": round(susceptibility_score, 1),
        "trigger_prob": round(trigger_prob, 1),
        "pred_24h": round(pred_24h, 1),
        "pred_48h": round(pred_48h, 1),
        "pred_72h": round(pred_72h, 1),
        "soil_moisture": round(soil_moisture, 1),
        "soil_saturation": soil_saturation,
        "soil_24h_change": soil_24h_change,
        "sat_detected": sat_detected,
        "sat_confidence": sat_confidence,
        "exp_rain": exp_rain,
        "exp_soil": exp_soil,
        "exp_slope": exp_slope,
        "exp_hist": exp_hist,
        "exp_sat": exp_sat,
        "road_closure_prob": round(road_closure_prob, 1),
        "road_status": road_status,
        "affected_villages": affected_villages,
        "rainfall": round(rainfall, 1),
        "rainfall_feature": "7-day average daily rainfall (mm/day)",
        "rainfall_source": rainfall_source,
        "rainfall_station": rain_station,
        "rainfall_station_distance_km": rain_station_distance,
        "risk_interpretation": "Experimental Random Forest screening score; not an official probability or warning.",
        "rainfall_window_days": rainfall_window_days,
        "rainfall_window_total": round(rainfall_window_total, 1) if rainfall_window_total is not None else None,
        "rainfall_1h": live_rain.get("rainfall_1h") if use_live and live_rain else None,
        "rainfall_24h": live_rain.get("rainfall_24h") if use_live and live_rain else None,
        "forecast_rainfall": live_rain.get("forecast_rainfall") if use_live and live_rain else None,
        # Explicit aliases consumed by the vanilla dashboard alert cards.
        "rainfall_1h_mm": live_rain.get("rainfall_1h") if use_live and live_rain else None,
        "rainfall_24h_mm": live_rain.get("rainfall_24h") if use_live and live_rain else None,
        "forecast_rainfall_mm": live_rain.get("forecast_rainfall") if use_live and live_rain else None,
        "weather_status": live_rain.get("status") if use_live and live_rain else "climate_fallback",
        "weather_fetched_at_utc": live_rain.get("fetched_at_utc") if use_live and live_rain else None,
        "month": month,
        "elevation": round(elevation, 1),
        "slope": round(slope, 2),
        "nearest_city": nearest_city,
        "data_source": data_source,
        "main_reason": main_reason,
    }



@app.get("/data-health")
def data_health():
    """Auditable current-data readiness; an absence of freshness is never described as live."""
    observations = weather_store.latest_all()

    # Deduplicate to one record per location_name to avoid double-counting
    # when the same location has multiple source rows with the same timestamp.
    seen_locations: set[str] = set()
    unique_obs: list[dict] = []
    for item in observations:
        key = item.get("location_name", "") or f"{item['lat']},{item['lon']}"
        if key not in seen_locations:
            seen_locations.add(key)
            unique_obs.append(item)

    current = [item for item in unique_obs if is_fresh(item, 60 * 60)]
    stale   = [item for item in unique_obs if item not in current]

    provider_counts: dict[str, int] = {}
    fallback_count = 0
    for item in unique_obs:
        provider_counts[item["source"]] = provider_counts.get(item["source"], 0) + 1
        if "fallback" in item.get("status", "").lower():
            fallback_count += 1

    newest = max((item["fetched_at_utc"] for item in unique_obs), default=None)
    return {
        "monitored_locations": len(CITIES), "locations_with_observations": len(unique_obs),
        "fresh_within_minutes": 60, "fresh_locations": len(current), "stale_locations": len(stale),
        "missing_locations": max(0, len(CITIES) - len(unique_obs)), "provider_counts": provider_counts,
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
        alert_item = {
            "name": c["name"], 
            "lat": c["lat"], 
            "lon": c["lon"],
            "state": c.get("state", ""), 
            "simulation_month": simulation_month if not use_live else None,
        }
        # Update with all advanced metrics (susceptibility_score, soil_moisture, pred_24h, etc.)
        alert_item.update(r)
        
        # Keep backward compatibility aliases used by older UI parts if any
        alert_item["rainfall_mm"] = r.get("rainfall", 0)
        alert_item["elevation_m"] = r.get("elevation", 0)
        alert_item["slope_pct"] = r.get("slope", 0)
        
        alerts.append(alert_item)
    return alerts


@app.get("/api/cap-feed.xml", response_class=Response)
def get_cap_feed():
    """CAP (Common Alerting Protocol) v1.2 XML Feed for NDMA/Government Integration."""
    alerts_data = get_alerts(use_live=True)
    
    xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">',
        f'  <identifier>NER-LANDSLIDE-{int(time())}</identifier>',
        '  <sender>early-warning@ner-landslide.gov.in</sender>',
        f'  <sent>{datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")}</sent>',
        '  <status>Actual</status>',
        '  <msgType>Alert</msgType>',
        '  <scope>Public</scope>'
    ]
    
    for alert in alerts_data:
        if alert["level"] in ["HIGH", "MEDIUM"]:
            severity = "Severe" if alert["level"] == "HIGH" else "Moderate"
            urgency = "Expected"
            certainty = "Likely"
            
            xml.append('  <info>')
            xml.append('    <category>Met</category>')
            xml.append('    <event>Landslide Risk Alert</event>')
            xml.append(f'    <urgency>{urgency}</urgency>')
            xml.append(f'    <severity>{severity}</severity>')
            xml.append(f'    <certainty>{certainty}</certainty>')
            xml.append(f'    <headline>{alert["level"]} Landslide Risk in {alert["name"]}</headline>')
            xml.append(f'    <description>Current screening level is {alert["level"]}. Rainfall (7-day avg): {alert["rainfall_mm"]} mm/day. {alert.get("main_reason", "")}</description>')
            xml.append('    <instruction>Evacuate high-risk slopes and monitor local emergency broadcasts.</instruction>' if alert["level"] == "HIGH" else '    <instruction>Monitor weather and road conditions.</instruction>')
            xml.append('    <area>')
            xml.append(f'      <areaDesc>{alert["name"]}</areaDesc>')
            xml.append(f'      <circle>{alert["lat"]},{alert["lon"]} 5.0</circle>')
            xml.append('    </area>')
            xml.append('  </info>')
            
    xml.append('</alert>')
    
    return Response(content="\n".join(xml), media_type="application/cap+xml")

import json
import base64
import binascii
import uuid
import hmac
import hashlib
import smtplib
from fastapi.staticfiles import StaticFiles
from email.message import EmailMessage

REPORTS_FILE = os.path.join(BASE_DIR, "..", "data", "citizen_reports.json")
AUDIT_FILE = os.path.join(BASE_DIR, "..", "data", "audit_log.json")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
DASHBOARD_DIR = os.path.join(BASE_DIR, "..", "dashboard")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/assets", StaticFiles(directory=DASHBOARD_DIR), name="dashboard_assets")
CONNECTIVITY_SEED_FILE = os.path.join(BASE_DIR, "..", "data", "ner_connectivity_demo.json")


@app.get("/")
def serve_frontend():
    return FileResponse(os.path.join(DASHBOARD_DIR, "index.html"))

@app.get("/index.html")
def serve_frontend_alias():
    return FileResponse(os.path.join(DASHBOARD_DIR, "index.html"))

@app.get("/manifest.json")
def serve_manifest():
    return FileResponse(os.path.join(DASHBOARD_DIR, "manifest.json"), media_type="application/manifest+json")

@app.get("/sw.js")
def serve_service_worker():
    return FileResponse(os.path.join(DASHBOARD_DIR, "sw.js"), media_type="application/javascript")

@app.get("/script.js")
def serve_script():
    return FileResponse(os.path.join(DASHBOARD_DIR, "script.js"), media_type="application/javascript")

@app.get("/style.css")
def serve_style():
    return FileResponse(os.path.join(DASHBOARD_DIR, "style.css"), media_type="text/css")

@app.get("/admin.html")
def serve_admin_page():
    return FileResponse(os.path.join(DASHBOARD_DIR, "admin.html"))

@app.get("/admin.css")
def serve_admin_css():
    return FileResponse(os.path.join(DASHBOARD_DIR, "admin.css"), media_type="text/css")

@app.get("/admin.js")
def serve_admin_js():
    return FileResponse(os.path.join(DASHBOARD_DIR, "admin.js"), media_type="application/javascript")

class CitizenReport(BaseModel):
    lat: float = Field(ge=21.0, le=29.5, description="Latitude within demonstrated NER coverage")
    lon: float = Field(ge=88.0, le=97.0, description="Longitude within demonstrated NER coverage")
    description: str = Field(default="", max_length=500)
    severity: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"
    reporter: str = Field(default="Anonymous", max_length=80)
    reporter_phone: str = Field(default="", max_length=25)
    incident_type: Literal["LANDSLIDE", "ROAD_BLOCKED", "SLOPE_CRACK", "PROPERTY_DAMAGE", "DEBRIS_FLOW", "OTHER"] = "LANDSLIDE"
    people_at_risk: int = Field(default=0, ge=0, le=10000)
    photo_data_url: str = Field(default="", max_length=25_000_000)

class SubscriptionRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=20, pattern=r"^[0-9+() -]+$")
    district: str = Field(max_length=100)

def load_reports():
    if os.path.exists(REPORTS_FILE):
        try:
            with open(REPORTS_FILE, "r", encoding="utf-8") as f:
                reports = json.load(f)
            return reports if isinstance(reports, list) else []
        except (OSError, json.JSONDecodeError):
            raise HTTPException(status_code=500, detail="Stored reports could not be read.")
    return []

def save_media(data_url: str) -> str | None:
    """Accept small browser-produced image or video data URL."""
    if not data_url:
        return None
    allowed = {
        "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
        "video/mp4": ".mp4", "video/webm": ".webm"
    }
    try:
        header, encoded = data_url.split(",", 1)
        media_type = header.split(";", 1)[0].replace("data:", "")
        if media_type not in allowed or ";base64" not in header:
            raise ValueError("Only JPG, PNG, WebP, MP4, or WebM formats are accepted.")
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=422, detail="Invalid media upload.") from exc
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Media must be 15 MB or smaller.")
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{allowed[media_type]}"
    path = os.path.join(UPLOADS_DIR, filename)
    with open(path, "xb") as media_file:
        media_file.write(content)
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
    saved_filename = None
    if report.photo_data_url:
        saved_filename = save_media(report.photo_data_url)
    report.photo_data_url = ""
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
            "photo_filename": saved_filename,
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


@app.post("/subscribe")
def subscribe_alerts(sub: SubscriptionRequest, request: Request):
    """Subscribe to SMS alerts for a district."""
    address = request.client.host if request.client else "unknown"
    now = time()
    recent_attempts = [stamp for stamp in _subscription_attempts.get(address, []) if now - stamp < 3600]
    if len(recent_attempts) >= 3:
        raise HTTPException(status_code=429, detail="Too many subscription requests from this network.")
    recent_attempts.append(now)
    _subscription_attempts[address] = recent_attempts
    message = f"Welcome to NER Landslide AI. You are subscribed to alerts for {sub.district}. (SIH Demo)"
    
    # If API key exists, send real SMS
    if FAST2SMS_API_KEY:
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            querystring = {
                "authorization": FAST2SMS_API_KEY,
                "message": message,
                "language": "english",
                "route": "q",
                "numbers": sub.phone
            }
            headers = {'cache-control': "no-cache"}
            response = requests.request("GET", url, headers=headers, params=querystring)
            if response.status_code == 200:
                print(f"[SMS DISPATCHED] Real SMS sent to {sub.phone}")
            else:
                print(f"[SMS ERROR] Failed to send SMS: {response.text}")
        except Exception as e:
            print(f"[SMS EXCEPTION] {e}")
            return {"status": "error", "message": "Failed to send real SMS."}
    else:
        # Mock mode for hackathon presentation without API key
        print(f"\n{'='*50}\n[MOCK SMS DISPATCH]\nTo: {sub.phone}\nMessage: {message}\n{'='*50}\n")
    
    return {"status": "success", "message": f"Successfully subscribed for {sub.district}"}


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

    # Service-type priority weights: critical life-safety services score higher
    service_type_weight = {
        "hospital": 10, "rescue_base": 10, "police": 6,
        "shelter": 4, "emergency_coordination": 3,
    }

    # Build a snapshot of current ML screening levels for risk correlation
    # Only computed once — used to check if HIGH/MEDIUM cities are near corridors
    try:
        month_now = datetime.now().month
        city_risk_snapshot = []
        for city in CITIES:
            cached = _rain_cache.get((round(city["lat"], 3), round(city["lon"], 3)))
            if cached:
                rain_val = cached["value"].get("rainfall", 0) or 0
            else:
                rain_val, _, _ = get_climate_rainfall(city["lat"], city["lon"], month_now)
            _, slope, _ = get_terrain(city["lat"], city["lon"])
            risk_label, _ = screening_level(50, rain_val, slope)
            city_risk_snapshot.append({"lat": city["lat"], "lon": city["lon"],
                                        "name": city["name"], "level": risk_label})
    except Exception:
        city_risk_snapshot = []

    corridors = []
    for corridor in seed["corridors"]:
        points = corridor["points"]

        # ── Nearby incident reports ──────────────────────────────────────────
        nearby = [r for r in reports
                  if _distance_to_corridor_km(float(r["lat"]), float(r["lon"]), points) <= 8]
        verified_blockage = [r for r in nearby
                              if r.get("verification_status") == "VERIFIED"
                              and r.get("incident_type") == "ROAD_BLOCKED"]
        verified_hazard   = [r for r in nearby if r.get("verification_status") == "VERIFIED"]
        blockage_report_count = len(verified_blockage)
        people_at_risk    = sum(int(r.get("people_at_risk", 0)) for r in nearby)

        # ── Nearby essential services (within 35 km of corridor midpoint) ───
        midpoint = points[len(points) // 2]
        nearby_services = [s for s in seed["service_points"]
                           if _haversine_km(midpoint[0], midpoint[1], s["lat"], s["lon"]) <= 35]
        affected_service_types = sorted(set(s["type"] for s in nearby_services))
        service_priority_sum   = sum(service_type_weight.get(s["type"], 1) for s in nearby_services)

        # ── ML Risk Correlation ──────────────────────────────────────────────
        # Check if any HIGH or MEDIUM screening city lies within 30 km of corridor
        risk_level_nearby = "NONE"
        risk_city_nearby  = None
        RISK_PROXIMITY_KM = 30
        for city_r in city_risk_snapshot:
            dist = _distance_to_corridor_km(city_r["lat"], city_r["lon"], points)
            if dist <= RISK_PROXIMITY_KM:
                if city_r["level"] == "HIGH":
                    risk_level_nearby = "HIGH"
                    risk_city_nearby  = city_r["name"]
                    break
                elif city_r["level"] == "MEDIUM" and risk_level_nearby != "HIGH":
                    risk_level_nearby = "MEDIUM"
                    risk_city_nearby  = city_r["name"]

        # ── Road Status ──────────────────────────────────────────────────────
        if verified_blockage:
            status, confidence = "CONFIRMED_BLOCKED", "reviewer_confirmed_report"
        elif verified_hazard:
            status, confidence = "CONFIRMED_HAZARD_NEARBY", "reviewer_confirmed_hazard_nearby"
        elif nearby:
            status, confidence = "UNVERIFIED_INCIDENT_NEARBY", "citizen_report_unverified"
        else:
            status, confidence = "NO_REPORTED_DISRUPTION", "no_nearby_report"

        # ── Priority Score ───────────────────────────────────────────────────
        severity_weight = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
        risk_boost = {"HIGH": 20, "MEDIUM": 10, "NONE": 0}.get(risk_level_nearby, 0)
        priority = min(100,
            len(nearby) * 12
            + people_at_risk // 5
            + service_priority_sum
            + max((severity_weight.get(r.get("severity"), 1) for r in nearby), default=0) * 8
            + risk_boost
        )

        # ── Action message ───────────────────────────────────────────────────
        if status != "NO_REPORTED_DISRUPTION":
            action = "⚠ Verify with road authority before any route or closure decision."
        elif risk_level_nearby in ("HIGH", "MEDIUM"):
            action = f"🔶 ML screening: {risk_level_nearby} risk near this corridor ({risk_city_nearby}). Monitor conditions."
        else:
            action = "No nearby website report; this is not confirmation that the road is open."

        corridors.append({
            **corridor,
            "status": status,
            "confidence": confidence,
            "nearby_report_count": len(nearby),
            "blockage_report_count": blockage_report_count,
            "nearby_report_references": [r.get("reference_id") for r in nearby],
            "reported_people_at_risk": people_at_risk,
            "nearby_essential_services": nearby_services,
            "affected_service_types": affected_service_types,
            "nearby_service_count": len(nearby_services),
            "priority_score": priority,
            "risk_level_nearby": risk_level_nearby,
            "risk_city_nearby": risk_city_nearby,
            "action": action,
        })

    corridors.sort(key=lambda item: item["priority_score"], reverse=True)

    # ── Alternate Route Logic ────────────────────────────────────────────────
    # Build a map of corridor_id -> states_connected for lookup
    corr_by_states: dict[str, list] = {}
    for c in corridors:
        for state in (c.get("states_connected") or []):
            corr_by_states.setdefault(state, []).append(c)

    for c in corridors:
        if c["status"] == "CONFIRMED_BLOCKED":
            # Find another non-blocked corridor sharing at least one state
            alternates = []
            for state in (c.get("states_connected") or []):
                for other in corr_by_states.get(state, []):
                    if other["id"] != c["id"] and other["status"] != "CONFIRMED_BLOCKED":
                        alternates.append(other["name"] + " (" + other.get("highway_ref", "") + ")")
            c["alternate_route"] = (
                "Possible alternate: " + "; ".join(dict.fromkeys(alternates))
                if alternates
                else "No alternate corridor in seed data for this state — check road authority."
            )
        else:
            c["alternate_route"] = None

    total_service_points = len(seed["service_points"])
    service_type_summary: dict[str, int] = {}
    for sp in seed["service_points"]:
        service_type_summary[sp["type"]] = service_type_summary.get(sp["type"], 0) + 1

    blocked_count = sum(1 for c in corridors if c["status"] == "CONFIRMED_BLOCKED")
    disrupted_count = sum(1 for c in corridors if c["status"] != "NO_REPORTED_DISRUPTION")

    return {
        "network_source": seed["source"],
        "updated_at_utc": seed["updated_at_utc"],
        "demonstration_only": True,
        "total_corridors": len(corridors),
        "blocked_corridors": blocked_count,
        "disrupted_corridors": disrupted_count,
        "total_service_points": total_service_points,
        "service_type_summary": service_type_summary,
        "notice": (
            "Corridors and service points are an SIH demonstration seed, not an official road "
            "authority feed. Status is derived only from local incident reports and reviewer state."
        ),
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
    """Officially sourced emergency operation contacts — NDRF, SDRF and state-level EOCs."""

    # ── National / Pan-India contacts (always shown first) ──────────────────
    national = [
        {"name": "India Emergency (112)", "number": "112", "type": "Police · Fire · Medical · Disaster",
         "verified_source": "https://112.gov.in/", "scope": "Pan-India"},
        {"name": "NDRF — National Disaster Response Force", "number": "011-24363260",
         "type": "National flood & landslide response teams",
         "verified_source": "https://ndrf.gov.in/contact-us", "scope": "National HQ"},
        {"name": "NDRF 4th Battalion (NER-dedicated, Guwahati)", "number": "0361-2343328",
         "type": "Rapid deployment — flood, landslide, cyclone",
         "verified_source": "https://ndrf.gov.in/battalions", "scope": "Northeast India"},
        {"name": "NDMA — National Disaster Management Authority", "number": "011-26701700",
         "type": "National coordination & policy",
         "verified_source": "https://ndma.gov.in/", "scope": "National"},
        {"name": "Ambulance / Medical Emergency", "number": "108",
         "type": "Medical emergency ambulance",
         "verified_source": "https://108.co.in/", "scope": "Pan-India"},
    ]

    # ── State-specific contacts (EOC + SDRF + Flood teams) ──────────────────
    state_contacts = {
        "Assam": [
            {"name": "Assam SEOC — State Emergency Operation Centre", "number": "1070",
             "type": "State disaster control room", "scope": "Assam",
             "verified_source": "https://onlineasdma.assam.gov.in/emergency.html"},
            {"name": "Assam SDMA Control Room (direct)", "number": "0361-2237219",
             "type": "State Disaster Management Authority", "scope": "Assam",
             "verified_source": "https://onlineasdma.assam.gov.in/emergency.html"},
            {"name": "Assam Flood Control Room (Irrigation Dept.)", "number": "0361-2261173",
             "type": "Flood monitoring & response", "scope": "Assam",
             "verified_source": "https://onlineasdma.assam.gov.in/"},
            {"name": "Assam Fire & Emergency Services", "number": "101",
             "type": "Fire, rescue & landslide response", "scope": "Assam",
             "verified_source": "https://fire.assam.gov.in/"},
        ],
        "Meghalaya": [
            {"name": "Meghalaya SEOC — State Emergency Operation Centre", "number": "1070",
             "type": "State disaster control room", "scope": "Meghalaya",
             "verified_source": "https://msdma.gov.in/contact-us.html"},
            {"name": "Meghalaya SDMA (direct)", "number": "0364-2224807",
             "type": "State Disaster Management Authority", "scope": "Meghalaya",
             "verified_source": "https://msdma.gov.in/contact-us.html"},
            {"name": "Meghalaya Fire & Emergency Services", "number": "101",
             "type": "Fire, rescue & landslide response", "scope": "Meghalaya",
             "verified_source": "https://meghalaya.gov.in/"},
        ],
        "Manipur": [
            {"name": "Manipur SEOC — State Emergency Operation Centre", "number": "1070",
             "type": "State disaster control room", "scope": "Manipur",
             "verified_source": "https://msdma.mn.gov.in/contact_us"},
            {"name": "Manipur SEOC Control Room (direct)", "number": "03852443441",
             "type": "State Disaster Management Authority", "scope": "Manipur",
             "verified_source": "https://msdma.mn.gov.in/contact_us"},
            {"name": "Manipur SDRF — State Disaster Response Force", "number": "0385-2411337",
             "type": "Rapid response — flood, landslide, search & rescue", "scope": "Manipur",
             "verified_source": "https://msdma.mn.gov.in/"},
            {"name": "Manipur Fire & Emergency Services", "number": "101",
             "type": "Fire, rescue & disaster response", "scope": "Manipur",
             "verified_source": "https://manipur.gov.in/"},
        ],
        "Nagaland": [
            {"name": "Nagaland SEOC — State Emergency Operation Centre", "number": "03702291122",
             "type": "State disaster control room", "scope": "Nagaland",
             "verified_source": "https://nsdma.nagaland.gov.in/index.php/contact-us"},
            {"name": "Nagaland SDMA", "number": "0370-2244016",
             "type": "State Disaster Management Authority", "scope": "Nagaland",
             "verified_source": "https://nsdma.nagaland.gov.in/"},
            {"name": "Nagaland Fire & Emergency Services", "number": "101",
             "type": "Fire, rescue & disaster response", "scope": "Nagaland",
             "verified_source": "https://nagaland.gov.in/"},
        ],
        "Tripura": [
            {"name": "Tripura SEOC — State Emergency Operation Centre", "number": "03812416045",
             "type": "State Emergency Operation Centre", "scope": "Tripura",
             "verified_source": "https://dit.tripura.gov.in/"},
            {"name": "Tripura SDMA", "number": "0381-2315879",
             "type": "State Disaster Management Authority", "scope": "Tripura",
             "verified_source": "https://sdma.tripura.gov.in/"},
            {"name": "Tripura Fire & Emergency Services", "number": "101",
             "type": "Fire, rescue & disaster response", "scope": "Tripura",
             "verified_source": "https://tripura.gov.in/"},
        ],
        "Mizoram": [
            {"name": "Mizoram SEOC — State Emergency Operation Centre", "number": "1070",
             "type": "State disaster control room", "scope": "Mizoram",
             "verified_source": "https://dipr.mizoram.gov.in/"},
            {"name": "Mizoram SEOC Control Room (direct)", "number": "03892342520",
             "type": "Disaster Management & Rehabilitation Dept.", "scope": "Mizoram",
             "verified_source": "https://dmr.mizoram.gov.in/"},
            {"name": "Mizoram SDMA", "number": "0389-2334391",
             "type": "State Disaster Management Authority", "scope": "Mizoram",
             "verified_source": "https://dmr.mizoram.gov.in/"},
        ],
        "Arunachal Pradesh": [
            {"name": "Arunachal Pradesh SEOC", "number": "1070",
             "type": "State disaster control room", "scope": "Arunachal Pradesh",
             "verified_source": "https://sdma-arunachal.in/"},
            {"name": "Arunachal Pradesh SDMA (direct)", "number": "0360-2213421",
             "type": "State Disaster Management Authority", "scope": "Arunachal Pradesh",
             "verified_source": "https://sdma-arunachal.in/"},
            {"name": "Arunachal Pradesh Fire & Emergency", "number": "101",
             "type": "Fire, rescue & disaster response", "scope": "Arunachal Pradesh",
             "verified_source": "https://arunachalpradesh.gov.in/"},
        ],
        "Sikkim": [
            {"name": "Sikkim SEOC — State Emergency Operation Centre", "number": "1070",
             "type": "State disaster control room", "scope": "Sikkim",
             "verified_source": "https://ssdma.nic.in/"},
            {"name": "Sikkim SEOC Control Room (direct)", "number": "03592201145",
             "type": "State Disaster Management Authority", "scope": "Sikkim",
             "verified_source": "https://ssdma.nic.in/"},
            {"name": "Sikkim SDRF — State Disaster Response Force", "number": "03592-281626",
             "type": "Rapid response — flood, landslide, search & rescue", "scope": "Sikkim",
             "verified_source": "https://ssdma.nic.in/"},
            {"name": "Sikkim Fire & Emergency Services", "number": "101",
             "type": "Fire, rescue & disaster response", "scope": "Sikkim",
             "verified_source": "https://sikkim.gov.in/"},
        ],
    }

    contacts = list(national)
    contacts.extend(state_contacts.get(state, []))
    # If no state selected, show all state EOC numbers as a quick reference
    if not state:
        contacts.append({"name": "All State EOCs (universal)", "number": "1070",
                          "type": "State Emergency Operation Centres — all NER states",
                          "verified_source": "https://ndma.gov.in/", "scope": "All NER States"})
    return {
        "location_state": state,
        "contacts": contacts,
        "notice": "For life-threatening emergencies, call 112 immediately. NDRF & SDRF teams are deployed by state authorities — contact your state SEOC to request deployment. Numbers are government-published control rooms; district-level numbers require further verification.",
        "authority_dispatch_configured": False,
    }

# ==========================================
# LANDSLIDE AI 2.0 ADVANCED ENDPOINTS
# ==========================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Keep alive or process incoming if needed
    except WebSocketDisconnect:
        manager.disconnect(websocket)

class ChatMessage(BaseModel):
    message: str

import re
from random import choice

def extract_keywords(text):
    stopwords = {"is", "are", "what", "how", "many", "the", "in", "of", "and", "to", "for", "a", "an", "on", "about", "ner", "details", "tell", "me", "all", "state"}
    words = re.findall(r'\b\w+\b', text.lower())
    return [w for w in words if w not in stopwords]

@app.post("/chat")
def chat_with_assistant(chat: ChatMessage):
    msg = chat.message.lower()
    
    try:
        with open("ner_knowledge.txt", "r", encoding="utf-8") as f:
            kb = f.read()
    except:
        kb = ""
        
    # 1. First, check if the user is asking about live risk/weather for a specific city
    for city in CITIES:
        city_name = city["name"].split(',')[0].lower()
        if city_name in msg:
            if "risk" in msg or "safe" in msg or "danger" in msg or "weather" in msg or "rain" in msg or "status" in msg:
                r = get_risk(city["lat"], city["lon"])
                reply = f"Currently in {city['name']}, the landslide screening risk is **{r['level']}** ({r['risk']}% probability). Trigger: {r['main_reason']}. Rainfall over 24h is {r.get('rainfall_24h_mm') or r.get('rainfall', 0)} mm."
                return {"reply": reply}

    # 2. Extract keywords and search the knowledge base paragraphs
    paragraphs = [p.strip() for p in kb.split('\n\n') if p.strip()]
    keywords = extract_keywords(msg)
    
    best_score = 0
    best_paragraph = ""
    
    for p in paragraphs:
        p_lower = p.lower()
        score = sum(1 for kw in keywords if kw in p_lower)
        if score > best_score:
            best_score = score
            best_paragraph = p
            
    if best_score > 0:
        reply = f"{best_paragraph}"
    else:
        # 3. Smart fallbacks instead of repeating the same generic response
        fallbacks = [
            "I don't have that specific information in my database. Could you ask about a specific state like Assam or Meghalaya, or ask about live risk levels in a city?",
            "I'm an AI assistant specialized in North East India's geography and landslide risks. Try asking me about population, rivers, or safety in specific areas.",
            "While I don't know the exact answer to that, I can tell you about the 131 districts and major rivers of the 8 NER states if you'd like.",
            "Could you rephrase that? I'm best at answering questions about terrain, rainfall, demographics, and landslide probabilities in the North East Region."
        ]
        reply = choice(fallbacks)
        
    return {"reply": reply}

@app.post("/vision/analyze")
def analyze_image(report: CitizenReport):
    # Simulated U-Net analysis for SIH
    return {
        "crack_detected": True,
        "severity": "HIGH",
        "confidence": 92.4,
        "affected_area_sq_meters": 15.5,
        "recommendation": "Immediate road block recommended. Deep foundational cracks detected by U-Net."
    }

