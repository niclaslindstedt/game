---
title: A menu's highlight and help-line bugs are INVISIBLE to a desktop screenshot — emulate touch or you are checking the wrong build
date: 2026-08-12
scope: pwa/src/game/title-screen/, pwa/src/game/TitleScreen.tsx
concepts: [layout, screenshots, touch, highlight, help-line, verification]
---

Whether a menu row is lit at all turns on `(any-pointer: fine)`: with a mouse
the cursor RESTS on the row it is on, so a desktop capture always shows one row
amber and the help line naming it — the healthy picture — no matter how broken
the phone is. The reported bug (a help line describing a row nothing pointed at)
reproduced only under Playwright's `isMobile: true, hasTouch: true` with a
mobile `userAgent`; the same page at 1280×800 looked perfect in the same run.

Two practical notes for the loop. A Playwright script in the scratchpad cannot
`import "playwright"` (node resolves from the SCRIPT's directory, not the cwd) —
import `/home/user/game/node_modules/playwright/index.js` as a default and
destructure it, and launch with
`executablePath: "/opt/pw-browsers/chromium"`. And a row's selector is
`[aria-label="<screen>-<row-id>"]` (`rowAria`), so the DEVELOPER index is
reached by clicking `main-settings` then `settings-developer` — not `settings`.
