# Race behavior and acceptance criteria

This describes the current product contract. Organizer rules and course data still
need checking against the latest published material before race day.

## Time and race state

- All race clock times use Thailand time (UTC+07:00).
- Race elapsed time uses the scheduled gun start, 14 November 2026 at 05:00.
  Tapping start records actual departure; it does not move the gun start or COTs.
- Before a start record exists, the app remains in pre-race mode. The start button
  unlocks one hour before gun start, including when the page stays open across
  that boundary. Earlier use offers a rehearsal starting at simulated gun time.
- Recording arrival enters a CP stop; recording departure enters the next leg.
  W0 is a recorded stop, but its listed time is advisory, not a COT.
- Recording FIN ends the race. Elapsed time freezes at the finish record while
  the time-of-day clock continues. Undoing FIN resumes the running state.
- COT displays use the fixed station deadlines in `P`. The current app compares
  arrival to these deadlines; confirm arrival-versus-departure rules with the organizer.

## Plans and predictions

- Plans A/B/C target 23:59, 26:59 and 29:59 elapsed; D targets 31:00.
- Custom arrival input is elapsed `hr:mm` (0–99 hours, minutes 00–59). Rest is a
  finite, nonnegative number of minutes. Every arrival must be strictly after
  departure from the previous station. Invalid edits show an explanation and
  preserve the previously saved plan.
- Plans are drafts. Saving a plan beyond a COT is allowed; predictions and COT
  displays help assess it rather than silently changing the user's plan.
- ETA assumes the remaining legs and stops follow the selected plan. On a leg,
  predicted arrival is actual departure plus planned leg duration, bounded below
  by the current time. At a CP, predicted departure is the later of now and
  actual arrival plus planned rest. Remaining planned duration is then added.
- ETA under every plan button updates with the live clock, including overdue
  legs and extended stops. Colors compare gun elapsed finish to the plan goal,
  then the finish COT. These are plan projections, not GPS-based pace estimates.

## Reset and storage

- Race records, checklist, simulation offset and custom plans persist locally.
- “ล้างบันทึกและเลิกจำลองเวลา” clears arrivals, departures, history, checklist,
  backdating and simulation; it preserves custom plans and UI preferences.
- After reset and reload, the next race uses real time. Resetting a plan is a
  separate action affecting only the selected plan.

## Day and Night display

- The original card layout and ordering of race information are retained.
  A Day/Night button sits beside the CP progress bar and is available on every tab.
- Main labels use 15–16 px and supporting text 15 px. Time units and day badges
  have a 13 px floor rather than proportional superscripts shrinking to 6–9 px.
  Primary numbers remain bold; supporting text uses medium weight. Compact
  three-column time values are 20–24 px; plan-button times are 16 px.
- On narrow screens, supporting rows can wrap and supply labels break across
  lines rather than shrinking the text. The existing card/group order stays intact.
- First use follows the device's light/dark preference. The selected theme is
  saved locally with app state and restored on reopening, including offline.
- Toggling changes colors in place: it does not rebuild the current screen,
  move content, change race records, restart GPS or discard unsaved plan edits.
- Night restores the original navy background, blue accents, green primary button
  and blue/purple clock icons. Day uses the same blue/green identity on a light
  background, with darker status and supply colors for readable text. Both modes
  retain the enlarged typography. Supplies keep distinct colors and icons; the
  dropped bag is yellow. Status green/amber/red retains its meaning.
- Map labels, markers, units, selected plans, form controls and browser theme color
  all adapt to the selected mode. Warning colors must not remain after the
  underlying race status changes during a tab switch.

## Route and preparation notes

- Each outgoing leg has one preparation note keyed by source and destination CP.
  FIN has no outgoing note. A5→A6 carries the +1,117 m climb advice; A6→W0 carries
  the last-hot-food-before-W0 advice; W0→A7 carries the descent advice.
- The embedded track is labelled official GPX v1.0 by repository commit `788db7a`.
  CP distances are anchored to the station table, ending at 105.8 km. The original
  GPX and a reproducible import script are not included; upstream provenance and
  later route revisions must be confirmed separately.
- Water quantities and preparation notes are planning advice inherited from the
  app, not newly verified organizer requirements. GPS is an approximate aid;
  official markers and race rules determine the actual course and COT.

## Offline operation and updates

- Installation caches the HTML, manifest and icons. First installation must
  complete online before offline use; there is currently no readiness indicator.
- GET requests try the network first. Only successful HTTP responses may replace
  cache entries. Network failures and HTTP errors use the current version's cache.
  HTML fallback is for navigation only, not missing images or other assets.
- Cache writes must stay alive through completion; a write failure must not
  prevent displaying a successful online response.
- Updates increment the service worker cache version. Activation removes only
  older PST100 caches and preserves unrelated apps' caches on the same origin.
- The app currently waits for the browser's network failure before using cache;
  slow-network fallback and an offline-readiness indicator remain future work.

## Verification

Run `node --test tests/*.test.cjs` for regression checks without dependencies.
Run `python tests/browser_smoke.py` after installing Python Playwright and its
Chromium/WebKit browsers for the mobile UI and real service-worker smoke tests.
Physical iPhone installation, airplane-mode reopening, GPS signal loss and battery
use require a device check before race day; desktop WebKit is not an iOS device.
