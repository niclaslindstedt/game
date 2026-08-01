// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The conjured powers' tick: timed ability pickups (orbs, storms, the magnet),
// the forever spells worn gear grants, and the deferred combat bursts — weapon
// procs and magic-crit blobs — that resolve after every enemy-list pass. Part
// of the step pipeline (see ./index.ts).

import { distanceSq, moveToward } from "@game/lib/vec.ts";
import {
  abilityPowerScale,
  magnetRadius,
  removeHeldSlot,
} from "../abilities.ts";
import {
  abilityScratch,
  applyImmolation,
  applyOrbit,
  applySingularity,
  applyStorm,
  applyVolley,
  commitAbilityScratch,
  plainBilling,
  powerupBilling,
  spellBilling,
} from "../ability-effects.ts";
import { MAGIC_CRIT, SPELL } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import { canCollectEquipment, effectiveStat } from "../items/index.ts";
import { hitEnemy } from "../loot.ts";
import {
  boltProcDamage,
  immolationSpellBlock,
  novaProcParams,
  orbitSpellBlock,
  seekerSpellBlock,
  singularitySpellBlock,
  stormSpellBlock,
  syncItemSpells,
} from "../spells.ts";
import type { GameState, Player } from "../types/index.ts";
import { heroAt } from "../party.ts";
import { nearestEnemy } from "./weapon.ts";
import { inertEnemy } from "../disposition.ts";

/**
 * Advance the player's time-limited abilities: orbit orbs sweep and mangle
 * what they touch, storms strike the nearest monster on an interval, and
 * expired abilities fall away. (Stasis fields act inside moveEnemy.) All
 * damage flows through hitEnemy, so crits, XP, and loot work unchanged.
 */
export function stepAbilities(
  state: GameState,
  player: Player,
  dt: number,
  dtMs: number,
): void {
  if (player.abilities.length === 0) return;

  // The conjured powers' damage scale (level ramp × INT — abilityPowerScale):
  // catalog numbers are level-1 values; this keeps a powerup meaning the same
  // fraction of a level-appropriate healthbar all campaign.
  const power = abilityPowerScale(state, player);

  for (const ability of player.abilities) {
    ability.remainingMs -= dtMs;
    const def = abilityDef(ability.defId);

    // Every effect the power carries runs, each on its OWN clock (see
    // `ActiveAbility.clocks`), through the shared effect library — the same
    // code a granted spell reaches, so a picked-up ring and a conjured one can
    // never drift apart again. A powerup's kills stay out of the menace meter
    // (`noMenace`): a pickup is not the hero's own strength.
    if (def.orbit) {
      const scratch = abilityScratch(ability, "orbit", dtMs);
      applyOrbit(state, player, def.orbit, scratch, dt, power, powerupBilling);
      commitAbilityScratch(ability, "orbit", scratch);
    }

    if (def.storm) {
      const scratch = abilityScratch(ability, "storm", dtMs);
      applyStorm(state, player, def.storm, scratch, power, powerupBilling);
      commitAbilityScratch(ability, "storm", scratch);
    }

    // The magnet: drops caught in the field fly at the player. Actual
    // pickup stays stepItems' job once they arrive within reach.
    if (def.magnet) {
      const reach = magnetRadius(state, player, def);
      const reachSq = reach * reach;
      const pull = def.magnet.pullSpeed * dt;
      for (const item of state.items) {
        // A drop still being flown in by its angel is airborne — the magnet
        // can't reel a gift out of the guardian's hands (see stepItems).
        if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
        // Nor can it reel one mid-TOSS: a find still arcing out of the body it
        // came from would otherwise be yanked sideways in flight, and its
        // landing spot (which is what `pos` holds) is the whole arc's target.
        if (item.toss) continue;
        // Gear the hero can't keep — a find that neither auto-equips nor fits
        // the bag — is left where it lies; reeling it in would only pile
        // uncollectable loot at his feet (stepItems turns it away on arrival).
        if (
          item.kind === "equipment" &&
          !canCollectEquipment(state, player, item.equipment)
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
    state.events.push({
      type: "abilityEnded",
      defId: ability.defId,
      ...(abilityDef(ability.defId).sfx
        ? { sfx: abilityDef(ability.defId).sfx }
        : {}),
    });
    // The power is done: free its dock slot at last, closing the row up so the
    // rest shift down (and keeping every other running copy's slot link true).
    if (ability.slot !== undefined) removeHeldSlot(state, player, ability.slot);
  }
}

/**
 * Advance the GRANTED SPELLS worn gear grants AND the magic tree conjures (the
 * `spell` affix / a `conjure` talent — see spells.ts and config `SPELL`): the
 * loadout is reconciled first, then the forever orbit sweeps, storm strikes,
 * SEEKER-orb volleys, SINGULARITY collapses, and IMMOLATION aura ticks run off
 * `player.itemSpells` (stasis acts inside moveEnemy via `stasisFactorAt`). One
 * deliberate difference from the pickups: NO `noMenace` — a granted spell is
 * the hero's permanent build power, so its output heats the menace meter
 * like any weapon blow, where a temporary powerup's is exempted.
 */
export function stepItemSpells(
  state: GameState,
  player: Player,
  dt: number,
  dtMs: number,
): void {
  syncItemSpells(state, player);
  if (player.itemSpells.length === 0) return;

  const power = abilityPowerScale(state, player);

  for (const spell of player.itemSpells) {
    spell.cooldownMs = Math.max(0, spell.cooldownMs - dtMs);
    // A granted spell IS an effect block — its rank curve simply arrives at one
    // (see spells.ts) — so every branch below hands the shared library the same
    // shape a powerup's own block has. `ItemSpell` already keeps exactly the
    // scratch the library wants, so the spell itself is the scratch.
    if (spell.spell === "orbit") {
      applyOrbit(
        state,
        player,
        orbitSpellBlock(state, player, spell.rank),
        spell,
        dt,
        power,
        spellBilling,
      );
    }

    if (spell.spell === "storm") {
      applyStorm(
        state,
        player,
        stormSpellBlock(state, player, spell.rank),
        spell,
        power,
        plainBilling,
      );
    }

    if (spell.spell === "seeker") {
      applyVolley(
        state,
        player,
        seekerSpellBlock(state, player, spell.rank),
        spell,
        power,
      );
    }

    if (spell.spell === "singularity") {
      applySingularity(
        state,
        player,
        singularitySpellBlock(state, player, spell.rank),
        spell,
        power,
        spellBilling,
      );
    }

    if (spell.spell === "immolation") {
      applyImmolation(
        state,
        player,
        immolationSpellBlock(state, player, spell.rank),
        spell,
        power,
        spellBilling,
      );
    }
  }
}

/**
 * Bill the ARCANE RETRIBUTION reflects this tick's contact/hostile blows queued
 * (`state.pendingReflects`, filled in the struck path): each pays its share of
 * the blow back to the attacker if it still stands. Drained HERE, after every
 * pass that iterates the enemy list, for the same reason as `stepProcs` — a
 * reflected kill must never splice that list out from under a sweep.
 */
export function stepReflectedDamage(state: GameState): void {
  const queue = state.pendingReflects;
  if (!queue || queue.length === 0) return;
  state.pendingReflects = [];
  for (const reflect of queue) {
    const attacker = state.enemies.find((e) => e.id === reflect.enemyId);
    if (!attacker || attacker.hp <= 0) continue;
    // The reflected bite is the struck hero's own build power, so it heats
    // menace like a granted spell's blow (no `noMenace`), and it is billed as
    // THAT hero's blow — an entry with no seat reads as seat 0's. Its enemyHit
    // float shows the hit.
    hitEnemy(state, attacker, reflect.amount, "magic", {
      attacker: heroAt(state, reflect.seat ?? 0) ?? undefined,
    });
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

  for (const proc of queue) {
    // The proc's OWNER (the hero whose affix rolled it — see PendingProc.seat):
    // its damage scales off THEIR power and its hits are billed as their blow.
    // A proc with no seat, or one whose seat has since emptied, reads as seat 0
    // — the one hero a solo run has.
    const owner = heroAt(state, proc.seat ?? 0) ?? state.players[0];
    const power = abilityPowerScale(state, owner);
    if (proc.spell === "bolt") {
      const target =
        state.enemies.find((e) => e.id === proc.enemyId) ??
        nearestEnemy(state, proc.pos, SPELL.bolt.range);
      if (!target) continue;
      state.events.push({ type: "lightning", pos: { ...target.pos } });
      hitEnemy(state, target, boltProcDamage(proc.rank) * power, "magic", {
        attacker: owner,
      });
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
        !inertEnemy(enemy) && distanceSq(enemy.pos, proc.pos) <= reachSq,
    );
    // One proc burst = one menace ATTACK (see bankOverkill).
    const attack = state.nextId++;
    for (const victim of victims) {
      hitEnemy(state, victim, params.damage * power, "magic", {
        attack,
        attacker: owner,
      });
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
  for (const blob of queue) {
    // The crit was one hero's, so the splash reads THAT hero's INTELLIGENCE
    // and bills as their blow — a blob with no seat reads as seat 0's.
    const owner = heroAt(state, blob.seat ?? 0) ?? state.players[0];
    const int = effectiveStat(state, owner, "intelligence");
    const radius = Math.min(
      MAGIC_CRIT.blobRadiusMax,
      MAGIC_CRIT.blobRadius + int * MAGIC_CRIT.blobRadiusPerInt,
    );
    const maxTargets = Math.min(
      MAGIC_CRIT.blobTargetsMax,
      Math.floor(MAGIC_CRIT.blobTargets + int * MAGIC_CRIT.blobTargetsPerInt),
    );
    const reachSq = radius * radius;
    state.events.push({ type: "nova", pos: { ...blob.pos }, radius });
    if (maxTargets <= 0) continue;
    // The nearest OTHER foes to the burst — the crit victim already ate the
    // blow, so it is excluded. Snapshot + sort so the cap is honest even as
    // hitEnemy splices the slain.
    const victims = state.enemies
      .filter(
        (enemy) =>
          enemy.id !== blob.victimId &&
          !inertEnemy(enemy) &&
          distanceSq(enemy.pos, blob.pos) <= reachSq,
      )
      .sort((a, b) => distanceSq(a.pos, blob.pos) - distanceSq(b.pos, blob.pos))
      .slice(0, maxTargets);
    const damage = blob.blowDamage * MAGIC_CRIT.blobDamageFrac;
    // One blob's splash = one menace ATTACK (see bankOverkill).
    const attack = state.nextId++;
    for (const victim of victims) {
      hitEnemy(state, victim, damage, "magic", { attack, attacker: owner });
    }
  }
}
