"""Weather providers with explicit source labels and no silent fallback."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import requests

try:
    from .config import IMD_API_KEY, IMD_API_KEY_HEADER, IMD_WEATHER_URL
    from .store import utc_now
except ImportError:  # supports `cd backend; uvicorn app:app --reload`
    from config import IMD_API_KEY, IMD_API_KEY_HEADER, IMD_WEATHER_URL
    from store import utc_now


class ProviderUnavailable(RuntimeError):
    pass


def parse_utc_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class OpenMeteoProvider:
    source = "Open-Meteo"
    url = "https://api.open-meteo.com/v1/forecast"

    def fetch(self, location_name: str, lat: float, lon: float) -> dict[str, Any]:
        # Request enough past timestamps to calculate completed observation windows.
        # Forecast values are kept separate and never included in observed totals.
        params = {"latitude": lat, "longitude": lon, "current": "precipitation", "hourly": "precipitation", "daily": "rain_sum", "past_days": 8, "forecast_days": 1, "timezone": "UTC"}
        try:
            response = requests.get(self.url, params=params, timeout=15)
            response.raise_for_status()
            raw = response.json()
            hourly = raw.get("hourly", {})
            hour_pairs = list(zip(hourly.get("time", []), hourly.get("precipitation", [])))
            current_time = parse_utc_timestamp(raw["current"]["time"])
            observed_hours = [(parse_utc_timestamp(stamp), value) for stamp, value in hour_pairs
                              if isinstance(value, (int, float)) and parse_utc_timestamp(stamp) <= current_time]
            daily = raw.get("daily", {})
            daily_pairs = [(datetime.fromisoformat(stamp).date(), value) for stamp, value in zip(daily.get("time", []), daily.get("rain_sum", []))]
            completed_days = [value for day, value in daily_pairs if day < current_time.date() and isinstance(value, (int, float))]
            forecast = next((value for day, value in daily_pairs if day > current_time.date() and isinstance(value, (int, float))), None)
            if len(observed_hours) < 1 or not completed_days:
                raise ValueError("missing precipitation values")
        except (requests.RequestException, ValueError, KeyError) as exc:
            raise ProviderUnavailable(f"Open-Meteo unavailable: {exc}") from exc
        return {"location_name": location_name, "lat": lat, "lon": lon, "source": self.source,
                "fetched_at_utc": utc_now(), "observed_at_utc": current_time.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                "rainfall_1h_mm": float(observed_hours[-1][1]), "rainfall_24h_mm": float(sum(value for _, value in observed_hours[-24:])),
                "rainfall_7d_mm": float(sum(completed_days[-7:])), "forecast_rainfall_mm": forecast,
                "warning_level": None, "status": "fallback_live", "raw_metadata": raw}


class IMDProvider:
    source = "IMD"
    def configured(self) -> bool:
        return bool(IMD_API_KEY and IMD_WEATHER_URL)

    def fetch(self, location_name: str, lat: float, lon: float) -> dict[str, Any]:
        if not self.configured():
            raise ProviderUnavailable("IMD credentials or subscribed endpoint are not configured")
        try:
            response = requests.get(IMD_WEATHER_URL, params={"lat": lat, "lon": lon}, headers={IMD_API_KEY_HEADER: IMD_API_KEY}, timeout=20)
            response.raise_for_status()
            raw = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise ProviderUnavailable(f"IMD unavailable: {exc}") from exc
        # Field mappings are intentionally only accepted after a subscribed IMD endpoint's schema is confirmed.
        rain = raw.get("rainfall", raw)
        return {"location_name": location_name, "lat": lat, "lon": lon, "source": self.source, "fetched_at_utc": utc_now(),
                "observed_at_utc": raw.get("observed_at_utc"), "rainfall_1h_mm": rain.get("rainfall_1h_mm"),
                "rainfall_24h_mm": rain.get("rainfall_24h_mm"), "rainfall_7d_mm": rain.get("rainfall_7d_mm"),
                "forecast_rainfall_mm": rain.get("forecast_rainfall_mm"), "warning_level": raw.get("warning_level"),
                "status": "primary_live", "raw_metadata": raw}


def fetch_preferred_weather(location_name: str, lat: float, lon: float) -> dict[str, Any]:
    """Use IMD when configured; explicitly fall back to Open-Meteo otherwise."""
    imd = IMDProvider()
    if imd.configured():
        try:
            return imd.fetch(location_name, lat, lon)
        except ProviderUnavailable as failure:
            try:
                fallback = OpenMeteoProvider().fetch(location_name, lat, lon)
                fallback["status"] = "fallback_after_imd_failure"
                fallback["raw_metadata"] = {"provider": fallback["raw_metadata"], "imd_failure": str(failure)}
                return fallback
            except ProviderUnavailable:
                raise failure
    return OpenMeteoProvider().fetch(location_name, lat, lon)
