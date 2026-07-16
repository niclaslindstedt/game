// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-CAST spells (see defs/spells.ts): the mana-costed, INT-unlocked powers
// the hero taps off the HUD spell bar. This module owns the cast path —
// unlock/cooldown/mana gates, mana spend, and effect resolution — plus the
// SPIRIT-driven mana/health regen tick. Damage routes through the shared
// `hitEnemy` funnel at "magic" class (always hits, ignores mob armor) scaled by
// the same `abilityPowerScale` the abilities and granted spells use, so a
// spell keeps meaning the same fraction of a level-appropriate healthbar all
// campaign. Effects reuse the existing `lightning` / `nova` event cues.

import { distanceSq } from "@game/lib/vec.ts";
import { REGEN, WEAPON } from "./config.ts";
import { abilityPowerScale } from "./abilities.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import {
  isSpellUnlocked,
  spellDef,
  SPELL_STAT,
  type SpellDef,
} from "./defs/spells.ts";
import { effectiveStat, hpRegenPerSec, manaRegenPerSec } from "./items.ts";
import { hitEnemy } from "./loot.ts";
import type { Enemy, GameState } from "./types.ts";

/** True when a spell can be seen/hit — not an apparition, not a kneeling
 * spareable awaiting its verdict (mirrors the guards inside `hitEnemy`). */
function isTargetable(state: GameState, enemy: Enemy): boolean {
  if (enemyDef(enemy.defId).apparition) return false;
  if (state.choice !== null && state.choice.enemyId === enemy.id) return false;
  return true;
}

/** The nearest targetable foe to `from` within `range`, or undefined. */
function nearestTarget(
  state: GameState,
  from: { x: number; y: number },
  range: number,
  exclude?: Set<number>,
): Enemy | undefined {
  const rangeSq = range * range;
  let best: Enemy | undefined;
  let bestSq = Infinity;
  for (const enemy of state.enemies) {
    if (exclude?.has(enemy.id)) continue;
    if (!isTargetable(state, enemy)) continue;
    const d = distanceSq(enemy.pos, from);
    if (d <= rangeSq && d < bestSq) {
      bestSq = d;
      best = enemy;
    }
  }
  return best;
}

/**
 * Whether a spell would do ANYTHING right now — used to refuse (and refund) a
 * cast that has no effect: an attack bolt with no foe in range, a heal at full
 * hp. AoE / ward / slow casts are always allowed (the player's call to pre-cast
 * into an empty field).
 */
function hasEffect(state: GameState, def: SpellDef): boolean {
  const effect = def.effect;
  if (effect.kind === "bolt") {
    return nearestTarget(state, state.player.pos, effect.range) !== undefined;
  }
  if (effect.kind === "heal") {
    return state.player.hp < state.player.maxHp;
  }
  return true;
}

/**
 * Cast the spell in spell-bar slot `slotIndex`. Runs the gates in order —
 * unlocked (effective INT ≥ its `minInt`), off cooldown, enough mana, and it
 * would actually do something — refusing with a `spellFizzled` event (nothing
 * spent) on any miss. On success it spends the mana, arms the cooldown, pauses
 * mana regen (`REGEN.manaDelayMs`), books the spell-economy stats, emits
 * `spellCast`, and resolves the effect. Returns whether a cast happened.
 */
export function castSpell(state: GameState, slotIndex: number): boolean {
  const player = state.player;
  const id = player.spellSlots[slotIndex];
  if (!id) return false;
  const def = spellDef(id);

  const effInt = effectiveStat(state, SPELL_STAT);
  if (!isSpellUnlocked(def, effInt)) {
    state.events.push({ type: "spellFizzled", spellId: id, reason: "locked" });
    return false;
  }
  if ((player.spellCooldowns[id] ?? 0) > 0) {
    state.events.push({
      type: "spellFizzled",
      spellId: id,
      reason: "cooldown",
    });
    return false;
  }
  if (player.mana < def.manaCost) {
    state.events.push({ type: "spellFizzled", spellId: id, reason: "mana" });
    return false;
  }
  if (!hasEffect(state, def)) {
    state.events.push({ type: "spellFizzled", spellId: id, reason: "nothing" });
    return false;
  }

  // Spend the mana, arm the cooldown, and hold mana regen off for the idle
  // window — a cast is what resets the "5 seconds of no spell" timer.
  player.mana -= def.manaCost;
  player.spellCooldowns[id] = def.cooldownMs;
  player.manaRegenMs = REGEN.manaDelayMs;
  state.stats.manaSpent += def.manaCost;
  state.stats.spellsCast += 1;
  state.events.push({
    type: "spellCast",
    spellId: id,
    pos: { ...player.pos },
    cost: def.manaCost,
  });

  resolveEffect(state, def);
  return true;
}

/** Resolve a cast spell's effect (mana already spent). */
function resolveEffect(state: GameState, def: SpellDef): void {
  const player = state.player;
  const effect = def.effect;
  const power = abilityPowerScale(state);

  if (effect.kind === "bolt") {
    castBolt(state, effect.damage * power, effect.range, effect.chain ?? 0);
    return;
  }
  if (effect.kind === "nova") {
    const reachSq = effect.radius * effect.radius;
    const victims = state.enemies.filter(
      (e) => isTargetable(state, e) && distanceSq(e.pos, player.pos) <= reachSq,
    );
    state.events.push({
      type: "nova",
      pos: { ...player.pos },
      radius: effect.radius,
    });
    const damage = effect.damage * power;
    for (const victim of victims) hitEnemy(state, victim, damage, "magic");
    return;
  }
  if (effect.kind === "heal") {
    const before = player.hp;
    const heal = Math.max(1, Math.round(player.maxHp * effect.healPct));
    player.hp = Math.min(player.maxHp, player.hp + heal);
    state.events.push({ type: "spellHealed", heal: player.hp - before });
    return;
  }
  if (effect.kind === "shield") {
    // Refresh to the stronger ward — a re-cast tops up rather than stacking.
    const absorb = Math.max(1, Math.round(player.maxHp * effect.absorbPct));
    player.shieldHp = Math.max(player.shieldHp, absorb);
    player.shieldMs = Math.max(player.shieldMs, effect.durationMs);
    state.events.push({
      type: "playerShielded",
      shieldHp: player.shieldHp,
      ms: player.shieldMs,
    });
    return;
  }
  // slow: chill every foe in the ring (reuses the frost-nova chill fields;
  // pure crowd control, no damage). The frost `nova` cue draws the ring.
  const reachSq = effect.radius * effect.radius;
  state.events.push({
    type: "nova",
    pos: { ...player.pos },
    radius: effect.radius,
    frost: true,
  });
  for (const enemy of state.enemies) {
    if (!isTargetable(state, enemy)) continue;
    if (distanceSq(enemy.pos, player.pos) > reachSq) continue;
    enemy.chillMs = effect.durationMs;
    enemy.chillFactor = effect.factor;
  }
}

/**
 * The ATTACK bolt: strike the nearest foe in range, then arc to `chain` more
 * unstruck foes within `WEAPON.chainRange`, each leap carrying
 * `WEAPON.chainDamageFrac` of the last. Each strike flashes a `lightning`
 * event. `damage` is already power-scaled.
 */
function castBolt(
  state: GameState,
  damage: number,
  range: number,
  chain: number,
): void {
  let victim = nearestTarget(state, state.player.pos, range);
  if (!victim) return;
  const struck = new Set<number>();
  let dmg = damage;
  let from = state.player.pos;
  for (let leap = 0; ; leap++) {
    state.events.push({ type: "lightning", pos: { ...victim.pos } });
    struck.add(victim.id);
    const at = victim.pos;
    hitEnemy(state, victim, dmg, "magic");
    if (leap >= chain) break;
    const next = nearestTarget(state, at, WEAPON.chainRange, struck);
    if (!next) break;
    from = at;
    victim = next;
    dmg *= WEAPON.chainDamageFrac;
  }
  void from;
}

/**
 * Advance the SPIRIT-driven regen and the spell/shield timers one tick (called
 * from `step` while playing). Mana refills only after the post-cast idle window
 * (`player.manaRegenMs`) lapses; health only after the post-hit pause
 * (`player.hpRegenMs`); the shield and every per-spell cooldown count down.
 */
export function stepRegen(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;

  // Mana regen: held off until the 5s post-cast window idles out.
  if (player.manaRegenMs > 0) {
    player.manaRegenMs = Math.max(0, player.manaRegenMs - dtMs);
  } else if (player.mana < player.maxMana) {
    player.mana = Math.min(
      player.maxMana,
      player.mana + manaRegenPerSec(state) * dt,
    );
  }

  // Health regen: held off until the post-hit pause lapses; 0 at 0 SPIRIT.
  if (player.hpRegenMs > 0) {
    player.hpRegenMs = Math.max(0, player.hpRegenMs - dtMs);
  } else if (player.hp < player.maxHp) {
    const rate = hpRegenPerSec(state);
    if (rate > 0) player.hp = Math.min(player.maxHp, player.hp + rate * dt);
  }

  // The magical shield ebbs with its timer; a drained or lapsed ward clears.
  if (player.shieldMs > 0) {
    player.shieldMs = Math.max(0, player.shieldMs - dtMs);
    if (player.shieldMs === 0) player.shieldHp = 0;
  }

  // Per-spell cooldowns tick down.
  for (const id of Object.keys(player.spellCooldowns)) {
    const left = (player.spellCooldowns[id] ?? 0) - dtMs;
    if (left <= 0) delete player.spellCooldowns[id];
    else player.spellCooldowns[id] = left;
  }
}
