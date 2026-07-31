// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ability helpers shared by the step pipeline and the renderer: activating a
// pickup, where orbit orbs sit right now, and how hard a stasis field slows
// a monster. The per-tick behavior itself lives in step/ (stepAbilities)
// so all combat flows through one hitEnemy path.

import { type Vec2 } from "@game/lib/vec.ts";
import { ABILITY, HELD_ITEMS } from "./config/index.ts";
import { abilityDef, type AbilityDef } from "./defs/abilities.ts";
import { effectiveStat } from "./items/index.ts";
import { autoPowerScale } from "./leveling.ts";
import { mobHpLevelFactor } from "./menace.ts";
import { stasisSpellParams } from "./spells.ts";
import type { ActiveAbility, GameState, Player } from "./types/index.ts";

/**
 * Activate an ability on the player. A `stackable` power adds a fresh copy on
 * every activation, so two STORM CELLs strike twice as often and two rings of
 * FIRE ORBS interleave into a denser sweep. A non-stackable power refuses to
 * start a second copy while one is still running (the MAGNET — its pull can't
 * stack), leaving nothing changed. Returns whether a copy actually started, so
 * the caller can keep a refused pickup banked instead of consuming it.
 *
 * `slot` links the copy back to the dock slot it was spent from — that slot
 * keeps the powerup, counting down in place, until the copy lapses (see
 * ActiveAbility.slot). Omit it for a scripted grant with no dock slot.
 */
export function grantAbility(
  state: GameState,
  defId: string,
  slot?: number,
): boolean {
  const def = abilityDef(defId);
  const player = state.players[0];
  const running = player.abilities.filter((a) => a.defId === defId);
  if (running.length > 0 && !def.stackable) return false;
  const ability: ActiveAbility = {
    defId,
    remainingMs: def.durationMs,
    // Phase a stacked orbit half a step off the copies already up so its orbs
    // interleave with the existing ring instead of hiding right behind it.
    angle: def.orbit
      ? ((Math.PI / def.orbit.count) * running.length) % (Math.PI * 2)
      : 0,
    clocks: {},
    slot,
  };
  // The powers that are PLACED rather than worn are pinned to the hero's feet
  // at the moment of the spend: a well's core (roaming or anchored) opens
  // where he stood, and a turret grid bolts its guns to a ring around it.
  if (def.well) ability.pos = { ...player.pos };
  if (def.turret) {
    ability.pos = { ...player.pos };
    ability.nodes = [];
    for (let i = 0; i < def.turret.count; i++) {
      const angle = (i / def.turret.count) * Math.PI * 2 + Math.PI / 4;
      ability.nodes.push({
        pos: {
          x: player.pos.x + Math.cos(angle) * def.turret.radius,
          // The ring is squashed like every other ground circle the game
          // draws, so four guns read as planted around him, not orbiting.
          y: player.pos.y + Math.sin(angle) * def.turret.radius * 0.6,
        },
        // Stagger the openings so the grid rattles instead of volleying.
        cooldownMs: (def.turret.intervalMs / def.turret.count) * i,
      });
    }
  }
  if (def.trail) ability.patches = [];
  // A barrier's pool is sized off the hero's healthbar AT THE SPEND, so a
  // shield picked up early and held keeps growing with him.
  if (def.barrier) ability.pool = def.barrier.poolFrac * player.maxHp;
  player.abilities.push(ability);
  state.events.push({
    type: "abilityStarted",
    defId,
    ...(def.sfx ? { sfx: def.sfx } : {}),
  });
  return true;
}

/**
 * Ms until `block`'s next bite on this running power. A block that has never
 * fired reads 0 — ready — which is what makes a freshly granted power bite on
 * its first tick without every carrier having to seed a clock per block.
 */
export function abilityClock(ability: ActiveAbility, block: string): number {
  return ability.clocks[block] ?? 0;
}

/** Arm `block`'s clock for its next bite. */
export function setAbilityClock(
  ability: ActiveAbility,
  block: string,
  ms: number,
): void {
  ability.clocks[block] = ms;
}

/**
 * Run `block`'s clock down by `dtMs` and return what's left (never below 0).
 * Each effect ticks its OWN clock, so a power carrying several never
 * double-decrements one field the way a single shared clock would.
 */
export function tickAbilityClock(
  ability: ActiveAbility,
  block: string,
  dtMs: number,
): number {
  const left = Math.max(0, abilityClock(ability, block) - dtMs);
  ability.clocks[block] = left;
  return left;
}

/**
 * Whether a pickup of `defId` can bank into the powerup dock right now: there
 * must be room under the carry cap, and a `uniqueHeld` power (the NUKE) is
 * refused while a copy is already docked. The one gate every route into the
 * dock shares — the ground pickup pass (step/) and the merchant stall
 * (buyStock/canBuyStock) — so all of them refuse for the same reasons and a
 * refused pickup stays where it was instead of being consumed.
 */
export function canBankAbility(state: GameState, defId: string): boolean {
  const held = state.players[0].heldAbilities;
  if (held.length >= HELD_ITEMS.cap) return false;
  return !(abilityDef(defId).uniqueHeld && held.includes(defId));
}

/**
 * Pull the dock slot at `index` out of `heldAbilities` and close the row up,
 * keeping every running copy's `slot` link pointed at its powerup as the tail
 * shifts down. Returns the removed def-id (or null when `index` is empty /
 * out of range). The one place `heldAbilities` shrinks — a lapsed power, a
 * spent nuke, or a discard all route through here so the links never drift.
 */
export function removeHeldSlot(state: GameState, index: number): string | null {
  const held = state.players[0].heldAbilities;
  if (index < 0 || index >= held.length) return null;
  const [defId] = held.splice(index, 1);
  for (const ability of state.players[0].abilities) {
    if (ability.slot !== undefined && ability.slot > index) ability.slot -= 1;
  }
  return defId ?? null;
}

/** Whether the dock slot at `index` is holding a power that is running now. */
export function isSlotActive(state: GameState, index: number): boolean {
  return state.players[0].abilities.some((a) => a.slot === index);
}

/**
 * Permanently drop the ability pickup in dock slot `index` — the "drag it out
 * of its slot to make room for new loot" gesture, also reachable in-sim via
 * the `dropItemIndex` input. The rest of the row shifts down so the dock
 * stays packed. Returns the discarded def-id (so the UI can announce/poof
 * it), or null on an empty or out-of-range slot. A slot whose power is
 * RUNNING can be dropped too: the pickup is already spent, so the running
 * copy keeps counting down to its natural end — merely unlinked from the dock
 * (like a scripted grant) — and the slot frees for new loot at once. For a
 * still-banked slot there is no undo and nothing is left on the ground: the
 * powerup is gone for good. Safe to call outside step() (the dock discards
 * while paused-free play continues).
 */
export function discardHeldAbility(
  state: GameState,
  index: number,
): string | null {
  for (const ability of state.players[0].abilities) {
    if (ability.slot === index) ability.slot = undefined;
  }
  return removeHeldSlot(state, index);
}

/**
 * Reorder the powerup dock: pull the slot at `from` out and re-insert it at
 * `to` (both indices into `heldAbilities`), shifting the row between them.
 * Running copies keep their `slot` links pointed at their own powerup as the
 * row shuffles, so a running slot travels with its countdown intact. Returns
 * whether anything moved (false on out-of-range or same-slot no-ops). The
 * in-sim route is the `moveItem` input; the dock UI's drag-to-reorder lands
 * here too.
 */
export function moveHeldSlot(
  state: GameState,
  from: number,
  to: number,
): boolean {
  const held = state.players[0].heldAbilities;
  if (from === to) return false;
  if (from < 0 || from >= held.length || to < 0 || to >= held.length) {
    return false;
  }
  const [defId] = held.splice(from, 1);
  held.splice(to, 0, defId!);
  for (const ability of state.players[0].abilities) {
    const s = ability.slot;
    if (s === undefined) continue;
    if (s === from) ability.slot = to;
    else if (from < s && s <= to) ability.slot = s - 1;
    else if (to <= s && s < from) ability.slot = s + 1;
  }
  return true;
}

/**
 * The damage multiplier every conjured ability blow carries (config
 * `ABILITY`): the catalog numbers are authored at level 1, and this scale is
 * EXACTLY the minion healthbar's growth — `mobHpLevelFactor(L) ×
 * autoPowerScale(L)`, the same geometric curve `mobHpScaleFor` bakes into every
 * spawn at the neutral offset — times an INTELLIGENCE deepening. So a
 * FIRE ORB that clipped a third of a level-1 bar still clips a third of a
 * level-50 bar, INT makes it bite deeper, and the difficulty offset is the
 * only thing that moves the fraction. Scale = 1 at level 1 and zero INT:
 * the authored numbers ARE the opening experience. Applied at the two
 * `hitEnemy` sites in stepAbilities (orbit ticks, storm bolts); the NUKE
 * (binary minion wipe) and the MAGNET (no damage) have nothing to scale.
 * (`LEVELING.maxLevel` never matters here — mob bars use the same L.)
 */
export function abilityPowerScale(state: GameState): number {
  const level = Math.max(1, state.players[0].level);
  return (
    mobHpLevelFactor(level) *
    autoPowerScale(level) *
    (1 + effectiveStat(state, "intelligence") * ABILITY.intDamagePerPoint)
  );
}

/**
 * Whether the hero is SPECTRAL right now (a running `phase` power — the PALE
 * SHROUD). While he is, nothing lands on him: the contact loop skips its blow,
 * a hostile shot passes clean through, and `absorbPlayerDamage` zeroes anything
 * that reaches it anyway. Read at every player-damage site rather than stamped
 * onto the player, so it can never outlive the power that granted it.
 */
export function isPhased(state: GameState): boolean {
  return state.players[0].abilities.some((a) => abilityDef(a.defId).phase);
}

/**
 * The walk-speed multiplier the hero's running powers grant (the PALE SHROUD's
 * untethered drift) — 1 when none is up. Multiplies with the talent/gear speed
 * factors at the one `playerSpeed` read.
 */
export function abilitySpeedMult(state: GameState): number {
  let mult = 1;
  for (const ability of state.players[0].abilities) {
    const phase = abilityDef(ability.defId).phase;
    if (phase) mult *= phase.speedMult;
  }
  return mult;
}

/**
 * The multipliers a running `surge` power (REACTOR SURGE) puts on the hero's
 * own weapon — `{ damage, cooldown }`, both 1 when none is up. Read by
 * `weaponDamageFor` / `weaponCooldownFor`, the two sources of truth for the
 * hero's output, so the fight and every readout move together while it burns.
 * Copies MULTIPLY, but the kind is non-stackable so at most one can be up.
 */
export function abilitySurge(state: GameState): {
  damage: number;
  cooldown: number;
} {
  let damage = 1;
  let cooldown = 1;
  for (const ability of state.players[0].abilities) {
    const surge = abilityDef(ability.defId).surge;
    if (!surge) continue;
    damage *= surge.damageMult;
    cooldown *= surge.cooldownMult;
  }
  return { damage, cooldown };
}

/**
 * Feed an incoming blow to the hero's running BARRIER shells (BLAST SHIELD),
 * newest first, and return what still gets through. A shell drained to nothing
 * SHATTERS: its pool is a budget, not a timer, so the power ends on the spot
 * (`remainingMs = 0`, swept up by the ability tick like any lapsed power) and a
 * `barrierBroke` cue fires. Called from `absorbPlayerDamage`, the one choke
 * point every player-damage path funnels through.
 */
export function absorbWithBarriers(state: GameState, damage: number): number {
  if (damage <= 0) return damage;
  const player = state.players[0];
  for (let i = player.abilities.length - 1; i >= 0; i--) {
    const ability = player.abilities[i] as ActiveAbility;
    if (ability.pool === undefined || ability.pool <= 0) continue;
    if (!abilityDef(ability.defId).barrier) continue;
    const eaten = Math.min(ability.pool, damage);
    ability.pool -= eaten;
    damage -= eaten;
    state.events.push({
      type: "barrierAbsorbed",
      absorbed: eaten,
      remaining: ability.pool,
    });
    if (ability.pool <= 0) {
      ability.remainingMs = 0;
      state.events.push({
        type: "barrierBroke",
        pos: { ...player.pos },
        defId: ability.defId,
        ...(abilityDef(ability.defId).sfx
          ? { sfx: abilityDef(ability.defId).sfx }
          : {}),
      });
    }
    if (damage <= 0) return 0;
  }
  return damage;
}

/**
 * Clip a blow that would kill while a WARD holds (CONTINUITY PROTOCOL): the
 * hero is left standing on the ward's `floor` hp and a `wardHeld` cue fires.
 * Returns the damage actually allowed through. A ward buys a window, not a
 * life — it keeps clipping for as long as it runs, and the moment it lapses
 * the next blow kills like any other.
 */
export function clipLethalDamage(state: GameState, damage: number): number {
  const player = state.players[0];
  if (damage < player.hp) return damage;
  let floor: number | null = null;
  // The DEEPEST ward answers, and the cue is drawn in ITS colours — whichever
  // power actually did the saving is the one the player should see.
  let defId = "";
  for (const ability of player.abilities) {
    const ward = abilityDef(ability.defId).ward;
    if (!ward) continue;
    if (floor === null || ward.floor > floor) defId = ability.defId;
    floor = Math.max(floor ?? 0, ward.floor);
  }
  if (floor === null) return damage;
  const allowed = Math.max(0, player.hp - floor);
  state.events.push({
    type: "wardHeld",
    pos: { ...player.pos },
    floor,
    defId,
    ...(defId && abilityDef(defId).sfx ? { sfx: abilityDef(defId).sfx } : {}),
  });
  return allowed;
}

/**
 * A stasis field's effective radius for this player: the def's base widened
 * by INTELLIGENCE (`ABILITY.stasisRadiusPerInt`), mirroring the magnet. The
 * slow factor itself never scales — a stronger slow would trivialize kiting.
 */
export function stasisRadius(state: GameState, def: AbilityDef): number {
  if (!def.stasis) return 0;
  return (
    def.stasis.radius +
    effectiveStat(state, "intelligence") * ABILITY.stasisRadiusPerInt
  );
}

/** World positions of an orbit ability's orbs, spread evenly on the ring. */
/**
 * Where a ring of `count` orbs sits right now.
 *
 * Shared by the damage tick and the renderer, and by BOTH carriers — a
 * conjured ring and a picked-up one are the same circle, so they had better
 * not each have their own idea of where its orbs are.
 */
export function orbRingPositions(
  player: Player,
  angle: number,
  count: number,
  radius: number,
): Vec2[] {
  const positions: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const a = angle + (i * Math.PI * 2) / count;
    positions.push({
      x: player.pos.x + Math.cos(a) * radius,
      y: player.pos.y + Math.sin(a) * radius,
    });
  }
  return positions;
}

export function orbPositions(player: Player, ability: ActiveAbility): Vec2[] {
  const orbit = abilityDef(ability.defId).orbit;
  if (!orbit) return [];
  return orbRingPositions(player, ability.angle, orbit.count, orbit.radius);
}

/**
 * A magnet ability's effective pull radius for this player: the def's base
 * widened by INTELLIGENCE. Shared by the item-pull step and the renderer's
 * field ring.
 */
export function magnetRadius(state: GameState, def: AbilityDef): number {
  if (!def.magnet) return 0;
  return (
    def.magnet.radius +
    effectiveStat(state, "intelligence") * def.magnet.radiusPerInt
  );
}

/**
 * The combined slow multiplier stasis fields apply to a monster at `pos`
 * (1 = unaffected). Fields don't stack below the strongest one. The reach
 * is the INT-widened `stasisRadius`, so a scholarly build casts a broader
 * field; the slow itself stays the authored factor.
 */
export function stasisFactorAt(state: GameState, pos: Vec2): number {
  return stasisFactorFrom(activeStasisFields(state), state.players[0].pos, pos);
}

/** One live stasis field, resolved for this player: its INT-widened reach
 * (squared, for the per-mob test) and its slow factor. */
export type StasisField = { radiusSq: number; slowFactor: number };

// The overwhelmingly common loadout runs no stasis at all — share one frozen
// empty list so the per-tick build allocates nothing then.
const NO_STASIS: readonly StasisField[] = Object.freeze([]);

/**
 * Every stasis field the player is projecting right now — the pickup copies
 * and the granted `spell` affixes, with their INT-widened radii resolved once.
 * The horde tick builds this ONCE per tick and tests every mob against it via
 * `stasisFactorFrom`; the old per-mob `stasisFactorAt` walk re-derived the
 * radii (a full gear walk each) for every enemy every tick.
 */
export function activeStasisFields(state: GameState): readonly StasisField[] {
  const player = state.players[0];
  let fields: StasisField[] | null = null;
  for (const ability of player.abilities) {
    const def = abilityDef(ability.defId);
    if (!def.stasis) continue;
    const radius = stasisRadius(state, def);
    (fields ??= []).push({
      radiusSq: radius * radius,
      slowFactor: def.stasis.slowFactor,
    });
  }
  for (const spell of player.itemSpells) {
    if (spell.spell !== "stasis") continue;
    const params = stasisSpellParams(state, spell.rank);
    (fields ??= []).push({
      radiusSq: params.radius * params.radius,
      slowFactor: params.slowFactor,
    });
  }
  return fields ?? NO_STASIS;
}

/** The combined stasis slow at `pos` given the pre-resolved `fields` (see
 * `activeStasisFields`) — fields don't stack below the strongest one. */
export function stasisFactorFrom(
  fields: readonly StasisField[],
  playerPos: Vec2,
  pos: Vec2,
): number {
  let factor = 1;
  if (fields.length === 0) return factor;
  const dx = pos.x - playerPos.x;
  const dy = pos.y - playerPos.y;
  const dSq = dx * dx + dy * dy;
  for (const field of fields) {
    if (dSq <= field.radiusSq) {
      factor = Math.min(factor, field.slowFactor);
    }
  }
  return factor;
}
