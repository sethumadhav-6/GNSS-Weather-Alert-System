# GNSS Atmospheric Weather Detection

Python-backed live version of the GPS accuracy discussion.

## What Works Live

- Browser requests real device location with `enableHighAccuracy`.
- Flask backend fetches current weather from Open-Meteo when internet is available.
- Backend calculates simplified tropospheric delay, ionospheric estimate, water vapor estimate, precipitation probability, and signal quality.
- Frontend updates continuously with `watchPosition`.

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

Browser geolocation works on `localhost`. If you test from another phone on the same Wi-Fi using your PC IP address, use HTTPS or deploy to Render.

## Deploy On Render

1. Push this folder to a GitHub repository.
2. In Render, create a new Web Service.
3. Use:

```text
Build command: pip install -r requirements.txt
Start command: gunicorn app:app
```

The included `render.yaml` can also be used as a blueprint.
