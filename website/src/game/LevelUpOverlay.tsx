// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level-up chooser: shown while the engine pauses in the `levelup`
// phase. One button per stat; each click spends one banked point through
// `allocateStat`, and play resumes automatically when the last point is
// spent. Each button carries a short blurb; the (i) toggle opens a panel with
// the full per-stat effects (kept in sync with the engine's STATS rules).
//
// Keyboard: a cursor highlights one stat; the arrow keys (and WASD) move it and
// Enter/Space spends a point on it. GameScreen cedes the keyboard to this
// overlay while the `levelup` phase is up, so these keys never leak to steering
// or the jump.

import { useEffect, useState } from "react";

import { allocateStat, type GameState } from "@game/core";

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
  // Which stat the keyboard cursor sits on; also synced by pointer hover so the
  // mouse and keyboard never disagree about the highlight. `active` gates the
  // highlight ring so a touch-only phone (no keyboard, no hover) keeps its
  // ring-free look until the player actually engages the cursor.
  const [cursor, setCursor] = useState(0);
  const [active, setActive] = useState(false);
  const points = state.player.pendingStatPoints;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showInfo) {
        // While the (i) breakdown is open the buttons are hidden — any
        // confirm/cancel key just closes it back to the chooser.
        if (
          event.key === "Escape" ||
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          setShowInfo(false);
        }
        return;
      }
      const code = event.code;
      const n = CHOICES.length;
      // Match the CSS: a single vertical column on a phone, a 3-wide grid on
      // wider screens (styles.css `min-aspect-ratio: 4/3`). Left/right step one
      // stat; up/down jump a whole row (± the column count), so both axes read
      // the way the grid looks. Everything wraps.
      const cols = window.matchMedia("(min-aspect-ratio: 4/3)").matches ? 3 : 1;
      const step = (delta: number) => {
        event.preventDefault();
        setActive(true);
        setCursor((c) => (c + delta + n) % n);
      };
      if (code === "ArrowLeft" || code === "KeyA") {
        step(-1);
      } else if (code === "ArrowRight" || code === "KeyD") {
        step(1);
      } else if (code === "ArrowUp" || code === "KeyW") {
        step(-cols);
      } else if (code === "ArrowDown" || code === "KeyS") {
        step(cols);
      } else if (
        code === "Enter" ||
        code === "NumpadEnter" ||
        code === "Space"
      ) {
        const choice = CHOICES[cursor];
        if (!choice) return;
        event.preventDefault();
        allocateStat(state, choice.stat);
        onChange();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showInfo, cursor, state, onChange]);

  return (
    <div
      className="game-overlay levelup-overlay"
      // While the (i) breakdown is open a tap anywhere off the box closes it —
      // the box swallows its own taps so a mis-tap between buttons never does.
      onPointerDown={showInfo ? () => setShowInfo(false) : undefined}
    >
      <div className="levelup-box" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`info-button${showInfo ? " active" : ""}`}
          aria-label="toggle-stat-info"
          onClick={() => setShowInfo((v) => !v)}
        >
          {/* A dotted lowercase "i" — the pixel font is uppercase-only, so its
              "i" renders as a dotless capital I; draw the glyph from blocks. */}
          <span className="info-glyph" aria-hidden="true">
            <span className="info-glyph-dot" />
            <span className="info-glyph-stem" />
          </span>
        </button>
        <div className="levelup-header">
          <PixelText font={font} text="LEVEL UP!" scale={5} color="#ffd75e" />
          <PixelText
            font={font}
            text={`LEVEL ${state.player.level}`}
            scale={3}
            color="#7ef0c8"
          />
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
          <div className="stat-buttons">
            {CHOICES.map(({ stat, label, blurb, icon }, i) => {
              // Only the points the PLAYER has spent on this stat (see
              // `spentStats`) — the head-start, automatic per-level growth, and
              // gear bonuses folded into the effective stat are deliberately
              // left off so the chooser shows the player's own picks alone.
              const spent = state.player.spentStats[stat];
              return (
                <button
                  key={stat}
                  type="button"
                  className={`pixel-button stat-button${
                    active && cursor === i ? " selected" : ""
                  }`}
                  aria-label={`stat-${stat}`}
                  // Hover with a mouse tracks the cursor; a bare touch (which
                  // also fires pointerenter) shouldn't light the ring, so only
                  // a real mouse activates it.
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setActive(true);
                    setCursor(i);
                  }}
                  onClick={() => {
                    setCursor(i);
                    allocateStat(state, stat);
                    onChange();
                  }}
                >
                  <StatGlyph sprites={sprites} icon={icon} />
                  <span className="stat-button-text">
                    <span className="stat-button-value">
                      <PixelText
                        font={font}
                        text={`${label} ${spent}`}
                        scale={2}
                        color="#0b0d10"
                      />
                    </span>
                    <PixelText
                      font={font}
                      text={blurb}
                      scale={2}
                      color="#3a4048"
                    />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
