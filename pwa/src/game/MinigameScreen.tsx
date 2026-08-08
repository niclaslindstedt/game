// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A MINIGAME, PLAYED ON ITS OWN — what the main menu's arcade shelf mounts.
//
// IT IS THE REAL MINIGAME, not a diorama: the same `DriveScreen` a campaign
// hands the wheel to, on the same `createDrive`, banking to the same board. What
// this adds is only what a RUN would otherwise have settled — which rung, what
// seed — and somewhere to land when the road ends, because there is no crossing
// waiting on the far side of it.
//
// AND IT IS THE PLAYER'S DOOR, not the developer's. `DriveWorkbench` (`?drive`)
// is the same idea for working ON the road: it is folded out of a store build,
// it takes its leg, its rung, its seed and its staged collisions off the query
// string, and it laps forever without ever showing a board. This one ships,
// takes what the shelf chose, and ends on the cabinet's high-score screen —
// which is the whole point of playing it here.
//
// ONE LAP, THEN THE SHELF. Arriving (or giving up on the pause card) drops back
// to the MINIGAMES screen with the cursor still on the cabinet, so another go is
// one press. A cabinet that re-racked itself would be the attract loop's
// behaviour, and it would take the way out with it: the road's own pause card is
// the only exit, and the title card at the top of each lap owns the first key.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import type { Difficulty } from "@game/menu";

import { loadGameAssets, peekGameAssets, type GameAssets } from "./assets.ts";
import { synth } from "./audio.ts";
import { arcadeDriveParams } from "./drive-screen/begin.ts";
import { DriveScreen } from "./drive-screen/DriveScreen.tsx";
import { LoadingScreen } from "./LoadingScreen.tsx";
import type { MinigameId } from "./minigames.ts";
import { captureScreen } from "./screenshots.ts";
import { playUiSound } from "./sfx/ui.ts";

export function MinigameScreen({
  id,
  difficulty,
  heroName,
  onExit,
}: {
  id: MinigameId;
  /** The rung the shelf is set to — what the road WEIGHS, and the only thing a
   * difficulty changes about a minigame. */
  difficulty: Difficulty;
  /** The active hero's name, for the road's speech box. Absent when no hero is
   * picked: the shelf is the player's rather than a hero's, so a cabinet is
   * playable with an empty roster and the box simply goes unheaded. */
  heroName?: string;
  /** Back to the arcade shelf — however the road ended. */
  onExit: () => void;
}): ReactElement | null {
  // `RefObject<T>` already includes the null under Preact's types — see
  // AGENTS.md → the three places Preact's types are not React's.
  const rootRef = useRef<HTMLDivElement>(null);
  const [assets, setAssets] = useState<GameAssets | null>(peekGameAssets);
  // THE ROAD IS SETTLED ONCE, on the way in: `DriveParams` is what the whole leg
  // is built from, and a fresh object every render would rebuild the drive under
  // the player. The seed is the clock, as a campaign leg's is — so each go is a
  // different stretch of road and none of them is ever replayed by accident.
  const [params] = useState(() =>
    arcadeDriveParams(Date.now() >>> 0, difficulty),
  );

  useEffect(() => {
    if (assets) return;
    let live = true;
    void loadGameAssets().then((loaded) => {
      if (live) setAssets(loaded);
    });
    return () => {
      live = false;
    };
  }, [assets]);

  /** The SCREENSHOT bind, here as in a run. No flash miniature — the shelf that
   * shows one belongs to a run, and a cabinet has none; the shutter and the roll
   * are what a player taking a picture of their board needs. */
  const takeScreenshot = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    playUiSound(synth, "shutter");
    void captureScreen(root, "THE DRIVE");
  }, []);

  if (!assets) return <LoadingScreen />;
  // One cabinet, and the id is what a second one joins on. The catalog answers
  // WHICH — this answers WHAT IT IS, because only this module may reach the
  // simulation (`minigames.ts` is on the startup path).
  if (id !== "drive") return null;
  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0 }}>
      <DriveScreen
        params={params}
        assets={assets}
        heroName={heroName}
        // NO PORTRAIT. The doll is dressed from a `GameState` — the worn armor,
        // the held weapon, the blood on his coat — and a cabinet has no run
        // behind it to read one off, so the speech box prints his name over the
        // lines and stands a shade shorter.
        heroPortrait={null}
        arcade
        onScreenshot={takeScreenshot}
        // ARRIVED, and the board has been signed: there is no crossing to make,
        // so the road hands back to the shelf.
        onArrived={onExit}
        // …and the pause card's MAIN MENU lands in exactly the same place. It
        // costs nothing here: no hero to bank, no run to end, no trip anybody
        // was waiting on — just a lap given up on.
        onMenu={onExit}
      />
    </div>
  );
}
