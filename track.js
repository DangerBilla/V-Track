// Student live map: route filter, nearest stop, direction-aware ETA, offline buses
(function () {
  const VT = window.VT;
  const { C, esc, haversine, routes, routeIds, stopList, db } = VT;
  const database = db();
  const $ = (id) => document.getElementById(id);

  VT.ready.then(init);

  function init() {
    if (!routeIds.length) { $("note").textContent = "No routes are set up in config.js."; return; }

    // ---------- Map ----------
    const map = L.map("map").setView(C.center, C.zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const routeLines = {};
    routeIds.forEach((id) => {
      routeLines[id] = L.polyline(routes[id].line, { color: routes[id].color, weight: 5, opacity: 0.85 });
    });

    const stopIcon = (sel) =>
      L.divIcon({ className: "pin-wrap", html: `<div class="stop-pin ${sel ? "sel" : ""}"></div>`, iconSize: [20, 20] });

    const select = $("stopSelect");
    const stopMarkers = {};
    stopList.forEach((s) => {
      const m = L.marker([s.lat, s.lng], { icon: stopIcon(false) });
      m.bindTooltip(s.name);
      m.on("click", () => { select.value = s.key; render(); });
      stopMarkers[s.key] = m;
    });

    // ---------- State ----------
    let active = "all";          // route filter
    let visibleStops = stopList;
    let buses = {};              // id -> {lat,lng,speed,avg,dir,routeId,offline,ts}
    let userPos = null, meMarker = null;
    let serverOffset = 0;        // server clock minus this phone's clock (ms)
    const busMarkers = {};
    const serverNow = () => Date.now() + serverOffset;
    const plateFor = (id) => ((C.shuttles || []).find((s) => s.id === id) || {}).plate || "";

    // ---------- Route filter chips ----------
    $("routeChips").innerHTML =
      `<button class="rchip active" data-r="all">All routes</button>` +
      routeIds.map((id) =>
        `<button class="rchip" data-r="${esc(id)}" style="--c:${esc(routes[id].color)}"><i></i>${esc(routes[id].short)}</button>`
      ).join("");

    $("routeChips").addEventListener("click", (e) => {
      const b = e.target.closest(".rchip");
      if (!b) return;
      active = b.dataset.r;
      $("routeChips").querySelectorAll(".rchip").forEach((x) => x.classList.toggle("active", x === b));
      applyFilter(true);
      render();
    });

    function applyFilter(fit) {
      const vis = active === "all" ? routeIds : [active];
      routeIds.forEach((id) => {
        if (vis.includes(id)) routeLines[id].addTo(map); else map.removeLayer(routeLines[id]);
      });
      visibleStops = stopList.filter((s) => s.routes.some((r) => vis.includes(r)));
      stopList.forEach((s) => {
        if (visibleStops.includes(s)) stopMarkers[s.key].addTo(map); else map.removeLayer(stopMarkers[s.key]);
      });
      const prev = select.value;
      select.innerHTML =
        `<option value="auto">Nearest to me (automatic)</option>` +
        visibleStops.map((s) => `<option value="${esc(s.key)}">${esc(s.name)}</option>`).join("");
      select.value = [...select.options].some((o) => o.value === prev) ? prev : "auto";
      if (fit) map.fitBounds(L.featureGroup(vis.map((id) => routeLines[id])).getBounds().pad(0.2));
    }

    // ---------- ETA ----------
    function busIcon(id, cls, color) {
      return L.divIcon({
        className: "pin-wrap",
        html: `<div class="bus-pin ${cls}" style="--c:${esc(color)}">${esc(id).slice(0, 3)}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
    }

    // Seconds until bus b (on route r) reaches `stop`. Handles direction,
    // off-route buses, average speed and halts at stops in between.
    function etaFor(b, r, pr, stop) {
      const rs = r.stops.find((s) => s.key === stop.key);
      if (!rs) return { none: true };                         // this route doesn't serve the stop
      if (haversine(b, rs) <= C.arriveMeters) return { sec: 0 };
      const v = b.avg > 1.5 ? b.avg : C.avgSpeedKmh / 3.6;
      let dist, approx = false, n = 0;
      if (pr.d > C.offRouteMeters) {                          // off route: straight line
        dist = haversine(b, rs); approx = true;
      } else {
        let dir = b.dir;
        if (dir !== 1 && dir !== -1) {                        // direction not known yet
          const f = r.ahead(pr.along, rs.along, 1), g = r.ahead(pr.along, rs.along, -1);
          if (f == null && g == null) return { passed: true };
          dir = g == null || (f != null && f <= g) ? 1 : -1;
          approx = true;
        }
        dist = r.ahead(pr.along, rs.along, dir);
        if (dist == null) return { passed: true };            // one-way route, already gone by
        n = r.stopsBetween(pr.along, rs.along, dir);
      }
      return { sec: dist / v + n * C.dwellSeconds, approx };
    }

    function etaLabel(e) {
      if (!e || e.none) return "";
      if (e.passed) return "Passed";
      if (e.sec < 45) return "Arriving";
      return (e.approx ? "~" : "") + Math.ceil(e.sec / 60) + " min";
    }
    const ago = (s) => (s < 90 ? Math.round(s) + " s" : Math.round(s / 60) + " min") + " ago";
    const fmtDist = (d) => Math.round(d) + " m away \u00b7 ~" + Math.max(1, Math.ceil(d / 80)) + " min walk";

    // ---------- Render ----------
    function render() {
      const now = serverNow();

      // Which stop are we showing?
      let stop = null, distText = "";
      if (select.value === "auto") {
        if (userPos && visibleStops.length) {
          let bestD = Infinity;
          visibleStops.forEach((s) => {
            const d = haversine(userPos, s);
            if (d < bestD) { bestD = d; stop = s; }
          });
          distText = fmtDist(bestD);
        }
      } else {
        stop = stopList.find((s) => s.key === select.value) || null;
        if (stop && userPos) distText = fmtDist(haversine(userPos, stop));
      }
      Object.entries(stopMarkers).forEach(([key, m]) => {
        const sel = !!stop && key === stop.key;
        if (m._sel !== sel) { m._sel = sel; m.setIcon(stopIcon(sel)); }
      });
      $("stopName").textContent = stop ? stop.name : 'Tap "Locate me"';
      $("stopDist").textContent = distText;

      // Buses
      const rows = [], shown = new Set();
      Object.entries(buses).forEach(([id, b]) => {
        const r = routes[b.routeId];
        if (!r) return;
        const age = b.ts ? (now - b.ts) / 1000 : Infinity;
        if (age > C.hideAfterSeconds) return;                 // gone for good
        if (active !== "all" && b.routeId !== active) return; // filtered out

        const offline = !!b.offline || age > C.staleSeconds;
        const moving = !offline && (b.speed || 0) > 1;
        const cls = offline ? "offline" : moving ? "moving" : "stopped";
        const atStop = !offline && !moving ? r.stops.find((s) => haversine(b, s) <= C.arriveMeters) : null;
        const pr = r.project(b.lat, b.lng);

        shown.add(id);
        if (!busMarkers[id]) busMarkers[id] = L.marker([b.lat, b.lng], { icon: busIcon(id, cls, r.color), zIndexOffset: 1000 }).addTo(map);
        busMarkers[id].setLatLng([b.lat, b.lng]).setIcon(busIcon(id, cls, r.color));

        const e = !offline && stop ? etaFor(b, r, pr, stop) : null;
        let rank = 0;
        if (offline) rank = 4e9;
        else if (stop) rank = !e || e.none ? 3e9 : e.passed ? 2e9 : e.sec;

        let sub;
        if (offline) sub = "Last seen " + ago(age);
        else {
          const nx = pr.d <= C.offRouteMeters ? r.nextStop(pr.along, b.dir === -1 ? -1 : 1) : null;
          sub = pr.d > C.offRouteMeters ? "Off route" : nx ? "Next: " + nx.name : r.hours;
        }
        const plate = b.plate || plateFor(id);
        rows.push({ id, b, r, offline, moving, atStop, rank, sub: (plate ? plate + " \u00b7 " : "") + sub, label: offline ? "-" : e && e.none ? "No stop here" : etaLabel(e), none: e && e.none });
      });
      Object.keys(busMarkers).forEach((id) => {
        if (!shown.has(id)) { map.removeLayer(busMarkers[id]); delete busMarkers[id]; }
      });

      rows.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
      $("busList").innerHTML = rows.length
        ? rows.map((x) => {
            const chip = x.offline
              ? `<span class="chip offline">Offline</span>`
              : x.moving
              ? `<span class="chip moving">Moving &middot; ${Math.round((x.b.speed || 0) * 3.6)} km/h</span>`
              : `<span class="chip stopped">${x.atStop ? "At " + esc(x.atStop.name) : "Stopped"}</span>`;
            return `<div class="bus" data-id="${esc(x.id)}">
              <div class="bus-id" style="background:${x.offline ? "#6b7280" : esc(x.r.color)}">${esc(x.id).slice(0, 3)}</div>
              <div class="bus-info"><strong>Shuttle #${esc(x.id)}<span class="rtag" style="--c:${esc(x.r.color)}">${esc(x.r.short)}</span></strong>${chip}<small>${esc(x.sub)}</small></div>
              <div class="bus-eta${x.none ? " dim" : ""}">${esc(x.label)}</div>
            </div>`;
          }).join("")
        : `<div class="empty">${active === "all" ? "No shuttles are live right now." : "No shuttles are live on this route right now."}</div>`;
    }

    $("busList").addEventListener("click", (e) => {
      const el = e.target.closest(".bus");
      const b = el && buses[el.dataset.id];
      if (b) map.flyTo([b.lat, b.lng], 18);
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
    applyFilter(true);

    if (database) {
      database.ref(".info/serverTimeOffset").on("value", (s) => { serverOffset = s.val() || 0; });
      database.ref(".info/connected").on("value", (s) => {
        badge.textContent = s.val() ? "Live" : "Reconnecting...";
        badge.classList.toggle("live", !!s.val());
      });
      database.ref("buses").on("value", (snap) => {
        const raw = snap.val() || {};
        const clean = {};
        Object.entries(raw).forEach(([id, b]) => {
          if (b && Number.isFinite(b.lat) && Number.isFinite(b.lng) && routes[b.routeId]) {
            clean[id] = {
              lat: b.lat, lng: b.lng,
              speed: Number(b.speed) || 0, avg: Number(b.avg) || 0,
              dir: b.dir === 1 || b.dir === -1 ? b.dir : 0,
              routeId: b.routeId, offline: !!b.offline, ts: Number(b.ts) || 0,
              plate: String(b.plate || plateFor(id)),
            };
          }
        });
        buses = clean;
        render();
      });
      setInterval(render, 3000); // keeps "offline" and last-seen fresh
    } else {
      // DEMO mode: pretend buses on different routes, one going the other way
      // round and one offline, so every state of the screen can be seen.
      badge.textContent = "Demo mode";
      $("note").textContent = "Demo mode: these buses are simulated. Sign in on driver.html in another tab of this browser and start sharing to see your own shuttle appear here. Connect Firebase in config.js for real buses (see SETUP.md).";
      const SPEED = 5; // m/s (18 km/h)
      const sims = [
        { id: "01", route: "academic", dir: 1,  frac: 0.0 },
        { id: "02", route: "mh",       dir: -1, frac: 0.4 },
        { id: "05", route: "lh",       dir: 1,  frac: 0.2 },
        { id: "07", route: "night",    dir: 1,  frac: 0.6, offline: true },
      ].filter((s) => routes[s.route]);
      sims.forEach((s) => { s.along = s.frac * routes[s.route].total; s.halt = 0; s.speed = SPEED; s.lastStop = null; });

      function step(s, t) {
        const r = routes[s.route];
        if (s.offline || t < s.halt) { s.speed = 0; return; }
        s.along = (((s.along + s.dir * SPEED) % r.total) + r.total) % r.total;
        s.speed = SPEED;
        r.stops.forEach((st) => {
          const dd = Math.abs(r.alongDelta(s.along, st.along));
          if (dd > 30 && s.lastStop === st.key) s.lastStop = null;
          if (dd <= 3 && s.lastStop !== st.key) {
            s.along = st.along; s.halt = t + 4000; s.speed = 0; s.lastStop = st.key;
          }
        });
      }

      setInterval(() => {
        const t = Date.now();
        const out = {};
        sims.forEach((s) => {
          step(s, t);
          const p = routes[s.route].pointAt(s.along);
          out[s.id] = {
            lat: p.lat, lng: p.lng, speed: s.speed, avg: SPEED, dir: s.dir, routeId: s.route,
            offline: false, ts: s.offline ? t - (C.staleSeconds + 30) * 1000 : t,
          };
        });
        // Shuttles started from driver.html in this same browser (demo feed)
        try {
          const fed = JSON.parse(localStorage.getItem("vtrack-demo-buses") || "{}");
          Object.entries(fed).forEach(([id, b]) => { if (b && routes[b.routeId]) out[id] = b; });
        } catch (e) {}
        buses = out;
        render();
      }, 1000);
    }

    render();
  }
})();
