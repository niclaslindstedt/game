// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The conjured powers' tick: timed ability pickups (orbs, storms, the magnet),
// the forever spells worn gear grants, and the deferred combat bursts — weapon
// procs and magic-crit blobs — that resolve after every enemy-list pass. Part
// of the step pipeline (see ./index.ts).

import { distanceSq, moveToward } from "@game/lib/vec.ts";
import {
  abilityPowerScale,
  magnetRadius,
  orbPositions,
  removeHeldSlot,
} from "../abilities.ts";
import { MAGIC_CRIT, SPELL } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { canCollectEquipment, effectiveStat } from "../items/index.ts";
import { hitEnemy } from "../loot.ts";
import {
  boltProcDamage,
  itemSpellOrbPositions,
  novaProcParams,
  orbitSpellParams,
  stormSpellParams,
  syncItemSpells,
} from "../spells.ts";
import type { Enemy, GameState } from "../types.ts";
import { nearestEnemy } from "./weapon.ts";

/**
 * Advance the player's time-limited abilities: orbit orbs sweep and mangle
 * what they touch, storms strike the nearest monster on an interval, and
 * expired abilities fall away. (Stasis fields act inside moveEnemy.) All
 * damage flows through hitEnemy, so crits, XP, and loot work unchanged.
 */
export function stepAbilities(
  state: GameState,
  dt: number,
  dtMs: number,
): void {
  const player = state.player;
  if (player.abilities.length === 0) return;

  // The conjured powers' damage scale (level ramp × INT — abilityPowerScale):
  // catalog numbers are level-1 values; this keeps a powerup meaning the same
  // fraction of a level-appropriate healthbar all campaign.
  const power = abilityPowerScale(state);

  for (const ability of player.abilities) {
    ability.remainingMs -= dtMs;
    ability.cooldownMs = Math.max(0, ability.cooldownMs - dtMs);
    const def = abilityDef(ability.defId);

    if (def.orbit) {
      ability.angle += def.orbit.angularSpeed * dt;
      if (ability.cooldownMs <= 0) {
        let struck = false;
        for (const orb of orbPositions(player, ability)) {
          let victim: Enemy | undefined;
          for (const enemy of state.enemies) {
            const enemyDefData = enemyDef(enemy.defId);
            if (enemyDefData.apparition) continue;
            const reach = enemyDefData.radius + def.orbit.orbRadius;
            if (distanceSq(enemy.pos, orb) <= reach * reach) {
              victim = enemy;
              break;
            }
          }
          if (!victim) continue;
          // Conjured abilities crit off INTELLIGENCE, like the magic they are.
          // A powerup's kills stay out of the menace meter (`noMenace`).
          hitEnemy(state, victim, def.orbit.damage * power, "magic", {
            noMenace: true,
          });
          struck = true;
        }
        if (struck) ability.cooldownMs = def.orbit.hitCooldownMs;
      }
    }

    if (def.storm && ability.cooldownMs <= 0) {
      const victim = nearestEnemy(state.enemies, player.pos, def.storm.range);
      if (victim) {
        ability.cooldownMs = def.storm.intervalMs;
        state.events.push({ type: "lightning", pos: { ...victim.pos } });
        hitEnemy(state, victim, def.storm.damage * power, "magic", {
          noMenace: true,
        });
      }
    }

    // The magnet: drops caught in the field fly at the player. Actual
    // pickup stays stepItems' job once they arrive within reach.
    if (def.magnet) {
      const reach = magnetRadius(state, def);
      const reachSq = reach * reach;
      const pull = def.magnet.pullSpeed * dt;
      for (const item of state.items) {
        // A drop still being flown in by its angel is airborne — the magnet
        // can't reel a gift out of the guardian's hands (see stepItems).
        if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
        // Gear the hero can't keep — a find that neither auto-equips nor fits
        // the bag — is left where it lies; reeling it in would only pile
        // uncollectable loot at his feet (stepItems turns it away on arrival).
        if (
          item.kind === "equipment" &&
          !canCollectEquipment(state, item.equipment)
        )
          continue;
        if (distanceSq(item.pos, player.pos) > reachSq) continue;
        item.pos = moveToward(item.pos, player.pos, pull);
      }
    }
  }

  for (let i = player.abilities.length - 1; i >= 0; i--) {
    const ability = player.abilities[i] as (typeof player.abilities)[number];
    if (ability.remainingMs > 0) continue;
    player.abilities.splice(i, 1);
    state.events.push({ type: "abilityEnded", defId: ability.defId });
    // The power is done: free its dock slot at last, closing the row up so the
    // rest shift down (and keeping every other running copy's slot link true).
    if (ability.slot !== undefined) removeHeldSlot(state, ability.slot);
  }
}

/**
 * Advance the GRANTED SPELLS worn gear carries (the `spell` affix — see
 * spells.ts and config `SPELL`): the loadout is reconciled first, then the
 * forever orbit sweeps and the forever storm strikes exactly like their
 * pickup twins (stasis acts inside moveEnemy via `stasisFactorAt`). One
 * deliberate difference from the pickups: NO `noMenace` — a granted spell is
 * the hero's permanent build power, so its output heats the menace meter
 * like any weapon blow, where a temporary powerup's is exempted.
 */
export function stepItemSpells(
  state: GameState,
  dt: number,
  dtMs: number,
): void {
  syncItemSpells(state);
  const player = state.player;
  if (player.itemSpells.length === 0) return;

  const power = abilityPowerScale(state);

  for (const spell of player.itemSpells) {
    spell.cooldownMs = Math.max(0, spell.cooldownMs - dtMs);

    if (spell.spell === "orbit") {
      const params = orbitSpellParams(state, spell.rank);
      spell.angle += params.angularSpeed * dt;
      if (spell.cooldownMs <= 0) {
        let struck = false;
        // One sweep of the orbs = one menace ATTACK (see bankOverkill).
        const attack = state.nextId++;
        for (const orb of itemSpellOrbPositions(state, player, spell)) {
          let victim: Enemy | undefined;
          for (const enemy of state.enemies) {
            const enemyDefData = enemyDef(enemy.defId);
            if (enemyDefData.apparition) continue;
            const reach = enemyDefData.radius + params.orbRadius;
            if (distanceSq(enemy.pos, orb) <= reach * reach) {
              victim = enemy;
              break;
            }
          }
          if (!victim) continue;
          hitEnemy(state, victim, params.damage * power, "magic", { attack });
          struck = true;
        }
        if (struck) spell.cooldownMs = params.hitCooldownMs;
      }
    }

    if (spell.spell === "storm" && spell.cooldownMs <= 0) {
      const params = stormSpellParams(state, spell.rank);
      const victim = nearestEnemy(state.enemies, player.pos, params.range);
      if (victim) {
        spell.cooldownMs = params.intervalMs;
        state.events.push({ type: "lightning", pos: { ...victim.pos } });
        hitEnemy(state, victim, params.damage * power, "magic");
      }
    }
  }
}

/**
 * Resolve the PROCS this tick's weapon blows queued (`proc` affixes — see
 * `queueWeaponProcs` in loot.ts): a BOLT grounds in the triggering victim if
 * it still stands (else the nearest foe to where it fell), a NOVA bursts
 * around the trigger point and bills everything inside the ring. Drained
 * AFTER the attack passes so the extra kills never mutate the enemy list
 * under a sweep in progress — and since only `rollAccuracy` blows queue
 * procs, a proc's own hits can never proc again.
 */
export function stepProcs(state: GameState): void {
  if (state.pendingProcs.length === 0) return;
  const queue = state.pendingProcs;
  state.pendingProcs = [];
  const power = abilityPowerScale(state);

  for (const proc of queue) {
    if (proc.spell === "bolt") {
      const target =
        state.enemies.find((e) => e.id === proc.enemyId) ??
        nearestEnemy(state.enemies, proc.pos, SPELL.bolt.range);
      if (!target) continue;
      state.events.push({ type: "lightning", pos: { ...target.pos } });
      hitEnemy(state, target, boltProcDamage(proc.rank) * power, "magic");
      continue;
    }
    // NOVA: snapshot the victims first — hitEnemy splices the slain.
    const params = novaProcParams(proc.rank);
    state.events.push({
      type: "nova",
      pos: { ...proc.pos },
      radius: params.radius,
    });
    const reachSq = params.radius * params.radius;
    const victims = state.enemies.filter(
      (enemy) =>
        !enemyDef(enemy.defId).apparition &&
        distanceSq(enemy.pos, proc.pos) <= reachSq,
    );
    // One proc burst = one menace ATTACK (see bankOverkill).
    const attack = state.nextId++;
    for (const victim of victims) {
      hitEnemy(state, victim, params.damage * power, "magic", { attack });
    }
  }
}

/**
 * Burst the MAGIC CRIT BLOBS this tick's magic crits queued (config
 * `MAGIC_CRIT`): each detonates a small arcane splash around the struck foe,
 * billing the nearest few OTHERS (the crit victim already took the blow) for a
 * fraction of it. INTELLIGENCE grows the reach and the target count, both
 * firmly capped — the baseline reward stays small, and screen-shaping AoE is
 * left to unique/legendary item powers. Drained after `stepProcs` so the extra
 * kills never mutate the enemy list under a sweep; the splash hits omit
 * `rollAccuracy`, so a blob never blobs or procs again. Reuses the violet
 * `nova` burst for its visual — a local arcane shockwave.
 */
export function stepMagicCritBlobs(state: GameState): void {
  if (state.pendingCritBlobs.length === 0) return;
  const queue = state.pendingCritBlobs;
  state.pendingCritBlobs = [];
  const int = effectiveStat(state, "intelligence");
  const radius = Math.min(
    MAGIC_CRIT.blobRadiusMax,
    MAGIC_CRIT.blobRadius + int * MAGIC_CRIT.blobRadiusPerInt,
  );
  const maxTargets = Math.min(
    MAGIC_CRIT.blobTargetsMax,
    Math.floor(MAGIC_CRIT.blobTargets + int * MAGIC_CRIT.blobTargetsPerInt),
  );
  const reachSq = radius * radius;
  for (const blob of queue) {
    state.events.push({ type: "nova", pos: { ...blob.pos }, radius });
    if (maxTargets <= 0) continue;
    // The nearest OTHER foes to the burst — the crit victim already ate the
    // blow, so it is excluded. Snapshot + sort so the cap is honest even as
    // hitEnemy splices the slain.
    const victims = state.enemies
      .filter(
        (enemy) =>
          enemy.id !== blob.victimId &&
          !enemyDef(enemy.defId).apparition &&
          distanceSq(enemy.pos, blob.pos) <= reachSq,
      )
      .sort((a, b) => distanceSq(a.pos, blob.pos) - distanceSq(b.pos, blob.pos))
      .slice(0, maxTargets);
    const damage = blob.blowDamage * MAGIC_CRIT.blobDamageFrac;
    // One blob's splash = one menace ATTACK (see bankOverkill).
    const attack = state.nextId++;
    for (const victim of victims) {
      hitEnemy(state, victim, damage, "magic", { attack });
    }
  }
}
