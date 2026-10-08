// ---------- Mobile menu ----------
const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");
menuBtn.addEventListener("click", () => navLinks.classList.toggle("open"));
navLinks.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => navLinks.classList.remove("open"))
);

// ---------- Scroll reveal ----------
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// ---------- Simulated shuttle demo ----------
// NOTE: this is a front-end simulation. Real data will come from the
// driver GPS beacon + cloud server once those phases are built.
const route = document.getElementById("route");
const shuttle = document.getElementById("shuttle");
const stopsLayer = document.getElementById("stopsLayer");
const statusText = document.getElementById("statusText");
const speedText = document.getElementById("speedText");
const statusDot = document.getElementById("statusDot");
const etaText = document.getElementById("etaText");
const nextText = document.getElementById("nextText");

const SVG_NS = "http://www.w3.org/2000/svg";
const totalLen = route.getTotalLength();

// position along the route (0 to 1)
const stops = [
  { name: "Main Gate", at: 0.0 },
  { name: "TT / GDN", at: 0.3 },
  { name: "SJT (Nearest)", at: 0.62, near: true },
  { name: "MH Block Q", at: 1.0 },
];

// draw stops
stops.forEach((s) => {
  const p = route.getPointAtLength(s.at * totalLen);
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", p.x);
  dot.setAttribute("cy", p.y);
  dot.setAttribute("r", 9);
  dot.setAttribute("class", "stop-dot" + (s.near ? " near" : ""));
  stopsLayer.appendChild(dot);

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("x", Math.min(Math.max(p.x, 60), 640));
  label.setAttribute("y", p.y + (s.at > 0.9 ? -20 : 28));
  label.setAttribute("class", "stop-label" + (s.near ? " near" : ""));
  label.textContent = s.name;
  stopsLayer.appendChild(label);
});

const nearest = stops.find((s) => s.near);
const TRIP_MINUTES = 9;     // simulated full-route time
const TRIP_SECONDS = 28;    // how long the demo takes in real seconds
const HALT_SECONDS = 2.5;   // pause at each stop

let progress = 0;
let haltUntil = 0;
let haltedAt = -1;
let last = performance.now();

function setMoving(moving) {
  shuttle.classList.toggle("stopped", !moving);
  statusDot.classList.toggle("stopped", !moving);
  statusText.textContent = "Shuttle #04 " + (moving ? "Moving" : "Stopped");
  speedText.textContent = moving ? "22 km/h" : "0 km/h \u00b7 picking up students";
}

function updateEta() {
  const remaining = nearest.at - progress;
  if (remaining > 0.005) {
    const mins = Math.max(1, Math.ceil(remaining * TRIP_MINUTES));
    etaText.textContent = mins + (mins === 1 ? " Minute Away" : " Minutes Away");
    nextText.textContent = "Next: SJT Rotunda \u00b7 Academic Loop 1";
  } else if (remaining > -0.02) {
    etaText.textContent = "Arriving now";
    nextText.textContent = "Arrived at SJT";
  } else {
    etaText.textContent = "Departed SJT";
    nextText.textContent = "Next: MH Block Q (End of route)";
  }
}

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;

  if (now < haltUntil) {
    setMoving(false);
  } else {
    setMoving(true);
    progress += dt / TRIP_SECONDS;

    // halt at stops
    stops.forEach((s, i) => {
      if (s.at > 0 && s.at < 1 && haltedAt !== i && progress >= s.at) {
        haltedAt = i;
        progress = s.at;
        haltUntil = now + HALT_SECONDS * 1000;
      }
    });

    if (progress >= 1) {
      progress = 0;
      haltedAt = -1;
    }
  }

  const p = route.getPointAtLength(progress * totalLen);
  shuttle.setAttribute("transform", `translate(${p.x}, ${p.y})`);
  updateEta();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// ---------- Role chooser (Student / Driver) ----------
(function () {
  const gate = document.getElementById("roleGate");
  if (!gate) return;
  const close = () => {
    gate.hidden = true;
    document.body.style.overflow = "";
    try { sessionStorage.setItem("vtrack-gate", "1"); } catch (e) {}
  };
  let seen = false;
  try { seen = sessionStorage.getItem("vtrack-gate") === "1"; } catch (e) {}
  if (seen || location.hash) { gate.hidden = true; return; }
  document.body.style.overflow = "hidden";
  document.getElementById("gateSkip").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();
