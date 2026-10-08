// =====================================================
//  V-Track settings. Edit this file to set up your campus.
// =====================================================

// ---------- STOPS ----------
// Every bus stop is defined ONCE here, then reused by any route.
// IMPORTANT: these coordinates are APPROXIMATE PLACEHOLDERS.
// Stand at each stop, open Google Maps, press and hold on the spot,
// and copy the two numbers shown (lat, lng). Add all 18+ stops.
const STOPS = {
  mainGate:    { name: "Main Gate",                   lat: 12.9722, lng: 79.1642 },
  katpadiGate: { name: "Katpadi Gate",                lat: 12.9731, lng: 79.1660 },
  tt:          { name: "Technology Tower (TT) / GDN", lat: 12.9708, lng: 79.1588 },
  smv:         { name: "SMV",                         lat: 12.9700, lng: 79.1573 },
  sjt:         { name: "Silver Jubilee Tower (SJT)",  lat: 12.9692, lng: 79.1559 },
  library:     { name: "Library",                     lat: 12.9680, lng: 79.1548 },
  foodys:      { name: "Foodys / Gazebo",             lat: 12.9668, lng: 79.1527 },
  mhQ:         { name: "Men's Hostel (Block Q)",      lat: 12.9650, lng: 79.1510 },
  lh:          { name: "Ladies' Hostel (LH Blocks)",  lat: 12.9672, lng: 79.1590 }
};

window.VTRACK = {
  // Map centre (VIT Vellore, approximate)
  center: [12.9692, 79.1559],
  zoom: 16,

  // Used for the ETA when a bus has no recent average speed
  avgSpeedKmh: 15,

  // Extra seconds added to the ETA for every stop the bus must still call at
  // before reaching yours (shuttles halt to pick up students).
  dwellSeconds: 20,

  // A stopped bus within this many metres of a stop is shown as "At <stop>"
  // and a bus this close to your stop shows "Arriving".
  arriveMeters: 40,

  // Shown as "Offline" (grey) if no location was received for this long
  staleSeconds: 45,

  // Offline buses disappear from the map after this long
  hideAfterSeconds: 600,

  // If a shuttle is further than this from its route line it is "off route".
  // Its ETA then uses straight-line distance and is marked with "~".
  offRouteMeters: 60,

  // true = bend the route lines along real roads (uses the free OSRM service).
  // Leave false until your stop coordinates are surveyed and accurate.
  snapToRoads: false,

  // ---------- SHUTTLES ----------
  // The number plates a driver can choose from after logging in.
  // PLACEHOLDER PLATES: replace with your real shuttle number plates.
  shuttles: [
    { id: "01", plate: "TN 23 AB 1001" },
    { id: "02", plate: "TN 23 AB 1002" },
    { id: "03", plate: "TN 23 AB 1003" },
    { id: "04", plate: "TN 23 AB 1004" },
    { id: "05", plate: "TN 23 AB 1005" },
    { id: "06", plate: "TN 23 AB 1006" },
    { id: "07", plate: "TN 23 AB 1007" }
  ],

  // ---------- DRIVER LOGINS ----------
  // Real logins are Firebase accounts, one per driver (see SETUP.md).
  // A driver types a short username; the app adds this domain to make the
  // Firebase email, e.g. "ravi" -> ravi@vtrack.app
  driverEmailDomain: "vtrack.app",

  // DEMO MODE ONLY (used when Firebase is not connected below).
  // These fake logins let you show the driver flow at a review. Delete them
  // once Firebase is connected.
  demoDrivers: {
    driver1: { password: "demo123", name: "Demo Driver 1" },
    driver2: { password: "demo123", name: "Demo Driver 2" }
  },

  // Paste your Firebase Realtime Database details here (see SETUP.md).
  // Leave databaseURL empty and the site runs in DEMO mode with fake buses.
  firebase: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    appId: ""
  },

  stops: STOPS,

  // ROUTES, each in the order the shuttle drives it (one full circle).
  //  - A string ("sjt") is a bus stop taken from STOPS above.
  //  - { lat, lng } without a name just bends the line to follow the road.
  //  - loop: true  = last point connects back to the first (either direction)
  //    loop: false = one way only
  // The route id (academic, mh, ...) is what drivers and the map use.
  routes: {
    academic: {
      name: "Route 1: Academic Loop", short: "Academic", color: "#38bdf8", loop: true,
      hours: "8:00 AM - 6:00 PM",
      points: ["mainGate", { lat: 12.9714, lng: 79.1615 }, "tt", "smv", "sjt",
               { lat: 12.9715, lng: 79.1620 }, "katpadiGate"]
    },
    mh: {
      name: "Route 2: Men's Hostel Shuttle", short: "Men's Hostel", color: "#34d399", loop: true,
      hours: "7:30 AM - 8:00 PM",
      points: ["mhQ", { lat: 12.9658, lng: 79.1518 }, "foodys", { lat: 12.9680, lng: 79.1540 }, "sjt", "tt"]
    },
    lh: {
      name: "Route 3: Ladies' Hostel Shuttle", short: "Ladies' Hostel", color: "#f472b6", loop: true,
      hours: "7:30 AM - 8:00 PM",
      points: ["lh", "smv", "tt", { lat: 12.9714, lng: 79.1615 }, "mainGate"]
    },
    night: {
      name: "Route 4: Late Night Transit", short: "Late Night", color: "#fbbf24", loop: true,
      hours: "8:00 PM - 12:00 AM",
      points: ["mainGate", "tt", "smv", "sjt", "library", "foodys", "mhQ", "lh"]
    }
  }
};
