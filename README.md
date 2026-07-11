# GNSS Atmospheric Weather Detection

Python-backed live GPS accuracy prototype for Canopy Geospatial Solutions.

## Branding

- Company name shown in the app: Canopy Geospatial Solutions.
- Logo asset: `static/cgs.png`.
- Footer text: Maintained and owned by Canopy Geospatial Solutions.
- The `i` information button explains the prototype, location access, and backend storage behavior.

## What Works Live

- Browser requests real device location with `enableHighAccuracy`.
- Flask backend fetches current weather from Open-Meteo when internet is available.
- Backend calculates simplified tropospheric delay, ionospheric estimate, water vapor estimate, precipitation probability, and signal quality.
- Frontend updates continuously with `watchPosition`.
- Each analyzed browser location is stored on the backend for later expansion and review.

## Backend Location Storage

Location access points are appended to:

```text
instance/data/location_access_log.jsonl
```

Each JSONL row includes timestamp, client IP, user agent, latitude, longitude, browser accuracy, altitude, weather context, signal quality estimate, and precipitation probability.

Retrieve recent stored points with:

```text
GET /api/location-access-points
GET /api/location-access-points?limit=100
```

You can change the storage directory with:

```text
GPS_APP_DATA_DIR=/path/to/data
```

## Important Limitation

Chrome, Firefox, Safari, and mobile browsers do not expose raw GNSS satellite measurements such as PRN, SNR/CN0, pseudorange, carrier phase, ionospheric delay, or tropospheric delay. The app therefore uses live browser location plus modeled atmospheric estimates. For true GNSS research, connect a receiver that exports raw measurements through a native service or uploaded RINEX/NMEA data.

## Run Locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open:

```text
http://localhost:5000
```

Browser geolocation works on `localhost` and `127.0.0.1`.

## Network Or Mobile Testing

Browsers do not normally allow GPS/location prompts on plain `http://YOUR-PC-IP:5000`. Use one of these options:

- Open the app on the same computer with `http://127.0.0.1:5000/`.
- Use HTTPS for phone/network testing, for example Render, ngrok, Cloudflare Tunnel, or another HTTPS reverse proxy.
- For temporary desktop Chrome testing only, add `http://YOUR-PC-IP:5000` in `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, then restart Chrome.
- If browser GPS is blocked, use the manual latitude/longitude fallback in the app.

## Deploy On Render

1. Push this folder to a GitHub repository.
2. In Render, create a new Web Service.
3. Use:

```text
Build command: pip install -r requirements.txt
Start command: gunicorn app:app
```

The included `render.yaml` can also be used as a blueprint.

