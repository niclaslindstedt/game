// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level-up chooser: shown while the local hero's `levelup` screen is up.
// One button per stat; each click spends one banked point through
// `allocateStat`, and the screen closes automatically when the last point is
// spent — or on LATER/Escape (`closeLevelup`), which banks the rest for the
// HUD's points pip. Each button carries a short blurb; the (i) toggle opens a
// panel with the full per-stat effects (kept in sync with the engine's STATS
// rules).
//
// Reveal freeze: the chooser pops open under a short lockout (`LEVELUP_ARM_MS`)
// during which the stat buttons are dimmed and inert — pointer AND keyboard.
// The modal appears the instant the celebration ends, while the player may
// still be holding/tapping to steer, so an un-frozen chooser would eat that
// stray input as a permanent stat pick. An "arming" bar fills across the wait
// so the pause reads as intentional, then the buttons light up and accept input.
//
// THE FREEZE IS FOR A MODAL THAT ARRIVES UNANNOUNCED, AND ONLY THAT. A chooser
// the player OPENED — the HUD's points pip, the one door a party ever reaches
// it through — is one they are already looking at with a finger aimed at it,
// so there is no stray steering input to eat and nothing to protect them from;
// it arms instantly (`skipArm`, from the press that sent
// `promptPendingPoints`). Only the ding's own reveal keeps the lockout.
//
// Keyboard: a cursor highlights one stat; the arrow keys (and WASD) move it and
// Enter/Space spends a point on it. GameScreen cedes the keyboard to this
// overlay while the `levelup` screen is up, so these keys never leak to
// steering or the jump — which is also why Escape is handled HERE rather than
// in controls.ts's Escape ladder.

import { localHero } from "../local-seat.ts";
import { useEffect, useState } from "react";

import type { GameState } from "@game/core";

import { PixelBar } from "@ui/lib/PixelBar.tsx";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useArmDelay } from "@ui/lib/use-arm-delay.ts";

import { type Sprites } from "../assets.ts";
import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import {
  STAT_CHOICES as CHOICES,
  InfoButton,
  StatGlyph,
  StatInfoPanel,
} from "../stat-choices.tsx";

import { runCommand, runCommandOk } from "../run-commands.ts";

// How long the chooser stays inert after it reveals, so an accidental
// hold-over tap from steering can't spend a point. Kept in sync with the CSS
// `levelup-arming-bar` fill by feeding this value to its `animationDuration`.
const LEVELUP_ARM_MS = 1000;

export function LevelUpOverlay({
  state,
  font,
  sprites,
  onChange,
  skipArm = false,
  demoFocusStat = null,
}: {
  state: GameState;
  font: PixelFont;
  sprites: Sprites;
  onChange: () => void;
  /** The player opened this chooser themselves (the HUD's points pip), so it
   * skips the reveal lockout and takes input at once — see the header. */
  skipArm?: boolean;
  /** HOW TO PLAY demo only: the stat the autopilot is about to tap. When set,
   * that button carries the selection ring (the same highlight a human cursor
   * gives) so a viewer can SEE which stat the bot picks. Null in normal play,
   * where the cursor/hover drives the highlight instead. */
  demoFocusStat?: string | null;
}) {
  const [showInfo, setShowInfo] = useState(false);
  // Which stat the keyboard cursor sits on; also synced by pointer hover so the
  // mouse and keyboard never disagree about the highlight. `active` gates the
  // highlight ring so a touch-only phone (no keyboard, no hover) keeps its
  // ring-free look until the player actually engages the cursor.
  const [cursor, setCursor] = useState(0);
  const [active, setActive] = useState(false);
  // Reveal lockout: the buttons stay inert until this flips true, a couple of
  // seconds after the chooser mounts. It arms once and stays armed for the
  // life of the overlay, so spending a second banked point is instant (the
  // wait already happened) — only a brand-new level-up (a fresh mount) re-arms.
  // A chooser the player asked for skips the wait entirely (`skipArm`).
  const armMs = skipArm ? 0 : LEVELUP_ARM_MS;
  const armed = useArmDelay(armMs);
  const points = localHero(state).pendingStatPoints;

  // LATER/Escape: bank the unspent points and close the chooser — the HUD's
  // points pip carries the reminder, and `promptPendingPoints` reopens it.
  const close = () => {
    runCommand(state, "closeLevelup");
    playUiSound(synth, "back");
    onChange();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // While the reveal freeze is up the whole chooser is inert: swallow every
      // key (GameScreen already stops steering from seeing them) so a stray
      // Enter/Space held over from play can't spend a point before it arms.
      if (!armed) {
        event.preventDefault();
        return;
      }
      // A talent point earned this level-up floats its picker ABOVE this
      // chooser and owns the keyboard until it's spent — swallow keys here so
      // one Enter doesn't both pick a talent and spend a stat point behind it.
      if (localHero(state).pendingTalentPoints.length > 0) {
        event.preventDefault();
        return;
      }
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
      // Escape banks the remaining points and closes (the LATER button's key).
      // Handled here rather than in controls.ts's Escape ladder because the
      // ladder cedes the whole keyboard while this chooser is up.
      if (event.key === "Escape") {
        event.preventDefault();
        runCommand(state, "closeLevelup");
        playUiSound(synth, "back");
        onChange();
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
        runCommandOk(state, "allocateStat", choice.stat);
        onChange();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armed, showInfo, cursor, state, onChange]);

  return (
    <div
      className="game-overlay levelup-overlay"
      // While the (i) breakdown is open a tap anywhere off the box closes it —
      // the box swallows its own taps so a mis-tap between buttons never does.
      onPointerDown={showInfo ? () => setShowInfo(false) : undefined}
    >
      <div
        className={`levelup-box levelup-reveal${armed ? "" : " arming"}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <InfoButton active={showInfo} onToggle={() => setShowInfo((v) => !v)} />
        <div className="levelup-header">
          <PixelText font={font} text="LEVEL UP!" scale={5} color="#ffd75e" />
          <PixelText
            font={font}
            text={`LEVEL ${localHero(state).level}`}
            scale={3}
            color="#7ef0c8"
          />
        </div>
        <div className="levelup-choose-row">
          <PixelText
            font={font}
            text={`CHOOSE A STAT (${points} ${points === 1 ? "POINT" : "POINTS"})`}
            scale={2}
            color="#9aa3ad"
          />
          {!showInfo && !skipArm && (
            // The "arming" bar fills across LEVELUP_ARM_MS so the inert buttons
            // read as a deliberate pause, not a frozen UI. It sits to the right
            // of the CHOOSE A STAT text. Its fill duration is driven from the
            // same constant that flips `armed`, so the bar and the lockout
            // always end together. Once armed it's hidden with `visibility`
            // rather than unmounted, so its slot stays reserved and the row
            // (and the box) doesn't shift. A chooser the player opened
            // (`skipArm`) never has a wait to draw, so it never mounts one at
            // all — there is no shift to guard against when the bar was never
            // there.
            <PixelBar
              fillMs={LEVELUP_ARM_MS}
              className={`levelup-arming-bar${armed ? " armed" : ""}`}
              ariaHidden
            />
          )}
        </div>
        {showInfo ? (
          <StatInfoPanel font={font} sprites={sprites} />
        ) : (
          <>
            <div className="stat-buttons">
              {CHOICES.map(({ stat, label, blurb, icon }, i) => {
                // Only the points the PLAYER has spent on this stat (see
                // `spentStats`) — the head-start, automatic per-level growth, and
                // gear bonuses folded into the effective stat are deliberately
                // left off so the chooser shows the player's own picks alone.
                const spent = localHero(state).spentStats[stat];
                // The demo's bot-focus highlight overrides the cursor/hover one so
                // the picked stat lights up as the autopilot taps it.
                const highlighted =
                  demoFocusStat != null
                    ? stat === demoFocusStat
                    : active && cursor === i;
                return (
                  <button
                    key={stat}
                    type="button"
                    className={`pixel-button stat-button${
                      highlighted ? " selected" : ""
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
                      // Belt-and-suspenders: CSS already blocks pointer events on
                      // the buttons while arming, but never spend a point before
                      // the lockout lifts even if a click slips through.
                      if (!armed) return;
                      setCursor(i);
                      runCommandOk(state, "allocateStat", stat);
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
            {/* LATER banks the unspent points instead of forcing a pick —
                the HUD's points pip remembers, and its press reopens this
                chooser. Same close row every other overlay ends with. */}
            <button
              type="button"
              className="pixel-button modal-close-btn"
              aria-label="close-levelup"
              onClick={() => {
                if (!armed) return;
                close();
              }}
            >
              <PixelText font={font} text="LATER" scale={2} color="#0b0d10" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
