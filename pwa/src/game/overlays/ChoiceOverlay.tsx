// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SPARE-or-KILL verdict: shown while the engine pauses in the `choice`
// phase — a beaten spareable unique (one of the rift's historic residents)
// kneels and awaits the player's call. SPARE recruits it into the party
// (its joining scene follows through the dialogue overlay); KILL lands the
// withheld blow through the ordinary kill rails. One tap, one fate.

import { enemyDef, resolveChoice, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type GameAssets } from "../assets.ts";

export function ChoiceOverlay({
  state,
  assets,
  font,
  onResolve,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  onResolve: (spared: boolean) => void;
}) {
  if (!state.choice) return null;
  const def = enemyDef(state.choice.defId);
  const portrait = spriteDataUrl(assets.sprites, `${def.sprite}_0`);
  return (
    <div className="game-overlay choice-overlay">
      <div className="choice-box">
        <div className="choice-head">
          {portrait ? (
            <span className="choice-portrait-frame">
              <img src={portrait} alt="" className="pixel-img" />
            </span>
          ) : null}
          <div className="choice-title">
            <PixelText font={font} text={def.name} scale={3} color="#ffd75e" />
            <PixelText
              font={font}
              text="BEATEN. AT YOUR MERCY."
              scale={2}
              color="#9aa3ad"
            />
          </div>
        </div>
        <div className="choice-buttons">
          <button
            type="button"
            className="pixel-button choice-button choice-spare"
            aria-label="spare"
            onClick={() => {
              if (resolveChoice(state, true)) onResolve(true);
            }}
          >
            <PixelText font={font} text="SPARE" scale={3} color="#0b0d10" />
            <PixelText
              font={font}
              text="THEY JOIN YOUR SIDE"
              scale={2}
              color="#1d4034"
            />
          </button>
          <button
            type="button"
            className="pixel-button choice-button choice-kill"
            aria-label="kill"
            onClick={() => {
              if (resolveChoice(state, false)) onResolve(false);
            }}
          >
            <PixelText font={font} text="KILL" scale={3} color="#0b0d10" />
            <PixelText
              font={font}
              text="TAKE THE LOOT"
              scale={2}
              color="#4a1d1d"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
