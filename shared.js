// Shared helpers: distance maths, route geometry and Firebase setup.
(function () {
  const C = window.VTRACK;
  const R = 6371000; // earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;

  function haversine(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Route as a ring (closed if loop) with cumulative distance at each point
  const pts = C.route.map((p) => ({ ...p }));
  const ring = C.loop ? pts.concat([pts[0]]) : pts;
  const cum = [0];
  for (let i = 1; i < ring.length; i++) {
    cum[i] = cum[i - 1] + haversine(ring[i - 1], ring[i]);
  }
  const total = cum[cum.length - 1];

  const stops = pts
    .map((p, i) => ({ name: p.name, lat: p.lat, lng: p.lng, along: cum[i] }))
    .filter((p) => p.name);

  // Lat/lng at a given distance along the route
  function pointAt(along) {
    if (C.loop) along = ((along % total) + total) % total;
    else along = Math.max(0, Math.min(total, along));
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < along) i++;
    const seg = cum[i + 1] - cum[i];
    const t = seg ? (along - cum[i]) / seg : 0;
    const a = ring[i], b = ring[i + 1];
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  }

  // Snap a GPS position onto the route; returns distance along the route
  function project(lat, lng) {
    const k = Math.cos(toRad(lat)) * 111320;
    const m = 110574;
    let best = { d: Infinity, along: 0 };
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const ax = (a.lng - lng) * k, ay = (a.lat - lat) * m;
      const bx = (b.lng - lng) * k, by = (b.lat - lat) * m;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best.d) best = { d, along: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
    return best;
  }

  // Distance still to drive from one point on the route to another
  function ahead(fromAlong, toAlong) {
    let d = toAlong - fromAlong;
    if (C.loop) return ((d % total) + total) % total;
    return d < 0 ? null : d;
  }

  // Firebase (only if configured)
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

  window.VT = { C, haversine, pointAt, project, ahead, stops, total, db };
})();
