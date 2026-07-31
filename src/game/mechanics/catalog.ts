// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOSS ABILITY CATALOG — the registry and the contract every ability
// implements. The authored shapes live in defs/enemies/abilities.ts; this is
// the runtime half: a Map from ability id to the module that steps it.
//
// The point of the registry is that NOTHING in the engine grows a member per
// idea. `stepEnemyMechanics` looks an ability up by id and calls three methods;
// it has no notion of beams, flags, or whatever comes next. Adding an ability
// is a variant in the authored union plus one module that calls
// `registerAbility` — and the boss YAML that names it.
//
// The three methods ARE the three-beat contract (tell → cast → resolve):
//   • `ready`  — beat 1's gate. May this move start right now? (range, line of
//                sight, whether its own thing is already out there.) A true
//                here begins the WINDUP, which is the tell; the orchestrator
//                owns the clock, so no ability can forget to telegraph itself.
//   • `cast`   — beat 2/3. The windup ran out; commit the move, push the event
//                the app draws it from, start the cooldown.
//   • `step`   — for a move that keeps running after it commits (a sweeping
//                beam). Returns true while it OWNS the mob's tick.

import { difficultyDef } from "../defs/difficulties.ts";
import type { BossAbility, BossAbilityId } from "../defs/enemies/abilities.ts";
import type { EnemyDef } from "../defs/enemies/types.ts";
import type { Enemy, EnemyMech, GameState } from "../types/index.ts";

/** What every ability method is handed. */
export type AbilityCtx = {
  state: GameState;
  enemy: Enemy;
  def: EnemyDef;
  /** `enemy.mech`, already created — abilities never have to null-check it. */
  mech: EnemyMech;
  /** Seconds and ms elapsed this tick. */
  dt: number;
  dtMs: number;
  /** Distance from the mob to the hero, computed once by the orchestrator. */
  distance: number;
  /**
   * The bearing LOCKED when the windup started, handed to `cast` — the single
   * most important value an ability is given, and the reason a player who
   * keeps moving is not where the move arrives.
   *
   * It has to travel here rather than be read back off `mech.telegraph`,
   * because the orchestrator clears the telegraph the instant the windup runs
   * out (that is what un-roots the mob) and only then commits the move. An
   * ability reaching for the telegraph inside `cast` finds nothing, silently
   * falls back to the CURRENT bearing, and re-aims onto the hero at the last
   * moment — which looks almost right, plays as unavoidable, and quietly
   * breaks the promise every tell in the game makes.
   */
  lockedDir?: { x: number; y: number };
  /**
   * The RANGE locked when the windup started, handed to `cast` for exactly the
   * reason `lockedDir` is and travelling the same way (the telegraph is already
   * cleared by the time the move commits).
   *
   * A move that locks the bearing but re-measures the range at cast time has
   * only half-kept its promise: it can no longer be dodged sideways but can
   * still follow a hero who ran straight back. BLINK STRIKE is the one that
   * needs both, since its arrival spot is derived from the two together.
   */
  lockedDistance?: number;
};

/**
 * One ability's implementation. Generic over its own authored variant, so a
 * handler is handed its OWN spec type rather than the union — the id
 * discriminates once, here, instead of in every method body.
 */
export type AbilityHandler<A extends BossAbility = BossAbility> = {
  id: A["id"];
  /**
   * May this ability begin its windup right now? Cooldown and difficulty gate
   * are already checked by the orchestrator — this is the move's OWN question
   * (is the hero in reach, is there line of sight, is the last one still up).
   */
  ready: (ability: A, ctx: AbilityCtx) => boolean;
  /** The windup ran out: commit the move. */
  cast: (ability: A, ctx: AbilityCtx) => void;
  /** Advance whatever `cast` left running; true while it owns the mob's tick. */
  step?: (ability: A, ctx: AbilityCtx) => boolean;
};

const HANDLERS = new Map<string, AbilityHandler<never>>();

/** Register one ability implementation. Called at module load by each ability. */
export function registerAbility<A extends BossAbility>(
  handler: AbilityHandler<A>,
): void {
  HANDLERS.set(handler.id, handler as unknown as AbilityHandler<never>);
}

/** The handler for an ability id, or undefined if nothing claims it. */
export function abilityHandler(
  id: BossAbilityId,
): AbilityHandler<never> | undefined {
  return HANDLERS.get(id);
}

/** Every registered ability id — the content validator's source of truth. */
export function registeredAbilityIds(): string[] {
  return [...HANDLERS.keys()];
}

/**
 * Is this ability present at all on the rung being played? An ability with no
 * `minDifficulty` is on every rung; one that names a rung appears at or below
 * it (compared on `DifficultyDef.index`, the menu's own gentlest-first order).
 *
 * This is the whole difficulty story: nightmare and JESUS ADD moves to a fight
 * the player already knows rather than only multiplying its numbers, so a step
 * up the ladder is a new thing to learn instead of a longer health bar.
 */
export function abilityUnlocked(
  ability: BossAbility,
  difficulty: string,
): boolean {
  if (!ability.minDifficulty) return true;
  return (
    difficultyDef(difficulty).index >=
    difficultyDef(ability.minDifficulty).index
  );
}

/**
 * The windup this ability actually stands in on this rung. The authored
 * `windupMs` is the fight everyone learns; the top rungs SQUEEZE it toward
 * `windupFloorMs` so a known move gets faster — but the floor is authored, and
 * a windup never goes below it. That floor is the difference between a hard
 * fight and a cheap one: a tell shorter than a reaction is not a tell.
 */
export function abilityWindupMs(
  ability: BossAbility,
  difficulty: string,
): number {
  const floor = ability.windupFloorMs;
  if (floor === undefined) return ability.windupMs;
  const def = difficultyDef(difficulty);
  const top = difficultyDef("jesus").index;
  // 0 on the gentlest rung, 1 at the top of the ladder.
  const t = top > 0 ? Math.min(1, Math.max(0, def.index / top)) : 0;
  return Math.max(floor, ability.windupMs + (floor - ability.windupMs) * t);
}
