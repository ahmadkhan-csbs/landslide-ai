"""Small auditable local store. Raw payloads are retained as JSON text."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


class ObservationStore:
    def __init__(self, path: Path | str):
        self.path = Path(path)

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def initialise(self) -> None:
        with self.connection() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS weather_observations (
              id INTEGER PRIMARY KEY, location_name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
              source TEXT NOT NULL, fetched_at_utc TEXT NOT NULL, observed_at_utc TEXT,
              rainfall_1h_mm REAL, rainfall_24h_mm REAL, rainfall_7d_mm REAL,
              forecast_rainfall_mm REAL, warning_level TEXT, status TEXT NOT NULL,
              raw_metadata_json TEXT NOT NULL, UNIQUE(location_name, lat, lon, source, fetched_at_utc)
            );
            CREATE INDEX IF NOT EXISTS weather_latest ON weather_observations(location_name, lat, lon, fetched_at_utc DESC);
            CREATE TABLE IF NOT EXISTS landslide_events (
              event_key TEXT PRIMARY KEY, event_date TEXT, lat REAL NOT NULL, lon REAL NOT NULL,
              country TEXT, source TEXT NOT NULL, fetched_at_utc TEXT NOT NULL,
              verification_status TEXT NOT NULL, raw_metadata_json TEXT NOT NULL
            );
            """)

    def save_observation(self, record: dict[str, Any]) -> None:
        fields = ("location_name", "lat", "lon", "source", "fetched_at_utc", "observed_at_utc", "rainfall_1h_mm", "rainfall_24h_mm", "rainfall_7d_mm", "forecast_rainfall_mm", "warning_level", "status")
        values = [record.get(field) for field in fields]
        values.append(json.dumps(record.get("raw_metadata", {}), sort_keys=True, default=str))
        with self.connection() as conn:
            conn.execute(f"INSERT OR IGNORE INTO weather_observations ({','.join(fields)},raw_metadata_json) VALUES ({','.join('?' for _ in values)})", values)

    def latest(self, location_name: str, lat: float, lon: float) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute("""SELECT * FROM weather_observations WHERE location_name=? AND lat=? AND lon=?
                ORDER BY fetched_at_utc DESC LIMIT 1""", (location_name, lat, lon)).fetchone()
        if not row:
            return None
        result = dict(row)
        result["raw_metadata"] = json.loads(result.pop("raw_metadata_json"))
        return result

    def latest_all(self) -> list[dict[str, Any]]:
        """One newest observation per monitored location, for the operational health view."""
        with self.connection() as conn:
            rows = conn.execute("""
                SELECT w.* FROM weather_observations w
                JOIN (SELECT location_name, lat, lon, MAX(fetched_at_utc) newest
                      FROM weather_observations GROUP BY location_name, lat, lon) latest
                ON w.location_name=latest.location_name AND w.lat=latest.lat AND w.lon=latest.lon
                   AND w.fetched_at_utc=latest.newest
            """).fetchall()
        results = []
        for row in rows:
            record = dict(row)
            record["raw_metadata"] = json.loads(record.pop("raw_metadata_json"))
            results.append(record)
        return results

    def history(self, location_name: str, lat: float, lon: float, limit: int = 6) -> list[dict[str, Any]]:
        """Newest auditable weather records for one demonstrated location.

        Raw provider payloads deliberately stay in the local store. The public
        API can expose the measured fields and provenance without exposing a
        provider response wholesale.
        """
        with self.connection() as conn:
            rows = conn.execute("""SELECT * FROM weather_observations
                WHERE location_name=? AND lat=? AND lon=?
                ORDER BY fetched_at_utc DESC LIMIT ?""", (location_name, lat, lon, limit)).fetchall()
        results = []
        for row in rows:
            record = dict(row)
            record.pop("raw_metadata_json", None)
            results.append(record)
        return results

    def save_event(self, event: dict[str, Any]) -> bool:
        with self.connection() as conn:
            cursor = conn.execute("""INSERT OR IGNORE INTO landslide_events
              (event_key,event_date,lat,lon,country,source,fetched_at_utc,verification_status,raw_metadata_json)
              VALUES (?,?,?,?,?,?,?,?,?)""", (event["event_key"], event.get("event_date"), event["lat"], event["lon"], event.get("country"), event["source"], event["fetched_at_utc"], "unverified", json.dumps(event["raw_metadata"], sort_keys=True, default=str)))
        return cursor.rowcount == 1


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def is_fresh(record: dict[str, Any] | None, maximum_age_seconds: int = 900) -> bool:
    """Whether an observation is recent enough to be described as live."""
    if not record or not record.get("fetched_at_utc"):
        return False
    try:
        fetched = datetime.fromisoformat(str(record["fetched_at_utc"]).replace("Z", "+00:00"))
    except ValueError:
        return False
    return (datetime.now(timezone.utc) - fetched).total_seconds() <= maximum_age_seconds
