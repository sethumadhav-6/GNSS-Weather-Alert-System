from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)

DATA_DIR = Path(os.environ.get("GPS_APP_DATA_DIR", Path(app.instance_path) / "data"))
LOCATION_LOG_PATH = DATA_DIR / "location_access_log.jsonl"

LIGHT_SPEED_M_PER_NS = 0.299792458


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def fetch_open_meteo(latitude: float, longitude: float) -> dict:
    params = urllib.parse.urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,relative_humidity_2m,precipitation,pressure_msl,weather_code",
            "timezone": "auto",
        }
    )
    url = f"https://api.open-meteo.com/v1/forecast?{params}"
    try:
        with urllib.request.urlopen(url, timeout=6) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {}


def weather_code_label(code: int | None) -> str:
    labels = {
        0: "Clear",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        71: "Slight snow",
        80: "Rain showers",
        95: "Thunderstorm",
    }
    return labels.get(code, "Unknown")


def normalize_weather(raw: dict, latitude: float) -> dict:
    current = raw.get("current") or {}
    if not current:
        hour = datetime.now(timezone.utc).hour
        seasonal_temp = 28 - 10 * abs(latitude) / 90
        humidity = 58 + 16 * math.sin(hour / 24 * math.tau)
        return {
            "source": "modeled fallback",
            "temperature_c": round(seasonal_temp, 1),
            "humidity_percent": round(clamp(humidity, 20, 95), 1),
            "pressure_hpa": 1011.5,
            "precipitation_mm": 0,
            "condition": "Modeled clear",
            "weather_code": None,
        }

    code = current.get("weather_code")
    return {
        "source": "Open-Meteo",
        "temperature_c": current.get("temperature_2m", 25),
        "humidity_percent": current.get("relative_humidity_2m", 50),
        "pressure_hpa": current.get("pressure_msl", 1013.25),
        "precipitation_mm": current.get("precipitation", 0),
        "condition": weather_code_label(code),
        "weather_code": code,
    }


def saturation_vapor_pressure_hpa(temp_c: float) -> float:
    return 6.112 * math.exp((17.67 * temp_c) / (temp_c + 243.5))


def analyze_atmosphere(payload: dict) -> dict:
    lat = float(payload.get("latitude"))
    lon = float(payload.get("longitude"))
    browser_accuracy = float(payload.get("accuracy_m") or 50)
    altitude_m = float(payload.get("altitude_m") or 0)
    weather = payload.get("weather") or normalize_weather({}, lat)

    temp_c = float(weather.get("temperature_c") or 25)
    temp_k = temp_c + 273.15
    humidity = float(weather.get("humidity_percent") or 50)
    pressure = float(weather.get("pressure_hpa") or 1013.25)
    precipitation = float(weather.get("precipitation_mm") or 0)

    e = humidity / 100 * saturation_vapor_pressure_hpa(temp_c)
    lat_rad = math.radians(lat)
    hydrostatic_m = 0.0022768 * pressure / (
        1 - 0.00266 * math.cos(2 * lat_rad) - 0.00028 * altitude_m / 1000
    )
    wet_m = 0.002277 * (1255 / temp_k + 0.05) * e
    tropo_ns = (hydrostatic_m + wet_m) / LIGHT_SPEED_M_PER_NS

    iono_ns = clamp(8 + abs(lat) / 9 + max(0, 18 - datetime.now().hour) * 0.15, 6, 28)
    water_vapor_mm = clamp(e * 2.1, 0, 70)
    precip_probability = clamp(precipitation * 42 + humidity - 45, 0, 100)

    estimated_signal = clamp(
        96 - browser_accuracy * 0.35 - precip_probability * 0.18 - wet_m * 4,
        20,
        99,
    )
    if estimated_signal >= 80:
        quality = "Good"
    elif estimated_signal >= 55:
        quality = "Moderate"
    else:
        quality = "Weak"

    satellites = []
    constellations = ["GPS", "Galileo", "GLONASS", "BeiDou"]
    visible_count = int(clamp(10 + estimated_signal / 15, 8, 18))
    for index in range(visible_count):
        constellation = constellations[index % len(constellations)]
        prn = (index * 7 + int(abs(lon))) % 32 + 1
        satellites.append(
            {
                "name": f"{constellation}-{prn:02d}",
                "strength": round(clamp(estimated_signal - (index % 5) * 5 + 4, 15, 99), 1),
            }
        )

    return {
        "location": {
            "latitude": lat,
            "longitude": lon,
            "accuracy_m": browser_accuracy,
            "altitude_m": altitude_m,
        },
        "weather": weather,
        "analysis": {
            "tropospheric_delay_ns": round(tropo_ns, 2),
            "ionospheric_delay_ns": round(iono_ns, 2),
            "water_vapor_mm": round(water_vapor_mm, 2),
            "precipitation_probability": round(precip_probability, 1),
            "signal_quality": quality,
            "estimated_signal": round(estimated_signal, 1),
            "satellites": satellites,
        },
        "note": "Browser geolocation is live; satellite/SNR values are estimates because browsers do not expose raw GNSS measurements.",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

def save_location_access(payload: dict, result: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "stored_at": datetime.now(timezone.utc).isoformat(),
        "client_ip": request.headers.get("X-Forwarded-For", request.remote_addr),
        "user_agent": request.headers.get("User-Agent", ""),
        "location": result.get("location", {}),
        "weather": result.get("weather", {}),
        "analysis": {
            "signal_quality": result.get("analysis", {}).get("signal_quality"),
            "estimated_signal": result.get("analysis", {}).get("estimated_signal"),
            "precipitation_probability": result.get("analysis", {}).get("precipitation_probability"),
        },
        "source": payload.get("source", "browser-geolocation"),
    }
    with LOCATION_LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=True) + "\n")

@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/weather")
def weather():
    lat = float(request.args["lat"])
    lon = float(request.args["lon"])
    return jsonify(normalize_weather(fetch_open_meteo(lat, lon), lat))


@app.post("/api/analyze")
def analyze():
    payload = request.get_json(force=True)
    result = analyze_atmosphere(payload)
    save_location_access(payload, result)
    result["storage"] = {"status": "stored", "path": str(LOCATION_LOG_PATH)}
    return jsonify(result)


@app.get("/api/location-access-points")
def location_access_points():
    limit = int(request.args.get("limit", 50))
    if not LOCATION_LOG_PATH.exists():
        return jsonify({"points": []})
    with LOCATION_LOG_PATH.open("r", encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    return jsonify({"points": rows[-max(1, min(limit, 500)):], "count": len(rows)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")


