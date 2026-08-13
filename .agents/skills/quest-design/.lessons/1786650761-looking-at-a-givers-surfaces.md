---
title: To LOOK at a giver's pick list you need a giver with two UNGATED errands — most open on a single ask, and the first tap is eaten by the intro talk
date: 2026-08-13
scope: pwa/src/game/overlays/, content/quest-givers.yaml
concepts: [staging, screenshots, playwright, overlays, verification]
---

The skill's step 9 stages the hero on a giver; three things stand between that
and a screenshot of the surface you actually changed.

**The bot will not do it.** In the hub it boards the wagon and drives out, so a
`?bot=` playtest ends on the road or in the DRIVE. Drop the bot and stage with
`?scenario={"place":{x,y},"clearEnemies":true,"stopWaves":true,"skipOpening":true}`
at the giver's own `at:` plus a few px — `place` works fine, it just loses to a
bot that walks away.

**Tapping is a screen-space guess.** The world carries a yaw, so click a small
grid around the canvas centre until `.quest-box` appears rather than computing
the giver's screen seat.

**The first tap is not the slate.** A giver with an `intro:` (Ruth) spends tap
one on the arrival conversation; the slate opens on the tap AFTER it. And a
giver with exactly ONE topic never shows a list at all — the engine opens the
ask directly. Ruth is therefore the wrong subject for a pick-list change: her
other errands are chain-gated, so she is a list of one all night.
`hq_intern` on `goodco_hq` (`hq_night_log` + `hq_line_stop`, both ungated) is
the shipped giver that opens on a two-row slate from the first visit — place at
`{x: 486, y: 700}`.

Note the DOM is shared: `TalkOverlay` and `QuestOverlay` both render
`.quest-topics` rows in a `.quest-box`, so a selector that means "the slate"
has to be one only `QuestOverlay` emits.
