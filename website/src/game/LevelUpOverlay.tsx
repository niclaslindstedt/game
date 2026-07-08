// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level-up chooser: shown while the engine pauses in the `levelup`
// phase. One button per stat; each click spends one banked point through
// `allocateStat`, and play resumes automatically when the last point is
// spent. Each button carries a short blurb; the (i) toggle opens a panel with
// the full per-stat effects (kept in sync with the engine's STATS rules).

import { useState } from "react";

import { allocateStat, effectiveStat, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { type Sprites } from "./assets.ts";
import { STAT_CHOICES as CHOICES, StatGlyph } from "./statChoices.tsx";

export function LevelUpOverlay({
  state,
  font,
  sprites,
  onChange,
}: {
  state: GameState;
  font: PixelFont;
  sprites: Sprites;
  onChange: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const points = state.player.pendingStatPoints;
  return (
    <div className="game-overlay levelup-overlay">
      <div className="levelup-box">
        <div className="levelup-header">
          <PixelText font={font} text="LEVEL UP!" scale={5} color="#ffd75e" />
          <button
            type="button"
            className={`info-button${showInfo ? " active" : ""}`}
            aria-label="toggle-stat-info"
            onClick={() => setShowInfo((v) => !v)}
          >
            <PixelText font={font} text="i" scale={2} color="#0b0d10" />
          </button>
        </div>
        <PixelText
          font={font}
          text={
            points > 1 ? `CHOOSE A STAT (${points} POINTS)` : "CHOOSE A STAT"
          }
          scale={2}
          color="#9aa3ad"
        />
        {showInfo ? (
          <div className="stat-info">
            {CHOICES.map(({ stat, label, info, icon }) => (
              <div key={stat} className="stat-info-row">
                <div className="stat-info-head">
                  <StatGlyph sprites={sprites} icon={icon} />
                  <PixelText
                    font={font}
                    text={label}
                    scale={2}
                    color="#ffd75e"
                  />
                </div>
                <PixelText font={font} text={info} scale={1} color="#c7ccd1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="stat-buttons">
            {CHOICES.map(({ stat, label, blurb, icon }) => (
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
                <StatGlyph sprites={sprites} icon={icon} />
                <span className="stat-button-text">
                  <PixelText
                    font={font}
                    text={`${label} ${effectiveStat(state, stat)}`}
                    scale={2}
                    color="#0b0d10"
                  />
                  <PixelText
                    font={font}
                    text={blurb}
                    scale={1}
                    color="#3a4048"
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
