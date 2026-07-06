// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Data shapes for the simulation. The state is a plain mutable object the
// renderer reads every frame; `step()` advances it and reports what happened
// as events so the app layer can drive sound and visual feedback without the
// engine knowing either exists.

import type { Vec2 } from "../lib/vec.ts";

export type GamePhase = "playing" | "victory" | "defeat";

export type Player = {
  pos: Vec2;
  hp: number;
  maxHp: number;
  /** Unit vector of the last movement direction; drives sprite facing. */
  facing: Vec2;
  /** True while the player moved this step; drives the walk animation. */
  moving: boolean;
  /** Remaining ms until the weapon may fire again. */
  weaponCooldownMs: number;
  /** Remaining ms of post-hit invulnerability flash (visual only). */
  hurtFlashMs: number;
};

export type Enemy = {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  /** Remaining ms until this enemy may deal contact damage again. */
  contactCooldownMs: number;
};

export type Projectile = {
  id: number;
  pos: Vec2;
  /** Unit direction of travel. */
  dir: Vec2;
  /** Remaining ms before the projectile despawns. */
  lifetimeMs: number;
};

export type Item = {
  id: number;
  kind: "medkit";
  pos: Vec2;
};

export type GameStats = {
  kills: number;
  totalEnemies: number;
  shotsFired: number;
  damageDealt: number;
  damageTaken: number;
  itemsCollected: number;
  /** Wall-clock ms of simulated play time. */
  timeMs: number;
};

/**
 * Something notable that happened during one `step()`, for the app layer to
 * react to (play a sound, flash the screen). Cleared at the start of every
 * step.
 */
export type GameEvent =
  | { type: "shot" }
  | { type: "enemyHit"; pos: Vec2 }
  | { type: "enemyKilled"; pos: Vec2 }
  | { type: "playerHurt" }
  | { type: "itemCollected"; kind: Item["kind"] }
  | { type: "victory" }
  | { type: "defeat" };

/** Per-step player intent, produced by the app's input layer. */
export type GameInput = {
  /** True while the pointer/touch is held down. */
  steering: boolean;
  /** Steering target in world coordinates (meaningful while steering). */
  target: Vec2;
};

export type GameState = {
  phase: GamePhase;
  level: { width: number; height: number };
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  items: Item[];
  stats: GameStats;
  /** Events emitted by the most recent `step()`. */
  events: GameEvent[];
  /** Monotonic id source for spawned entities. */
  nextId: number;
};
