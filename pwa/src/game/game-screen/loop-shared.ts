// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Mutable per-run scratch shared between the sim step and the render frame.
// One instance lives for one run effect (GameScreen rebuilds it per mount /
// retry); the simulate side writes it, the render side reads it.

import type { Effect, PlayerAction } from "../render.ts";

export type LoopShared = {
  /** Transient visuals driven by engine events (lightning strikes, slashes,
   * corpses, damage numbers, …) — drawn over the frame by drawEffects. */
  effects: Effect[];
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
    heroAction: undefined,
    lastXpGainMs: undefined,
    xpHeatBaseXp: 0,
    bagFullHintUntilMs: 0,
  };
}
