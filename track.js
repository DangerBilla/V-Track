// Student live map
(function () {
  const { C, haversine, pointAt, project, ahead, stops, total, db } = window.VT;
  const database = db();

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Map ----------
  const map = L.map("map").setView(C.center, C.zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const line = C.route.map((p) => [p.lat, p.lng]);
  if (C.loop) line.push(line[0]);
  L.polyline(line, { color: "#38bdf8", weight: 5, opacity: 0.85 }).addTo(map);
  map.fitBounds(L.latLngBounds(line).pad(0.2));

  const stopIcon = (sel) =>
    L.divIcon({ className: "pin-wrap", html: `<div class="stop-pin ${sel ? "sel" : ""}"></div>`, iconSize: [20, 20] });

  // ---------- Stops ----------
  const select = $("stopSelect");
  select.innerHTML =
    `<option value="auto">Nearest to me (automatic)</option>` +
    stops.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join("");

  const stopMarkers = stops.map((s, i) => {
    const m = L.marker([s.lat, s.lng], { icon: stopIcon(false) }).addTo(map);
    m.bindTooltip(s.name);
    m.on("click", () => { select.value = String(i); render(); });
    return m;
  });

  // ---------- State ----------
  let buses = {};        // id -> {lat,lng,speed,ts}
  let userPos = null;
  let meMarker = null;
  let serverOffset = 0;  // ms difference between server clock and this phone
  const busMarkers = {};
  const serverNow = () => Date.now() + serverOffset;

  function busIcon(id, cls) {
    return L.divIcon({
      className: "pin-wrap",
      html: `<div class="bus-pin ${cls}">${esc(id).slice(0, 3)}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }

  function etaFor(bus, stop) {
    const d = ahead(bus.along, stop.along);
    if (d == null) return null;
    const v = bus.speed > 2 ? bus.speed : C.avgSpeedKmh / 3.6;
    return d / v; // seconds
  }
  function etaText(sec) {
    if (sec == null) return "Passed";
    if (sec < 45) return "Arriving";
    return Math.ceil(sec / 60) + " min";
  }

  // ---------- Render ----------
  function render() {
    const now = serverNow();

    // Which stop are we showing?
    let stopIdx = null;
    let distText = "";
    if (select.value === "auto") {
      if (userPos) {
        let bestD = Infinity;
        stops.forEach((s, i) => {
          const d = haversine(userPos, s);
          if (d < bestD) { bestD = d; stopIdx = i; }
        });
        distText = Math.round(bestD) + " m away";
      }
    } else {
      stopIdx = Number(select.value);
      if (userPos) distText = Math.round(haversine(userPos, stops[stopIdx])) + " m away";
    }
    stopMarkers.forEach((m, i) => m.setIcon(stopIcon(i === stopIdx)));
    $("stopName").textContent = stopIdx == null ? 'Tap "Locate me"' : stops[stopIdx].name;
    $("stopDist").textContent = distText;
    const stop = stopIdx == null ? null : stops[stopIdx];

    // Buses
    const rows = [];
    Object.entries(buses).forEach(([id, b]) => {
      const offline = !b.ts || (now - b.ts) / 1000 > C.staleSeconds;
      const moving = (b.speed || 0) > 1;
      const along = project(b.lat, b.lng).along;
      const cls = offline ? "offline" : moving ? "moving" : "stopped";

      if (!busMarkers[id]) busMarkers[id] = L.marker([b.lat, b.lng], { icon: busIcon(id, cls), zIndexOffset: 1000 }).addTo(map);
      busMarkers[id].setLatLng([b.lat, b.lng]).setIcon(busIcon(id, cls));

      const sec = !offline && stop ? etaFor({ along, speed: b.speed || 0 }, stop) : null;
      rows.push({ id, b, offline, moving, sec: offline ? Infinity : sec == null && stop ? Infinity - 1 : sec ?? Infinity - 2 });
      rows[rows.length - 1].etaLabel = offline ? "-" : stop ? etaText(sec) : "";
    });
    Object.keys(busMarkers).forEach((id) => {
      if (!buses[id]) { map.removeLayer(busMarkers[id]); delete busMarkers[id]; }
    });

    rows.sort((a, b) => a.sec - b.sec);
    $("busList").innerHTML = rows.length
      ? rows.map((r) => {
          const chip = r.offline
            ? `<span class="chip offline">Offline</span>`
            : r.moving
            ? `<span class="chip moving">Moving &middot; ${Math.round((r.b.speed || 0) * 3.6)} km/h</span>`
            : `<span class="chip stopped">Stopped</span>`;
          return `<div class="bus" data-id="${esc(r.id)}">
            <div class="bus-id">${esc(r.id).slice(0, 3)}</div>
            <div class="bus-info"><strong>Shuttle #${esc(r.id)}</strong>${chip}<small>${esc(C.routeName)}</small></div>
            <div class="bus-eta">${esc(r.etaLabel)}</div>
          </div>`;
        }).join("")
      : `<div class="empty">No shuttles are live right now.</div>`;
  }

  $("busList").addEventListener("click", (e) => {
    const el = e.target.closest(".bus");
    if (el && buses[el.dataset.id]) map.flyTo([buses[el.dataset.id].lat, buses[el.dataset.id].lng], 18);
  });
  select.addEventListener("change", render);

  // ---------- My location ----------
  let watching = false;
  $("locBtn").addEventListener("click", () => {
    if (!navigator.geolocation) { $("note").textContent = "Your browser can't share location. Pick a stop instead."; return; }
    if (watching) { if (userPos) map.flyTo([userPos.lat, userPos.lng], 17); return; }
    watching = true;
    let first = true;
    navigator.geolocation.watchPosition(
      (pos) => {
        userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!meMarker) {
          meMarker = L.marker([userPos.lat, userPos.lng], {
            icon: L.divIcon({ className: "pin-wrap", html: '<div class="me-pin"></div>', iconSize: [18, 18] }),
          }).addTo(map);
        } else meMarker.setLatLng([userPos.lat, userPos.lng]);
        if (first) { first = false; map.flyTo([userPos.lat, userPos.lng], 17); }
        render();
      },
      () => {
        watching = false;
        $("note").textContent = "Location blocked. Allow it in your browser settings, or choose a stop from the list.";
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  });

  // ---------- Data source ----------
  const badge = $("modeBadge");
  if (database) {
    badge.textContent = "Live";
    badge.classList.add("live");
    database.ref(".info/serverTimeOffset").on("value", (s) => { serverOffset = s.val() || 0; });
    database.ref("buses").on("value", (snap) => {
      const raw = snap.val() || {};
      const clean = {};
      Object.entries(raw).forEach(([id, b]) => {
        if (b && Number.isFinite(b.lat) && Number.isFinite(b.lng)) {
          clean[id] = { lat: b.lat, lng: b.lng, speed: Number(b.speed) || 0, ts: Number(b.ts) || 0 };
        }
      });
      buses = clean;
      render();
    });
    setInterval(render, 3000); // refresh "offline" status
  } else {
    // DEMO mode: one pretend bus drives the route
    badge.textContent = "Demo mode";
    $("note").textContent = "Demo mode: this bus is simulated. Connect Firebase in config.js to show real buses (see SETUP.md).";
    let along = 0, haltUntil = 0;
    const SPEED = 5; // m/s (18 km/h)
    setInterval(() => {
      const t = Date.now();
      let speed = SPEED;
      if (t < haltUntil) speed = 0;
      else {
        const prev = along;
        along += SPEED;
        let wrapped = false;
        if (along >= total) { along -= total; wrapped = true; }
        stops.forEach((s) => {
          const crossed = wrapped ? s.along > prev || s.along <= along : prev < s.along && s.along <= along;
          if (crossed) { along = s.along; haltUntil = t + 4000; speed = 0; }
        });
      }
      const p = pointAt(along);
      buses = { "04": { lat: p.lat, lng: p.lng, speed, ts: t } };
      render();
    }, 1000);
  }

  render();
})();
