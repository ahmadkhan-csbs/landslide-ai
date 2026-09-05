# NER Landslide AI — SIH26001 Project Brain

**Problem Statement:** SIH26001 — AI-Based Early Warning and Landslide Risk Monitoring System in NER  
**Ministry:** Ministry of Development of North Eastern Region (MDoNER)  
**Project name:** NER Landslide Screening & Incident Support  
**Last updated:** 2026-09-05  
**Current stage:** Working SIH prototype; not an operational government warning system.

---

## 1. Mission

Build an AI-enabled North East India platform that helps communities and disaster-management teams see rainfall-linked landslide screening, report slope/road incidents, understand road/village impact, and review incidents through a transparent human-in-the-loop workflow.

> This is **experimental screening**, not an official disaster-warning service. Official alerts come from IMD, SDMA/DDMA, district administration, and emergency authorities.

### Non-negotiable public-safety rules

- Never call a model score a real-world probability or official warning.
- Never call Open-Meteo data “IMD data”.
- Never claim authority delivery/acknowledgement unless it genuinely occurred.
- Never auto-train from citizen reports, COOLR candidates, or unreviewed records.
- Never fake a sensor, satellite feed, verified event, approval, or emergency contact.

---

## 2. SIH26001 requirement gap matrix

| SIH requirement | Current state | What remains |
|---|---|---|
| Real-time GIS dashboard | **Working** | 53 NER point locations exist; add zones, roads, villages, services. |
| Rainfall + terrain analytics | **Working, experimental** | Open-Meteo fallback, NASA POWER history, elevation/slope; official IMD pending. |
| IMD weather/forecast/warning feeds | **Blocked externally** | Needs genuine IMD approval, API key, and exact subscribed endpoint. |
| AI/ML predictive analytics | **Partial** | v2 runs as experimental screening; v3 candidate is blocked from deployment. |
| Risk levels and explanation | **Working** | Rain, forecast, terrain, source, timestamp and screening level are visible. |
| Citizen/field reporting | **Working** | Geo-tagged report, image, tracking ID; add video and offline queue later. |
| Reviewer/authority dashboard | **Working locally** | Audit and queue work; no real authority delivery without approved recipients. |
| Historical landslide records | **Foundation ready** | Verified contemporary NER event data must be collected manually. |
| Road connectivity status | **Missing** | Build road layer, blockage status, service/village impact and routes. |
| Roads/villages/hospitals/rescue GIS | **Missing** | Add verified, source-labelled geospatial layers. |
| Satellite imagery / deformation | **Missing** | Add Sentinel/Copernicus layer and transparent availability status. |
| Soil-moisture sensors | **Missing** | Add sensor ingestion model with calibration/health/timestamp. |
| SMS/app alert delivery | **Missing** | Add only with approved provider, recipients and SOP. |
| Multilingual notifications | **Missing** | Hindi + English first; add reviewed local translations. |
| Low-network/offline sync | **Missing** | Build PWA cache and queued report sync. |
| Cloud-scale architecture | **Missing** | HTTPS, PostGIS, hosted storage, jobs, monitoring and backups. |

---

## 3. What works today

### Public dashboard

- 53 unique screening locations across Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, and Tripura.
- Live weather and historical climate-simulation modes.
- Separate fields for observed 1-hour, observed 24-hour, seven completed-day rainfall, and next-day forecast.
- Location source, timestamp, provider status and stored weather audit trail.
- Explicit experimental / non-official disclaimer.

### Incident support

- Citizen incident form with map location, type, severity, people-at-risk field, optional contact and validated image upload.
- Tracking reference ID and `UNVERIFIED` default status.
- Public report view protects personal contact information and uploaded media.
- Emergency help includes 112 plus sourced state-level contact records.

### Reviewer workflow

- Restricted local reviewer dashboard.
- Statuses: `UNVERIFIED`, `VERIFIED`, `REJECTED`, `RESOLVED`.
- Every reviewer change has an audit record.
- Dispatch queue is local only.
- Email dispatch is possible only with SMTP plus an explicitly approved authority address; success means SMTP hand-off, not authority acknowledgement.

---

## 4. Current data architecture

```text
 IMD official feeds (after approval) ─┐
 Open-Meteo fallback ─────────────────┼─> Weather provider layer
 NASA POWER historic/backfill ─────────┘          |
                                                   v
                                          SQLite auditable store
                                   weather source/time/status/raw metadata
                                                   |
 Citizen reports / field evidence ────────────────┼─> FastAPI
 NASA COOLR candidate events ─────────────────────┘       |
                                                          v
                                          GIS dashboard + reviewer panel
```

### Data-source truth table

| Source | Purpose | Status | Rule |
|---|---|---|---|
| IMD | Official rainfall, forecast, nowcast, warnings | Pending approval | Primary only after real authenticated responses. |
| Open-Meteo | Live current-weather fallback | Working | Clearly label `fallback_live`. |
| NASA POWER Daily | Historical rainfall / 2025–2026 backfill | Working | Historical context, not live warning source. |
| NASA COOLR | Candidate landslide records | Upstream returned 404 | Save failure audit; never create fake events. |
| SDMA/DDMA/district records | Event verification and official contacts | Needed | Traceable source and human review required. |
| Sentinel/Copernicus | Satellite layer | Planned | Show image date/availability/uncertainty. |
| Soil sensors | Local saturation/moisture | Planned | Sensor ID, health, calibration and time required. |

---

## 5. Data assets and evidence

| Path | Meaning | Rule |
|---|---|---|
| `data/ner_rainfall_2015_2024.csv` | Original historical dataset | Never overwrite. |
| `data/raw/nasa_power/YYYY-MM-DD/` | Dated NASA POWER snapshots + provenance | Preserve raw files. |
| `data/raw/nasa_power/ner_rainfall_2025_2026.csv` | 2025–2026 backfill | Produced only through pipeline. |
| `data/processed/ner_rainfall_2015_2026.csv` | Merged historical/backfill dataset | Write only after every station succeeds. |
| `data/weather_observations.sqlite3` | Auditable local weather observations | Keep out of Git. |
| `data/raw/coolr/YYYY-MM-DD/` | COOLR data or failure audit | Failure must not appear as success. |
| `data/verified_events/` | Human-reviewed current events | Starts empty deliberately. |
| `data/MODEL_READINESS_AUDIT.md` | Model go/no-go evidence | Required before promotion. |

### NASA POWER result already achieved

- Backfill dates: `2025-01-01` to `2026-09-05`
- Eight source stations; 607 daily records each
- 4,856 total daily records
- Dated snapshot, SHA-256 checksum, and station-level counts are recorded
- Original 2015–2024 CSV stayed unchanged

---

## 6. Model status and guardrails

### v2 currently used by dashboard

- Artifact: `ml_model/landslide_model_v2.pkl`
- Use: experimental rainfall/terrain susceptibility screening.
- Never call the score accuracy, probability, or official warning.

### v3 candidate is blocked

- Artifacts are `candidate_not_deployed`.
- Audit decision: `NOT_APPROVED_FOR_OPERATIONAL_WARNING`.
- Spatial fold recall ranged from **31.2% to 85.2%**.
- Data uses catalogued events and `background_no_record` controls, not confirmed no-landslide records.

### Before model promotion

1. Verified contemporary NER events.
2. Representative non-event denominator.
3. Independent temporal and spatial validation.
4. False-alarm, miss-rate and lead-time analysis.
5. Domain expert/state authority review.
6. Approved threshold and alert Standard Operating Procedure.

---

## 7. Verified-event registry

No software or model may call an event verified.

- Template: `data/verified_events/ner_verified_events_template.csv`
- Active registry: `data/verified_events/ner_verified_events.csv`
- Validator: `event_registry.py`

Each row requires event date, coordinates, state/district, type, coordinate accuracy, source URL, stable source record ID, reviewer identity, UTC verification time, and evidence notes.

The validator checks NER bounds, dates, source URLs, reviewer data, and same-day events within one kilometre.

```powershell
python event_registry.py validate
```

`VALID_FOR_MANUAL_RESEARCH_USE` means format/evidence checks passed. It does not trigger model retraining or official deployment.

---

## 8. Build roadmap — correct order

### P0. Road Connectivity Impact Module — build next

This is the strongest missing SIH feature and highest judge value.

Build:

- GIS road layer, villages, hospitals, police/rescue points, shelters and critical infrastructure;
- road blockage report type and reviewer validation;
- status: `OPEN`, `CAUTION`, `BLOCKED`, `UNVERIFIED`;
- affected-road, nearby village/service impact and emergency-priority score;
- simple alternate safe-route suggestion that excludes confirmed blocked segments;
- layer source and update time everywhere.

**SIH impact:** answers road connectivity status, vulnerable infrastructure visualization, emergency response prioritisation and actionable dashboards.

### P1. Satellite and soil-moisture ingestion

- Sentinel/Copernicus scene metadata and availability layer.
- Land-cover/slope-change research indicator, never claimed as confirmed slide evidence.
- `sensor_readings` storage: sensor ID, location, moisture, battery, calibration date, observation time, source and health.
- If hardware is unavailable, use a clearly labelled `DEMO_SENSOR` feed; never call it live sensor data.

### P2. IMD official integration

After approval:

1. Store `IMD_API_KEY` and exact `IMD_WEATHER_URL` only in `.env`.
2. Validate a real response for one known location.
3. Store IMD observation, forecast and warning separately with raw provenance.
4. Use IMD display label only after a real verified response.

### P3. Offline + multilingual field reporting

- PWA cache for safety guidance and report UI.
- Offline queue with visible `QUEUED_OFFLINE` / `SYNCED` states.
- English + Hindi first; local languages only after human-reviewed translations.

### P4. Alert delivery and authority pilot

- Approved recipient directory.
- SMS/WhatsApp/app-push delivery provider.
- Delivery receipt, acknowledgement and escalation status.
- Authority-approved SOP before any mass sending.

### P5. Cloud readiness

- HTTPS; hosted database with PostGIS; object storage for media.
- Background worker queue, monitoring, backups, rate limits and incident response runbook.

---

## 9. SIH demo story

1. Open NER GIS dashboard and show 53 locations.
2. Show live data source, freshness and observation-versus-forecast separation.
3. Click a location: show rain, terrain, source, timestamp, explanation and audit trail.
4. Switch to NASA POWER simulation and explain it is historical climate, not live forecast.
5. Submit a landslide/blocked-road incident with map point and photo.
6. Track the reference ID: it remains unverified until a reviewer checks it.
7. Show reviewer audit workflow and safe local dispatch queue.
8. Show Road Connectivity Impact: affected road, nearby village/hospital/rescue impact, priority and alternate route.
9. Show Data & Method plus model-readiness audit; explain that unsafe model deployment is blocked.
10. End with real pilot roadmap: IMD + verified events + authority partner + low-network multilingual reporting.

---

## 10. External actions for the student/team

### IMD request

- Apply honestly as `Individual` / `Student` / `Researcher`; do not choose Government using a Gmail account.
- Submit only real identity proof and a genuine signed institute/HOD/Principal permission letter if the portal requires it.
- Do not fabricate documents.
- Never share the approved API key in chat, screenshots, GitHub or frontend code.
- Add it only to local `.env`, then say `IMD configured`.

### Official event collection

- Collect SDMA/DDMA, district administration, official bulletin, or credible research records.
- Add only after a human verifies date, location, source and coordinate accuracy.

### Official dispatch contacts

- Obtain explicit consent before saving authority recipient addresses.
- Never infer an email address or claim automatic dispatch.

---

## 11. Runbook

```powershell
# Backend
cd backend
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8010

# Dashboard, separate terminal
cd dashboard
npm run dev

# Data operations from project root
python pipeline.py weather
python pipeline.py data-health
python pipeline.py nasa-power --start 20250101 --end 20260905
python pipeline.py coolr
python event_registry.py validate
python model_readiness_audit.py

# Checks
python -m unittest discover -s tests -v
cd dashboard
npm run lint
```

---

## 12. Definition of success

### SIH prototype

An honest end-to-end demonstration of: auditable data → GIS screening → citizen report → human review → road/service impact prioritisation, with uncertainty and data-source truth visible at every step.

### Real government pilot

Only after IMD data agreement, state/district partner approval, verified events, independent validation, approved alert SOP, real delivery integration, secure cloud deployment, and monitored field testing.

**Correct public claim until then:**  
*Experimental NER landslide screening and incident-support prototype. Follow IMD and local authority instructions for official warnings and emergency action.*
