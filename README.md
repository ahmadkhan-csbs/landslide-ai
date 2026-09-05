# 🏔️ NER Landslide Experimental Screening Dashboard

> Experimental rainfall-and-terrain screening prototype for the **North East Region (NER) of India**. It is not an official early-warning system and must not be used for life-safety decisions.

![Python](https://img.shields.io/badge/Python-3.12-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-Latest-green) ![ML](https://img.shields.io/badge/Model-Random%20Forest-orange) ![Live Data](https://img.shields.io/badge/Rainfall-Live%20API-00b4d6)

---

## 🚨 The Problem

North East India is one of the **most landslide-prone regions in the world**. The Himalayan/Hill terrain combined with extreme monsoon rainfall causes hundreds of landslides every year — damaging roads, cutting off villages, and claiming lives.

This project does not replace official warning systems or local emergency instructions.

## What this prototype does

A complete end-to-end system:
- 🤖 **ML model** that produces an experimental screening score by location and month
- ⚡ **FastAPI Backend** serving real-time predictions
- 🗺️ **Interactive Map Dashboard** with live color-coded risk alerts
- 📡 **Live rainfall** — IMD when a subscribed endpoint is configured; Open-Meteo is a visibly labelled fallback
- 🔵 **Dual Mode** — LIVE mode (real weather) + Monsoon Simulation mode (emergency planning)
- 📍 **Citizen Reports** — anyone can report a landslide on the map & get instant ML risk for that exact location
- 🔍 **Explainable AI** — every prediction shows *why* (main factor: monsoon rainfall)

## 📊 Model Evaluation

The dashboard currently runs the terrain-aware v2 Random Forest model. Earlier
headline metrics in this project should not be presented as real-world field
accuracy: the training pipeline includes synthetic/background non-event
samples. The v3 artifacts are deliberately marked `candidate_not_deployed`
until coverage, calibration, and alert policy are reviewed.

### Sanity Checks ✅
| Test | Result |
|------|--------|
| Guwahati, July (peak monsoon) | 🔴 **100% HIGH risk** |
| Guwahati, December (dry season) | 🟢 **16.5% LOW risk** |
| Live mode (real weather) | 🟠 **Mixed risks per city — real data, real colors** |

## 🧠 Tech Stack

| Layer | |
|-------|-----------|
| Machine Learning | Random Forest (scikit-learn) |
| Dataset | NASA Global Landslide Catalog — 1,265 India events |
| Live Data | Open-Meteo Weather API (real-time rainfall) |
| Backend | FastAPI + Uvicorn |
| Frontend | HTML + Leaflet.js interactive map |
| Explainability | Feature importance analysis |

### Top Risk Factors (Feature Importance)
1. 🌧️ **Rainfall — 57.8%** (monsoon is the #1 trigger)
2. 🏔️ Terrain fragility — 22.4%
3. 📍 Location — 19.8%

## Run the dashboard

```bash
# Clone the repo
git clone https://github.com/ahmadkhan-csbs/landslide-ai.git
cd landslide-ai

# Install dependencies
pip install -r requirements.txt

# 1. Start the API server
cd backend
python -m uvicorn app:app --reload

# 2. Start the dashboard (new terminal)
cd dashboard
npm install
npm run dev

# 3. Open in browser
# Static dashboard: http://127.0.0.1:5501/index.html
```

## Auditable 2026 data pipeline

The pipeline never overwrites `data/ner_rainfall_2015_2024.csv`. It records live observations in `data/weather_observations.sqlite3` (ignored by Git) with source, fetch time, observed 1 h/24 h/7 d rain, forecast, provider payload, and status. API payloads and provenance are retained in dated `data/raw/` snapshots; raw and credentials are ignored by Git.

1. Copy `.env.example` to `.env`. Add `IMD_API_KEY` and the exact subscribed `IMD_WEATHER_URL` from the [IMD API portal](https://api.imd.gov.in/public/index.php). Do not commit `.env`. IMD is used only when both values are present; a failed IMD request falls back to Open-Meteo and is marked as such.
2. Refresh 53 location observations (safe to schedule): `python pipeline.py weather`
3. Backfill NASA POWER data (requires internet, rate-limited): `python pipeline.py nasa-power --start 20250101 --end 20260905`. It writes `data/raw/nasa_power/ner_rainfall_2025_2026.csv`, a dated raw snapshot plus provenance JSON, and `data/processed/ner_rainfall_2015_2026.csv`.
4. Refresh candidate COOLR events monthly: `python pipeline.py coolr`. This writes a dated source response and deduplicates NER India candidates to SQLite using event date plus a coordinate cell. Candidates without a parseable event date are rejected; every accepted event remains `unverified`. No refresh command retrains the model or writes `data/verified_events/`. If the upstream FeatureServer is unavailable, a dated failure-audit JSON is saved and no candidates are added.

NASA POWER backfill is all-or-nothing: if any of the source stations fails or returns no valid daily rainfall, a dated failure audit is saved and the merged processed dataset is left unchanged. Successful snapshots include a SHA-256 checksum and per-station record counts.

For Windows Task Scheduler, use the project directory as **Start in** and commands such as `python pipeline.py weather`. Run the NASA POWER and COOLR commands separately on their own schedule to make failures and provenance easy to audit.

For an hourly weather refresh task on Windows, run `powershell -ExecutionPolicy Bypass -File scripts\install_weather_refresh_task.ps1` once. It runs `scripts\refresh_weather.ps1`, keeps timestamped outcomes in `data\refresh_logs\weather_refresh.log`, and does not overwrite historical datasets.

Run checks before deploying a change:

```bash
python -m compileall backend pipeline.py
python -m unittest discover -s tests -v
cd dashboard && npm run lint && npm run build
```

Generate the model go/no-go evidence (this never retrains or promotes a model):

```bash
python model_readiness_audit.py
```

It writes `data/model_readiness_audit.json` and `data/MODEL_READINESS_AUDIT.md`. The current verdict is intentionally **not approved for operational warning** until verified contemporary events and independent expert review exist.

## Verified contemporary-event registry

No external record is automatically treated as verified. Create the empty review template with `python event_registry.py template`, copy it to `data/verified_events/ner_verified_events.csv`, and validate reviewer-entered evidence using `python event_registry.py validate`. The registry requires a NER location, non-future ISO date, coordinate accuracy, traceable source URL/record ID, reviewer identity/timestamp, and an evidence note; it also flags same-day events within one kilometre. Validation only produces an audit report—it never retrains or deploys a model.

Provider references: [IMD API reference](https://api.imd.gov.in/public/api_reference.html), [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), [NASA COOLR public service](https://gis.earthdata.nasa.gov/gis05/rest/services/Landslides/COOLR_Events_Points/MapServer). The pipeline resolves the active point-layer id from the service directory rather than assuming it is always layer 0.

## Authority dispatch safety

An authorised local reviewer can mark reports as verified and queue a report for a selected state in `dashboard/admin.html`. Queueing is local only. The separate **Send queued report** action sends an email only when both SMTP credentials and that state's explicitly approved `AUTHORITY_EMAIL_*` recipient are in `.env`. A successful SMTP hand-off is recorded as sent, not as an authority acknowledgement. Do not configure personal, guessed, or unapproved contacts.

## 🔌 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | API status |
| `GET /predict?lat=26.14&lon=91.73&month=7&use_live=false` | Landslide risk for a NER location; set `use_live=false` for seasonal simulation |
| `GET /alerts` | Live screening for 53 NER locations; Open-Meteo rainfall when available |
| `GET /alerts?use_live=false&month=7` | Historical climate simulation using nearest-station NASA POWER 2015–2024 monthly means |
| `POST /report` | Submit a citizen landslide report (location + description + severity) |
| `GET /reports` | Get all citizen reports with ML risk at each location |
| `GET /docs` | Auto-generated interactive API documentation |

### Sample Response
```json
{
  "location": {"lat": 26.14, "lon": 91.73},
  "risk_probability": 43.5,
  "risk_level": "MEDIUM",
  "data_source": "LIVE (Open-Meteo)",
  "factors": {
    "rainfall_mm": 62.3,
    "main_reason": "Moderate rainfall, monitor conditions"
  }
}
```

## 🗺️ Coverage

Monitoring **53 disaster-prone NER locations** across Assam, Arunachal Pradesh,
Manipur, Meghalaya, Mizoram, Nagaland, Sikkim and Tripura. The dashboard offers
state filters and makes clear whether an alert uses live rainfall or the
seasonal simulation.

## ✅ Recently Completed

- [x] 🤖 Terrain-aware Random Forest model with documented evaluation caveats
- [x] ⚡ FastAPI backend with 6 endpoints
- [x] 🗺️ Interactive live dashboard with color-coded alerts
- [x] 📡 Real-time rainfall integration (Open-Meteo API)
- [x] 🔵 LIVE / Monsoon Simulation toggle
- [x] 📍 Citizen report feature with instant ML risk calculation

## 🎯 Future Scope

- [ ] Real-time rainfall data (IMD/API integration)
- [ ] Photo upload in citizen reports
- [ ] SMS/WhatsApp alerts for villagers
- [ ] Deep learning model with satellite imagery

## Data status and safe use

- **Live rainfall:** Open-Meteo observed daily rainfall for the last seven
  completed days. If unavailable, the API says so and uses a labelled NASA
  POWER climate-normal fallback.
- **Simulation:** not a live forecast. Each location uses the closest of eight
  NASA POWER station records and the selected calendar month's 2015–2024 mean
  daily rainfall; the station and distance are returned by the API.
- **Terrain:** values come from the project's 120-point SRTM grid and are a
  nearest-grid approximation, not a surveyed site measurement.
- **Risk score:** an experimental model screening score, not a calibrated
  probability of a landslide and not an official warning. The model's v2
  training data includes synthetic negatives; never use this prototype for a
  life-safety decision without local authority validation and an approved alert
  operating policy.

## 👨‍💻 Built By

**Ahmad Khan** — Hackathon Project | Disaster Management × AI

---

⭐ **Star this repo if you found it useful!**
