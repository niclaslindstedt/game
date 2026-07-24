// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The screen's imperative chrome — DOM surfaces the render loop writes into
// directly (never through React): the touch-steering dpad hint, BOT VIEW's
// steer-readout dpad and tap-ripple layer, and the FPS meter. Plus the HOW
// TO PLAY demo's front layer: the teaching tooltip and the invisible
// full-shell catcher whose tap freezes the demo into its exit confirm.

import type { MutableRefObject, RefObject } from "react";

import { pauseGame, type GameState } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";

import { synth } from "../audio.ts";
import { DemoTip, type DemoTipState } from "../DemoTip.tsx";
import { pauseMusic } from "../music/index.ts";
import { playUiSound } from "../sfx/index.ts";
import type { Hud } from "./hud-model.ts";

export function ScreenChrome({
  dpadRef,
  botDpadRef,
  tapFxRef,
  nukeFxRef,
  levelUpFxRef,
  fpsRef,
  showFps,
}: {
  dpadRef: RefObject<HTMLDivElement | null>;
  botDpadRef: RefObject<HTMLDivElement | null>;
  tapFxRef: RefObject<HTMLDivElement | null>;
  nukeFxRef: RefObject<HTMLDivElement | null>;
  levelUpFxRef: RefObject<HTMLDivElement | null>;
  fpsRef: RefObject<HTMLDivElement | null>;
  showFps: boolean;
}) {
  return (
    <>
      {/* The touch steering hint (see the render loop): subtle arrows around
          the finger's anchor point plus a nub that trails the drag. */}
      <div ref={dpadRef} className="touch-dpad" aria-hidden="true">
        <span className="dpad-arrow dpad-up" />
        <span className="dpad-arrow dpad-down" />
        <span className="dpad-arrow dpad-left" />
        <span className="dpad-arrow dpad-right" />
        <span className="dpad-nub" />
      </div>

      {/* BOT VIEW only (toggled by the render loop): the autopilot's steering
          readout, a fixed lower-right dpad whose arrows/nub mirror the bot's
          live steer. Same parts as the touch dpad, framed as a persistent pad. */}
      <div ref={botDpadRef} className="bot-dpad" aria-hidden="true">
        <span className="bot-dpad-ring" />
        <span className="dpad-arrow dpad-up" />
        <span className="dpad-arrow dpad-down" />
        <span className="dpad-arrow dpad-left" />
        <span className="dpad-arrow dpad-right" />
        <span className="dpad-nub" />
      </div>

      {/* BOT VIEW "tap" ripples: the render loop appends white wavy ring blooms
          here wherever the bot clicks (a jump, or an ability/spell/consumable
          button). Overlays the whole shell, never eats input. */}
      <div ref={tapFxRef} className="tap-fx-layer" aria-hidden="true" />

      {/* The screen-clearing NUKE's full-screen detonation (createNukeFx): a
          blinding flash, an expanding light bloom + god-rays, a cooling
          fireball, licking flames, and billowing smoke, appended here when a
          bomb goes off. Washes over the field + HUD for one beat; pointer-events
          off so it never eats input. */}
      <div ref={nukeFxRef} className="nuke-fx-layer" aria-hidden="true" />

      {/* The LEVEL-UP light explosion's full-screen burst (createLevelUpFx): a
          blinding white flash, an expanding holy-gold light bloom + god-rays, a
          pillar of light to the heavens, and rising gold sparkle motes, appended
          here on a ding. The modal rises out of the fading glare a beat later;
          pointer-events off so it never eats input. */}
      <div ref={levelUpFxRef} className="levelup-fx-layer" aria-hidden="true" />

      {/* The FPS meter (DEBUG MODE / ?debug): a tiny bottom-center readout
          the render loop writes into directly — see fpsRef. */}
      {showFps && <div ref={fpsRef} className="game-fps" aria-hidden="true" />}
    </>
  );
}

export function DemoChrome({
  state,
  hud,
  font,
  demoTip,
  clearTip,
  userPausedRef,
  bumpUi,
}: {
  state: GameState | null;
  hud: Hud | null;
  font: PixelFont;
  demoTip: DemoTipState | null;
  /** Flick the current tip away and drop its read-freeze (useDemoState). */
  clearTip: () => void;
  userPausedRef: MutableRefObject<boolean>;
  bumpUi: () => void;
}) {
  // HOW TO PLAY: a tap ANYWHERE freezes the demo and raises the exit confirm
  // (DemoExitOverlay). Reuses the pause machinery — latched so the bot's input
  // loop leaves it alone (like a hand-opened pause) — so KEEP WATCHING resumes
  // exactly where it froze. The developer BOT VIEW keeps the normal pause menu.
  // Exception: while a teaching tooltip is up, the tap dismisses THAT and keeps
  // the demo playing — the exit confirm only comes up on a tap with no tip
  // showing. The catch layer only mounts during play, where a tip is visible
  // for every key except "levelstat" (that one is bound to the level-up modal).
  const openDemoExit = () => {
    if (!state || state.phase !== "playing") return;
    if (demoTip && demoTip.key !== "levelstat") {
      clearTip();
      playUiSound(synth, "back");
      return;
    }
    userPausedRef.current = true;
    pauseGame(state);
    pauseMusic();
    // Drop any leftover tip (and its read-freeze) so KEEP WATCHING resumes to
    // live play at once.
    clearTip();
    playUiSound(synth, "confirm");
    bumpUi();
  };

  return (
    <>
      {/* The current teaching tooltip, anchored where the bot just tapped.
          Decorative (pointer-events off) so the catch layer below still gets
          every click. The "levelstat" tip is anchored to a stat button, so it
          shows ONLY while the level-up modal is up — bound to that phase so it
          vanishes with the modal instead of lingering over the field for the
          rest of its lifetime; every other tip shows during play. */}
      {demoTip &&
        (demoTip.key === "levelstat"
          ? hud?.phase === "levelup"
          : hud?.phase === "playing") && <DemoTip font={font} tip={demoTip} />}

      {/* An invisible full-shell catcher — a tap ANYWHERE (field, HUD, docks)
          freezes the demo and raises the exit confirm. Only while the demo
          actually plays; the paused confirm covers everything itself. */}
      {hud?.phase === "playing" && (
        <div
          className="demo-exit-catch"
          role="presentation"
          onPointerDown={openDemoExit}
        />
      )}
    </>
  );
}
