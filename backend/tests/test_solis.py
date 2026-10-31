import base64, hashlib, hmac, os, tempfile
from email.utils import parsedate_to_datetime

os.environ.setdefault("ENCRYPTION_KEY", "p7y2Z0m3Qn9m0wq1G1qK0y8o8bq0pYH2cV8N3yq0sXc=")
os.environ.setdefault("APP_API_TOKEN", "test-token")
os.environ.setdefault("DATABASE_PATH", os.path.join(tempfile.mkdtemp(), "s.db"))

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.providers import solis

H = {"Authorization": "Bearer test-token"}
SECRET = "shhh-secret"
INVERTERS = {"success": True, "code": "0", "msg": "success", "data": {
    "page": {"total": 2, "records": [{"sn": "SN1", "state": 1}, {"sn": "SN2", "state": 2}]},
    "inverterStatusVo": {"all": 2, "normal": 1, "offline": 1}}}
DETAIL = {"SN1": {"sn": "SN1", "pac": 2.5, "pacStr": "kW", "eToday": 11.0, "eTodayStr": "kWh",
                  "eTotal": 3.2, "eTotalStr": "MWh"},
          "SN2": {"sn": "SN2", "pac": 0, "pacStr": "W", "eToday": 0, "eTodayStr": "kWh",
                  "eTotal": 900, "eTotalStr": "kWh"}}


def fake_solis(request: httpx.Request) -> httpx.Response:
    """Acts like SolisCloud: recomputes the signature from what was actually received."""
    body = request.content.decode()
    resource = request.url.path
    h = request.headers
    assert h["content-md5"] == base64.b64encode(hashlib.md5(body.encode()).digest()).decode()
    parsedate_to_datetime(h["date"])  # must be a valid HTTP date
    key_id, sig = h["authorization"].removeprefix("API ").split(":", 1)
    want = base64.b64encode(hmac.new(SECRET.encode(), f"POST\n{h['content-md5']}\n{h['content-type']}\n"
                                     f"{h['date']}\n{resource}".encode(), hashlib.sha1).digest()).decode()
    if key_id != "goodid123" or sig != want:
        return httpx.Response(403, text="wrong sign")
    import json
    b = json.loads(body)
    if resource.endswith("userStationList"):
        return httpx.Response(200, json={"success": True, "code": "0", "data": {"page": {"total": 1, "records": [{"id": "9"}]}}})
    if resource.endswith("inverterList"):
        return httpx.Response(200, json=INVERTERS)
    if resource.endswith("inverterDetail"):
        return httpx.Response(200, json={"success": True, "code": "0", "data": DETAIL[b["sn"]]})
    return httpx.Response(200, json={"success": False, "code": "B0001", "msg": "nope"})


@pytest.fixture()
def client():
    solis._transport = httpx.MockTransport(fake_solis)
    with TestClient(app) as c:
        yield c
    solis._transport = None


def connect(client, secret=SECRET, api_id="goodid123"):
    return client.post("/v1/solis/connections", headers=H, json={"api_id": api_id, "api_secret": secret})


def test_md5_matches_vendor_spec_example():
    # Worked example published with the SolisCloud spec
    assert solis.content_md5('{"pageNo":1,"pageSize":10}') == "kxdxk7rbAsrzSIWgEwhH4w=="


def test_bad_secret_is_401(client):
    r = connect(client, secret="wrong-secret")
    assert r.status_code == 401 and "signature" in r.json()["error"]


def test_connect_ok_and_secret_encrypted(client):
    r = connect(client)
    assert r.status_code == 201 and r.json()["stations_total"] == 1
    from app import db
    with db.connect() as c:
        enc = c.execute("SELECT creds_enc FROM provider_connections").fetchone()[0]
    assert SECRET not in enc and "goodid123" not in enc


def test_dashboard_units_normalised(client):
    cid = connect(client).json()["connection_id"]
    d = client.get(f"/v1/solis/connections/{cid}/dashboard", headers=H).json()
    t = d["totals"]
    assert t["current_power_kw"] == 2.5          # 2.5 kW + 0 W
    assert t["energy_today_kwh"] == 11.0
    assert t["energy_total_kwh"] == 3200 + 900   # MWh converted to kWh
    assert [i["state"] for i in d["inverters"]] == ["online", "offline"]


def test_api_error_envelope_surfaces(client):
    cid = connect(client).json()["connection_id"]
    r = client.get(f"/v1/solis/connections/{cid}/inverters/SN1/day?date=2026-10-28", headers=H)
    assert r.status_code == 502 and "B0001" in r.json()["error"]


def test_other_provider_cannot_load_connection(client):
    cid = connect(client).json()["connection_id"]
    from app.providers import store
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        store.load(cid, "myenergi")


def test_pause_gates_solis(client):
    r = client.post("/v1/solis/connections", headers=H, json={"api_id": "goodid123", "api_secret": SECRET, "home_id": "sol-home"})
    cid = r.json()["connection_id"]
    assert client.get(f"/v1/solis/connections/{cid}/dashboard", headers=H).status_code == 200
    client.put("/v1/homes/sol-home/settings/pause", headers=H, json={"home_connections": False})
    assert client.get(f"/v1/solis/connections/{cid}/dashboard", headers=H).status_code == 423
    assert client.delete(f"/v1/solis/connections/{cid}", headers=H).status_code == 204
