// Driver page: sends this phone's GPS position to the database every ~3 seconds
(function () {
  const { C, haversine, db } = window.VT;
  const database = db();
  const $ = (id) => document.getElementById(id);

  let watchId = null, wake = null, ref = null;
  let lastSent = 0, last = null, sharing = false;

  function say(text, kind) {
    const m = $("msg");
    m.textContent = text;
    m.className = "msg " + (kind || "");
  }

  $("start").addEventListener("click", async () => {
    const id = $("busId").value.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12);
    if (!id) return say("Enter the shuttle number.", "bad");
    if ($("code").value !== C.driverCode) return say("Wrong driver code.", "bad");
    if (!database) return say("The live database isn't connected yet. Add your Firebase details in config.js (see SETUP.md).", "bad");
    if (!navigator.geolocation) return say("This browser cannot share location.", "bad");

    ref = database.ref("buses/" + id);
    ref.onDisconnect().remove(); // bus disappears from the map if the phone loses connection

    sharing = true;
    watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 15000,
    });
    requestWake();

    $("setup").hidden = true;
    $("live").hidden = false;
    $("modeBadge").textContent = "Sharing";
    $("modeBadge").classList.add("live");
    say("Sharing shuttle #" + id + ". Keep this page open.", "good");
  });

  function onPos(pos) {
    const c = pos.coords;
    const now = Date.now();
    const cur = { lat: c.latitude, lng: c.longitude };

    let speed = typeof c.speed === "number" && c.speed >= 0 ? c.speed : null;
    if (speed === null && last) {
      const dt = (now - last.t) / 1000;
      if (dt > 0) speed = haversine(last, cur) / dt;
    }
    speed = speed || 0;
    last = { ...cur, t: now };

    $("speedOut").textContent = Math.round(speed * 3.6) + " km/h";
    $("accOut").textContent = c.accuracy ? "\u00b1" + Math.round(c.accuracy) + " m" : "-";

    if (now - lastSent < 3000) return; // every 3 seconds
    lastSent = now;
    ref.set({
      lat: cur.lat,
      lng: cur.lng,
      speed,
      heading: c.heading || 0,
      ts: firebase.database.ServerValue.TIMESTAMP,
    })
      .then(() => {
        $("sendStatus").textContent = "Sending";
        $("lastOut").textContent = new Date().toLocaleTimeString();
      })
      .catch((e) => { $("sendStatus").textContent = "Send failed"; say("Could not send: " + e.message, "bad"); });
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
    if (sharing && document.visibilityState === "visible") requestWake();
  });

  $("stop").addEventListener("click", () => {
    sharing = false;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (ref) ref.remove();
    if (wake) { wake.release(); wake = null; }
    $("setup").hidden = false;
    $("live").hidden = true;
    $("modeBadge").textContent = "Not sharing";
    $("modeBadge").classList.remove("live");
    say("Stopped sharing.", "");
  });
})();
