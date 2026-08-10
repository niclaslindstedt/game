---
title: The DRIVE's high-score board is unreachable by the bot — drive it by hand and push `window.__drive.distance`
date: 2026-08-10
scope: pwa/src/game/drive-screen/, pwa/scripts/playtest.mjs
concepts: [minigame, drive, playtest, harness, debug-hooks]
---

`?bot=1` cannot verify anything on the drive's RANKING board: an auto-driven
leg arrives SILENTLY and the board is never raised for one (deliberately — see
`DriveScreen.arrive`), so a harness that waits for `.drive-scores` under the bot
waits forever.

Driving it by hand from Playwright does not work either on its own. Holding
`ArrowUp` with no steering wrecks the wagon inside ten seconds — the car sits at
0 mph against a parked one and the finish never comes — and a leg cut SHORT to
dodge that (`&course=900`) arrives with an EMPTY clock, which ranks as `null`
and prints the un-signable "YOU 0'00\"00" row instead of the name entry.

What works: `?drive&city=0&course=2500&debug` (the `city=0` starts the leg
inside the town so the clock is already running), hold `ArrowUp` for a few
seconds so the clock reads something real, then shove the road under the car
from the harness every 200 ms —

```js
const d = window.__drive;
d.car.damage = 0;
for (const p of d.props) p.x += 4000;
for (const t of d.traffic) t.x += 4000;
d.distance += 600;
```

— until `.drive-scores` appears. Give the context `hasTouch`/`isMobile` to
exercise the TOUCH branch of the board (it leaves the name field unfocused on a
coarse pointer) and a plain desktop context for the other.
