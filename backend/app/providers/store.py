"""Generic credential store shared by every provider (Solis, myenergi, Ohme ...).
Credentials are a small dict, encrypted as one JSON blob."""
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from .. import db
from ..crypto import decrypt, encrypt


def save(provider: str, creds: dict, home_id: str | None = None) -> str:
    cid = str(uuid.uuid4())
    with db.connect() as c:
        c.execute("INSERT INTO provider_connections (id, provider, home_id, creds_enc, created_at) VALUES (?,?,?,?,?)",
                  (cid, provider, home_id, encrypt(json.dumps(creds)), datetime.now(timezone.utc).isoformat()))
    return cid


def load(connection_id: str, provider: str) -> dict:
    with db.connect() as c:
        row = c.execute("SELECT creds_enc FROM provider_connections WHERE id=? AND provider=?",
                        (connection_id, provider)).fetchone()
    if not row:
        raise HTTPException(404, "Unknown connection.")
    return json.loads(decrypt(row["creds_enc"]))


def delete(connection_id: str, provider: str) -> None:
    with db.connect() as c:
        c.execute("DELETE FROM provider_connections WHERE id=? AND provider=?", (connection_id, provider))
