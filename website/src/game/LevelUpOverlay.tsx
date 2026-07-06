// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level-up chooser: shown while the engine pauses in the `levelup`
// phase. One button per stat; each click spends one banked point through
// `allocateStat`, and play resumes automatically when the last point is
// spent.

import {
  allocateStat,
  effectiveStat,
  type GameState,
  type StatName,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

const CHOICES: { stat: StatName; label: string; blurb: string }[] = [
  { stat: "health", label: "HEALTH", blurb: "+20 MAX HP" },
  { stat: "strength", label: "STRENGTH", blurb: "MELEE DAMAGE" },
  { stat: "dexterity", label: "DEXTERITY", blurb: "RANGED DAMAGE" },
  { stat: "intelligence", label: "INTELLECT", blurb: "MAGIC DAMAGE" },
  { stat: "luck", label: "LUCK", blurb: "CRITS + LOOT" },
];

export function LevelUpOverlay({
  state,
  font,
  onChange,
}: {
  state: GameState;
  font: PixelFont;
  onChange: () => void;
}) {
  const points = state.player.pendingStatPoints;
  return (
    <div className="game-overlay levelup-overlay">
      <div className="levelup-box">
        <PixelText font={font} text="LEVEL UP!" scale={5} color="#ffd75e" />
        <PixelText
          font={font}
          text={
            points > 1 ? `CHOOSE A STAT (${points} POINTS)` : "CHOOSE A STAT"
          }
          scale={2}
          color="#9aa3ad"
        />
        <div className="stat-buttons">
          {CHOICES.map(({ stat, label, blurb }) => (
            <button
              key={stat}
              type="button"
              className="pixel-button stat-button"
              aria-label={`stat-${stat}`}
              onClick={() => {
                allocateStat(state, stat);
                onChange();
              }}
            >
              <PixelText
                font={font}
                text={`${label} ${effectiveStat(state, stat)}`}
                scale={2}
                color="#0b0d10"
              />
              <PixelText font={font} text={blurb} scale={1} color="#3a4048" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
