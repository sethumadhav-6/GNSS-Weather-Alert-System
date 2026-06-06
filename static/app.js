let watchId = null;
let lastWeather = null;
let lastAnalysis = null;

const $ = (id) => document.getElementById(id);

function setStatus(message, good = true) {
  $("connection-status").textContent = message;
  $("connection-status").style.borderColor = good ? "rgba(33, 193, 122, 0.35)" : "rgba(255, 107, 107, 0.45)";
}

function fmt(value, suffix = "", digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${Number(value).toFixed(digits)}${suffix}`;
}

async function getWeather(latitude, longitude) {
  const params = new URLSearchParams({ lat: latitude, lon: longitude });
  const response = await fetch(`/api/weather?${params}`);
  if (!response.ok) throw new Error("Weather request failed");
  return response.json();
}

async function analyzePosition(position, overrideWeather = null) {
  const { latitude, longitude, accuracy, altitude } = position.coords;
  $("gps-status").textContent = "Live location received";
  $("location-info").textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  $("gps-accuracy").textContent = fmt(accuracy, " m", 1);
  $("current-time").textContent = new Date(position.timestamp || Date.now()).toLocaleTimeString();

  try {
    lastWeather = overrideWeather || await getWeather(latitude, longitude);
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude,
        longitude,
        accuracy_m: accuracy,
        altitude_m: altitude || 0,
        weather: lastWeather,
      }),
    });
    if (!response.ok) throw new Error("Analysis request failed");
    lastAnalysis = await response.json();
    renderAnalysis(lastAnalysis);
    setStatus(`Live - ${lastAnalysis.weather.source}`);
  } catch (error) {
    setStatus(error.message, false);
  }
}

function renderAnalysis(data) {
  const analysis = data.analysis;
  const weather = data.weather;
  $("tropo-delay").textContent = fmt(analysis.tropospheric_delay_ns, " ns", 2);
  $("iono-delay").textContent = fmt(analysis.ionospheric_delay_ns, " ns", 2);
  $("water-vapor").textContent = fmt(analysis.water_vapor_mm, " mm", 2);
  $("signal-quality").textContent = `${analysis.signal_quality} (${fmt(analysis.estimated_signal, "%", 1)})`;
  $("precip-prob").textContent = fmt(analysis.precipitation_probability, "%", 1);
  $("pressure").textContent = fmt(weather.pressure_hpa, " hPa", 1);
  $("humidity").textContent = fmt(weather.humidity_percent, "%", 1);
  $("weather-condition").textContent = weather.condition;
  $("sat-count").textContent = `${analysis.satellites.length} estimated satellites`;

  const grid = $("satellite-grid");
  grid.innerHTML = "";
  analysis.satellites.forEach((sat) => {
    const card = document.createElement("div");
    card.className = "satellite";
    card.innerHTML = `<strong>${sat.name}</strong><div>${fmt(sat.strength, "%", 1)}</div><div class="bar" style="--value:${sat.strength}%"><span></span></div>`;
    grid.appendChild(card);
  });

  updateNetwork(data);
  updateAlerts(analysis);
  updateVisualization(analysis.precipitation_probability, weather.condition);
}

function updateNetwork(data) {
  const accuracy = data.location.accuracy_m;
  const nodes = accuracy < 20 ? 4 : accuracy < 50 ? 2 : 1;
  $("network-nodes").textContent = String(nodes);
  $("coverage-radius").textContent = fmt(Math.max(1.5, accuracy / 12), " km", 1);
  $("data-accuracy").textContent = fmt(Math.max(2.0, accuracy * 1000), " mm", 0);
  $("network-latency").textContent = fmt(35 + nodes * 8, " ms", 0);
}

function updateAlerts(analysis) {
  const alerts = $("weather-alerts");
  alerts.innerHTML = "";
  if (analysis.precipitation_probability > 65) {
    alerts.innerHTML += `<div class="alert">High precipitation probability may degrade positioning quality.</div>`;
  }
  if (analysis.signal_quality === "Weak") {
    alerts.innerHTML += `<div class="alert">Weak estimated signal quality. Move outdoors or near a window.</div>`;
  }
}

function updateVisualization(probability, condition) {
  const viz = $("weather-viz");
  viz.querySelectorAll(".cloud,.rain").forEach((node) => node.remove());
  $("visualization-content").textContent = `${condition}. Estimated precipitation probability: ${fmt(probability, "%", 1)}.`;

  if (probability > 25) {
    for (let i = 0; i < 4; i += 1) {
      const cloud = document.createElement("div");
      cloud.className = "cloud";
      cloud.style.top = `${55 + i * 26}px`;
      cloud.style.animationDelay = `${i * -3}s`;
      viz.appendChild(cloud);
    }
  }
  if (probability > 55) {
    for (let i = 0; i < 32; i += 1) {
      const rain = document.createElement("div");
      rain.className = "rain";
      rain.style.left = `${Math.random() * 100}%`;
      rain.style.animationDelay = `${Math.random()}s`;
      viz.appendChild(rain);
    }
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    $("gps-status").textContent = "Geolocation is not supported in this browser";
    return;
  }
  $("gps-status").textContent = "Requesting permission...";
  navigator.geolocation.getCurrentPosition(analyzePosition, handleLocationError, {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 0,
  });
}

function startMonitoring() {
  if (!navigator.geolocation) {
    $("gps-status").textContent = "Geolocation is not supported in this browser";
    return;
  }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  $("gps-status").textContent = "Monitoring...";
  watchId = navigator.geolocation.watchPosition(analyzePosition, handleLocationError, {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 5000,
  });
}

function handleLocationError(error) {
  const messages = {
    1: "Location permission denied. Allow location access for this site.",
    2: "Location unavailable. Try moving outdoors or near a window.",
    3: "Location request timed out. Try again.",
  };
  $("gps-status").textContent = messages[error.code] || "Location failed";
  setStatus("Location unavailable", false);
}

function simulateWeatherEvent() {
  if (!lastAnalysis) {
    $("weather-alerts").innerHTML = `<div class="alert">Start location monitoring first, then simulate weather.</div>`;
    return;
  }
  const syntheticPosition = {
    coords: {
      latitude: lastAnalysis.location.latitude,
      longitude: lastAnalysis.location.longitude,
      accuracy: lastAnalysis.location.accuracy_m + 15,
      altitude: lastAnalysis.location.altitude_m,
    },
    timestamp: Date.now(),
  };
  const weather = {
    ...lastWeather,
    humidity_percent: 92,
    precipitation_mm: 2.4,
    condition: "Simulated heavy rain",
    source: "simulation",
  };
  analyzePosition(syntheticPosition, weather);
}

function resetSystem() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  lastWeather = null;
  lastAnalysis = null;
  $("gps-status").textContent = "Waiting for permission";
  $("location-info").textContent = "Not available";
  $("gps-accuracy").textContent = "--";
  $("sat-count").textContent = "0 estimated satellites";
  $("satellite-grid").innerHTML = "";
  $("weather-alerts").innerHTML = "";
  $("visualization-content").textContent = "Start monitoring to view live atmospheric estimates.";
  ["tropo-delay", "iono-delay", "water-vapor", "precip-prob", "pressure", "humidity", "weather-condition", "data-accuracy", "network-latency"].forEach((id) => {
    $(id).textContent = "--";
  });
  $("signal-quality").textContent = "--";
  setStatus("Backend ready");
}

$("request-location").addEventListener("click", requestLocation);
$("start-monitoring").addEventListener("click", startMonitoring);
$("simulate-weather").addEventListener("click", simulateWeatherEvent);
$("reset-system").addEventListener("click", resetSystem);

fetch("/api/health")
  .then((response) => response.json())
  .then(() => setStatus("Backend ready"))
  .catch(() => setStatus("Backend unavailable", false));
