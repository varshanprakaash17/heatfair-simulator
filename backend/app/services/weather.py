"""Open-Meteo integration: live modelled conditions and hourly forecasts.

This service is deliberately transparent about provenance:

* ``retrieved_at`` is the UTC instant HeatFair called the provider.
* ``source_timestamp`` is the provider's own timestamp for the current block.
* ``weather_type`` is always ``forecast`` — Open-Meteo returns **modelled**
  grid-cell conditions and forecasts, not direct on-site sensor measurements.
* ``missing_variables`` lists any requested variable the provider omitted; the
  caller decides how to handle it. No values are ever fabricated here.

If the provider is unreachable this raises ``WeatherServiceError``. Callers must
surface the error rather than substituting sample conditions.
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from ..config import get_settings

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

CURRENT_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "shortwave_radiation",
]

HOURLY_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "wind_speed_10m",
    "wind_gusts_10m",
    "shortwave_radiation",
    "cloud_cover",
    "precipitation",
    "weather_code",
]

WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}

_cache: dict[str, tuple[float, dict]] = {}


class WeatherServiceError(RuntimeError):
    """Provider or payload failure that must be shown to the user."""


def _cache_get(key: str, ttl: int) -> tuple[dict, float] | None:
    hit = _cache.get(key)
    if not hit:
        return None
    stamp, payload = hit
    age = time.time() - stamp
    if age > ttl:
        _cache.pop(key, None)
        return None
    return payload, age


def clear_cache() -> None:
    _cache.clear()


def _http_get(url: str, params: dict) -> dict:
    settings = get_settings()
    try:
        response = httpx.get(url, params=params, timeout=settings.open_meteo_timeout_seconds)
        response.raise_for_status()
        data = response.json()
    except httpx.TimeoutException as exc:
        raise WeatherServiceError(
            "The Open-Meteo request timed out. Check the network connection and retry."
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise WeatherServiceError(
            f"Open-Meteo returned HTTP {exc.response.status_code}. The service may be rate limiting or temporarily unavailable."
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherServiceError(f"Open-Meteo could not be reached: {exc}") from exc
    if not isinstance(data, dict):
        raise WeatherServiceError("Open-Meteo returned an unexpected payload.")
    return data


def geocode(query: str, count: int = 6) -> list[dict]:
    """Resolve a place name to candidate coordinates via Open-Meteo geocoding."""
    settings = get_settings()
    q = (query or "").strip()
    if len(q) < 2:
        raise ValueError("Search query must be at least 2 characters")
    key = f"geo:{q.lower()}:{count}"
    cached = _cache_get(key, 86_400)
    if cached:
        return cached[0]["results"]

    data = _http_get(
        GEOCODE_URL,
        {"name": q, "count": count, "language": "en", "format": "json"},
    )
    results = []
    for record in data.get("results") or []:
        results.append(
            {
                "id": record.get("id"),
                "name": record.get("name"),
                "country": record.get("country"),
                "country_code": record.get("country_code"),
                "admin1": record.get("admin1"),
                "admin2": record.get("admin2"),
                "timezone": record.get("timezone"),
                "latitude": record.get("latitude"),
                "longitude": record.get("longitude"),
                "elevation": record.get("elevation"),
                "label": ", ".join(
                    part
                    for part in [
                        record.get("name"),
                        record.get("admin1"),
                        record.get("country"),
                    ]
                    if part
                ),
            }
        )
    _cache[key] = (time.time(), {"results": results})
    return results


def _iso_local(offset_seconds: int | None) -> datetime:
    offset = timedelta(seconds=offset_seconds or 0)
    return datetime.now(timezone.utc).astimezone(timezone(offset))


def _num(block: dict, key: str) -> float | None:
    value = block.get(key)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_weather(
    latitude: float,
    longitude: float,
    location_name: str | None = None,
    force: bool = False,
) -> dict:
    """Fetch current + hourly modelled weather for a coordinate.

    The response includes every requested variable and an explicit list of any
    that were absent. Results are cached for ``weather_cache_seconds`` to avoid
    hammering the upstream API during auto-refresh.
    """
    settings = get_settings()
    key = f"weather:{latitude:.3f}:{longitude:.3f}"
    cached = None if force else _cache_get(key, settings.weather_cache_seconds)
    if cached:
        payload, age = cached
        out = dict(payload)
        out["cached"] = True
        out["cache_age_seconds"] = round(age, 1)
        if location_name:
            out["location"] = {**out["location"], "name": location_name}
        return out

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(CURRENT_VARIABLES),
        "hourly": ",".join(HOURLY_VARIABLES),
        "timezone": "auto",
        "forecast_days": 4,
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    data = _http_get(FORECAST_URL, params)

    current_block = data.get("current") or {}
    hourly_block = data.get("hourly") or {}
    times: list[str] = hourly_block.get("time") or []

    current = {
        "time": current_block.get("time"),
        "temperature": _num(current_block, "temperature_2m"),
        "humidity": _num(current_block, "relative_humidity_2m"),
        "apparent_temperature": _num(current_block, "apparent_temperature"),
        "is_day": current_block.get("is_day"),
        "precipitation": _num(current_block, "precipitation"),
        "weather_code": current_block.get("weather_code"),
        "weather_condition": WEATHER_CODES.get(
            current_block.get("weather_code"), "Unknown condition"
        ),
        "cloud_cover": _num(current_block, "cloud_cover"),
        "wind_speed": _num(current_block, "wind_speed_10m"),
        "wind_direction": _num(current_block, "wind_direction_10m"),
        "wind_gusts": _num(current_block, "wind_gusts_10m"),
        "shortwave_radiation": _num(current_block, "shortwave_radiation"),
    }

    hourly: list[dict] = []
    for index, stamp in enumerate(times):
        def series(name: str):
            values = hourly_block.get(name) or []
            return values[index] if index < len(values) else None

        try:
            parsed = datetime.fromisoformat(stamp)
        except (TypeError, ValueError):
            continue
        hourly.append(
            {
                "index": index,
                "time": stamp,
                "date": parsed.date().isoformat(),
                "hour": parsed.hour,
                "temperature": _float(series("temperature_2m")),
                "humidity": _float(series("relative_humidity_2m")),
                "apparent_temperature": _float(series("apparent_temperature")),
                "wind_speed": _float(series("wind_speed_10m")),
                "wind_gusts": _float(series("wind_gusts_10m")),
                "shortwave_radiation": _float(series("shortwave_radiation")),
                "cloud_cover": _float(series("cloud_cover")),
                "precipitation": _float(series("precipitation")),
                "weather_code": series("weather_code"),
                "weather_condition": WEATHER_CODES.get(series("weather_code"), "Unknown condition"),
            }
        )

    missing = []
    for name in CURRENT_VARIABLES:
        if current_block.get(name) is None:
            missing.append(f"current.{name}")
    for name in HOURLY_VARIABLES:
        values = hourly_block.get(name)
        if not values or all(v is None for v in values):
            missing.append(f"hourly.{name}")

    units = data.get("current_units") or data.get("hourly_units") or {}
    location = {
        "name": location_name or "Selected location",
        "latitude": data.get("latitude", latitude),
        "longitude": data.get("longitude", longitude),
        "timezone": data.get("timezone"),
        "timezone_abbreviation": data.get("timezone_abbreviation"),
        "utc_offset_seconds": data.get("utc_offset_seconds"),
        "elevation": data.get("elevation"),
    }
    payload = {
        "source": "open-meteo",
        "provider": "Open-Meteo Forecast API",
        "api_url": FORECAST_URL,
        "weather_type": "forecast",
        "data_note": (
            "Modelled current conditions and hourly forecast for the provider's grid cell. "
            "This is not a direct on-site sensor measurement and future hours are forecasts, "
            "not observations."
        ),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "source_timestamp": current.get("time"),
        "cached": False,
        "cache_age_seconds": 0,
        "location": location,
        "current": current,
        "hourly": hourly,
        "units": {
            "temperature": "°C",
            "apparent_temperature": "°C",
            "relative_humidity": "%",
            "wind_speed": "km/h",
            "wind_gusts": "km/h",
            "wind_direction": "°",
            "shortwave_radiation": "W/m²",
            "cloud_cover": "%",
            "precipitation": "mm",
        },
        "missing_variables": missing,
        "requested_variables": {
            "current": CURRENT_VARIABLES,
            "hourly": HOURLY_VARIABLES,
        },
    }
    _cache[key] = (time.time(), payload)
    return payload


def _float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def choose_shift_date(weather: dict, start_hour: int, end_hour: int) -> str:
    """Pick the first local date whose shift window has not already finished.

    A shift that is currently in progress keeps today's date. A shift that has
    already ended moves to tomorrow so the comparison uses forecast hours rather
    than retrospective conditions.
    """
    offset = weather.get("location", {}).get("utc_offset_seconds")
    now_local = _iso_local(offset)
    dates = sorted({row["date"] for row in weather.get("hourly", []) if row.get("date")})
    if not dates:
        raise WeatherServiceError("The weather provider returned no hourly timestamps.")

    today = now_local.date().isoformat()
    if today in dates:
        if now_local.hour < end_hour:
            return today
        return dates[dates.index(today) + 1] if today != dates[-1] else dates[-1]
    return dates[0]


def extract_shift(
    weather: dict,
    start_hour: int = 6,
    end_hour: int = 14,
    shift_date: str | None = None,
) -> dict:
    """Extract the hourly conditions covering ``[start_hour, end_hour)``."""
    if not (0 <= start_hour <= 23):
        raise ValueError("Work start hour must be between 0 and 23")
    if not (1 <= end_hour <= 24):
        raise ValueError("Work end hour must be between 1 and 24")
    if end_hour <= start_hour:
        raise ValueError("Work end hour must be later than work start hour")

    target = shift_date or choose_shift_date(weather, start_hour, end_hour)
    rows = [
        row
        for row in weather.get("hourly", [])
        if row.get("date") == target and start_hour <= row.get("hour", -1) < end_hour
    ]
    if len(rows) < (end_hour - start_hour):
        # Some providers omit an hour at the end of the forecast horizon; try
        # the next available day rather than inventing rows.
        dates = sorted(
            {
                row["date"]
                for row in weather.get("hourly", [])
                if start_hour <= row.get("hour", -1) < end_hour
            }
        )
        for candidate in dates:
            candidate_rows = [
                row for row in weather["hourly"] if row["date"] == candidate and start_hour <= row["hour"] < end_hour
            ]
            if len(candidate_rows) == (end_hour - start_hour):
                target = candidate
                rows = candidate_rows
                break

    if not rows:
        raise WeatherServiceError(
            "No hourly weather rows were available for the selected work hours."
        )

    temps = [r["temperature"] for r in rows if r.get("temperature") is not None]
    humidity = [r["humidity"] for r in rows if r.get("humidity") is not None]
    return {
        "date": target,
        "start_hour": start_hour,
        "end_hour": end_hour,
        "hours": len(rows),
        "rows": rows,
        "conditions": [
            {
                "hour": row["hour"],
                "temperature": row["temperature"],
                "humidity": row["humidity"],
                "apparent_temperature": row.get("apparent_temperature"),
                "solar_radiation": row.get("shortwave_radiation"),
                "wind_speed": row.get("wind_speed"),
                "weather_code": row.get("weather_code"),
            }
            for row in rows
        ],
        "mean_temperature": round(sum(temps) / len(temps), 2) if temps else None,
        "mean_humidity": round(sum(humidity) / len(humidity), 1) if humidity else None,
        "weather_type": "forecast",
    }


def forecast_for_shift(
    latitude: float,
    longitude: float,
    start_hour: int = 6,
    end_hour: int = 14,
    location_name: str | None = None,
    force: bool = False,
) -> dict:
    """Combined payload: full weather plus the extracted shift window."""
    weather = fetch_weather(latitude, longitude, location_name, force=force)
    shift = extract_shift(weather, start_hour, end_hour)
    return {**weather, "shift": shift}


def legacy_hourly_rows(weather: dict) -> list[dict]:
    """Backwards-compatible 24-row shape used by the climate scenario editor."""
    rows = []
    for row in weather.get("hourly", []):
        if row.get("date") != choose_shift_date(weather, 0, 23):
            continue
        rows.append(
            {
                "hour": row["hour"],
                "time": row["time"],
                "temperature": row.get("temperature"),
                "humidity": row.get("humidity"),
                "apparent_temperature": row.get("apparent_temperature"),
                "solar_radiation": row.get("shortwave_radiation"),
            }
        )
    return rows[:24]
