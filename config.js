// =====================================================
//  V-Track settings. Edit this file to set up your campus.
// =====================================================
window.VTRACK = {
  // Map centre (VIT Vellore, approximate)
  center: [12.9692, 79.1559],
  zoom: 16,

  routeName: "Academic Loop 1",

  // true  = shuttle goes round in a circle (last stop connects back to the first)
  // false = shuttle runs one way
  loop: true,

  // Used for the ETA when a bus is stopped or the GPS gives no speed
  avgSpeedKmh: 15,

  // A bus is shown as "Offline" if it has not sent a location for this long
  staleSeconds: 45,

  // Drivers type this code on driver.html before sharing location.
  // CHANGE THIS and keep it private (see SETUP.md for stronger protection).
  driverCode: "vtrack123",

  // Paste your Firebase Realtime Database details here (see SETUP.md).
  // Leave databaseURL empty and the site runs in DEMO mode with a fake bus.
  firebase: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    appId: ""
  },

  // ROUTE, in the order the shuttle drives it.
  //  - Points WITH a "name" are bus stops.
  //  - Points WITHOUT a name just bend the line so it follows the road.
  //
  // IMPORTANT: these coordinates are APPROXIMATE PLACEHOLDERS.
  // Replace them with surveyed ones: stand at each stop, open Google Maps,
  // press and hold on the spot, and copy the two numbers shown (lat, lng).
  // Add extra unnamed points along curves so the line follows the real road.
  route: [
    { name: "Main Gate",                    lat: 12.9722, lng: 79.1642 },
    {                                       lat: 12.9714, lng: 79.1615 },
    { name: "Technology Tower (TT) / GDN",  lat: 12.9708, lng: 79.1588 },
    { name: "Silver Jubilee Tower (SJT)",   lat: 12.9692, lng: 79.1559 },
    {                                       lat: 12.9680, lng: 79.1540 },
    { name: "Foodys / Gazebo",              lat: 12.9668, lng: 79.1527 },
    { name: "Men's Hostel (Block Q)",       lat: 12.9650, lng: 79.1510 }
  ]
};
