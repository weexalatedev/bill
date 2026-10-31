"""Pause switch enforcement. If a home has Home connections or Device sync paused, calls that pull
provider data answer 423 Locked, so the client app can show 'Paused' instead of silently polling."""
import json

from fastapi import HTTPException, Request

from . import db


def require_sync_active(request: Request, connection_id: str | None = None) -> None:
    if request.method == "DELETE" or not connection_id:
        return
    with db.connect() as c:
        row = c.execute("SELECT home_id FROM connections WHERE id=? UNION ALL "
                        "SELECT home_id FROM provider_connections WHERE id=?", (connection_id, connection_id)).fetchone()
        if not row or not row["home_id"]:
            return
        s = c.execute("SELECT data FROM home_settings WHERE home_id=? AND section='pause'", (row["home_id"],)).fetchone()
    pause = json.loads(s["data"]) if s else {}
    if not (pause.get("home_connections", True) and pause.get("device_sync", True)):
        raise HTTPException(423, "Connections are paused for this home.")
