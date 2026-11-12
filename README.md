# PST100 Race Day

Offline race-day helper for Pocari Sweat Trail 100 km (14 Nov 2026): aid-station plan, cut-off buffers, supplies per station, elevation profile with GPS position.

Install on iPhone: open the GitHub Pages URL in Safari → Share → Add to Home Screen. Open it once while online so it caches; after that it works without signal.

Data: aid-station table and supplies graphic attributed to the organizer. The embedded route is labelled official GPX v1.0 in the repository history, with distances anchored to the station table (105.8 km). The original GPX is not included; verify the latest course and rules before race day. Plan times and water/preparation advice are drafts.

Labels and controls use concise English; station names, course descriptions and practical race advice remain in Thai. GPS diagnostics and usage tutorials are not shown in the planner.

Behavior and acceptance criteria: [docs/race-behavior.md](docs/race-behavior.md).

Before race day, use **Preview race** to try the planner. Use **Exit preview** in Settings to clear sample records and return to real time while keeping custom plans.

Use the Day/Night button beside CP progress to switch display colors. Your choice is saved on this device; switching keeps race records and unsaved plan edits intact.

The Now screen shows course position, distance to the next CP and finish, and climb/descent remaining to the next CP. Start GPS there or on Profile. Without a fix, values start from the last recorded CP; a stopped or old fix is labelled with its age and accuracy. These are distances along the embedded course, not a GPS odometer. **ETA (plan)** continues to use your plan and CP records, not GPS speed.

Export GPX v3 from Settings using the selected plan and the values currently in its fields, including unsaved edits. Export leaves saved plans and race records intact. Choose **CP only** (11 stops) or **CP + peaks / km** (25 points). The full 8,999-point course and V2 smoothed elevations are cached for offline export. GPX times are fixed plan projections.

Bag drop-off follows the [Race Manual](https://pst.mytrails.run/Racemanual/): shuttle users arrive at CMECC's Ruang Phueng building at 02:30 and deposit before the 03:00 departure; self-arrivals deposit at Wat Wimut Tikaram from 04:00–04:45 on 14 November. Special Need Bags go to A5; finish bags are separate.

Regression tests (Node.js 22+, no dependencies): `node --test tests/*.test.cjs`.
Optional mobile-browser smoke tests: install Python Playwright, run `python -m playwright install chromium webkit`, then `python tests/browser_smoke.py`.

Deploying an update: edit files, bump `VERSION` in `sw.js`, push.
