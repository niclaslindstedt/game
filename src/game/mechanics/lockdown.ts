// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOCKDOWN — the room stops being the room.
//
// Blast shutters drop in a ring around the hero, leaving exactly ONE gap. He is
// not trapped, he is CORNERED, and the difference is the entire ability: a
// sealed box is just a damage window with extra steps, while a box with a door
// is a question. Take the fight in here where the warden wants it, or spend the
// seconds finding the way out and give up the ground you were holding.
//
// The shutters are ORDINARY OBSTACLES (`state.obstacles`) rather than a new kind
// of thing. That is the same bargain ORBITAL DELIVERY made with the meteors:
// collision, line-of-sight, shot-blocking and the renderer all already know what
// an obstacle is, so the ability is a placement rule and nothing else — and the
// shutters block a boss's own shots exactly like a rock does, which the player
// can and should use.
//
// The one thing that ISN'T free is the autopilot's nav grid, which is built once
// per level and cached. A wall that appears after that is a wall the bot cannot
// see, so it paths straight into it and grinds. `state.obstaclesVersion` exists
// for that: bumped whenever this ability changes the field, read by
// `ensureRoute`, which rebuilds. Any future dynamic obstacle gets the fix free.

import type { LockdownAbility } from "../defs/enemies/abilities.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";

/**
 * Worth doing when the hero is far enough from the boss that a ring around HIM
 * is a real cage rather than a box the boss is standing in the middle of, and
 * when the last one has retracted.
 */
function ready(ability: LockdownAbility, ctx: AbilityCtx): boolean {
  if (ctx.mech.lockdownMs && ctx.mech.lockdownMs > 0) return false;
  return ctx.distance > ability.radius * 0.5;
}

function cast(ability: LockdownAbility, ctx: AbilityCtx): void {
  const { state, enemy, mech } = ctx;
  const hero = state.players[0].pos;
  // The gap's bearing is ROLLED, so the way out is somewhere different every
  // time and the move stays a search rather than a memorised sidestep.
  const gapAt = state.rng() * Math.PI * 2;
  const gap = (ability.gapDeg * Math.PI) / 180;
  const ids: number[] = [];

  for (let i = 0; i < ability.segments; i++) {
    const angle = (i / ability.segments) * Math.PI * 2;
    // Inside the gap? Leave the door open.
    let d = angle - gapAt;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= gap / 2) continue;

    const pos = {
      x: hero.x + Math.cos(angle) * ability.radius,
      y: hero.y + Math.sin(angle) * ability.radius,
    };
    const margin = ability.segmentRadius + 2;
    if (pos.x < margin || pos.y < margin) continue;
    if (pos.x > state.level.width - margin) continue;
    if (pos.y > state.level.height - margin) continue;

    const id = state.nextId++;
    state.obstacles.push({
      id,
      kind: "shutter",
      sprite: ability.sprite,
      pos,
      radius: ability.segmentRadius,
      // Emphatically NOT jumpable: the gap is the way out, and a hero who could
      // simply hop the wall would never look for it.
      jumpable: false,
    });
    ids.push(id);
  }

  mech.shutterIds = ids;
  mech.lockdownMs = ability.durationMs;
  // The field changed shape — every cached nav grid is now wrong.
  state.obstaclesVersion++;
  state.events.push({
    type: "bossLockdown",
    pos: { ...hero },
    radius: ability.radius,
    gapAngle: gapAt,
    defId: enemy.defId,
  });
}

/**
 * Run the clock down and pull the shutters back up when it expires. Never owns
 * the mob's tick: a warden that stood still admiring its own cage would give
 * the player the whole lockdown for free.
 */
function step(_ability: LockdownAbility, ctx: AbilityCtx): boolean {
  const { state, mech, dtMs } = ctx;
  if (!mech.lockdownMs || mech.lockdownMs <= 0) return false;
  mech.lockdownMs -= dtMs;
  if (mech.lockdownMs > 0) return false;

  const ids = new Set(mech.shutterIds ?? []);
  if (ids.size > 0) {
    state.obstacles = state.obstacles.filter((o) => !ids.has(o.id));
    state.obstaclesVersion++;
    state.events.push({
      type: "bossLockdownLifted",
      pos: { ...ctx.enemy.pos },
      defId: ctx.enemy.defId,
    });
  }
  mech.shutterIds = undefined;
  mech.lockdownMs = 0;
  return false;
}

registerAbility<LockdownAbility>({ id: "lockdown", ready, cast, step });
