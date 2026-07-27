// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cutscene workbench (`?cutscene=<id>`): plays one scene from the
// catalog on a loop, outside any game run, so scene authors can iterate —
// edit defs/cutscenes.ts, hot-reload, watch it again. Tap advances a beat,
// SKIP ends it, REPLAY restarts. `window.__cutscene` (with `?debug`) exposes
// the live scene state to the automated preview harness
// (pwa/scripts/cutscene-preview.mjs).

import { useEffect, useMemo, useState } from "react";

import {
  advanceCutsceneBeat,
  createCutscene,
  cutsceneDef,
  CUTSCENE_DEFS,
  error,
  finishCutscene,
  stepCutscene,
  type CutsceneState,
} from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";
import { startGameLoop } from "@ui/lib/game-loop.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { loadGameAssets, type GameAssets } from "./assets.ts";
import { CutsceneOverlay } from "./overlays/CutsceneOverlay.tsx";
import { LoadingScreen } from "./LoadingScreen.tsx";

/**
 * The workbench's front door. The catalog check lives HERE rather than in the
 * app shell so `CUTSCENE_DEFS` loads with this chunk instead of riding the
 * entry bundle for every player who never types the param: an id the catalog
 * doesn't carry drops `?cutscene` and reloads onto the title, which is where an
 * unrecognised id landed before.
 */
export function CutscenePreview({ id }: { id: string }) {
  const known = id in CUTSCENE_DEFS;
  useEffect(() => {
    if (known) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("cutscene");
    window.location.replace(url.toString());
  }, [known]);
  if (!known) return <LoadingScreen />;
  return <CutsceneStage id={id} />;
}

function CutsceneStage({ id }: { id: string }) {
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
      onError: (err, phase) => {
        error(`cutscene preview ${phase} failed: ${describeError(err)}`);
      },
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
