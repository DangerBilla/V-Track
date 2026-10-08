// Shared helpers: distance maths, multi-route geometry (straight or road-snapped)
// and Firebase setup. Used by track.js and driver.js.
(function () {
  const C = window.VTRACK;
  const R = 6371000; // earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function haversine(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // A route point is either a stop key ("sjt") or a plain {lat,lng} bend
  function resolve(p) {
    if (typeof p === "string") {
      const s = (C.stops || {})[p];
      if (!s) { console.error("V-Track: unknown stop key in config.js: " + p); return null; }
      return { key: p, name: s.name, lat: s.lat, lng: s.lng };
    }
    return { lat: p.lat, lng: p.lng };
  }

  // ---------- One route = geometry + distance helpers ----------
  function makeRoute(id, def) {
    const loop = def.loop !== false;
    const pts = (def.points || []).map(resolve).filter(Boolean);
    const r = {
      id, loop, pts,
      name: def.name || id,
      short: def.short || def.name || id,
      color: def.color || "#38bdf8",
      hours: def.hours || "",
      ring: [], cum: [], total: 0, stops: [], line: [], mode: "straight",
    };

    function finish() {
      r.cum = [0];
      for (let i = 1; i < r.ring.length; i++) r.cum[i] = r.cum[i - 1] + haversine(r.ring[i - 1], r.ring[i]);
      r.total = r.cum[r.cum.length - 1];
      r.line = r.ring.map((p) => [p.lat, p.lng]);
    }

    // Closest point on the route, searching segments from index `start` onward
    function projectCore(lat, lng, start) {
      const k = Math.cos(toRad(lat)) * 111320;
      const m = 110574;
      let best = { d: Infinity, along: 0, seg: start };
      for (let i = start; i < r.ring.length - 1; i++) {
        const a = r.ring[i], b = r.ring[i + 1];
        const ax = (a.lng - lng) * k, ay = (a.lat - lat) * m;
        const bx = (b.lng - lng) * k, by = (b.lat - lat) * m;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < best.d) best = { d, along: r.cum[i] + t * (r.cum[i + 1] - r.cum[i]), seg: i };
      }
      return best;
    }

    // Route exactly as written in config.js (points joined by straight lines)
    r.useStraight = function () {
      r.ring = loop ? pts.concat([pts[0]]) : pts.slice();
      finish();
      r.stops = pts
        .map((p, i) => ({ key: p.key, name: p.name, lat: p.lat, lng: p.lng, along: r.cum[i] }))
        .filter((p) => p.name);
    };

    // Route that follows a road geometry (list of {lat,lng})
    r.useLine = function (line) {
      r.ring = line.slice();
      if (loop && haversine(r.ring[0], r.ring[r.ring.length - 1]) > 0.5) r.ring.push({ ...r.ring[0] });
      finish();
      let fromSeg = 0;
      r.stops = pts
        .filter((p) => p.name)
        .map((p) => {
          const pr = projectCore(p.lat, p.lng, fromSeg);
          fromSeg = pr.seg;
          return { key: p.key, name: p.name, lat: p.lat, lng: p.lng, along: pr.along };
        });
      r.mode = "road-snapped";
    };

    // Lat/lng at a given distance along the route
    r.pointAt = function (along) {
      if (loop) along = ((along % r.total) + r.total) % r.total;
      else along = Math.max(0, Math.min(r.total, along));
      let i = 0;
      while (i < r.cum.length - 2 && r.cum[i + 1] < along) i++;
      const seg = r.cum[i + 1] - r.cum[i];
      const t = seg ? (along - r.cum[i]) / seg : 0;
      const a = r.ring[i], b = r.ring[i + 1];
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    };

    // Snap a GPS position onto the route -> { along, d (metres from the line) }
    r.project = function (lat, lng) {
      const p = projectCore(lat, lng, 0);
      return { d: p.d, along: p.along };
    };

    // Distance still to drive between two points on the route, travelling in
    // direction dir (1 = forward, -1 = reverse). null = behind a one-way route.
    r.ahead = function (fromAlong, toAlong, dir) {
      const d = dir < 0 ? fromAlong - toAlong : toAlong - fromAlong;
      if (loop) return ((d % r.total) + r.total) % r.total;
      return d < 0 ? null : d;
    };

    // Signed shortest movement along the route between two positions
    r.alongDelta = function (prev, cur) {
      let d = cur - prev;
      if (loop) d = ((((d + r.total / 2) % r.total) + r.total) % r.total) - r.total / 2;
      return d;
    };

    // The next stop a bus reaches when travelling in direction dir
    r.nextStop = function (along, dir) {
      let best = null, bestD = Infinity;
      r.stops.forEach((s) => {
        const d = r.ahead(along, s.along, dir);
        if (d != null && d > 1 && d < bestD) { best = s; bestD = d; }
      });
      return best;
    };

    // How many stops lie strictly between the bus and the target stop
    r.stopsBetween = function (fromAlong, toAlong, dir) {
      const full = r.ahead(fromAlong, toAlong, dir);
      if (full == null) return 0;
      return r.stops.filter((s) => {
        const d = r.ahead(fromAlong, s.along, dir);
        return d != null && d > 1 && d < full - 1;
      }).length;
    };

    r.useStraight();
    return r;
  }

  // ---------- Road snapping (follows real roads between the route points) ----------
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  async function fetchRoadLine(r) {
    const wps = r.pts.map((p) => [p.lng, p.lat]);
    if (r.loop) wps.push(wps[0]);
    const key = "vtrack-road-" + hash(JSON.stringify(wps));
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(cached) && cached.length > 1) return cached;
    } catch (e) {}

    const CH = 24; // waypoints per request
    let line = [];
    for (let s = 0; s < wps.length - 1; s += CH - 1) {
      const chunk = wps.slice(s, s + CH);
      if (chunk.length < 2) break;
      const url =
        "https://router.project-osrm.org/route/v1/driving/" +
        chunk.map((c) => c[0] + "," + c[1]).join(";") +
        "?overview=full&geometries=geojson";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("routing service " + res.status);
      const j = await res.json();
      if (j.code !== "Ok" || !j.routes || !j.routes[0]) throw new Error("no road route found");
      const coords = j.routes[0].geometry.coordinates;
      line = line.concat(line.length ? coords.slice(1) : coords);
    }
    const out = line.map((c) => ({ lat: c[1], lng: c[0] }));
    try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
    return out;
  }

  function straightLength(r) {
    let len = 0;
    for (let i = 1; i < r.pts.length; i++) len += haversine(r.pts[i - 1], r.pts[i]);
    if (r.loop) len += haversine(r.pts[r.pts.length - 1], r.pts[0]);
    return len;
  }

  // ---------- Build all routes ----------
  const routes = {};
  Object.entries(C.routes || {}).forEach(([id, def]) => {
    const r = makeRoute(id, def);
    if (r.pts.length >= 2) routes[id] = r;
    else console.error("V-Track: route '" + id + "' needs at least 2 points");
  });
  const routeIds = Object.keys(routes);

  // Every distinct stop, with the routes that serve it
  const stopMap = {};
  routeIds.forEach((id) =>
    routes[id].pts.forEach((p) => {
      if (!p.key) return;
      if (!stopMap[p.key]) stopMap[p.key] = { key: p.key, name: p.name, lat: p.lat, lng: p.lng, routes: [] };
      if (!stopMap[p.key].routes.includes(id)) stopMap[p.key].routes.push(id);
    })
  );
  const stopList = Object.values(stopMap);

  const ready = (async function () {
    if (!C.snapToRoads) return;
    await Promise.all(
      routeIds.map(async (id) => {
        const r = routes[id];
        try {
          const line = await fetchRoadLine(r);
          let len = 0;
          for (let i = 1; i < line.length; i++) len += haversine(line[i - 1], line[i]);
          if (line.length < 2 || len > straightLength(r) * 3) throw new Error("road route looks like a big detour, so it was ignored");
          r.useLine(line);
        } catch (e) {
          r.mode = "straight (road snapping failed)";
          if (window.console) console.warn("V-Track: road snapping failed for " + id + ", using straight lines.", e);
        }
      })
    );
  })();

  // ---------- Firebase (only if configured) ----------
  let _db;
  function db() {
    if (_db !== undefined) return _db;
    if (C.firebase && C.firebase.databaseURL && window.firebase) {
      if (!firebase.apps.length) firebase.initializeApp(C.firebase);
      _db = firebase.database();
    } else {
      _db = null;
    }
    return _db;
  }

  window.VT = { C, esc, haversine, routes, routeIds, stopList, ready, db };
})();
