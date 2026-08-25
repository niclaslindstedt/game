// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAUNCH, PLAYED BY THE MINIGAME ITSELF — the lawn, the storm and the
// lift-off that the flight opens on when nothing else has already played them.
//
// IN THE CAMPAIGN THE SKY IS NEVER THE FIRST THING. The moon run's prelude
// plays `launch` on the garage lot, the chain announces it (`sceneEnded`), and
// the flight mounts on the black it goes out on — so the player is already off
// the ground and in the storm the scene authored when the controls arrive. A
// cabinet on the arcade shelf and the `?rocket` workbench had no prelude behind
// them, so the same flight began mid-air with no reason to be there.
//
// SO THE SCENE IS THE MINIGAME'S OWN OPENING when it is asked for, and it is
// the SHIPPED scene rather than a diorama of one: `createCutscene` from the
// compiled catalog, `stepCutscene` on the loop, `CutsceneOverlay` drawing it —
// the three a prelude is played with. Nothing here decides what the launch
// looks like.
//
// AND IT MAKES ITS OWN NOISE. A `sound` beat queues an id on the scene state
// for whoever is playing it to fire; in the campaign that is the run's step
// pipeline, and here it is this file's own loop — the ignition and the lift-off
// are the two moments of the flight nobody would forgive being silent.
//
// NO RUN TAGS. `launch`'s dressing climbs a ladder of `cleared:` tags — a whole
// house the first time, a burnt shell after the homecoming, a gutted one after
// Mars (`content/cutscenes/launch.yaml`) — and the trip this scene opens is the
// one to the MOON, which in the campaign is always the FIRST fire. An arcade lap
// that showed the player a two-fire house would be claiming a history the lap
// does not have.

import { useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";

import {
  advanceCutsceneBeat,
  createCutscene,
  cutsceneDef,
  error,
  finishCutscene,
  stepCutscene,
  type CutsceneState,
} from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";
import { startGameLoop } from "@ui/lib/game-loop.ts";

import type { GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { playTypewriterHaptic } from "../haptics.ts";
import {
  CutsceneOverlay,
  type CutsceneReveal,
} from "../overlays/CutsceneOverlay.tsx";
import { playFlightSound } from "../sfx/index.ts";
import { playUiSound } from "../sfx/ui.ts";

import { LAUNCH_SCENE } from "./begin.ts";

/** The reveal state before the overlay has published its own. */
const IDLE_REVEAL: CutsceneReveal = { done: true, skip: () => {} };

export function RocketLaunch({
  assets,
  heroName,
  onDone,
}: {
  assets: GameAssets;
  /** Whose name the scene's `{HERO}` resolves to. Absent off the shelf, where
   * a cabinet is the player's rather than one hero's. */
  heroName?: string;
  /** The lot is behind us — let the flight's own cards run. Called once,
   * however the scene ended. */
  onDone: () => void;
}): ReactElement {
  const def = cutsceneDef(LAUNCH_SCENE);
  const scene = useMemo<CutsceneState>(() => createCutscene(def, []), [def]);
  // Latched: the loop keeps stepping a finished scene for the frames between
  // `done` and the unmount, and the handover must not be booked twice.
  const handedOver = useRef(false);
  const doneRef = useRef(onDone);
  const revealRef = useRef<CutsceneReveal>(IDLE_REVEAL);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const stop = startGameLoop({
      simulate(dtMs) {
        stepCutscene(scene, def, dtMs);
        // A `sound` beat only WRITES ITS NAME DOWN (stepping a scene is pure),
        // so the queue is drained HERE — the job the run's own step does for a
        // scene the campaign plays (`engine/game/step/index.ts`, which turns it
        // into a `cutsceneSound` event). Nothing else drains it, and an
        // undrained queue is a scene that plays in silence. The ids are
        // content's, so they go through the same live bank the flight's own
        // sounds do and a mod's replacement is heard on the pad.
        for (const sfx of scene.sounds) playFlightSound(synth, sfx);
        scene.sounds.length = 0;
        if (!scene.done || handedOver.current) return;
        handedOver.current = true;
        doneRef.current();
      },
      // The scene draws itself — `CutsceneOverlay` owns a canvas of its own,
      // because the stage is a fixed letterbox and the dialogue box over it is
      // DOM.
      render() {},
      onError: (err, phase) => {
        error(`rocket launch ${phase} failed: ${describeError(err)}`);
      },
    });
    return stop;
  }, [scene, def]);

  // The run's own scene keys (`game-screen/controls.ts`): SPACE/ENTER turns the
  // page — finishing the crawl first, so one press never eats a line nobody has
  // read — and ESCAPE cuts to the sky. The flight's controls are parked behind
  // this, so nothing else is listening.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.key === "Enter") {
        event.preventDefault();
        if (!revealRef.current.done) {
          revealRef.current.skip();
          return;
        }
        advanceCutsceneBeat(scene, def);
        playUiSound(synth, "move");
        return;
      }
      if (event.key !== "Escape") return;
      finishCutscene(scene, def);
      playUiSound(synth, "back");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, def]);

  return (
    <CutsceneOverlay
      cutscene={scene}
      assets={assets}
      font={assets.font}
      heroName={heroName}
      revealRef={revealRef}
      onBlip={() => {
        playUiSound(synth, "blip");
        playTypewriterHaptic();
      }}
      onTap={() => {
        advanceCutsceneBeat(scene, def);
        playUiSound(synth, "move");
      }}
      onSkip={() => {
        finishCutscene(scene, def);
        playUiSound(synth, "back");
      }}
    />
  );
}
