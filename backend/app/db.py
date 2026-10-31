import sqlite3
from contextlib import contextmanager

from .config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    home_id TEXT,
    account_number TEXT NOT NULL,
    api_key_enc TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_sync_at TEXT
);
CREATE TABLE IF NOT EXISTS provider_connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    home_id TEXT,
    creds_enc TEXT NOT NULL,        -- encrypted JSON of that provider's credentials
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS home_settings (
    home_id TEXT NOT NULL,
    section TEXT NOT NULL,          -- hardware | rate_plan | pause
    data TEXT NOT NULL,             -- JSON
    updated_at TEXT NOT NULL,
    PRIMARY KEY (home_id, section)
);
CREATE TABLE IF NOT EXISTS geo_cache (
    query TEXT PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS readings (
    connection_id TEXT NOT NULL,
    fuel TEXT NOT NULL,
    mpxn TEXT NOT NULL,
    serial TEXT NOT NULL,
    interval_start TEXT NOT NULL,   -- UTC ISO
    interval_end TEXT NOT NULL,
    consumption REAL NOT NULL,      -- kWh (electricity) / kWh or m3 (gas, see README)
    PRIMARY KEY (connection_id, mpxn, serial, interval_start)
);
"""


@contextmanager
def connect():
    conn = sqlite3.connect(get_settings().database_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as c:
        c.executescript(SCHEMA)
