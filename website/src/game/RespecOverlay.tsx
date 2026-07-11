// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The LEVEL TOKEN respec: shown while the engine pauses in the `respec` phase,
// entered once when a token jump's carried build has been refunded into a
// single pool (engine `beginRespec`). A Diablo-style attribute screen with our
// pixel graphics — one row per stat with a −/+ pair, a running "points left"
// counter, and a CONFIRM that unlocks only once every refunded point has been
// re-placed. Points move freely both ways (`allocateStat` / `deallocateStat`)
// until the build is committed. Shares the stat catalog + (i) breakdown with
// the level-up chooser (statChoices.tsx).

import { useState } from "react";

import { allocateStat, deallocateStat, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { type Sprites } from "./assets.ts";
import { STAT_CHOICES as CHOICES, StatGlyph } from "./statChoices.tsx";

export function RespecOverlay({
  state,
  font,
  sprites,
  onChange,
  onConfirm,
}: {
  state: GameState;
  font: PixelFont;
  sprites: Sprites;
  onChange: () => void;
  onConfirm: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const points = state.player.pendingStatPoints;
  const ready = points === 0;
  return (
    <div
      className="game-overlay levelup-overlay respec-overlay"
      onPointerDown={showInfo ? () => setShowInfo(false) : undefined}
    >
      <div
        className="levelup-box respec-box"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="levelup-header">
          <PixelText font={font} text="RESPEC" scale={5} color="#ffd75e" />
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
            ready
              ? "TAKE THE FIGHT AS YOU LIKE"
              : `REALLOCATE - ${points} POINT${points === 1 ? "" : "S"} LEFT`
          }
          scale={2}
          color={ready ? "#7ef0c8" : "#9aa3ad"}
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
                {info.map((line, i) => (
                  <PixelText
                    key={i}
                    font={font}
                    text={line}
                    scale={2}
                    color="#c7ccd1"
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="respec-rows">
            {CHOICES.map(({ stat, label, blurb, icon }) => {
              // Only the points re-placed during this respec (see
              // `spentStats`) — `beginRespec` zeroes the tally, so it grows
              // from zero as the player rebuilds, matching the level-up chooser.
              const value = state.player.spentStats[stat];
              const canAdd = points > 0;
              const canRemove = state.player.stats[stat] > 0;
              return (
                <div key={stat} className="respec-row">
                  <StatGlyph sprites={sprites} icon={icon} />
                  <span className="respec-row-text">
                    <PixelText
                      font={font}
                      text={`${label} ${value}`}
                      scale={2}
                      color="#ffd75e"
                    />
                    <PixelText
                      font={font}
                      text={blurb}
                      scale={2}
                      color="#7a8088"
                    />
                  </span>
                  <span className="respec-steppers">
                    <button
                      type="button"
                      className="pixel-button respec-step"
                      aria-label={`respec-minus-${stat}`}
                      disabled={!canRemove}
                      onClick={() => {
                        if (deallocateStat(state, stat)) onChange();
                      }}
                    >
                      <PixelText
                        font={font}
                        text="-"
                        scale={3}
                        color="#0b0d10"
                      />
                    </button>
                    <button
                      type="button"
                      className="pixel-button respec-step"
                      aria-label={`respec-plus-${stat}`}
                      disabled={!canAdd}
                      onClick={() => {
                        if (allocateStat(state, stat)) onChange();
                      }}
                    >
                      <PixelText
                        font={font}
                        text="+"
                        scale={3}
                        color="#0b0d10"
                      />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {!showInfo && (
          <button
            type="button"
            className="pixel-button respec-confirm"
            aria-label="respec-confirm"
            disabled={!ready}
            onClick={onConfirm}
          >
            <PixelText
              font={font}
              text={ready ? "CONFIRM" : "SPEND ALL POINTS"}
              scale={3}
              color="#0b0d10"
            />
          </button>
        )}
      </div>
    </div>
  );
}
