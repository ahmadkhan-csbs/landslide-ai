"""Configuration without a dependency on a dotenv package."""
from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]


def load_dotenv(path: Path | None = None) -> None:
    """Load simple KEY=VALUE lines, without replacing process environment."""
    dotenv = path or ROOT_DIR / ".env"
    if not dotenv.exists():
        return
    for line in dotenv.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()
DATABASE_PATH = Path(os.getenv("LANDSLIDE_DB_PATH", str(ROOT_DIR / "data" / "weather_observations.sqlite3")))
IMD_API_KEY = os.getenv("IMD_API_KEY", "").strip()
IMD_WEATHER_URL = os.getenv("IMD_WEATHER_URL", "").strip()
IMD_API_KEY_HEADER = os.getenv("IMD_API_KEY_HEADER", "X-API-Key").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
ADMIN_SESSION_SECRET = os.getenv("ADMIN_SESSION_SECRET", "")
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
FAST2SMS_API_KEY = os.getenv("FAST2SMS_API_KEY", "").strip()
