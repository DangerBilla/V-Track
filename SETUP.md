# V-Track live tracking: setup

The site works in **demo mode** (a pretend bus) until you connect a free database.

## 1. Create the free Firebase database (about 5 minutes)

1. Go to https://console.firebase.google.com and sign in with a Google account.
2. **Add project**, name it `v-track` (you can switch off Google Analytics).
3. Left menu: **Build -> Realtime Database -> Create Database**.
   Pick the location closest to India (Singapore), and start in **locked mode**.
4. Open the **Rules** tab, paste this, and click **Publish**:

```json
{
  "rules": {
    "buses": {
      ".read": true,
      "$bus": {
        ".write": true,
        ".validate": "newData.hasChildren(['lat','lng','ts']) && newData.child('lat').isNumber() && newData.child('lng').isNumber()"
      }
    }
  }
}
```

5. Click the gear icon -> **Project settings** -> scroll to **Your apps** -> click **</>** (Web).
   Register the app (any name). Firebase shows a `firebaseConfig` block.
6. Copy those values into the `firebase: { ... }` section of `config.js`.
   Make sure `databaseURL` is filled in (it looks like `https://v-track-xxxx-default-rtdb.asia-southeast1.firebasedatabase.app`).

## 2. Set your real stops

In `config.js`, replace the placeholder coordinates. For each stop:
open Google Maps, press and hold on the exact spot, copy the two numbers (latitude, longitude).
Add extra unnamed points along curves so the blue line follows the real road.

## 3. Change the driver code

In `config.js`, change `driverCode` to something private and give it only to drivers.

## 4. Test with your own phone

1. Publish the site (GitHub Pages gives you an https link, which phones need for GPS).
2. On a phone, open `.../driver.html`, enter shuttle `04` and the driver code, tap **Start sharing**, allow location.
3. On another device open `.../track.html`. You should see the bus move.

## Good to know

- GPS in browsers only works on **https** (GitHub Pages is https) or localhost.
- Keep the driver page open with the screen on. Browsers pause GPS if the page is in the background.
- The driver code sits in the site's code, so it only stops casual misuse. For real protection later, add Firebase Authentication for drivers and restrict `.write` to signed-in drivers.
- Firebase's free plan is plenty for a campus pilot.
