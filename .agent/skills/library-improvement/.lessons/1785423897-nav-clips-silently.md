---
title: A fifth nav item is the last one, and it vanishes without a trace
date: 2026-07-30
---

Adding a section to the library adds a name to `.site-nav`, and the nav was
built `flex-wrap: nowrap` with `overflow-x: auto`. Five names in the pixel font
are ~420 px against a 390 px reference phone, so STORY simply ended mid-word at
the right edge — and **nothing reported it**:

- the markup is perfectly well-formed, so no test could see it;
- the page does NOT scroll sideways, because the nav carries the overflow inside
  its own box — so the usual probe (`documentElement.scrollWidth >
  window.innerWidth`) stays green, which is exactly what it was written to do;
- a scroll box with `scrollbar-width: none` draws no affordance at all, so a
  reader cannot even tell there is more.

Only the screenshot at 390 px caught it. The fix is `flex-wrap: wrap` — two tidy
rows beat one clipped one — with the scroll kept underneath as the last resort
for something narrower still. **When a section is added, re-shoot the header at
the reference phone**; the nav is the one piece of shared chrome every new
section silently enlarges.

Two smaller things from the same pass, both also invisible in markup:

- **A trailing unit letter hard against a digit is misread in the pixel font.**
  A rack printing `14S` for a fourteen-second power reads as *145*. A space
  fixes it (`14 S`), and the same trap is waiting for any `12M`, `5X` or `30D`.
- **A rack must be sorted by the number it PRINTS.** The named-item racks were
  ordered on item level while showing the level requirement, and the two agree
  only loosely — so the visible column climbed, stalled and dropped back, and
  the rack read as a heap. Sort on the printed figure and let the other one
  break ties.
