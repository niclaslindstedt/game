// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ARMING A KNOCKBACK IMPULSE — the two-line leaf every shove in the game goes
// through, so they all decay on one curve.
//
// It is a LEAF (its only import is the vector helpers) because the callers sit
// on both sides of an existing edge: `hazards.ts` steps the impulses AND
// imports `story.ts` for the hero's pinned reads, so a beat in `story.ts` that
// wanted to shove somebody could not reach back into `hazards.ts` without
// closing a cycle. Splitting the ARMING out from the STEPPING costs nothing —
// `stepKnockback` stays in hazards.ts with the rocks it was written for — and
// leaves anything that needs a shove one import away from it.

import { direction, type Vec2 } from "@game/lib/vec.ts";

import type { Enemy, Player } from "./types/index.ts";

/**
 * Arm an outward KNOCKBACK impulse on a mob: point it straight away from
 * `from` at `speed` px/s and coast it for `coastMs`. `moveEnemy` sits the AI
 * out while `knockMs > 0`, and `stepKnockback` coasts and decays it. A
 * zero/negative speed (a boss, or a blast's rim) is a no-op. Shared by the
 * asteroid blast that flings, by THE UNMAKING's shove (step/powerups.ts) and
 * by the opening strike's recoil (story.ts) — one impulse path, so every fling
 * decays on the same curve.
 */
export function knockEnemyBack(
  enemy: Enemy,
  from: Vec2,
  speed: number,
  coastMs: number,
): void {
  if (speed <= 0) return;
  let dir = direction(from, enemy.pos);
  if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
  enemy.knockVel = { x: dir.x * speed, y: dir.y * speed };
  enemy.knockMs = coastMs;
}

/**
 * Shove the hero away from a point — he coasts along it (on top of whatever he
 * steers) until it bleeds out.
 *
 * Shared because a SHOCK PULSE is the same shove a blast is, and an ability
 * that rolled its own would drift from this one on the two details that
 * actually matter: the degenerate case where the hero is standing exactly on
 * the origin (which yields a zero vector and no push at all), and the fact that
 * the impulse RIDES ALONGSIDE his steering rather than replacing it.
 */
export function pushPlayer(
  player: Player,
  from: Vec2,
  speed: number,
  coastMs: number,
): void {
  if (speed <= 0) return;
  let dir = direction(from, player.pos);
  if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
  player.knockVel = { x: dir.x * speed, y: dir.y * speed };
  player.knockMs = coastMs;
}
