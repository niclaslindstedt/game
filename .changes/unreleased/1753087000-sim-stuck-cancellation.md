---
type: Added
title: Simulator stuck-cancellation + map highlights
---

The headless simulator now books a penalty with world coordinates every time the autopilot stops making progress (wedged on geometry, or loitering in one spot without landing damage), cancels the run when the penalty crosses a limit, and prints the clustered STUCK AREAS with a ready-made command to highlight those coordinates on the map-layout render.
