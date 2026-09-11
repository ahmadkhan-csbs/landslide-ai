# NER Landslide AI - Judge Q&A

This document is a presentation-ready viva guide for the current project. Answers are intentionally honest: this is an experimental screening prototype, not an official evacuation-warning system.

## 1. One-Minute Introduction

### Q: What is your project?
**Answer:**
NER Landslide AI is an experimental landslide risk-screening and incident-support platform for 53 selected locations in North East India. It combines rainfall, terrain, elevation, slope, location and month into a Random Forest screening score. The dashboard also shows live or fallback weather provenance, map-based risk markers, citizen reports, emergency contacts and road-connectivity demonstration data.

### Q: What problem are you solving?
**Answer:**
Landslide information is often fragmented and reactive. Local users need one place to see weather-linked terrain screening, report cracks or blocked roads, and access verified emergency guidance. Our prototype improves information access and transparency; it does not replace government warnings or field verification.

### Q: Who are the users?
**Answer:**
Citizens, district-level disaster-management teams, road and infrastructure teams, researchers and hackathon evaluators. Citizens can view screening and submit reports; authorized local administrators can review reports and stage dispatch.

### Q: What is your key innovation?
**Answer:**
The main innovation is an end-to-end workflow rather than only a model: terrain-aware screening, weather-provider fallback, auditable observation storage, bilingual citizen reporting, map visualization, report verification and connectivity context in one lightweight system.

### Q: Why North East India?
**Answer:**
The region combines steep terrain, monsoon rainfall, fragile hill roads and dispersed communities. It is a useful demonstration region where timely information and road-connectivity context matter.

## 2. Project Architecture

### Q: Explain the architecture.
**Answer:**
The browser opens the vanilla dashboard from FastAPI on port 5500. FastAPI serves static HTML/CSS/JavaScript and exposes REST endpoints. The backend loads the trained scikit-learn model, obtains weather from IMD when configured or Open-Meteo as an explicitly labelled fallback, stores observations in SQLite, and returns screening results. The frontend uses Leaflet for the map, Chart.js for local history visualization and a Service Worker for offline caching.

```text
Browser
  -> FastAPI/Uvicorn :5500
       -> Vanilla dashboard
       -> Risk API
       -> Weather providers
       -> Random Forest model
       -> SQLite observation store
       -> JSON incident records/media
```

### Q: Are frontend and backend on separate ports?
**Answer:**
No, the final demo uses one port. FastAPI serves both the frontend and API on `http://127.0.0.1:5500`. The vanilla dashboard in `dashboard/index.html` is the only supported dashboard.

### Q: Why did you choose one port?
**Answer:**
It reduces setup errors, avoids CORS complexity during the demo, and makes deployment simple: one Uvicorn process serves the dashboard and APIs.

### Q: Which files are most important?
**Answer:**
- `backend/app.py`: API, risk inference, dashboard serving, reports and admin flow.
- `backend/providers.py`: IMD/Open-Meteo provider logic and fallback.
- `backend/store.py`: SQLite weather observation storage.
- `train_model_v2.py`: Random Forest training pipeline.
- `dashboard/index.html`: canonical 53-city dashboard structure.
- `dashboard/script.js`: map, alerts, reports, charts and UI actions.
- `dashboard/sw.js`: offline caching behavior.
- `ml_model/landslide_model_v2.pkl`: deployed experimental model artifact.

## 3. Data Questions

### Q: What data do you use?
**Answer:**
The project uses historical landslide/event data for model training, rainfall/climate data for simulation and terrain data containing elevation and slope. Live weather is fetched from IMD when configured and Open-Meteo otherwise. The project also stores local observation provenance and citizen reports.

### Q: What are the six model inputs?
**Answer:**
`lat`, `lon`, `month`, `rainfall`, `elevation`, and `slope`.

### Q: Why latitude and longitude?
**Answer:**
Location captures regional and spatial differences. It is not a substitute for a full spatial model, but it provides location context used during training and inference.

### Q: Why month?
**Answer:**
Rainfall and landslide patterns are seasonal in the region. Month allows the model and simulation mode to represent seasonal differences.

### Q: What is rainfall measured in?
**Answer:**
The model feature is average daily rainfall in millimetres per day. The dashboard separately displays 1-hour, 24-hour, 7-day cumulative and forecast values when available.

### Q: What happens when live weather is unavailable?
**Answer:**
The backend falls back to the NASA POWER climate normal used by the project and clearly labels the result as a climate fallback. It does not silently call fallback data live data.

### Q: Why keep 1-hour, 24-hour and 7-day values separate?
**Answer:**
They represent different hazard signals. Short windows capture acute rainfall; longer windows capture accumulated wetness. Keeping them separate improves explainability and prevents forecast values from being mixed into observed rainfall totals.

### Q: How do you avoid forecast leakage?
**Answer:**
The Open-Meteo provider keeps only timestamps at or before the provider's current time in observed windows. Future daily values are stored separately as forecast values. Tests explicitly verify this behavior.

### Q: Why is some forecast data unavailable?
**Answer:**
A provider may not return a usable next-day value for a particular response. The UI shows `Unavailable` rather than inventing a number. Observed rainfall remains usable.

### Q: What is the 53-city coverage?
**Answer:**
The backend has a fixed demonstrated coverage list of 53 NER locations across Assam, Meghalaya, Manipur, Nagaland, Mizoram, Tripura, Arunachal Pradesh and Sikkim. The `/alerts` endpoint returns all 53 locations.

## 4. Machine Learning Questions

### Q: Which algorithm do you use?
**Answer:**
A scikit-learn `RandomForestClassifier` is used for the deployed v2 experimental model.

### Q: Why Random Forest?
**Answer:**
It handles nonlinear relationships, mixed-scale numerical features and feature interactions without requiring feature scaling. It is also relatively interpretable through feature importance and robust for a prototype-sized tabular dataset.

### Q: What are the model hyperparameters?
**Answer:**
The v2 training script uses 200 trees, maximum depth 12 and `random_state=42`. Training uses a stratified 80/20 train-test split.

### Q: What does the model output mean?
**Answer:**
`predict_proba` gives the classifier's experimental score for the landslide class, displayed as a percentage. It is a screening score, not a calibrated real-world probability and not an official warning level.

### Q: How is inference performed?
**Answer:**
The backend finds the nearest terrain-grid point, obtains the appropriate rainfall value, constructs a one-row DataFrame with the six training columns, and calls `model.predict_proba(...)`. The returned score is then mapped to LOW, MEDIUM or HIGH display levels using the project's screening policy.

### Q: Does the backend really use the trained model?
**Answer:**
Yes. The deployed artifact is loaded with joblib and `predict_proba` is called during `get_risk`. The model's expected feature names are `lat`, `lon`, `month`, `rainfall`, `elevation`, and `slope`.

### Q: What is explainability in this project?
**Answer:**
The dashboard shows rainfall, terrain susceptibility, slope, soil-moisture proxy, historical proxy and satellite status as supporting indicators. These are explanatory screening indicators. They should not be described as formal causal attribution or SHAP explanations.

### Q: Why do you not call this a production AI warning model?
**Answer:**
The readiness audit identifies important blockers: historical controls are not confirmed non-events, the data is not an independent contemporary 2025-2026 validation set, spatial recall varies, case-control scores are not real-world probabilities, and no authority-approved threshold exists.

### Q: What would you do before production deployment?
**Answer:**
Collect verified contemporary NER events and representative non-events, perform independent temporal and spatial validation, calibrate scores, obtain state/IMD/domain-expert review, define an approved operating threshold, run a monitored pilot, and add monitoring and rollback procedures.

## 5. Risk and Weather Flow

### Q: Explain one prediction request.
**Answer:**
The client requests `/predict` with latitude, longitude, month and live/simulation mode. The backend validates the NER bounds and month, chooses live weather or climate normal, finds nearest terrain values, runs the Random Forest, calculates display indicators and returns source, freshness and explanation fields.

### Q: What is LIVE mode?
**Answer:**
LIVE mode tries to use a recent stored observation first. If no fresh observation exists, it fetches from the configured preferred provider. IMD is primary when configured; Open-Meteo is explicitly labelled fallback otherwise.

### Q: What is Simulation mode?
**Answer:**
Simulation mode uses historical climate normals by month. It is useful for monsoon drills and demos when live weather should not influence the result.

### Q: Why cache weather?
**Answer:**
The dashboard requests up to 53 locations. A short cache reduces provider load, improves response time and avoids making users wait for repeated calls to the same location.

### Q: Why use a thread pool for alerts?
**Answer:**
Weather requests are I/O-bound. Concurrent fetching reduces total waiting time while the model calculations remain local. The project still limits concurrency to a controlled worker count.

### Q: What is SQLite used for?
**Answer:**
SQLite stores auditable weather observations, timestamps, source, status and provider metadata locally. It is sufficient for a prototype and easy to inspect. Production scale would use PostgreSQL/PostGIS and a managed storage layer.

## 6. Frontend Questions

### Q: Why vanilla JavaScript instead of only React/Next.js?
**Answer:**
The final demo prioritizes a single lightweight server and direct integration with FastAPI. Vanilla JavaScript avoids a second runtime process and is suitable for the map/report workflow. The repository contains a Next.js alternative, but the canonical demo is the vanilla dashboard.

### Q: What does Leaflet do?
**Answer:**
Leaflet renders the interactive map, markers, terrain boundary, reports and demonstration corridors. It is a visualization layer; it does not perform the ML prediction.

### Q: What does Chart.js do?
**Answer:**
Chart.js renders the rainfall history/projection visualization in the location-details modal. Provider observations and forecasts are kept as separate fields.

### Q: What does the Service Worker do?
**Answer:**
It caches static dashboard assets and attempts network-first behavior for API requests. When the network fails, cached responses may keep the interface usable. Cached data must still be checked for freshness.

### Q: Is the application truly offline?
**Answer:**
The shell and previously cached data can remain available offline, but new live weather cannot be fetched without connectivity. The UI must show that data is cached or unavailable rather than claiming current live status.

### Q: Why bilingual support?
**Answer:**
Hindi plus English improves accessibility for local users and demonstrates that emergency-support interfaces should not be English-only.

## 7. Citizen Reports and Security

### Q: How does citizen reporting work?
**Answer:**
A user selects a map location, chooses incident type and severity, enters an optional description and can attach an image or video. The browser sends a JSON data URL to `/report`. The backend validates location and fields, limits media to allowed formats and 15 MB, stores the media locally, and marks the report UNVERIFIED.

### Q: Are reports automatically sent to authorities?
**Answer:**
No. Reports are received locally and clearly marked unverified. An authorized administrator can review, verify/reject, queue a dispatch and explicitly send through configured SMTP. This prevents an unverified citizen report from becoming an automatic official alert.

### Q: How is admin access protected?
**Answer:**
Admin access requires configured `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`. Login returns a signed, expiring bearer token. Admin report and dispatch endpoints require that token.

### Q: What privacy protections exist?
**Answer:**
Public report feeds hide reporter phone, reporter name and uploaded media filename. Uploaded media is only exposed through an authenticated admin route. Production deployment should add stronger identity management, encryption, retention policy and malware scanning.

### Q: How is SMS protected?
**Answer:**
The subscription endpoint validates phone format and rate-limits subscription attempts by client address. Real SMS dispatch is admin-protected and requires a configured provider key.

### Q: Is the media upload production-ready?
**Answer:**
No. It is prototype-grade local storage. Production should use object storage such as S3, virus scanning, signed URLs, quotas, content inspection and retention controls.

## 8. API Questions

### Q: Important endpoints?
**Answer:**
- `GET /`: dashboard.
- `GET /alerts`: screening for all 53 locations.
- `GET /predict`: one-location screening.
- `GET /data-health`: observation freshness and provider coverage.
- `GET /weather-history`: stored provenance for a listed location.
- `POST /report`: citizen incident submission.
- `GET /reports`: public sanitized report feed.
- `GET /connectivity-impact`: demonstration road-impact context.
- `GET /emergency-contacts`: emergency directory.
- `GET /docs`: Swagger/OpenAPI documentation.

### Q: How is input validation handled?
**Answer:**
Latitude and longitude are restricted to the demonstrated NER bounds. Month is restricted to 1-12. Pydantic validates report enums, lengths, numeric ranges and media size. Unknown or malformed media is rejected.

### Q: Why use FastAPI?
**Answer:**
FastAPI provides typed request validation through Pydantic, automatic OpenAPI documentation, good performance for I/O APIs and a simple Python integration with pandas and scikit-learn.

### Q: Why Uvicorn?
**Answer:**
Uvicorn is the ASGI server that runs the FastAPI application locally and serves the unified dashboard/API process.

## 9. Demo Questions

### Q: How do you run it?
**Answer:**
```powershell
cd C:\Users\khanm\Desktop\landslide-ai
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 5500
```
Then open `http://127.0.0.1:5500/`. Keep the server terminal open. If port 5500 is already occupied, stop the old dashboard process first.

### Q: How do you demonstrate the project?
**Answer:**
1. Open the dashboard and show 53 monitored locations.
2. Switch between LIVE and Monsoon Simulation.
3. Filter a state and open a location marker.
4. Explain source, rainfall windows, terrain and screening score.
5. Submit a sample citizen report and show its UNVERIFIED status.
6. Open Data & Method and discuss freshness.
7. Show `/docs` for API transparency.

### Q: How do you verify the system before presenting?
**Answer:**
Run:
```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m compileall -q backend tests
node --check dashboard\script.js
```
The current test suite has 12 passing tests.

## 10. Difficult Judge Questions

### Q: Your UI says AI. Is it actually AI?
**Answer:**
Yes, the risk score uses a trained Random Forest classifier. However, it is experimental ML screening, not an autonomous official decision system. Supporting indicators and display thresholds are deterministic application logic around the model.

### Q: Why should we trust a prediction?
**Answer:**
The result should not be treated as a standalone truth. We expose data source, timestamp, rainfall windows and terrain context so a human can assess it. Operational trust requires the validation, calibration and expert-review work listed in the readiness audit.

### Q: What if Open-Meteo is wrong or unavailable?
**Answer:**
The provider status is exposed, observations and forecast are separated, recent observations are cached, and climate fallback is labelled. A production system would use multiple independently monitored providers and alert on data quality degradation.

### Q: Why not deep learning?
**Answer:**
The current inputs are small tabular data, not a large image or video dataset. Random Forest is faster to train, easier to explain and better matched to the available prototype data. Deep learning such as U-Net becomes relevant later for image-based crack/landslide evidence.

### Q: What is your biggest limitation?
**Answer:**
The biggest limitation is validation, not the dashboard. Historical case-control data and proxy non-events do not yet establish calibrated real-world probabilities for all NER locations. Therefore the system is a research demonstration and screening aid only.

### Q: What is the difference between risk level and official warning?
**Answer:**
Risk level is an application screening category generated from model output and policy thresholds. An official warning requires authorized agencies, validated observations, approved thresholds, communication protocols and human accountability.

### Q: How would you scale this system?
**Answer:**
Move weather and reports to managed services, use PostgreSQL/PostGIS for spatial queries, store media in S3-compatible object storage, add Redis/Celery for provider jobs, containerize the services, add authentication and observability, and deploy behind HTTPS with backups and rate limiting.

## 11. Claims to Avoid

Do not say:

- “100% accurate.”
- “Official evacuation warning.”
- “The displayed percentage is a calibrated probability.”
- “Satellite anomaly is real-time satellite detection” unless a real satellite pipeline is connected.
- “All citizen reports are verified.”
- “The system works fully offline with fresh weather.”
- “The model is production-approved.”
- “Every forecast value is always available.”

Say instead:

- “Experimental screening score.”
- “Source-labelled live/fallback/simulation data.”
- “Unverified citizen reports requiring review.”
- “Offline shell and cached data, not fresh weather.”
- “Research demonstration with a defined production roadmap.”

## 12. Best Closing Answer

“Our prototype connects data, model inference and community reporting into one auditable workflow for 53 NER locations. Its value is early information and operational transparency, not replacing authorities. We explicitly show source, freshness and limitations, and our next step is independent contemporary validation with domain experts before any operational warning use.”
