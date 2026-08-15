---
title: A draw-order bug lives in a narrow band — compute the band from the art, then shoot it with the fix stashed and unstashed
date: 2026-08-15
scope: pwa/src/game/render/
concepts: [sorting, repro, screenshots, before-after]
---

A "the hero draws behind X" bug is only wrong for the few world px between where
the art's silhouette really meets the ground and where its anchor claims to.
Staging "near X" and eyeballing the shot reproduces nothing: the first two
positions I tried were already correct, and a 4× crop of a correct frame still
looked wrong.

Get the band from the art instead. Read the sprite's YAML grid, find the lowest
non-`.` row in the column the hero will stand in, and convert:
`worldY = pos.y - (height - 2) + row` (`drawWorldSprite`'s "base" anchor seats
the last two rows below the mark). Stage a hero whose feet
(`pos.y + PLAYER.footLift`) land inside that band and the bug is unmissable.

Then prove it BOTH ways in one minute — stash only the file you changed, shoot,
pop, shoot:

```sh
git stash push pwa/src/game/render/vehicles.ts
node pwa/scripts/playtest.mjs --strategy idle --seed 1 --level garage --timeout 6 \
  --scenario '{"place":{"x":113,"y":220},"freeze":true,"disarmed":true,"clearEnemies":true,
               "stopWaves":true,"reveal":true,"muteDialogue":true,"noVictory":true}'
git stash pop
```

`--timeout 6` is plenty for a frozen pose, and crop to ~80×60 world px at 8× —
at 4× a one-pixel sort difference is invisible.
