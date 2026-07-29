// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LASER EYES — the boss's eyes light, and a beam sweeps the floor on fire.
//
// The move exists to do something no other set piece in the game does: CHANGE
// THE ARENA. A slam is one dodge and the floor is exactly as it was; a beam
// that leaves burning ground behind it means a fight that runs long costs the
// player the room they were using to stay alive. So the beam itself is almost
// generous — a slow, wide, plainly visible sweep off a locked bearing — and the
// pressure comes from what it leaves behind.
//
// Three rules make it learnable on the second sighting:
//   • THE BEARING LOCKS AT THE TELL. The sweep is centred on where the hero
//     stood when the eyes lit, so walking is the answer, and a player who
//     stands still to keep shooting is the one who gets burned. Exactly the
//     charge's rule, deliberately — a fight should reuse the answers it has
//     already taught.
//   • THE SWEEP IS ONE DIRECTION, ALWAYS. It starts at one edge of the arc and
//     travels to the other. A sweep that reversed would punish the player for
//     reading it correctly.
//   • THE FLOOR IS SURVIVABLE. Scorch bites on a slow cadence and burns out on
//     its own, so the arena is squeezed rather than deleted. A boss may carve
//     the floor; it may never permanently take it away.

import { direction } from "@game/lib/vec.ts";
import { PLAYER } from "../config/index.ts";
import type { LaserEyesAbility } from "../defs/enemies/abilities.ts";
import { lineOfSight } from "../obstacles.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import {
  groundMoveCanTouch,
  landHostileBlow,
  mobBlowDamage,
} from "./shared.ts";

// HOW MUCH FIRE. Measured, not guessed: at 170ms and 1.5 radii a 1.5s sweep
// laid ~70 patches, which drew as a solid black mass across half the arena
// rather than as a scorched band, and cost the player the whole floor at once.
// A patch is 30px across, so a lay every ~280ms across a 110° arc leaves a
// readable gap between successive lines, and spacing them 2.2 radii apart along
// the beam leaves gaps to walk THROUGH — which is what keeps a squeezed arena
// from being a closed one.
/** How often the sweep lays a fresh line of burning ground under itself. */
const LAY_INTERVAL_MS = 280;
/** Gap between patches along one laid line, as a share of a patch's radius. */
const LAY_SPACING = 2.2;

/**
 * The beam may open when the hero is inside its reach, in the open, and no
 * sweep is already running. It deliberately does NOT require the hero to be
 * far away: a beam that only fired at range would be answered by walking into
 * the boss's face and never leaving.
 */
function ready(ability: LaserEyesAbility, ctx: AbilityCtx): boolean {
  if (ctx.mech.beam) return false;
  if (ctx.distance > ability.range * 0.95) return false;
  return lineOfSight(ctx.state, ctx.enemy.pos, ctx.state.player.pos);
}

/**
 * The eyes finish lighting: open the sweep. The bearing was locked when the
 * windup started (the orchestrator stamps it on the telegraph), so the sweep
 * is centred on where the hero WAS, not where they are now.
 */
function cast(ability: LaserEyesAbility, ctx: AbilityCtx): void {
  const { state, enemy, def, mech } = ctx;
  const locked = ctx.lockedDir ?? direction(enemy.pos, state.player.pos);
  const angle = Math.atan2(locked.y, locked.x);
  const sweep = (ability.sweepDeg * Math.PI) / 180;
  mech.beam = {
    angle,
    sweep,
    remainingMs: ability.sweepMs,
    durationMs: ability.sweepMs,
    range: ability.range,
    width: ability.beamWidth,
    damage: mobBlowDamage(enemy, def.contactDamage, ability.damageFrac),
    hitIntervalMs: ability.hitIntervalMs,
    hitCooldownMs: 0,
    layMs: 0,
    scorchMs: ability.scorchMs,
    scorchRadius: ability.scorchRadius,
    scorchDamage: mobBlowDamage(
      enemy,
      def.contactDamage,
      ability.scorchDamageFrac,
    ),
    scorchTickMs: ability.scorchTickMs,
  };
  state.events.push({
    type: "bossBeam",
    pos: { ...enemy.pos },
    angle,
    sweep,
    range: ability.range,
    width: ability.beamWidth,
    durationMs: ability.sweepMs,
    defId: enemy.defId,
  });
}

/**
 * Advance the sweep: rotate the beam, burn whatever it is crossing, and lay
 * burning ground under it. Owns the mob's tick for as long as it runs — the
 * boss plants itself and turns, which is what makes the arc readable.
 */
function step(ability: LaserEyesAbility, ctx: AbilityCtx): boolean {
  const { state, enemy, def, mech, dtMs } = ctx;
  const beam = mech.beam;
  if (!beam) return false;
  beam.remainingMs -= dtMs;
  if (beam.hitCooldownMs > 0) beam.hitCooldownMs -= dtMs;
  if (beam.layMs > 0) beam.layMs -= dtMs;
  if (beam.remainingMs <= 0) {
    mech.beam = undefined;
    return false;
  }
  // Progress runs one way, edge to edge, so a read of the arc always holds.
  const t = 1 - beam.remainingMs / beam.durationMs;
  const angle = beam.angle - beam.sweep / 2 + beam.sweep * t;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // BURN WHAT IT CROSSES: the hero's offset resolved into the beam's own frame
  // — how far along the lane, and how far off its centreline.
  if (beam.hitCooldownMs <= 0 && groundMoveCanTouch(state)) {
    const dx = state.player.pos.x - enemy.pos.x;
    const dy = state.player.pos.y - enemy.pos.y;
    const along = dx * cos + dy * sin;
    const off = Math.abs(-dx * sin + dy * cos);
    if (
      along >= 0 &&
      along <= beam.range &&
      off <= beam.width + PLAYER.radius &&
      lineOfSight(state, enemy.pos, state.player.pos)
    ) {
      landHostileBlow(
        state,
        beam.damage,
        enemy.mlvl,
        enemy.defId,
        enemy,
        state.rng() < 0.1,
      );
      beam.hitCooldownMs = beam.hitIntervalMs;
    }
  }

  // LAY THE FIRE: a line of patches from just outside the boss's own body to
  // the beam's reach, dropped on a cadence rather than every tick — the floor
  // should read as a swept BAND of fire, not as a solid disc.
  if (beam.layMs <= 0) {
    beam.layMs = LAY_INTERVAL_MS;
    const spacing = Math.max(6, beam.scorchRadius * LAY_SPACING);
    const start = def.radius + beam.scorchRadius;
    for (let d = start; d <= beam.range; d += spacing) {
      const pos = { x: enemy.pos.x + cos * d, y: enemy.pos.y + sin * d };
      if (pos.x < 4 || pos.y < 4) continue;
      if (pos.x > state.level.width - 4 || pos.y > state.level.height - 4)
        continue;
      // A wall eats the beam: stop laying the moment the lane is broken, so
      // fire never appears on the far side of cover the player is using.
      if (!lineOfSight(state, enemy.pos, pos)) break;
      state.scorches.push({
        pos,
        radius: beam.scorchRadius,
        remainingMs: beam.scorchMs,
        durationMs: beam.scorchMs,
        tickMs: 0,
        intervalMs: beam.scorchTickMs,
        damage: beam.scorchDamage,
        defId: enemy.defId,
        seed: Math.floor(state.rng() * 997),
      });
    }
  }
  // The sweep is only over when the arc is spent, so the boss holds still and
  // the player can see the whole move through.
  return true;
}

registerAbility<LaserEyesAbility>({ id: "laser_eyes", ready, cast, step });
