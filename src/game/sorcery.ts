// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-CAST powers (see defs/spells.ts): the mana-costed, class-unlocked
// spells / arts / techniques the hero taps off the HUD spell bar. This module
// owns the cast path — availability/cooldown/mana gates, mana spend, and effect
// resolution (bolt, nova, rain, heal, shield, slow, self-buff) — plus the cast
// QUEUE and the shared GLOBAL cooldown (a press enqueues; `stepSpellQueue`
// drains one cast per global cooldown while mana lasts, then flushes on empty),
// the SPIRIT-driven mana/health regen tick, and the buff-timer tick. Damage routes
// through the shared `hitEnemy` funnel at "magic" class (always hits, ignores
// mob armor) scaled by the same `abilityPowerScale` the abilities and granted
// spells use, so a power keeps meaning the same fraction of a level-appropriate
// healthbar all campaign. Effects reuse the existing `lightning` / `nova` cues.

import { distanceSq } from "@game/lib/vec.ts";
import { REGEN, WEAPON } from "./config.ts";
import { abilityPowerScale } from "./abilities.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import {
  spellDef,
  SPELL_GLOBAL_COOLDOWN_MS,
  type SpellDef,
} from "./defs/spells.ts";
import { hpRegenPerSec, isSpellAvailable, manaRegenPerSec } from "./items.ts";
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
  if (effect.kind === "rain") {
    return (
      nearestTarget(state, state.player.pos, effect.castRange) !== undefined
    );
  }
  if (effect.kind === "heal") {
    return state.player.hp < state.player.maxHp;
  }
  return true;
}

/**
 * Cast the spell in spell-bar slot `slotIndex`. Runs the gates in order —
 * available (the hero's class, governing stat ≥ its `minStat`), off cooldown,
 * enough mana, and it
 * would actually do something — refusing with a `spellFizzled` event (nothing
 * spent) on any miss. On success it spends the mana, arms the spell's own
 * cooldown AND the shared global cooldown, pauses mana regen
 * (`REGEN.manaDelayMs`), books the spell-economy stats, emits `spellCast`, and
 * resolves the effect. Returns whether a cast happened.
 *
 * Casting the spell NOW; the global-cooldown gate that stops the next cast
 * lives in `stepSpellQueue` (the only real-play caller), so this stays directly
 * callable back-to-back by tests / the `?debug __cast` hook.
 */
export function castSpell(state: GameState, slotIndex: number): boolean {
  const player = state.player;
  const id = player.spellSlots[slotIndex];
  if (!id) return false;
  const def = spellDef(id);

  if (!isSpellAvailable(state, def)) {
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

  // Spend the mana, arm the spell's own cooldown AND the shared global
  // cooldown, and hold mana regen off for the idle window — a cast is what
  // resets the "5 seconds of no spell" timer.
  player.mana -= def.manaCost;
  player.spellCooldowns[id] = def.cooldownMs;
  player.globalCooldownMs = SPELL_GLOBAL_COOLDOWN_MS;
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

/**
 * Queue spell-bar slot `slotIndex` for casting — what a spell press does. The
 * queue drains one cast per global cooldown (`stepSpellQueue`), so a press casts
 * ONCE and a burst of presses fires in order. Deduped by slot: a slot already
 * waiting isn't queued again (so mashing one key, or the bot re-picking the same
 * slot every tick, can't bank a backlog), which also caps the queue at one entry
 * per slot. A slot with no assigned spell is ignored.
 */
export function enqueueSpell(state: GameState, slotIndex: number): void {
  const player = state.player;
  if (slotIndex < 0 || slotIndex >= player.spellSlots.length) return;
  if (!player.spellSlots[slotIndex]) return;
  if (player.spellQueue.includes(slotIndex)) return;
  player.spellQueue.push(slotIndex);
}

/**
 * Drain the cast queue one step. While the GLOBAL cooldown is clear, cast the
 * front queued slot; a successful cast arms the global cooldown, so only one
 * spell fires per cooldown. Entries that can't cast for any reason OTHER than
 * mana (empty slot, still on their own cooldown, nothing in range, off-class)
 * are dropped so the queue never stalls. The first entry the pool can't afford
 * FLUSHES the whole queue — the "cast until mana runs out, then wait for mana to
 * regen before casting again" rule. Called every playing tick from `step`.
 */
export function stepSpellQueue(state: GameState): void {
  const player = state.player;
  if (player.globalCooldownMs > 0) return; // no cast (nor dequeue) mid-GCD
  while (player.spellQueue.length > 0) {
    const slot = player.spellQueue[0];
    if (slot === undefined) break;
    const id = player.spellSlots[slot];
    if (!id) {
      // The slot was cleared/reassigned to empty since the press — drop it.
      player.spellQueue.shift();
      continue;
    }
    if (player.mana < spellDef(id).manaCost) {
      // Out of mana: the queue is spent. Drop the rest and wait for regen.
      player.spellQueue.length = 0;
      return;
    }
    player.spellQueue.shift();
    // A successful cast arms the global cooldown — stop here (one per GCD). A
    // failed cast (own cooldown / no target / locked) spent nothing and armed
    // nothing, so fall through and try the next queued spell this same tick.
    if (castSpell(state, slot)) return;
  }
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
    novaBurst(state, player.pos, effect.radius, effect.damage * power);
    return;
  }
  if (effect.kind === "rain") {
    // The ranged class's AOE: land the burst on the best foe cluster within
    // `castRange` (its centre is the nearest targetable foe there), so a volley
    // reaches out across the field rather than blooming at the hero's feet.
    const target = nearestTarget(state, player.pos, effect.castRange);
    const center = target ? target.pos : player.pos;
    novaBurst(state, center, effect.radius, effect.damage * power);
    return;
  }
  if (effect.kind === "buff") {
    // Refresh to the stronger buff — a re-cast tops up each mult and the timer
    // rather than stacking (mirrors the shield). The mults reset to 1 when the
    // timer lapses in `stepRegen`.
    player.buffMs = Math.max(player.buffMs, effect.durationMs);
    player.buffDamageMult = Math.max(
      player.buffDamageMult,
      effect.damageMult ?? 1,
    );
    player.buffHasteMult = Math.max(
      player.buffHasteMult,
      effect.hasteMult ?? 1,
    );
    player.buffSpeedMult = Math.max(
      player.buffSpeedMult,
      effect.speedMult ?? 1,
    );
    state.events.push({
      type: "playerBuffed",
      durationMs: effect.durationMs,
    });
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
 * An AOE burst centred at `pos` — flash the `nova` cue and deal `damage`
 * (already power-scaled) to every targetable foe within `radius`. Shared by the
 * hero-centred `nova` (magic/melee) and the ranged `rain` (centred on a distant
 * cluster); both route damage through the shared funnel at "magic" class.
 */
function novaBurst(
  state: GameState,
  pos: { x: number; y: number },
  radius: number,
  damage: number,
): void {
  const reachSq = radius * radius;
  state.events.push({ type: "nova", pos: { ...pos }, radius });
  // One cast = one menace ATTACK: the burst's kills share the id so a nova
  // wiping a ring escalates like one blow (see bankOverkill).
  const attack = state.nextId++;
  for (const enemy of state.enemies) {
    if (!isTargetable(state, enemy)) continue;
    if (distanceSq(enemy.pos, pos) > reachSq) continue;
    hitEnemy(state, enemy, damage, "magic", { attack });
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
  // One cast = one menace ATTACK across every leap (see bankOverkill).
  const attack = state.nextId++;
  for (let leap = 0; ; leap++) {
    state.events.push({ type: "lightning", pos: { ...victim.pos } });
    struck.add(victim.id);
    const at = victim.pos;
    hitEnemy(state, victim, dmg, "magic", { attack });
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

  // A martial self-buff ebbs with its timer; when it lapses the combat mults
  // (damage/haste/speed) snap back to neutral 1.
  if (player.buffMs > 0) {
    player.buffMs = Math.max(0, player.buffMs - dtMs);
    if (player.buffMs === 0) {
      player.buffDamageMult = 1;
      player.buffHasteMult = 1;
      player.buffSpeedMult = 1;
    }
  }

  // The shared global cooldown between casts ebbs each tick.
  if (player.globalCooldownMs > 0) {
    player.globalCooldownMs = Math.max(0, player.globalCooldownMs - dtMs);
  }

  // Per-spell cooldowns tick down.
  for (const id of Object.keys(player.spellCooldowns)) {
    const left = (player.spellCooldowns[id] ?? 0) - dtMs;
    if (left <= 0) delete player.spellCooldowns[id];
    else player.spellCooldowns[id] = left;
  }
}
