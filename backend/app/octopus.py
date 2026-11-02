"""Thin client for Octopus Energy's two APIs.

REST    https://api.octopus.energy/v1/...           HTTP Basic auth, API key as username, blank password
GraphQL https://api.octopus.energy/v1/graphql/      API key -> obtainKrakenToken -> token in Authorization header
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import get_settings
from .providers.errors import ProviderError

ACCOUNT_RE = re.compile(r"^A-[A-Z0-9]{6,10}$")
_transport: httpx.BaseTransport | None = None  # tests inject a mock transport here


class OctopusError(ProviderError):
    pass


class OctopusAuthError(OctopusError):
    status = 401


class OctopusNotFound(OctopusError):
    status = 404


class OctopusRateLimited(OctopusError):
    status = 429


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_tariff_code(code: str) -> dict[str, str]:
    """'E-1R-AGILE-FLEX-22-11-25-A' -> fuel E, register 1R, product AGILE-FLEX-22-11-25, region A."""
    parts = code.split("-")
    return {
        "fuel": "electricity" if parts[0] == "E" else "gas",
        "register_type": parts[1],
        "product_code": "-".join(parts[2:-1]),
        "region": parts[-1],
    }


class OctopusClient:
    def __init__(self, api_key: str):
        self._key = api_key
        self._base = get_settings().octopus_rest_base
        self._gql = get_settings().octopus_graphql_url
        self._http = httpx.Client(
            timeout=30, transport=_transport, headers={"User-Agent": "EnerOS/0.1"}
        )

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._http.close()

    # ---------------------------------------------------------------- REST
    def _get(self, url: str, params: dict | None = None) -> dict[str, Any]:
        try:
            r = self._http.get(url, params=params, auth=(self._key, ""))
        except httpx.HTTPError as e:
            # A network/DNS/TLS failure is a provider error (502), not a bug in this service.
            raise OctopusError(
                "Couldn't reach Octopus Energy: check this server's network and try again."
            ) from e
        if r.status_code in (401, 403):
            raise OctopusAuthError(
                "Octopus rejected these credentials, or the account number doesn't belong to this API key."
            )
        if r.status_code == 404:
            raise OctopusNotFound("Octopus couldn't find that resource.")
        if r.status_code == 429:
            raise OctopusRateLimited("Octopus rate limit hit; retry shortly.")
        if r.status_code >= 400:
            raise OctopusError(f"Octopus returned HTTP {r.status_code}.")
        try:
            return r.json()
        except ValueError as e:
            raise OctopusError(f"Octopus returned a non-JSON reply (HTTP {r.status_code}).") from e

    def _paginate(self, url: str, params: dict | None, max_pages: int = 200) -> list[dict]:
        out: list[dict] = []
        next_url: str | None = url
        for _ in range(max_pages):
            if not next_url:
                break
            data = self._get(next_url, params)
            out.extend(data.get("results", []))
            next_url, params = data.get("next"), None  # `next` already carries the query string
        return out

    def account(self, account_number: str) -> dict[str, Any]:
        return self._get(f"{self._base}/accounts/{account_number}/")

    def consumption(
        self, fuel: str, mpxn: str, serial: str, start: datetime, end: datetime,
        group_by: str | None = None,
    ) -> list[dict]:
        kind = "electricity-meter-points" if fuel == "electricity" else "gas-meter-points"
        params: dict[str, Any] = {
            "period_from": iso_utc(start), "period_to": iso_utc(end),
            "order_by": "period", "page_size": 25000,
        }
        if group_by:
            params["group_by"] = group_by
        return self._paginate(f"{self._base}/{kind}/{mpxn}/meters/{serial}/consumption/", params)

    def tariff_series(
        self, tariff_code: str, series: str, start: datetime, end: datetime
    ) -> list[dict]:
        """series: 'standard-unit-rates' | 'standing-charges' | 'day-unit-rates' | 'night-unit-rates'."""
        info = parse_tariff_code(tariff_code)
        seg = "electricity-tariffs" if info["fuel"] == "electricity" else "gas-tariffs"
        url = f"{self._base}/products/{info['product_code']}/{seg}/{tariff_code}/{series}/"
        return self._paginate(url, {"period_from": iso_utc(start), "period_to": iso_utc(end),
                                    "page_size": 25000})

    # ------------------------------------------------------------- GraphQL
    def _graphql(self, query: str, variables: dict | None = None, token: str | None = None) -> dict:
        headers = {"Authorization": token} if token else {}
        try:
            r = self._http.post(self._gql, json={"query": query, "variables": variables or {}},
                                headers=headers)
        except httpx.HTTPError as e:
            raise OctopusError(
                "Couldn't reach Octopus Energy: check this server's network and try again."
            ) from e
        if r.status_code == 429:
            raise OctopusRateLimited("Octopus rate limit hit; retry shortly.")
        try:
            body = r.json()
        except ValueError as e:
            raise OctopusError(f"Octopus GraphQL returned a non-JSON reply (HTTP {r.status_code}).") from e
        # GraphQL answers HTTP 200 even on failure: errors live in the body
        if body.get("errors"):
            msg = body["errors"][0].get("message", "GraphQL error")
            raise OctopusError(f"Octopus GraphQL error: {msg}")
        return body["data"]

    def kraken_token(self) -> str:
        data = self._graphql(
            "mutation($input: ObtainJSONWebTokenInput!){obtainKrakenToken(input:$input){token}}",
            {"input": {"APIKey": self._key}},
        )
        return data["obtainKrakenToken"]["token"]

    def live_telemetry(self, account_number: str) -> dict[str, Any]:
        """Near-real-time readings. Only works if the account has an Octopus Home Mini."""
        token = self.kraken_token()
        devices = self._graphql(
            """query($a:String!){account(accountNumber:$a){electricityAgreements(active:true){
               meterPoint{mpan meters(includeInactive:false){serialNumber smartDevices{deviceId}}}}}}""",
            {"a": account_number}, token,
        )
        ids = [
            d["deviceId"]
            for ag in devices["account"]["electricityAgreements"]
            for m in ag["meterPoint"]["meters"]
            for d in (m.get("smartDevices") or [])
        ]
        if not ids:
            return {"available": False, "reason": "No smart device (Home Mini) linked to this account."}
        t = self._graphql(
            "query($d:String!){smartMeterTelemetry(deviceId:$d){readAt demand consumption}}",
            {"d": ids[0]}, token,
        )
        return {"available": True, "device_id": ids[0], "readings": t["smartMeterTelemetry"]}
