from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..services import weather as weather_service

router = APIRouter(prefix="/weather", tags=["weather"])


def _fail(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(
        status_code=502,
        detail=(
            f"{exc} HeatFair does not substitute synthetic weather readings: retry the provider "
            "or run against a saved scenario."
        ),
    )


@router.get("/geocode")
def geocode(
    query: str = Query(..., min_length=2, max_length=120, description="City or place name"),
    count: int = Query(6, ge=1, le=20),
):
    """Resolve a location name through the Open-Meteo geocoding API."""
    try:
        results = weather_service.geocode(query, count=count)
    except Exception as exc:  # noqa: BLE001 - converted to a clear HTTP error
        raise _fail(exc) from exc
    return {"query": query, "source": "open-meteo-geocoding", "results": results}


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=120)):
    """Backwards-compatible alias for /geocode."""
    return geocode(q)


@router.get("/current")
def current(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    name: str | None = Query(None, max_length=240),
    force: bool = Query(False, description="Bypass the 15-minute provider cache"),
):
    """Modelled current conditions for the provider grid cell (not a sensor)."""
    try:
        weather = weather_service.fetch_weather(latitude, longitude, name, force=force)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc
    return {
        **weather,
        "hourly": weather.get("hourly", []),
    }


@router.get("/hourly")
def hourly(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    start_hour: int = Query(6, ge=0, le=23),
    end_hour: int = Query(14, ge=1, le=24),
    name: str | None = Query(None, max_length=240),
    date: str | None = Query(None, description="YYYY-MM-DD; defaults to the next suitable day"),
):
    """Hourly modelled forecast values, plus the selected work window."""
    if end_hour <= start_hour:
        raise HTTPException(status_code=422, detail="end_hour must be later than start_hour")
    try:
        weather = weather_service.fetch_weather(latitude, longitude, name)
        shift = weather_service.extract_shift(weather, start_hour, end_hour, date)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc
    return {**weather, "shift": shift}


@router.get("/forecast")
def forecast(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    start_hour: int = Query(6, ge=0, le=23),
    end_hour: int = Query(14, ge=1, le=24),
    name: str | None = Query(None, max_length=240),
    date: str | None = Query(None),
    force: bool = Query(False),
):
    """Full weather payload plus the forecast hours covering the selected shift."""
    if end_hour <= start_hour:
        raise HTTPException(status_code=422, detail="end_hour must be later than start_hour")
    try:
        weather = weather_service.fetch_weather(latitude, longitude, name, force=force)
        shift = weather_service.extract_shift(weather, start_hour, end_hour, date)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc
    return {**weather, "shift": shift}


@router.get("")
def legacy_weather(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    name: str | None = Query(None, max_length=240),
):
    """Legacy shape used by the climate scenario editor.

    Returns the full payload plus a 24-row ``hourly`` view for the next
    suitable local day. Provenance fields are unchanged.
    """
    try:
        weather = weather_service.fetch_weather(latitude, longitude, name)
    except Exception as exc:  # noqa: BLE001
        raise _fail(exc) from exc
    return {
        **weather,
        "hourly": weather_service.legacy_hourly_rows(weather),
        "fetched_at": weather.get("retrieved_at"),
    }
