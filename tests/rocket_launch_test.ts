// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT'S OWN LIFT-OFF — the launch cutscene a rocket minigame plays when
// nothing else has already played it (`rocket-screen/RocketLaunch.tsx`).
//
// The campaign never needed one: the moon run's prelude plays `launch` on the
// garage lot and the flight mounts on the black it goes out on. A cabinet off
// the arcade shelf and the `?rocket` workbench have no prelude behind them, so
// they ask `RocketScreen` for the scene themselves — which is what these pin,
// along with the two facts that make the handover safe: the scene ENDS, and it
// is dressed as the FIRST fire.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  advanceCutsceneBeat,
  createCutscene,
  cutsceneDef,
  currentLine,
  finishCutscene,
  stepCutscene,
  type CutsceneDef,
  type CutsceneState,
} from "@game/core";

import { LAUNCH_SCENE } from "../pwa/src/game/rocket-screen/begin.ts";

const source = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

const STEP_MS = 16;
/** How long a held text beat is left up before the stand-in player turns it —
 * the gallery's own reading dwell, and far longer than any crawl in the scene. */
const READ_MS = 3000;
/** Sim ceiling (ms). The scene is ~17 s of timeline plus its held pages; a run
 * that reaches this has stalled, which is the failure being pinned. */
const GIVE_UP_MS = 180_000;

/** Play the scene the way `RocketLaunch` does — the loop steps it, the player
 * turns a page that is still up — and answer how long it took to end. */
function playedThrough(scene: CutsceneState, def: CutsceneDef): number {
  let atBeat = -1;
  let beatMs = 0;
  let ms = 0;
  while (!scene.done && ms < GIVE_UP_MS) {
    stepCutscene(scene, def, STEP_MS);
    ms += STEP_MS;
    if (scene.beat !== atBeat) {
      atBeat = scene.beat;
      beatMs = 0;
      continue;
    }
    beatMs += STEP_MS;
    if (beatMs < READ_MS) continue;
    beatMs = 0;
    advanceCutsceneBeat(scene, def);
  }
  return ms;
}

describe("the flight's launch cutscene", () => {
  const def = cutsceneDef(LAUNCH_SCENE);

  it("ends on its own, so the sky is never held on the lawn", () => {
    // The whole contract of the opening: `RocketLaunch` hands over on
    // `scene.done`, and a scene that could not reach it is a cabinet the
    // player can never fly.
    const scene = createCutscene(def, []);
    const ms = playedThrough(scene, def);
    expect(scene.done).toBe(true);
    expect(ms).toBeLessThan(GIVE_UP_MS);
  });

  it("SKIP ends it outright — one press is always enough", () => {
    const scene = createCutscene(def, []);
    // Not already over on the opening beat, or the assertion below is vacuous.
    expect(scene.done).toBe(false);
    finishCutscene(scene, def);
    expect(scene.done).toBe(true);
    // A skipped scene makes no noise: the beats it settled in one turn must
    // not fire their sounds as a chord over the handover.
    expect(scene.sounds).toEqual([]);
  });

  it("speaks — the lot is a scene, not a hold on a still picture", () => {
    const scene = createCutscene(def, []);
    let spoke = false;
    let atBeat = -1;
    let beatMs = 0;
    for (let ms = 0; ms < GIVE_UP_MS && !scene.done; ms += STEP_MS) {
      stepCutscene(scene, def, STEP_MS);
      if (currentLine(scene, def)) spoke = true;
      if (scene.beat !== atBeat) {
        atBeat = scene.beat;
        beatMs = 0;
        continue;
      }
      beatMs += STEP_MS;
      if (beatMs < READ_MS) continue;
      beatMs = 0;
      advanceCutsceneBeat(scene, def);
    }
    expect(spoke).toBe(true);
  });

  it("is dressed as the FIRST fire — the trip it opens is the one to the moon", () => {
    // The lot climbs a ladder of `cleared:` tags: a whole house, then a burnt
    // shell once the homecoming is behind him, then a gutted one after Mars. A
    // lap has no history, and the flight it opens is always the moon's — so the
    // house standing on it is the one nobody has lit a rocket beside yet.
    const scene = createCutscene(def, []);
    expect(scene.hiddenProps).toContain("house_burnt");
    expect(scene.hiddenProps).toContain("house_gutted");
    expect(scene.hiddenProps).not.toContain("house");
  });
});

describe("who asks for the lift-off", () => {
  // The prop is the whole seam, so the check is that each door sets it the way
  // its own opening demands. Read from the source because the wiring is JSX:
  // there is no DOM in this suite to mount a screen into.
  const arcade = source("pwa/src/game/MinigameScreen.tsx");
  const workbench = source("pwa/src/game/rocket-screen/RocketWorkbench.tsx");
  const campaign = source("pwa/src/game/GameScreen.tsx");

  it("the arcade cabinet does — except on the MOON LANDING lap, which never left the lawn", () => {
    expect(arcade).toMatch(
      /<RocketScreen[\s\S]*?launch=\{flightParams\.leg !== "landing"\}[\s\S]*?\/>/,
    );
  });

  it("the workbench does, on the lap a sitting opens with", () => {
    expect(workbench).toMatch(/launch=\{lap === 0 && /);
  });

  it("the campaign does NOT — its prelude already played the same scene", () => {
    const mount = /<RocketScreen[\s\S]*?\/>/.exec(campaign)?.[0];
    expect(mount, "GameScreen no longer mounts RocketScreen").toBeTruthy();
    expect(mount).not.toMatch(/\blaunch\b/);
  });
});
