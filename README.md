# 🏔️ NER Landslide AI - AI Early Warning & Incident Support Platform

> **SIH 2026 Hackathon Prototype** | An experimental rainfall-and-terrain screening and incident-support system for the **North East Region (NER) of India**.

![Python](https://img.shields.io/badge/Python-3.12-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-Latest-green) ![ML](https://img.shields.io/badge/Model-Random%20Forest-orange) ![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-purple) ![Live Data](https://img.shields.io/badge/Rainfall-Live%20API-00b4d6)

---

## 🚨 The Challenge

North East India includes steep and geologically sensitive terrain where intense monsoon rainfall can increase landslide and road-disruption risk. These events can damage highway corridors, cut off communities, and create serious safety challenges.

Disaster-response teams and communities need timely, location-specific information that brings terrain, rainfall, screening results, and citizen reports together in one view.

## 💡 Our Solution: AI-Assisted Early Warning Support

We have developed a prototype platform that combines machine-learning screening with explainable indicators and incident-support workflows:

- 🤖 **AI Risk Screening**: A Random Forest model uses latitude, longitude, month, rainfall, elevation, and slope to produce an experimental screening score and risk level.
- 📈 **Forecast Windows**: The dashboard presents 24-hour, 48-hour, and 72-hour screening projections to support monitoring and preparedness discussions.
- 📶 **Resilient Dashboard**: Service Worker caching helps the interface remain available during temporary connectivity interruptions; cached results are labelled and should not be treated as current observations.
- 🗺️ **Interactive Map**: A Leaflet.js dashboard visualizes screening results for 53 selected NER locations and supporting terrain and connectivity layers.
- 🎥 **Citizen Reporting**: A bilingual Hindi/English reporting workflow accepts location-based incident reports and optional JPG, PNG, WebP, MP4, or WebM evidence.
- 📡 **Weather Providers**: The system can use IMD when configured and uses Open-Meteo or labelled historical climate data as fallback sources. The active source and freshness are shown in the dashboard.
- 🔵 **Two Operating Modes**: Live weather screening and historical climate simulation support monitoring, testing, and preparedness demonstrations.

## 🧠 Technical Architecture

| Layer | Technology |
|-------|-----------|
| **AI / ML** | Random Forest (scikit-learn) trained using project rainfall, terrain, and landslide data |
| **Backend** | Python, FastAPI, Uvicorn (REST APIs) |
| **Frontend** | Vanilla JavaScript, CSS Glassmorphism, Leaflet.js |
| **Deployment for Demo** | Uvicorn with optional Ngrok tunnelling |
| **Local Storage** | SQLite for weather observations and local files for prototype media storage |

### Screening Inputs

The model uses six inputs:

1. 🌧️ **Rainfall**
2. 🏔️ **Elevation**
3. ⛰️ **Slope**
4. 📍 **Latitude**
5. 📍 **Longitude**
6. 📅 **Month**

These inputs support an experimental screening result. They do not establish causation or a guaranteed probability of a landslide.

## 🚀 How to Run Locally (Hackathon Demo)

The FastAPI backend serves both the frontend and the API from one Uvicorn process.

```bash
# 1. Clone the repository
git clone https://github.com/ahmadkhan-csbs/landslide-ai.git
cd landslide-ai

# 2. Create and activate a virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate       # macOS/Linux
# Windows PowerShell: .\.venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the unified server from the repository root
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```
**Open in Browser:** `http://127.0.0.1:8000/`

### 🌐 Instant Live Sharing (Ngrok)
To temporarily share the running dashboard with judges or a mobile phone, open a second terminal:
```bash
# The FastAPI server must already be running on port 8000
ngrok http 8000
```

Ngrok provides a temporary public HTTPS URL. Keep both the Uvicorn and Ngrok terminals open while sharing the demo. The URL may change when the tunnel is restarted.

## 🔌 API Endpoints (FastAPI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | `GET` | Serves the Progressive Web App UI |
| `/alerts` | `GET` | Screening results for all 53 configured NER locations; live or simulation mode |
| `/report` | `POST` | Submit an unverified citizen report with optional media |
| `/reports` | `GET` | List stored citizen reports according to the API workflow |
| `/docs` | `GET` | Interactive Swagger API documentation |

## ✅ Features Completed for SIH Prototype

- [x] 🤖 Terrain-aware Random Forest risk-screening model
- [x] ⚡ Unified FastAPI backend serving static UI and JSON APIs
- [x] 🌐 **Multilingual Engine** (English & Hindi localization)
- [x] 🎥 **Media Uploads** (Support for High-Res Photos & MP4 Videos)
- [x] 📶 **Progressive Web App (PWA)** with Offline Caching
- [x] 🗺️ Interactive dashboard with map-based screening and incident workflows
- [x] 📡 Multi-provider rainfall integration with source and freshness labels

## 🎯 Future Scope (Production Architecture)

- Migrate to **PostgreSQL with PostGIS** for advanced spatial queries.
- Implement **AWS S3** for scalable cloud storage of citizen media.
- Train a **U-Net** deep learning model for automated crack detection in uploaded citizen videos.
- Integrate **Redis** for massive scale SMS queue handling.

---
**👨‍💻 Built for Smart India Hackathon (SIH) 2026**

*Disclaimer: This is an experimental decision-support prototype. Screening scores, forecasts, cached values, citizen reports, and route suggestions may be incomplete, delayed, or inaccurate. They are not official warnings, evacuation orders, verified incident confirmations, or substitutes for guidance from IMD, NDMA, NDRF, state authorities, police, fire, medical services, or local disaster-management teams. For immediate danger, contact the official emergency services in your area.*
