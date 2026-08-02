// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// YOU FELL — what the LOCAL player looks at while their hero lies on the field
// in a party that is still fighting (docs/multiplayer.md). Not the defeat
// splash: the run is not over, nobody else's game stopped, and the one choice
// on it is WHEN to take the walk back. RESPAWN is the `respawn` run command —
// up at the level's start at full health, the toll already paid at the fall,
// the corpse holding the kit where it dropped.
//
// Never mounts solo: one hero down is the party wiped, and that is the death
// scene and the defeat splash exactly as ever (`Hud.downed` is the gate).

import type { GameState } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { runCommandOk } from "../run-commands.ts";

export function DownedOverlay({
  state,
  font,
  bumpUi,
}: {
  state: GameState | null;
  font: PixelFont;
  /** Republish the HUD after the verb — the overlay unmounts off it. */
  bumpUi: () => void;
}) {
  return (
    <div className="game-splash">
      <PixelText font={font} text="YOU FELL" scale={6} color="#ff6d6d" />
      <PixelText
        font={font}
        text="YOUR GEAR LIES WHERE YOU DROPPED"
        scale={2}
        color="#9aa3ad"
        align="center"
        maxWidth={26}
      />
      <div className="splash-buttons">
        <button
          type="button"
          className="pixel-button"
          aria-label="respawn"
          onClick={() => {
            if (runCommandOk(state, "respawn")) bumpUi();
          }}
        >
          <PixelText font={font} text="RESPAWN" scale={3} color="#7ef0c8" />
        </button>
      </div>
    </div>
  );
}
