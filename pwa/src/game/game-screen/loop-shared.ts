// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Mutable per-run scratch shared between the sim step and the render frame.
// One instance lives for one run effect (GameScreen rebuilds it per mount /
// retry); the simulate side writes it, the render side reads it.

import {
  createCameraShake,
  type CameraShake,
  type Effect,
  type PlayerAction,
} from "../render.ts";

export type LoopShared = {
  /** Transient visuals driven by engine events (lightning strikes, slashes,
   * corpses, damage numbers, …) — drawn over the frame by drawEffects. */
  effects: Effect[];
  /** A transient camera KICK — the jolt a lightning strike or nuke throws
   * through the view (event-fx.ts writes it, render-frame.ts reads it into the
   * draw camera). Purely cosmetic; separate from the engine's victory quake. */
  cameraShake: CameraShake;
  /** The hero's most recent attack, so the field renderer can swing the held
   * weapon in step with its slash/muzzle effect. Only the hero's own blows
   * are captured — companions swing from their own spots. */
  heroAction: PlayerAction | undefined;
  /** Sim-clock ms of the most recent XP-granting kill. render() keeps the XP
   * strip's heat overlay lit (`is-hot`) while this is within XP_BAR_HOT_MS, so
   * a kill-chain holds the bright slice and it fades once the kills stop. */
  lastXpGainMs: number | undefined;
  /** The XP value where the current bright slice begins — the fill level at
   * the moment the streak started, so only XP earned during the streak glows. */
  xpHeatBaseXp: number;
  /** Run-clock ms through which the "bags are full" nudge stays lit — set when
   * a `pickupBlocked` event fires, drives the inventory button's pulse. */
  bagFullHintUntilMs: number;
};

export function createLoopShared(): LoopShared {
  return {
    effects: [],
    cameraShake: createCameraShake(),
    heroAction: undefined,
    lastXpGainMs: undefined,
    xpHeatBaseXp: 0,
    bagFullHintUntilMs: 0,
  };
}
