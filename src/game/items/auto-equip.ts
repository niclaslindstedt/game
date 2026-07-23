// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Auto-equip and the junk sweep: the on-pickup toggle, the is-it-better
// ranking (flat and spec-weighted), the UPGRADE marker read, the bulk-scrap
// cull, and the optimize-everything sweep.

import { gearDef, isWeaponDef, STAT_NAMES } from "../defs/equipment.ts";
import { gateKeyIds } from "../defs/levels/index.ts";
import type {
  Equipment,
  EquipSlot,
  GameState,
  StatName,
} from "../types/index.ts";
import { ARMOR_SLOTS } from "./class-stats.ts";
import { isPassiveItem } from "./derived.ts";
import { equipFromInventory } from "./inventory.ts";
import { baseDefId, canEquip } from "./requirements.ts";
import { gearScore, remainingDurability, weaponScore } from "./weapon-math.ts";

// Player setting (pwa settings `autoEquip`, applied via the
// `setAutoEquipEnabled` setter): whether a picked-up piece that out-scores the
// worn one is EQUIPPED ON THE SPOT (on) or banked to the bag for the player to
// equip by hand (off). It gates the pickup path in step.ts only — the manual
// AUTO-EQUIP sweep (autoEquipBest), the on-break weapon swap (a broken weapon
// still needs a replacement), and the pure ranking predicates below are all
// unaffected, so a player who turns auto-equip off keeps every manual escape
// hatch. The engine default is on (the standalone/test baseline when no app
// configures it); the shipped app applies the persisted choice on load. Tests
// that toggle it must restore it.
let autoEquipOnPickup = true;

/** Toggle whether picked-up upgrades are worn on the spot (a player setting).
 * Off banks them to the bag instead; the manual AUTO-EQUIP button and the
 * on-break weapon swap still work. */
export function setAutoEquipEnabled(enabled: boolean): void {
  autoEquipOnPickup = enabled;
}

/** Whether the on-pickup auto-equip is active (see `setAutoEquipEnabled`). The
 * pickup path in step.ts reads this to decide equip-on-spot vs bag-it. */
export function isAutoEquipEnabled(): boolean {
  return autoEquipOnPickup;
}

/** Is `candidate` strictly better than the piece occupying its slot? */
export function isBetterEquipment(
  state: GameState,
  candidate: Equipment,
): boolean {
  // An under-leveled OR under-statted find is never worn, however strong — it
  // banks until the hero grows the level and the attribute to wield it.
  if (!canEquip(state, candidate)) return false;
  if (candidate.slot === "weapon") {
    const current = state.player.equipment.weapon;
    // No starter special case anymore: weaponScore speaks the damage-budget
    // model (AoE targets + crit weight folded in), so the wall weapon holds
    // its slot until a find genuinely out-scores it — a budget-normalized
    // cone cleaver is a DOWNGRADE in a sparse field, and force-equipping it
    // (the old "pickup floor" rule) collapsed early runs. The starter still
    // leaves the story soon enough: it wears out.
    const candidateScore = weaponScore(state, candidate);
    const currentScore = weaponScore(state, current);
    if (candidateScore !== currentScore) return candidateScore > currentScore;
    // Equal firepower: picking up the same weapon you already wield is worth
    // swapping to when the fresh copy has more durability left — it refreshes
    // the durability bar. The worn copy heads to the bag, or drops to the
    // ground when the bag is full (like dropping it to grab the new one).
    if (baseDefId(candidate) === baseDefId(current)) {
      return remainingDurability(candidate) > remainingDurability(current);
    }
    return false;
  }
  // A passive trinket pays out from the bag, so it is never auto-equipped —
  // it heads for a bag cell like ordinary loot, leaving the charm slot free
  // for a piece that actually wants wearing.
  if (isPassiveItem(candidate.defId)) return false;
  const current = state.player.equipment[candidate.slot];
  return current === null || gearScore(candidate) > gearScore(current);
}

/**
 * How much the hero's SPEC values a point of `stat`, as a multiplier around 1:
 * the stat's share of the hero's ALLOCATED (base) stats against an even share.
 * A stat he has poured points into scores above 1 (it matters to his build); an
 * off-spec stat he left at the floor scores below 1. So a +INTELLECT roll is
 * worth more to a caster than a +STRENGTH one, and vice-versa — the item card's
 * "is this an upgrade FOR MY SPEC?" read. Reads `player.stats` (the pure
 * allocation, gear excluded — the same source `committedLane` reads the spec
 * from), so worn gear can't feed back into what counts as an upgrade. An
 * un-invested hero (flat stats) weights every stat at ~1, i.e. the old
 * stat-agnostic behaviour.
 */
function specStatWeight(state: GameState, stat: StatName): number {
  const stats = state.player.stats;
  let total = 0;
  for (const s of STAT_NAMES) total += stats[s];
  if (total <= 0) return 1;
  const evenShare = total / STAT_NAMES.length;
  return stats[stat] / evenShare;
}

/**
 * A gear piece's worth, spec-weighted: `gearScore` with each +STAT / +STAT%
 * roll scaled by how much the hero's build values that stat (`specStatWeight`).
 * Every other affix (armor, HP, crit, procs, …) helps any build the same, so
 * it keeps its flat `gearScore` worth. Used only by the pickup-card / inventory
 * upgrade read — NOT by the auto-equip rule (`isBetterEquipment`/`gearScore`),
 * which stays stat-agnostic so the balance sims read one stable ranking.
 */
function specGearScore(state: GameState, gear: Equipment): number {
  let score = gearScore(gear);
  for (const affix of gear.affixes) {
    // gearScore counted these at their flat worth; re-weight only the stat
    // portion by the hero's spec (a bonus of value×15, a %-bonus of value×600).
    if (affix.kind === "stat") {
      score += affix.value * 15 * (specStatWeight(state, affix.stat) - 1);
    } else if (affix.kind === "statPct") {
      score += affix.value * 600 * (specStatWeight(state, affix.stat) - 1);
    }
  }
  return score;
}

/**
 * Would wearing `candidate` improve its slot over what's equipped right now,
 * FOR THIS HERO'S SPEC? A purely informational cousin of `isBetterEquipment`
 * for the pickup card's "UPGRADE" marker and the inventory glow: it drops the
 * auto-equip rule's exclusions (passive charms, the equal-firepower durability
 * tiebreak) so a stronger passive still reads as an upgrade, keeps the level
 * gate — a piece the hero can't wear yet is not an upgrade he can act on — and
 * ranks gear by the spec-aware `specGearScore` (weapons already rank by the
 * spec-aware `weaponScore`), so an off-spec find no longer flashes UPGRADE.
 * Never mutates state.
 */
export function wouldUpgradeSlot(
  state: GameState,
  candidate: Equipment,
): boolean {
  if (!canEquip(state, candidate)) return false;
  if (candidate.slot === "weapon") {
    return (
      weaponScore(state, candidate) >
      weaponScore(state, state.player.equipment.weapon)
    );
  }
  const current = state.player.equipment[candidate.slot];
  return (
    current === null ||
    specGearScore(state, candidate) > specGearScore(state, current)
  );
}

/**
 * Would an equipment drop find a home the instant it reached the hero — worn
 * on the spot as a genuine upgrade, or slotted into a free bag cell? A
 * side-effect-free mirror of the equipment branch of `stepItems`' pickup, so
 * the item magnet can leave gear it couldn't keep where it lies instead of
 * dragging it uselessly to the hero's feet on a full bag.
 */
export function canCollectEquipment(
  state: GameState,
  item: Equipment,
): boolean {
  if (isAutoEquipEnabled() && isBetterEquipment(state, item)) return true;
  return state.player.inventory.indexOf(null) !== -1;
}

// ---- Bulk scrap (the "clear out junk" sweep) -----------------------------------

/**
 * A "special" bag piece the bulk-scrap sweep always spares, whatever the raw
 * numbers say: a passive trinket (it pays its bonus just by riding in the bag,
 * so a plain stat comparison misses its worth), a top-tier find (a SET green,
 * a unique or a legendary — the hand-authored drops, kept as trophies, for
 * their fat affix rolls, and because a set piece is worth banking until its
 * siblings turn up), or a travel-gate key (a zero-stat trinket whose worth is
 * the door it opens — see LevelDef.gates). Everything else is ordinary loot the
 * sweep may cull.
 */
export function isSpecialItem(item: Equipment): boolean {
  if (
    item.tier === "set" ||
    item.tier === "unique" ||
    item.tier === "legendary"
  )
    return true;
  if (gateKeyIds().includes(item.defId)) return true;
  if (isWeaponDef(item.defId)) return false;
  const def = gearDef(item.defId);
  return def.passive !== undefined;
}

/**
 * Is this bag piece at least as good as whatever is worn in its slot? Weapons
 * rank by `weaponScore` (the auto-equip model — damage-budget AoE and crit
 * folded in), gear by `gearScore`; an empty gear slot has nothing to beat, so
 * any piece bound for it counts as worth keeping. Equal worth is kept too — a
 * side-grade or a spare of the same weapon (a durability refresh) is not "worse
 * than equipped".
 */
function isAtLeastAsGoodAsEquipped(state: GameState, item: Equipment): boolean {
  if (item.slot === "weapon") {
    return (
      weaponScore(state, item) >=
      weaponScore(state, state.player.equipment.weapon)
    );
  }
  const current = state.player.equipment[item.slot];
  if (!current) return true;
  return gearScore(item) >= gearScore(current);
}

/**
 * True when the bulk-scrap sweep would destroy this bag piece: it is neither
 * special (see `isSpecialItem`) nor as good as what's already worn in its slot
 * (see `isAtLeastAsGoodAsEquipped`) — the loot the hero has outgrown. The UI
 * reads this to count the cull and enable the SCRAP button.
 */
export function isScrappableLoot(state: GameState, item: Equipment): boolean {
  return !isSpecialItem(item) && !isAtLeastAsGoodAsEquipped(state, item);
}

/**
 * The SCRAP-JUNK sweep: permanently destroy every bag piece the hero has
 * outgrown — loot that is neither special nor at least as good as what's worn
 * in its slot (see `isScrappableLoot`). Keepers stay: upgrades, side-grades,
 * trinkets, trophies, and anything bound for an empty slot. Returns the culled
 * pieces (empty when nothing was junk) so the UI can announce the count; there
 * is no undo, exactly like a single `discardFromInventory`.
 */
export function scrapInferiorLoot(state: GameState): Equipment[] {
  const inv = state.player.inventory;
  const scrapped: Equipment[] = [];
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (!item || !isScrappableLoot(state, item)) continue;
    inv[i] = null;
    scrapped.push(item);
  }
  return scrapped;
}

// ---- Auto-equip everything (the "optimize my gear" sweep) ----------------------

/** The wearable slots the auto-equip sweep fills, in paperdoll order after the
 * weapon: the four armor slots plus the charm and bag. */
const GEAR_SLOTS: readonly Exclude<EquipSlot, "weapon">[] = [
  ...ARMOR_SLOTS,
  "charm",
  "bag",
];

/**
 * Plan the auto-equip sweep without mutating: the bag cell indices to equip so
 * every slot ends up holding its best wearable piece. The weapon is decided
 * first, on the build the hero plays right now (allocated STATS drive the melee
 * vs magic choice through `weaponScore` — a STRENGTH hero lands a heavier melee
 * blow, an INTELLIGENCE hero a stronger spell), then each gear slot takes the
 * highest `gearScore` find that beats what's worn. Under-leveled banked finds,
 * broken weapons, and passive trinkets (they pay out from the bag, so the charm
 * slot is left free) are skipped — the same rule the pickup auto-equip follows.
 * Every returned index points at a distinct piece in a distinct slot, so the
 * cells stay valid as they are equipped one after another.
 */
function planAutoEquip(state: GameState): number[] {
  const player = state.player;
  const inv = player.inventory;
  const plan: number[] = [];

  // Weapon: the bag weapon that most out-scores what's held for this build.
  let bestWeapon = -1;
  let bestWeaponScore = weaponScore(state, player.equipment.weapon);
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (!item || item.slot !== "weapon") continue;
    if (item.durability !== undefined && item.durability <= 0) continue;
    if (!canEquip(state, item)) continue;
    const score = weaponScore(state, item);
    if (score > bestWeaponScore) {
      bestWeaponScore = score;
      bestWeapon = i;
    }
  }
  if (bestWeapon >= 0) plan.push(bestWeapon);

  // Gear: the highest-worth wearable find for each body/charm/bag slot,
  // provided it beats what that slot wears now (an empty slot takes anything).
  for (const slot of GEAR_SLOTS) {
    const current = player.equipment[slot];
    let bestGear = -1;
    let bestGearScore = current ? gearScore(current) : -Infinity;
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item || item.slot !== slot) continue;
      if (!canEquip(state, item)) continue;
      // A passive trinket earns its bonus just by riding in the bag, so it is
      // never worn — the charm slot stays open for an active piece.
      if (isPassiveItem(item.defId)) continue;
      const score = gearScore(item);
      if (score > bestGearScore) {
        bestGearScore = score;
        bestGear = i;
      }
    }
    if (bestGear >= 0) plan.push(bestGear);
  }

  return plan;
}

/**
 * The AUTO-EQUIP sweep: wear the best piece the bag can offer in every slot at
 * once. Weapons rank by the build-aware `weaponScore` (so the hero's stats pick
 * melee, ranged, or magic for them), gear by `gearScore` (armor, HP, crit, and
 * stat affixes — the health/armor the sweep maximizes). Each displaced piece
 * swaps back into the bag via `equipFromInventory`, so nothing is destroyed.
 * Returns how many slots actually changed, so the UI can stay quiet when the
 * loadout was already optimal.
 */
export function autoEquipBest(state: GameState): number {
  let changed = 0;
  for (const index of planAutoEquip(state)) {
    if (equipFromInventory(state, index)) changed++;
  }
  return changed;
}

/**
 * How many slots the auto-equip sweep would improve right now, without touching
 * a thing — the count the inventory reads to label the button and disable it on
 * an already-optimal loadout. Mirrors `autoEquipBest` exactly (it plans the same
 * swaps), so the badge never promises a change the sweep won't make.
 */
export function autoEquipUpgradeCount(state: GameState): number {
  return planAutoEquip(state).length;
}
