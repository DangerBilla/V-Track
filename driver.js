// Driver page: login -> choose number plate + route -> start/stop sharing.
// Real mode: Firebase Authentication (one account per driver) + Realtime Database.
// Demo mode (no Firebase): demo logins and a simulated shuttle, shown on the
// student page in the same browser.
(function () {
  const { C, esc, haversine, routes, routeIds, db } = window.VT;
  const database = db();
  const DEMO = !database;
  const auth = DEMO ? null : firebase.auth();
  const DEMO_KEY = "vtrack-demo-buses";
  const $ = (id) => document.getElementById(id);

  let user = null;                       // { uid, name }
  let watchId = null, simTimer = null, wake = null;
  let ref = null, connRef = null, connHandler = null;
  let sharing = false, shuttle = null, route = null, routeId = "";
  let last = null, lastSent = 0, lastAlong = null, acc = 0, dir = 0, avg = null;

  function say(text, kind) {
    const m = $("msg");
    m.textContent = text;
    m.className = "msg " + (kind || "");
  }
  function view(name) {
    $("loginView").hidden = name !== "login";
    $("setupView").hidden = name !== "setup";
    $("liveView").hidden = name !== "live";
    const b = $("modeBadge");
    b.classList.toggle("live", name === "live");
    b.textContent = name === "live" ? "Sharing" : name === "setup" ? "Signed in" : "Signed out";
  }

  // ---------- Pickers ----------
  $("busId").innerHTML = (C.shuttles || [])
    .map((s) => `<option value="${esc(s.id)}">${esc(s.plate)}  (Shuttle #${esc(s.id)})</option>`).join("");
  $("routeId").innerHTML = routeIds
    .map((id) => `<option value="${esc(id)}">${esc(routes[id].name)}</option>`).join("");
  try {
    const saved = JSON.parse(localStorage.getItem("vtrack-driver") || "{}");
    if (saved.bus && (C.shuttles || []).some((s) => s.id === saved.bus)) $("busId").value = saved.bus;
    if (saved.route && routes[saved.route]) $("routeId").value = saved.route;
  } catch (e) {}

  // ---------- Login ----------
  $("demoNote").hidden = !DEMO;

  function enter(u) {
    user = u;
    $("who").textContent = u.name;
    view("setup");
    say("", "");
  }

  function authMessage(err) {
    const c = err && err.code;
    if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-email")
      return "Wrong username or password.";
    if (c === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
    if (c === "auth/network-request-failed") return "No internet connection.";
    if (c === "auth/operation-not-allowed") return "Email/password sign-in isn't switched on in Firebase (see SETUP.md).";
    return "Could not sign in: " + ((err && err.message) || "unknown error");
  }

  $("loginView").addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = $("user").value.trim().toLowerCase();
    const p = $("pass").value;
    if (!u || !p) return say("Enter your username and password.", "bad");
    $("login").disabled = true;
    try {
      if (DEMO) {
        const d = (C.demoDrivers || {})[u];
        if (!d || d.password !== p) return say("Wrong username or password.", "bad");
        enter({ uid: "demo-" + u, name: d.name || u });
      } else {
        const email = u.includes("@") ? u : u + "@" + C.driverEmailDomain;
        await auth.signInWithEmailAndPassword(email, p); // onAuthStateChanged continues
      }
    } catch (err) {
      say(authMessage(err), "bad");
    } finally {
      $("login").disabled = false;
      $("pass").value = "";
    }
  });

  if (!DEMO) {
    // Also restores the login after a page reload
    auth.onAuthStateChanged(async (fu) => {
      if (!fu) { user = null; if (!sharing) view("login"); return; }
      try {
        const snap = await database.ref("drivers/" + fu.uid).once("value");
        if (!snap.exists()) throw new Error("not a driver");
        const name = snap.child("name").val() || (fu.email || "").split("@")[0];
        enter({ uid: fu.uid, name });
      } catch (e) {
        await auth.signOut();
        say("This account is not registered as a V-Track driver. Ask your coordinator.", "bad");
      }
    });
  } else {
    view("login");
  }

  $("signOut").addEventListener("click", async () => {
    if (!DEMO) await auth.signOut(); else { user = null; view("login"); }
    say("Signed out.", "");
  });

  // ---------- Start sharing ----------
  function publish(payload) {
    if (DEMO) {
      let all = {};
      try { all = JSON.parse(localStorage.getItem(DEMO_KEY) || "{}"); } catch (e) {}
      all[shuttle.id] = { ...payload, ts: Date.now() };
      localStorage.setItem(DEMO_KEY, JSON.stringify(all));
      return Promise.resolve();
    }
    return ref.set({ ...payload, ts: firebase.database.ServerValue.TIMESTAMP });
  }

  $("start").addEventListener("click", async () => {
    if (!user) return say("Sign in first.", "bad");
    shuttle = (C.shuttles || []).find((s) => s.id === $("busId").value);
    routeId = $("routeId").value;
    if (!shuttle) return say("Choose your shuttle number plate.", "bad");
    if (!routes[routeId]) return say("Choose the route you are driving.", "bad");
    if (!DEMO && !navigator.geolocation) return say("This browser cannot share location.", "bad");

    await window.VT.ready; // route geometry (may be road-snapped)
    route = routes[routeId];
    last = null; lastSent = 0; lastAlong = null; acc = 0; dir = 0; avg = null;
    try { localStorage.setItem("vtrack-driver", JSON.stringify({ bus: shuttle.id, route: routeId })); } catch (e) {}

    if (!DEMO) {
      ref = database.ref("buses/" + shuttle.id);
      // Refuse if another driver is already sharing this shuttle right now
      try {
        const [snap, off] = await Promise.all([ref.once("value"), database.ref(".info/serverTimeOffset").once("value")]);
        const cur = snap.val();
        const serverNow = Date.now() + (off.val() || 0);
        if (cur && cur.uid && cur.uid !== user.uid && !cur.offline && serverNow - (cur.ts || 0) < 60000)
          return say("Shuttle " + shuttle.plate + " is already being driven by another driver.", "bad");
      } catch (e) {}
      // If this phone loses connection, the shuttle turns grey (Offline) for students.
      connRef = database.ref(".info/connected");
      connHandler = connRef.on("value", (s) => {
        if (s.val() === true && ref) ref.onDisconnect().update({ offline: true });
      });
      sharing = true;
      watchId = navigator.geolocation.watchPosition(onPos, onErr, {
        enableHighAccuracy: true, maximumAge: 0, timeout: 15000,
      });
      requestWake();
    } else {
      sharing = true;
      startSim();
    }

    $("liveTitle").textContent = shuttle.plate + (DEMO ? " (simulated)" : "");
    $("routeOut").textContent = route.short;
    view("live");
    say("Sharing " + shuttle.plate + " on " + route.name + ". Keep this page open.", "good");
  });

  // ---------- GPS fixes ----------
  function onPos(pos) {
    const c = pos.coords;
    const cur = { lat: c.latitude, lng: c.longitude };
    let speed = typeof c.speed === "number" && c.speed >= 0 ? c.speed : null;
    onFix(cur, speed, c.accuracy, c.heading || 0);
  }

  function startSim() {
    const SPEED = 5; // m/s (18 km/h)
    let along = 0, haltUntil = 0, lastStop = null;
    $("sendStatus").textContent = "Simulating";
    simTimer = setInterval(() => {
      const t = Date.now();
      let speed = SPEED;
      if (t < haltUntil) speed = 0;
      else {
        along = (along + SPEED) % route.total;
        route.stops.forEach((st) => {
          const dd = Math.abs(route.alongDelta(along, st.along));
          if (dd > 30 && lastStop === st.key) lastStop = null;
          if (dd <= 3 && lastStop !== st.key) { along = st.along; haltUntil = t + 4000; speed = 0; lastStop = st.key; }
        });
      }
      const p = route.pointAt(along);
      onFix({ lat: p.lat, lng: p.lng }, speed, 5, 0);
    }, 1000);
  }

  function onFix(cur, speed, accuracy, heading) {
    const now = Date.now();
    if (speed === null && last) {
      const dt = (now - last.t) / 1000;
      if (dt > 0) speed = haversine(last, cur) / dt;
    }
    speed = speed || 0;
    last = { ...cur, t: now };

    // Smoothed speed while moving (steadier ETA)
    if (speed > 1) avg = avg == null ? speed : 0.8 * avg + 0.2 * speed;

    // Snap to the route and work out which way round the shuttle is going
    const pr = route.project(cur.lat, cur.lng);
    const off = pr.d > C.offRouteMeters;
    if (off) { lastAlong = null; acc = 0; }
    else {
      if (lastAlong != null && speed > 1) acc += route.alongDelta(lastAlong, pr.along);
      lastAlong = pr.along;
      if (Math.abs(acc) >= 15) { dir = acc > 0 ? 1 : -1; acc = 0; }
    }

    $("speedOut").textContent = Math.round(speed * 3.6) + " km/h";
    $("accOut").textContent = accuracy ? "\u00b1" + Math.round(accuracy) + " m" : "-";
    $("dirOut").textContent = off ? "Off route" : dir === 1 ? "Forward" : dir === -1 ? "Reverse" : "Detecting...";

    if (accuracy && accuracy > 100) { $("sendStatus").textContent = "Weak GPS"; return; }
    if (!DEMO && now - lastSent < 3000) return; // every 3 seconds
    lastSent = now;

    publish({
      lat: cur.lat, lng: cur.lng, speed, avg: avg || 0, heading, dir,
      routeId, plate: shuttle.plate, uid: user.uid,
    })
      .then(() => {
        $("sendStatus").textContent = DEMO ? "Simulating" : "Sending";
        $("lastOut").textContent = new Date().toLocaleTimeString();
      })
      .catch((e) => {
        $("sendStatus").textContent = "Send failed";
        say(e && e.code === "PERMISSION_DENIED" || /permission/i.test(String(e && e.message))
          ? "Not allowed to share this shuttle (is another driver using it, or are the database rules missing?)."
          : "Could not send: " + (e && e.message), "bad");
      });
  }

  function onErr(err) {
    say(err.code === 1
      ? "Location is blocked. Allow location for this site in your browser settings."
      : "GPS problem: " + err.message, "bad");
  }

  async function requestWake() {
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => {
    if (sharing && !DEMO && document.visibilityState === "visible") requestWake();
  });

  // ---------- Stop sharing ----------
  $("stop").addEventListener("click", () => {
    sharing = false;
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (simTimer) { clearInterval(simTimer); simTimer = null; }
    if (connRef && connHandler) { connRef.off("value", connHandler); connHandler = null; }
    if (DEMO) {
      try {
        const all = JSON.parse(localStorage.getItem(DEMO_KEY) || "{}");
        delete all[shuttle.id];
        localStorage.setItem(DEMO_KEY, JSON.stringify(all));
      } catch (e) {}
    } else if (ref) {
      ref.onDisconnect().cancel();
      ref.remove();
      ref = null;
    }
    if (wake) { wake.release(); wake = null; }
    view("setup");
    say("Stopped sharing.", "");
  });
})();
