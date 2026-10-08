# V-Track

Live campus shuttle tracking and ETA for VIT Vellore.

- `index.html` - landing page with Student / Driver chooser
- `track.html` - student live map (route filter, nearest stop, live ETA, offline handling)
- `driver.html` - driver login, number plate choice, start/stop sharing
- `config.js` - stops, routes, shuttle plates, Firebase details
- `shared.js` - route geometry and distance maths

Without Firebase details in `config.js` the site runs in demo mode with simulated shuttles.
See `SETUP.md` to go live.
