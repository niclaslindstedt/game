// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW A DEATH PRESENTS — burned up, or thrown and toppled. Its own leaf module
// for the same reason `corpse-launch.ts` and `blood-hit.ts` are ones: the rule is
// a decision over the kill event, so it stays testable without dragging the game
// screen's render/asset graph along. `event-fx.ts` reads it for every
// `enemyKilled` and spawns whichever the answer names.
//
// There are two ways to die in this game and they are mutually exclusive. A
// SCREEN-NUKE kill burns the body up — the fire replaces the gore splash and the
// plain corpse with a smoking charred skeleton. Every other kill PUNTS the body
// away from the hero and topples it.
//
// The device's MATURE CONTENT switch (app/device-policy.ts) decides between them
// for a nuked kill, and the shape of this function is the whole point: it drops
// the `incinerated` FLAG rather than suppressing the incinerate EFFECT, so a
// censored blast falls all the way back onto the ORDINARY death, launch included.
// Suppress the effect alone and the bomb kills a screenful of mobs whose bodies
// simply cease to exist, which reads as a bug rather than as a gentler game. That
// distinction is what `tests/nuke_incineration_test.ts` pins.

import { nsfwAllowed } from "../../app/device-policy.ts";

import { corpseLaunch, type CorpseLaunch } from "./corpse-launch.ts";

/** What a killing blow leaves behind. Exactly one of the two happens. */
export type KillPresentation = {
  /** Burn the body up into a smoking charred skeleton (a permitted nuke kill). */
  incinerate: boolean;
  /** The throw the body takes, or null when it just topples where it stood.
   * Always null when `incinerate` is set — there is no body left to throw. */
  launch: CorpseLaunch | null;
};

/**
 * Decide how one killing blow presents.
 *
 * `incinerated` is the engine's own flag off the `enemyKilled` event (a
 * screen-nuke blast); the rest is what `corpseLaunch` needs to size the throw.
 */
export function killPresentation(
  incinerated: boolean | undefined,
  damage: number,
  maxHp: number,
  heroPos: { x: number; y: number },
  pos: { x: number; y: number },
  role: string,
): KillPresentation {
  if (incinerated && nsfwAllowed()) return { incinerate: true, launch: null };
  return {
    incinerate: false,
    launch: corpseLaunch(damage, maxHp, heroPos, pos, role),
  };
}
