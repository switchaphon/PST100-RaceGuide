# PST100 Race Day

Offline race-day helper for Pocari Sweat Trail 100 km (14 Nov 2026): aid-station plan, cut-off buffers, supplies per station, elevation profile with GPS position.

Install on iPhone: open the GitHub Pages URL in Safari → Share → Add to Home Screen. Open it once while online so it caches; after that it works without signal.

Data: aid-station table and supplies graphic attributed to the organizer. The embedded route is labelled official GPX v1.0 in the repository history, with distances anchored to the station table (105.8 km). The original GPX is not included; verify the latest course and rules before race day. Plan times and water/preparation advice are drafts.

Labels and controls use concise English; station names, course descriptions and practical race advice remain in Thai. GPS diagnostics and usage tutorials are not shown in the planner.

Behavior and acceptance criteria: [docs/race-behavior.md](docs/race-behavior.md).

Before race day, use **Preview race** to try the planner. Use **Exit preview** in Settings to clear sample records and return to real time while keeping custom plans.

Use the Day/Night button beside CP progress to switch display colors. Your choice is saved on this device; switching keeps race records and unsaved plan edits intact.

Regression tests (Node.js 22+, no dependencies): `node --test tests/*.test.cjs`.
Optional mobile-browser smoke tests: install Python Playwright, run `python -m playwright install chromium webkit`, then `python tests/browser_smoke.py`.

Deploying an update: edit files, bump `VERSION` in `sw.js`, push.
