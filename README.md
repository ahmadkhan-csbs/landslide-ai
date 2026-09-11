# 🏔️ NER Landslide AI - Early Warning & Monitoring Platform

> **SIH 2026 Hackathon Prototype** | Experimental rainfall-and-terrain screening system for the **North East Region (NER) of India**.

![Python](https://img.shields.io/badge/Python-3.12-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-Latest-green) ![ML](https://img.shields.io/badge/Model-Random%20Forest-orange) ![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-purple) ![Live Data](https://img.shields.io/badge/Rainfall-Live%20API-00b4d6)

---

## 🚨 The Challenge

North East India is one of the **most landslide-prone regions in the world**. The Himalayan terrain combined with extreme monsoon rainfall causes hundreds of landslides every year — damaging critical highway corridors, cutting off villages, and claiming lives. 

Current response mechanisms are highly reactive, and data fragmentation prevents proactive evacuations during severe weather events.

## 💡 Our Solution: An AI-Powered EWS

We have developed an **End-to-End Disaster Intelligence Platform**:

- 🤖 **AI Risk Engine**: A Random Forest ML model calculating live 72-hr landslide probability using rainfall, slope, and terrain fragility.
- 📶 **Offline-First PWA**: The dashboard utilizes Service Workers and Network-First caching to remain accessible even during severe storm network blackouts.
- 🗺️ **Interactive Glassmorphism Map**: A visually stunning Leaflet.js dashboard visualizing 53 disaster-prone NER cities.
- 🎥 **Citizen Crowdsourcing**: A multilingual (Hindi/Eng) reporting portal where locals can upload geo-tagged photos and **video evidence (mp4)** of cracks/blocked roads.
- 📡 **Multi-Provider Weather**: Fallback architecture prioritizing the Indian Meteorological Department (IMD) API, gracefully degrading to Open-Meteo for 100% uptime.
- 🔵 **Dual Mode**: Instantly toggle between LIVE Weather Mode and Monsoon Simulation Mode for emergency preparedness drills.

## 🧠 Technical Architecture

| Layer | Technology |
|-------|-----------|
| **AI / ML** | Random Forest (scikit-learn) trained on NASA Global Landslide Catalog |
| **Backend** | Python, FastAPI, Uvicorn (REST APIs) |
| **Frontend** | Vanilla JavaScript, CSS Glassmorphism, Leaflet.js |
| **Cloud/Deployment** | Ngrok (Tunneling), Local Storage (Media), SQLite (Records) |

### Top Risk Factors (Explainable AI)
1. 🌧️ **Rainfall — 57.8%** (monsoon is the #1 trigger)
2. 🏔️ **Terrain fragility — 22.4%**
3. 📍 **Location — 19.8%**

## 🚀 How to Run Locally (Hackathon Demo)

No complex cloud setup required! The entire application (Frontend + Backend) is served through a single Uvicorn instance.

```bash
# 1. Clone the repository
git clone https://github.com/ahmadkhan-csbs/landslide-ai.git
cd landslide-ai

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the Unified Server
cd backend
python -m uvicorn app:app --reload --host 127.0.0.1 --port 5500
```
**Open in Browser:** `http://127.0.0.1:5500/` (the only canonical 53-city dashboard)

### 🌐 Instant Live Sharing (Ngrok)
To share the live dashboard with judges or your mobile phone during the presentation:
```bash
# In a new terminal window
ngrok http 5500
```

## 🔌 API Endpoints (FastAPI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | `GET` | Serves the Progressive Web App UI |
| `/alerts` | `GET` | Live AI screening for all 53 NER locations |
| `/report` | `POST` | Submit a citizen report (handles mp4/png media) |
| `/reports` | `GET` | Fetch verified citizen incident reports |
| `/docs` | `GET` | Interactive Swagger API documentation |

## ✅ Features Completed for SIH Prototype

- [x] 🤖 Terrain-aware Random Forest risk prediction model
- [x] ⚡ Unified FastAPI backend serving static UI and JSON APIs
- [x] 🌐 **Multilingual Engine** (English & Hindi localization)
- [x] 🎥 **Media Uploads** (Support for High-Res Photos & MP4 Videos)
- [x] 📶 **Progressive Web App (PWA)** with Offline Caching
- [x] 🗺️ Interactive Live Dashboard with Glassmorphism UI
- [x] 📡 Real-time rainfall integration (Multi-provider)

## 🎯 Future Scope (Production Architecture)

- Migrate to **PostgreSQL with PostGIS** for advanced spatial queries.
- Implement **AWS S3** for scalable cloud storage of citizen media.
- Train a **U-Net** deep learning model for automated crack detection in uploaded citizen videos.
- Integrate **Redis** for massive scale SMS queue handling.

---
**👨‍💻 Built for Smart India Hackathon (SIH) 2026**
*Disclaimer: This is an experimental prototype and must not be used for official life-safety decisions without local authority validation.*
