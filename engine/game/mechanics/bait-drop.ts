// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PUMP AND DUMP — bait that looks exactly like loot.
//
// The whole game trains one reflex harder than any other: a glinting thing on
// the floor is yours, go and get it. Ten levels of pickups, drop beams and
// coin-shaped icons build it, and the player stops deciding and just runs at
// them. This is the boss that read the room and priced that reflex.
//
// It only works ONCE per player, which is exactly right — the move is a lesson,
// not a tax. The second time, a scatter of coins on the floor is a question:
// did he throw those, or did something die there? That question is the ability.
//
// It is nasty, so it is built to be fair in three specific ways:
//   • The piles are THROWN, visibly, from the boss — a player watching the
//     field sees where they came from.
//   • They ARM on a delay (`armMs`) long enough to walk back out of, so being
//     caught mid-stride by one that landed under you is impossible.
//   • They go cold on their own, so the floor is never permanently poisoned.

import type { BaitDropAbility } from "../defs/enemies/abilities.ts";
import { insideObstacle } from "../obstacles.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { mobBlowDamage } from "./shared.ts";

/**
 * Only worth throwing when there is nothing of his still lying around: a floor
 * already covered in bait does not get more dangerous with more of it, it just
 * stops reading as bait and starts reading as a minefield the player waits out.
 */
function ready(_ability: BaitDropAbility, ctx: AbilityCtx): boolean {
  return !ctx.state.baits.some((b) => b.defId === ctx.enemy.defId);
}

function cast(ability: BaitDropAbility, ctx: AbilityCtx): void {
  const { state, enemy, def } = ctx;
  const damage = mobBlowDamage(enemy, def.contactDamage, ability.damageFrac);
  const margin = 8;
  for (let i = 0; i < ability.count; i++) {
    // Thrown in a ring around him rather than at the hero: bait is left lying
    // about to be WALKED INTO later, so aiming it at where the player is now
    // would just be a slow, worse grenade.
    const angle = (i / ability.count) * Math.PI * 2 + state.rng();
    const reach = ability.spread * (0.45 + state.rng() * 0.55);
    const pos = {
      x: enemy.pos.x + Math.cos(angle) * reach,
      y: enemy.pos.y + Math.sin(angle) * reach,
    };
    if (pos.x < margin || pos.y < margin) continue;
    if (pos.x > state.level.width - margin) continue;
    if (pos.y > state.level.height - margin) continue;
    // A pile inside a wall could never be walked into and never be seen — it
    // would just be an invisible timer the player cannot interact with.
    if (insideObstacle(state, pos, 6)) continue;
    state.baits.push({
      id: state.nextId++,
      pos,
      armMs: ability.armMs,
      remainingMs: ability.lifeMs,
      durationMs: ability.lifeMs,
      triggerRadius: ability.triggerRadius,
      blastRadius: ability.blastRadius,
      damage,
      defId: enemy.defId,
      seed: Math.floor(state.rng() * 997),
    });
    state.events.push({
      type: "baitDropped",
      pos: { ...pos },
      defId: enemy.defId,
    });
  }
}

registerAbility<BaitDropAbility>({ id: "bait_drop", ready, cast });
