import tempfile
import unittest
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import app
from backend.providers import IMDProvider, OpenMeteoProvider, ProviderUnavailable, fetch_preferred_weather
from backend.store import ObservationStore, is_fresh, utc_now
from pipeline import valid_event_date
from event_registry import REQUIRED_FIELDS, validate_rows


class PipelineTests(unittest.TestCase):
    def test_53_unique_locations(self):
        self.assertEqual(len(app.CITIES), 53)
        self.assertEqual(len({(city["name"], city["lat"], city["lon"]) for city in app.CITIES}), 53)

    def test_api_location_and_month_validation(self):
        with self.assertRaises(HTTPException) as outside:
            app.validate_ner_location(20.9, 91)
        self.assertEqual(outside.exception.status_code, 422)
        with self.assertRaises(HTTPException):
            app.validate_month(13)

    def test_simulation_month_changes_climate_input(self):
        january = app.get_risk(26.14, 91.73, month=1, use_live=False)
        july = app.get_risk(26.14, 91.73, month=7, use_live=False)
        self.assertEqual(january["month"], 1)
        self.assertEqual(july["month"], 7)
        self.assertNotEqual(january["rainfall"], july["rainfall"])

    def test_store_latest_and_freshness(self):
        with tempfile.TemporaryDirectory() as folder:
            store = ObservationStore(Path(folder) / "weather.sqlite3"); store.initialise()
            record = {"location_name": "test", "lat": 25.0, "lon": 92.0, "source": "test", "fetched_at_utc": utc_now(), "observed_at_utc": None, "rainfall_1h_mm": 0, "rainfall_24h_mm": 1, "rainfall_7d_mm": 2, "forecast_rainfall_mm": 3, "warning_level": None, "status": "test", "raw_metadata": {}}
            store.save_observation(record)
            self.assertTrue(is_fresh(store.latest("test", 25.0, 92.0)))
            self.assertEqual(len(store.history("test", 25.0, 92.0)), 1)
            self.assertFalse(is_fresh({"fetched_at_utc": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}, 60))

    def test_openmeteo_fallback_when_imd_fails(self):
        fallback = {"location_name": "x", "lat": 25, "lon": 92, "source": "Open-Meteo", "fetched_at_utc": utc_now(), "status": "fallback_live", "raw_metadata": {}}
        with patch.object(IMDProvider, "configured", return_value=True), patch.object(IMDProvider, "fetch", side_effect=ProviderUnavailable("down")), patch.object(OpenMeteoProvider, "fetch", return_value=fallback):
            result = fetch_preferred_weather("x", 25, 92)
        self.assertEqual(result["source"], "Open-Meteo")
        self.assertEqual(result["status"], "fallback_after_imd_failure")

    def test_official_state_emergency_contact_directory(self):
        directory = app.emergency_contacts("Sikkim")
        self.assertEqual(directory["contacts"][0]["number"], "112")
        self.assertTrue(any(contact["number"] == "1070" for contact in directory["contacts"]))
        self.assertFalse(directory["authority_dispatch_configured"])

    def test_openmeteo_observation_windows_exclude_forecast(self):
        """1h/24h/7d fields must only use timestamps at or before current time."""
        now = datetime(2026, 9, 5, 12, tzinfo=timezone.utc)
        hourly_times = [(now - timedelta(hours=30) + timedelta(hours=i)).isoformat().replace("+00:00", "Z") for i in range(36)]
        hourly_rain = [1.0] * 31 + [99.0] * 5  # Five future values must not leak into observations.
        payload = {
            "current": {"time": now.isoformat().replace("+00:00", "Z"), "precipitation": 1.0},
            "hourly": {"time": hourly_times, "precipitation": hourly_rain},
            "daily": {"time": ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"], "rain_sum": [2.0] * 8 + [77.0, 88.0]},
        }
        response = unittest.mock.Mock()
        response.json.return_value = payload
        response.raise_for_status.return_value = None
        with patch("backend.providers.requests.get", return_value=response):
            record = OpenMeteoProvider().fetch("test", 25.0, 92.0)
        self.assertEqual(record["rainfall_1h_mm"], 1.0)
        self.assertEqual(record["rainfall_24h_mm"], 24.0)
        self.assertEqual(record["rainfall_7d_mm"], 14.0)
        self.assertEqual(record["forecast_rainfall_mm"], 88.0)

    def test_data_health_uses_fixed_53_location_coverage(self):
        health = app.data_health()
        self.assertEqual(health["monitored_locations"], 53)
        self.assertGreaterEqual(health["locations_with_observations"], 0)
        self.assertIn(health["overall_status"], {"LIVE_READY", "PARTIAL_OR_STALE"})

    def test_coolr_event_date_validation(self):
        self.assertEqual(valid_event_date("2026-09-05T10:30:00Z"), "2026-09-05")
        self.assertEqual(valid_event_date("09/05/2026"), "2026-09-05")
        self.assertEqual(valid_event_date(1788604800000), "2026-09-05")
        self.assertIsNone(valid_event_date("not-a-date"))

    def test_model_readiness_audit_is_explicitly_non_operational(self):
        audit = json.loads((Path("data") / "model_readiness_audit.json").read_text(encoding="utf-8")) if (Path("data") / "model_readiness_audit.json").exists() else None
        if audit is not None:
            self.assertEqual(audit["decision"], "NOT_APPROVED_FOR_OPERATIONAL_WARNING")

    def test_verified_event_registry_requires_human_evidence(self):
        row = dict.fromkeys(REQUIRED_FIELDS, "")
        row.update({
            "event_id": "NER-2026-001", "event_date": "2026-09-01", "lat": "27.2", "lon": "88.5",
            "state": "Sikkim", "district": "Mangan", "event_type": "LANDSLIDE", "coordinate_accuracy_km": "1",
            "source_name": "Example authority", "source_url": "https://example.gov.in/report/1", "source_record_id": "1",
            "verification_status": "VERIFIED", "verified_by": "reviewer-1", "verified_at_utc": "2026-09-02T09:00:00Z",
            "verification_notes": "Checked source record, event date and map coordinates manually.",
        })
        self.assertEqual(validate_rows([row])["error_count"], 0)
        row["verification_status"] = "UNVERIFIED"
        self.assertGreater(validate_rows([row])["error_count"], 0)

    def test_connectivity_impact_requires_verified_road_blockage(self):
        report = {
            "reference_id": "NER-DEMO-1", "lat": 26.1445, "lon": 91.7362,
            "verification_status": "VERIFIED", "incident_type": "ROAD_BLOCKED",
            "severity": "HIGH", "people_at_risk": 20,
        }
        with patch("backend.app.load_reports", return_value=[report]):
            impact = app.connectivity_impact()
        corridor = next(item for item in impact["corridors"] if item["id"] == "NER-DEMO-01")
        self.assertTrue(impact["demonstration_only"])
        self.assertEqual(corridor["status"], "CONFIRMED_BLOCKED")
        self.assertIn("NOT_AVAILABLE", impact["alternate_route_status"])


if __name__ == "__main__":
    unittest.main()
