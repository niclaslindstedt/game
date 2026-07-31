// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FLAG PLANT — the summon with an ANSWER.
//
// Every summoner in the game is a tap the player can only out-damage: adds
// arrive, you kill adds, more arrive, and the only lever you have is killing
// the boss faster. That is not a mechanic, it is a rate. Here the boss drives
// its flag into the ground as a STRUCTURE and the adds come out of the FLAG —
// a real, stationary, killable body standing in the open, on a life of its own.
//
// So the fight asks a question with a right answer: break the thing that is
// making these. A player who works it out stops the tap; a player who doesn't
// still has the old fight, only harder. That is what a mechanic should be, and
// it costs the engine nothing extra — the flag is an ORDINARY EnemyDef with no
// legs and no bite, carrying its own `summon`, so the horde it calls, the
// health bar over it, the blood it throws and the xp it pays are all machinery
// that already exists. This module only decides WHEN and WHERE one goes in.
//
// The boss will not plant a second while one still stands, which self-limits
// the ability without a cap that would need explaining to anybody.

import { direction } from "@game/lib/vec.ts";
import { spawnEnemy } from "../create.ts";
import type { FlagPlantAbility } from "../defs/enemies/abilities.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { currentMobLevel, menaceStage, mobLevelScale } from "../menace.ts";
import { insideObstacle } from "../obstacles.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";

/** Is this boss's planted flag still standing? */
function flagStanding(ctx: AbilityCtx): boolean {
  const id = ctx.mech.flagId;
  if (id === undefined) return false;
  return ctx.state.enemies.some((e) => e.id === id && e.hp > 0);
}

/**
 * Plant only when the last one is gone. No range check and no line of sight:
 * the flag goes in beside the BOSS, not beside the hero, so where the hero is
 * standing has no bearing on whether the move is available.
 */
function ready(_ability: FlagPlantAbility, ctx: AbilityCtx): boolean {
  return !flagStanding(ctx);
}

/**
 * Drive it in: a step in front of the boss, on the bearing it was facing when
 * the windup started — so the flag lands between the boss and the hero, in the
 * open where it can be reached and shot. A spot inside a wall would hand the
 * player an unkillable tap, so an obstructed (or off-field) spot falls back to
 * the boss's own feet, which is always reachable by definition.
 */
function cast(ability: FlagPlantAbility, ctx: AbilityCtx): void {
  const { state, enemy, mech } = ctx;
  const def = enemyDef(ability.defId);
  const aim = ctx.lockedDir ?? direction(enemy.pos, state.players[0].pos);
  const wanted = {
    x: enemy.pos.x + aim.x * ability.distance,
    y: enemy.pos.y + aim.y * ability.distance,
  };
  const margin = def.radius + 4;
  const inBounds =
    wanted.x > margin &&
    wanted.y > margin &&
    wanted.x < state.level.width - margin &&
    wanted.y < state.level.height - margin;
  const pos =
    inBounds && !insideObstacle(state, wanted, def.radius)
      ? wanted
      : { ...enemy.pos };

  const flag = spawnEnemy(
    ability.defId,
    pos,
    state.rng,
    state.nextId++,
    mobLevelScale(state),
    menaceStage(state),
    difficultyDef(state.difficulty).menaceEffectMult,
    currentMobLevel(state),
  );
  // Planted, not asleep — its own summon runs off the elite awake latch, and a
  // flag that had to be walked up to before it did anything would just be
  // scenery.
  flag.awake = true;
  // It rots on its own if left alone, so ignoring it is a real (bad) choice
  // rather than a permanent second health bar on the field.
  flag.vanishMs = ability.lifeMs;
  state.enemies.push(flag);
  mech.flagId = flag.id;
  state.events.push({
    type: "bossFlagPlanted",
    pos: { ...pos },
    defId: enemy.defId,
    flagDefId: ability.defId,
  });
}

registerAbility<FlagPlantAbility>({ id: "flag_plant", ready, cast });
