// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RECOMPILE — the machine starts putting itself back together, and shows you
// exactly where from.
//
// A boss that heals is the oldest cheap trick in the genre. The bar goes back
// up, the player's last thirty seconds are deleted, and the only available
// response is "hit harder" — which is not a decision, it is a scolding.
//
// What turns it into a mechanic is putting the repair OUTSIDE the boss. It
// raises a node; a tether runs from the node to it; while the node stands, the
// bar climbs. Now the healing has an address, and breaking that address is a
// better play than any amount of extra damage on the boss itself. The bar going
// up stops being a punishment and becomes a signpost.
//
// It is deliberately the same SHAPE as FLAG PLANT — a boss that puts a killable
// thing on the field is a boss with an answer — so a player who learned to
// break the flag on the moon reads this one the moment it goes up. Reusing the
// grammar of an earlier fight is how a late boss gets to be complicated without
// being unreadable.

import { spawnEnemy } from "../create.ts";
import type { RecompileAbility } from "../defs/enemies/abilities.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { currentMobLevel, menaceStage, mobLevelScale } from "../menace.ts";
import { insideObstacle } from "../obstacles.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";

/** The live node this boss raised, if it is still standing. */
function liveNode(ctx: AbilityCtx) {
  const id = ctx.mech.nodeId;
  if (id === undefined) return undefined;
  return ctx.state.enemies.find((e) => e.id === id && e.hp > 0);
}

/**
 * Only worth doing when there is damage to undo and no node already up. The
 * hp gate matters: a boss that raised a node at full health would be teaching
 * the player to break something for no reason, and the FIRST time they see this
 * has to be the time it is obviously worth doing.
 */
function ready(_ability: RecompileAbility, ctx: AbilityCtx): boolean {
  if (liveNode(ctx)) return false;
  return ctx.enemy.hp < ctx.enemy.maxHp * 0.9;
}

function cast(ability: RecompileAbility, ctx: AbilityCtx): void {
  const { state, enemy, mech } = ctx;
  const def = enemyDef(ability.defId);
  // Raised BEHIND the boss, away from the hero: it should be a thing you have
  // to go around the fight to reach, not something that falls into your swing.
  const aim = ctx.lockedDir ?? { x: 1, y: 0 };
  const wanted = {
    x: enemy.pos.x - aim.x * ability.distance,
    y: enemy.pos.y - aim.y * ability.distance,
  };
  const margin = def.radius + 4;
  const ok =
    wanted.x > margin &&
    wanted.y > margin &&
    wanted.x < state.level.width - margin &&
    wanted.y < state.level.height - margin &&
    !insideObstacle(state, wanted, def.radius);
  const pos = ok ? wanted : { ...enemy.pos };

  const node = spawnEnemy(
    ability.defId,
    pos,
    state.rng,
    state.nextId++,
    mobLevelScale(state),
    menaceStage(state),
    difficultyDef(state.difficulty).menaceEffectMult,
    currentMobLevel(state),
  );
  node.awake = true;
  node.vanishMs = ability.lifeMs;
  state.enemies.push(node);
  mech.nodeId = node.id;
  state.events.push({
    type: "bossRecompile",
    pos: { ...enemy.pos },
    nodePos: { ...pos },
    defId: enemy.defId,
    nodeDefId: ability.defId,
  });
}

/**
 * The tether: while the node stands, the boss climbs. Owns no movement — a
 * healing boss should still be fighting, or the ability would just be a lull —
 * so it always returns false and lets the ordinary hunt run underneath it.
 */
function step(ability: RecompileAbility, ctx: AbilityCtx): boolean {
  const { enemy, mech, dt } = ctx;
  if (mech.nodeId === undefined) return false;
  const node = liveNode(ctx);
  if (!node) {
    // Broken, or powered down on its own: the tether drops. Clearing the id is
    // what lets the boss raise another once its cooldown is up.
    mech.nodeId = undefined;
    return false;
  }
  const before = enemy.hp;
  enemy.hp = Math.min(
    enemy.maxHp,
    enemy.hp + enemy.maxHp * ability.healFracPerSec * dt,
  );
  if (enemy.hp > before) {
    ctx.state.events.push({
      type: "bossHealed",
      pos: { ...enemy.pos },
      from: { ...node.pos },
      defId: enemy.defId,
    });
  }
  return false;
}

registerAbility<RecompileAbility>({ id: "recompile", ready, cast, step });
