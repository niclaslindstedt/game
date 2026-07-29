// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ORBITAL DELIVERY — an airstrike, in the company's own language.
//
// The boss points, and pods come down on marks around the hero: each telegraphs
// with a firming ground shadow, lands, blows, and POPS OPEN, so every crater is
// also a spawn. What arrives is not just damage — it is the next wave, delivered.
//
// It rides the METEOR system (`state.asteroids`) rather than growing one of its
// own, and that is a design decision rather than a saving. The rain already
// knows how to drop something out of the sky onto a readable mark, ramp a
// shadow as it comes, blast on impact, shove the horde and leave a crater — and
// crucially, THE PLAYER ALREADY KNOWS HOW TO READ THAT SHADOW, because Mars has
// been raining rocks at them for a level and a half. So a brand-new move is
// legible the very first time it is used, which is the hardest thing to buy for
// a boss ability and the thing a bespoke telegraph would have thrown away.
//
// The marks scatter AROUND the hero rather than landing on him: an airstrike
// aimed dead at a moving target is a coin flip, one that brackets him is a
// question about which way to move.

import type { AirstrikeAbility } from "../defs/enemies/abilities.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { mobBlowDamage } from "./shared.ts";

/** How far up-range a pod enters, so its fall visibly slants onto the mark. */
const ENTRY_DIST = 260;
/** The pod's own drawn size (world px). */
const POD_RADIUS = 9;

/**
 * Always available once the boss is awake. No range check and no line of sight
 * on purpose: an airstrike does not care how close anybody is standing or what
 * is between them — that is the entire point of calling one instead of walking
 * over. The cooldown is the only thing that paces it.
 */
const ready = (): boolean => true;

function cast(ability: AirstrikeAbility, ctx: AbilityCtx): void {
  const { state, enemy, def } = ctx;
  const damage = mobBlowDamage(enemy, def.contactDamage, ability.damageFrac);
  const hero = state.player.pos;
  for (let i = 0; i < ability.count; i++) {
    // Bracketed around him on an even ring, with the ring's phase rolled so a
    // second strike never lands on the first one's marks.
    const angle = (i / ability.count) * Math.PI * 2 + state.rng() * Math.PI;
    const reach = ability.spread * (0.35 + state.rng() * 0.65);
    const target = {
      x: Math.min(
        Math.max(hero.x + Math.cos(angle) * reach, 12),
        state.level.width - 12,
      ),
      y: Math.min(
        Math.max(hero.y + Math.sin(angle) * reach, 12),
        state.level.height - 12,
      ),
    };
    const bearing = state.rng() * Math.PI * 2;
    state.asteroids.push({
      id: state.nextId++,
      target,
      entry: {
        x: target.x + Math.cos(bearing) * ENTRY_DIST,
        y: target.y + Math.sin(bearing) * ENTRY_DIST,
      },
      fallMs: ability.fallMs,
      ageMs: 0,
      blastRadius: ability.blastRadius,
      rockRadius: POD_RADIUS,
      spin: 0, // A pod is guided; it does not tumble like a rock.
      sprite: "drop_pod",
      damage,
      sourceDefId: enemy.defId,
      hatch:
        ability.hatch && (ability.hatchCount ?? 0) > 0
          ? { defId: ability.hatch, count: ability.hatchCount ?? 1 }
          : undefined,
    });
  }
  state.events.push({
    type: "bossAirstrike",
    pos: { ...enemy.pos },
    count: ability.count,
    defId: enemy.defId,
  });
}

registerAbility<AirstrikeAbility>({ id: "airstrike", ready, cast });
