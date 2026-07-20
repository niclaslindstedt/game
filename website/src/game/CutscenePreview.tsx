// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cutscene workbench (`?cutscene=<id>`): plays one scene from the
// catalog on a loop, outside any game run, so scene authors can iterate —
// edit defs/cutscenes.ts, hot-reload, watch it again. Tap advances a beat,
// SKIP ends it, REPLAY restarts. `window.__cutscene` (with `?debug`) exposes
// the live scene state to the automated preview harness
// (website/scripts/cutscene-preview.mjs).

import { useEffect, useMemo, useState } from "react";

import {
  advanceCutsceneBeat,
  createCutscene,
  cutsceneDef,
  finishCutscene,
  stepCutscene,
  type CutsceneState,
} from "@game/core";

import { startGameLoop } from "@ui/lib/game-loop.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { loadGameAssets, type GameAssets } from "./assets.ts";
import { CutsceneOverlay } from "./CutsceneOverlay.tsx";
import { LoadingScreen } from "./LoadingScreen.tsx";

export function CutscenePreview({ id }: { id: string }) {
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [take, setTake] = useState(0); // bumps on REPLAY
  // Which take has finished — comparing against `take` avoids resetting any
  // state synchronously when a replay swaps the scene in.
  const [doneTake, setDoneTake] = useState(-1);
  const done = doneTake === take;
  const def = cutsceneDef(id);
  // A fresh scene per take; the loop below mutates it in place.
  const scene = useMemo<CutsceneState>(
    () => createCutscene(def),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- take restarts the scene
    [def, take],
  );

  useEffect(() => {
    let alive = true;
    void loadGameAssets().then((loaded) => {
      if (alive) setAssets(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("debug")) {
      (window as { __cutscene?: CutsceneState }).__cutscene = scene;
    }
    const stop = startGameLoop({
      simulate(dtMs) {
        stepCutscene(scene, def, dtMs);
        if (scene.done) setDoneTake(take);
      },
      render() {},
    });
    return stop;
  }, [scene, def, take]);

  if (!assets) {
    return <LoadingScreen />;
  }

  return (
    <div className="game-screen">
      <CutsceneOverlay
        cutscene={scene}
        assets={assets}
        font={assets.font}
        onTap={() => advanceCutsceneBeat(scene, def)}
        onSkip={() => finishCutscene(scene, def)}
      />
      {done && (
        <div className="cutscene-replay">
          <button
            type="button"
            className="pixel-button"
            aria-label="replay-cutscene"
            onClick={() => setTake((t) => t + 1)}
          >
            <PixelText
              font={assets.font}
              text="REPLAY"
              scale={3}
              color="#0b0d10"
            />
          </button>
        </div>
      )}
    </div>
  );
}
