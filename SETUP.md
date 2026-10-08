# V-Track live tracking: setup

The site works in **demo mode** (simulated shuttles, demo driver logins) until you connect a free Firebase project.

## Demo mode (no setup, good for a review)

1. Open the site, choose **I'm a Driver**, log in with `driver1` / `demo123` (see `demoDrivers` in `config.js`).
2. Pick a number plate and route, tap **Start sharing**. A simulated shuttle starts driving.
3. In another tab of the **same browser**, choose **I'm a Student** (track page). Your shuttle appears on the map and in the list.
   Tap **Stop sharing** and it disappears.

## 1. Create the Firebase project (about 10 minutes)

1. Go to https://console.firebase.google.com, **Add project** (name it `v-track`).
2. **Build -> Realtime Database -> Create Database** (pick Singapore, start in **locked mode**).
3. **Build -> Authentication -> Get started -> Sign-in method -> Email/Password -> Enable**.
4. Gear icon -> **Project settings -> Your apps -> </>** (Web). Copy the `firebaseConfig` values into the
   `firebase: { ... }` section of `config.js` (make sure `databaseURL` is filled in).
5. Realtime Database -> **Rules** tab, paste this and **Publish**:

```json
{
  "rules": {
    "drivers": {
      "$uid": { ".read": "auth != null && auth.uid === $uid" }
    },
    "buses": {
      ".read": true,
      "$bus": {
        ".write": "auth != null && root.child('drivers').child(auth.uid).exists() && (!data.exists() || data.child('uid').val() === auth.uid || data.child('offline').val() === true || now - data.child('ts').val() > 60000)",
        ".validate": "newData.hasChildren(['lat','lng','ts','routeId','uid']) && newData.child('uid').val() === auth.uid && newData.child('lat').isNumber() && newData.child('lng').isNumber() && newData.child('lat').val() >= -90 && newData.child('lat').val() <= 90 && newData.child('lng').val() >= -180 && newData.child('lng').val() <= 180 && newData.child('routeId').isString()"
      }
    }
  }
}
```

What these rules do: anyone can read the live buses; only registered drivers can write; a driver can only take a shuttle
that nobody else is actively sharing.

## 2. Create a login for each driver

For every driver:

1. **Authentication -> Users -> Add user**. Email = `username@vtrack.app` (e.g. `ravi@vtrack.app`), plus a password.
   The driver only types `ravi` on the login page. (The domain comes from `driverEmailDomain` in `config.js`.)
2. Copy that user's **User UID** from the Users table.
3. **Realtime Database -> Data**: add `drivers` -> `<that UID>` -> `name` = the driver's name (e.g. `Ravi`).
   A login without this entry is rejected, even if the account exists.

To remove a driver, delete the `drivers/<UID>` entry (and the user).

## 3. Set your shuttles, stops and routes

- `shuttles` in `config.js`: the number plates drivers choose from (replace the placeholders).
- `STOPS` and `routes`: for each stop, open Google Maps, press and hold on the exact spot and copy the two numbers.
  Add all your stops and extra `{ lat, lng }` bend points along curves. Set `snapToRoads: true` once the coordinates are accurate.
- Delete `demoDrivers` once real logins work.

## 4. Test with two phones

1. Publish the site (GitHub Pages gives https, which phones need for GPS).
2. Phone A: **I'm a Driver** -> log in -> choose plate and route -> **Start sharing** -> allow location.
3. Phone B: **I'm a Student**. The shuttle should appear and move.

## Good to know

- GPS in browsers needs **https** (or localhost). Keep the driver page open with the screen on.
- A phone that loses connection turns its shuttle grey ("Offline"); it disappears after `hideAfterSeconds`.
- If a shuttle leaves its route (more than `offRouteMeters`), its ETA switches to a straight-line estimate shown with "~".
- Firebase's free plan allows roughly 100 people connected at once. Fine for a pilot; check current limits before a campus-wide launch.
