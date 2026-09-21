# 🏔️ Landslide AI PRO - Advanced AI Early Warning & Incident Support Ecosystem

> **SIH 2026 Hackathon Prototype** | An experimental AI-driven predictive screening, satellite analysis, and incident-support system for the **North East Region (NER) of India**.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js) ![FastAPI](https://img.shields.io/badge/FastAPI-Latest-009688?style=for-the-badge&logo=fastapi) ![ML](https://img.shields.io/badge/Model-XGBoost%20%2B%20UNet-FF6F00?style=for-the-badge) ![Live Data](https://img.shields.io/badge/Data-IMD%20%26%20GSI-00b4d6?style=for-the-badge)

---

## 🚨 The Challenge

North East India includes steep and geologically sensitive terrain where intense monsoon rainfall can increase landslide and road-disruption risk. These events can damage highway corridors, cut off communities, and create serious safety challenges.

Current disaster-response systems are reactive. Teams and communities need a **proactive, location-specific** system that brings predictive AI, satellite terrain analysis, rainfall forecasts, and citizen reports together in one centralized command view.

## 💡 Our Solution: Predictive AI & Sentinel-2 Integration

We have developed a next-generation prototype platform that combines Ensemble Machine Learning (XGBoost + LSTM) with explainable indicators and life-saving incident-support workflows:

- ⏳ **AI Time-Travel Forecasting**: Visually animate and predict future (12H, 24H, 72H) landslide vulnerabilities directly on a 3D topographic map based on live rainfall forecasts.
- 🛰️ **Sentinel-2 Satellite Scan (NDVI)**: Real-time map overlay that calculates tree cover loss to detect deforestation hotspots, directly linking ecological damage to increased landslide risks.
- 🛣️ **3D Evacuation Convoy Simulator**: Dynamic route planner that calculates the safest logistics path for NDRF/Army by actively avoiding high-risk roads and simulating convoy movement.
- 📶 **Offline Mass SMS Broadcast Simulator**: A resilient fallback communication system that connects to local cell towers to broadcast text alerts to feature phones (No Smartphone or Internet required).
- 📄 **One-Click SitRep PDF Export**: Instantly generate an official Government-formatted 'Situation Report' (SitRep) detailing critical alerts, AI metrics, and evacuation logistics.
- 🎮 **Gamified Citizen Incident Portal**: A bilingual (Hindi/English) crowdsourcing app that rewards citizens for reporting real-time ground anomalies (slope cracks, blocked roads) with visual evidence.
- 📊 **Real-World Analytics**: Trained on 10 years of authentic IMD (Meteorological) and GSI (Geological) data with live model training accuracy visualizations.

## 🧠 Technical Architecture

| Layer | Technology |
|-------|-----------|
| **AI / ML** | XGBoost (Tabular data) + U-Net (Satellite imagery & Crack detection) |
| **Backend** | Python, FastAPI, Uvicorn (REST APIs) |
| **Frontend** | Next.js 14, React, Tailwind CSS (Glassmorphism), Leaflet.js |
| **Data Analytics** | Recharts, jsPDF (AutoTable) |
| **Deployment for Demo** | Uvicorn with optional Ngrok tunnelling |

### Screening Inputs
The predictive model uses hyper-localized inputs:
1. 🌧️ **Live Rainfall (IMD/Open-Meteo)**
2. 🏔️ **Elevation & Slope (Terrain GIS)**
3. 🌳 **Deforestation / NDVI (Sentinel-2)**
4. 💧 **Soil Moisture Levels**
5. 📍 **Latitude & Longitude**

## 🚀 How to Run Locally (Hackathon Demo)

The project consists of a Python FastAPI backend and a Next.js React frontend.

### 1. Setup Backend (Python)
```bash
# Clone the repository
git clone https://github.com/ahmadkhan-csbs/landslide-ai.git
cd landslide-ai

# Create and activate a virtual environment
python -m venv .venv
# Windows: .\.venv\Scripts\Activate.ps1
# Mac/Linux: source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI backend
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000

2. Setup Frontend (Next.js)
Open a second terminal:

bash


cd dashboard
npm install
npm run dev
Open in Browser: http://localhost:3000/

(Optional) On Windows PowerShell, you can start both servers together:

powershell


.\start_dashboard.ps1
🔌 API Endpoints (FastAPI)
Endpoint	Method	Description
/	GET	Serves the legacy UI / Health Check
/api/alerts	GET	Screening results for all 53 NER locations; live or simulation mode
/api/report	POST	Submit an unverified citizen report with optional media
/docs	GET	Interactive Swagger API documentation
🎯 Future Scope (Production Architecture)
Migrate to PostgreSQL with PostGIS for advanced spatial queries.
Implement AWS S3 for scalable cloud storage of citizen media.
Hardware integration with Arduino/Raspberry Pi IoT Inclinometers for live ground movement tracking.
Integrate Redis for massive scale SMS queue handling.
👨‍💻 Built for Smart India Hackathon (SIH) 2026

Disclaimer: This is an experimental decision-support prototype. Screening scores, forecasts, cached values, citizen reports, and route suggestions may be incomplete, delayed, or inaccurate. They are not official warnings, evacuation orders, verified incident confirmations, or substitutes for guidance from IMD, NDMA, NDRF, state authorities, police, fire, medical services, or local disaster-management teams. For immediate danger, contact the official emergency services in your area.


