---
title: A cutscene stepped outside a run makes no sound — its host owns draining `state.sounds`
date: 2026-08-25
scope: pwa/src/game/rocket-screen/, engine/lib/cutscene.ts
concepts: [cutscene, sound, minigame, silent-regression]
---

`stepCutscene` is pure: a `sound` beat only pushes its id onto
`CutsceneState.sounds` and something else has to fire and empty the list. In a
RUN that is `engine/game/step/index.ts`, which turns the queue into
`cutsceneSound` events for `playEventSounds`.

Anything else that steps a scene on its own loop has to do the same job itself,
and nothing warns you: `RocketLaunch.tsx` played the shipped `launch` scene in
total silence, and every check was green because an undrained queue is a
correctly-behaving pure function. Two lines in the host's `simulate`:

```ts
for (const sfx of scene.sounds) playFlightSound(synth, sfx);
scene.sounds.length = 0;
```

Play the ids through the surface's own shared door (`playFlightSound` /
`playDriveSound`), never a direct synth call — they are content's ids, so a
mod's replacement has to be heard on the pad exactly as it is heard in a fight.
`finishCutscene` already drops the queue, so a skipped scene stays silent
without any help.
