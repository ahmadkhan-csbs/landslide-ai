# 🏔️ NER Landslide Early Warning System

> AI-powered landslide risk prediction system for **North East Region (NER) of India** — built to save lives with early warnings.

![Python](https://img.shields.io/badge/Python-3.12-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-Latest-green) ![ML](https://img.shields.io/badge/Model-Random%20Forest-orange) ![Accuracy](https://img.shields.io/badge/Accuracy-93.6%25-brightgreen) ![Live Data](https://img.shields.io/badge/Rainfall-Live%20API-00b4d6)

---

## 🚨 The Problem

North East India is one of the **most landslide-prone regions in the world**. The Himalayan/Hill terrain combined with extreme monsoon rainfall causes hundreds of landslides every year — damaging roads, cutting off villages, and claiming lives.

**There is no accessible early-warning system for local communities. Until now.**

## 💡 Our Solution

A complete end-to-end system:
- 🤖 **ML Model** that predicts landslide probability by location & month
- ⚡ **FastAPI Backend** serving real-time predictions
- 🗺️ **Interactive Map Dashboard** with live color-coded risk alerts
- 📡 **Real-Time Rainfall** — live weather data via Open-Meteo API (no fake inputs!)
- 🔵 **Dual Mode** — LIVE mode (real weather) + Monsoon Simulation mode (emergency planning)
- 📍 **Citizen Reports** — anyone can report a landslide on the map & get instant ML risk for that exact location
- 🔍 **Explainable AI** — every prediction shows *why* (main factor: monsoon rainfall)

## 📊 Model Performance

| Metric | Score |
|--------|-------|
| Accuracy | **93.6%** |
| Precision | **100%** |
| F1-Score | **94%** |

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

## 🚀 How to Run

```bash
# Clone the repo
git clone https://github.com/ahmadkhan-csbs/landslide-ai.git
cd landslide-ai

# Install dependencies
pip install -r requirements.txt

# 1. Train the model (downloads NASA data separately — see data/README)
python train_model.py

# 2. Start the API server
cd backend
python -m uvicorn app:app --reload

# 3. Start the dashboard (new terminal)
cd dashboard
python -m http.server 5500

# 4. Open in browser
# http://localhost:5500/index.html
```

## 🔌 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | API status |
| `GET /predict?lat=26.14&lon=91.73&month=7` | Landslide risk for any location + month |
| `GET /alerts` | Live risk alerts for 8 major NER cities (real rainfall) |
| `GET /alerts?use_live=false` | Monsoon simulation mode (demo/emergency planning) |
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

Monitoring 8 major NER cities:  
`Guwahati` · `Shillong` · `Imphal` · `Kohima` · `Aizawl` · `Agartala` · `Itanagar` · `Gangtok`

## ✅ Recently Completed

- [x] 🤖 Random Forest model — 93.6% accuracy on NASA data
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

## 👨‍💻 Built By

**Ahmad Khan** — Hackathon Project | Disaster Management × AI

---

⭐ **Star this repo if you found it useful!**
