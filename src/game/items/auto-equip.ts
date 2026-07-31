// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Auto-equip and the junk sweep: the on-pickup toggle, the is-it-better
// ranking (flat and spec-weighted), the UPGRADE marker read, the bulk-scrap
// cull, and the optimize-everything sweep.

import {
  gearDef,
  isWeaponDef,
  STAT_NAMES,
  tierRank,
} from "../defs/equipment.ts";
import { gateKeyIds } from "../defs/levels/index.ts";
import type {
  EquipSlot,
  Equipment,
  GameState,
  Player,
  StatName,
} from "../types/index.ts";
import { ARMOR_SLOTS } from "./class-stats.ts";
import { isPassiveItem } from "./derived.ts";
import { isTwoHandedWeapon } from "./hands.ts";
import { fitsEquipSlot, isOffhandItem, RING_SLOTS } from "./slots.ts";
import { equipFromInventory, wearSlotFor } from "./inventory.ts";
import { baseDefId, canEquip } from "./requirements.ts";
import { gearScore, remainingDurability, weaponScore } from "./weapon-math.ts";

// The on-pickup AUTO-EQUIP toggle lives in the engine's leaf `flags.ts` so the
// settings screen can apply it at startup without importing this module (and
// the pickup/ranking model behind it); re-exported here because every existing
// caller reads it off this module.
import { isAutoEquipEnabled } from "../flags.ts";
export { isAutoEquipEnabled, setAutoEquipEnabled } from "../flags.ts";

/** Is `candidate` strictly better than the piece occupying its slot? */
export function isBetterEquipment(
  state: GameState,
  player: Player,
  candidate: Equipment,
): boolean {
  // An under-leveled OR under-statted find is never worn, however strong — it
  // banks until the hero grows the level and the attribute to wield it.
  if (!canEquip(state, player, candidate)) return false;
  if (candidate.slot === "weapon") {
    const current = player.equipment.weapon;
    // No starter special case anymore: weaponScore speaks the damage-budget
    // model (AoE targets + crit weight folded in), so the wall weapon holds
    // its slot until a find genuinely out-scores it — a budget-normalized
    // cone cleaver is a DOWNGRADE in a sparse field, and force-equipping it
    // (the old "pickup floor" rule) collapsed early runs. The starter still
    // leaves the story soon enough: it wears out.
    const candidateScore = weaponScore(state, player, candidate);
    const currentScore = weaponScore(state, player, current);
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
  // A TRINKET (and any passive piece) pays out from the bag, so it is never
  // auto-equipped — it heads for a bag cell like ordinary loot.
  if (isPassiveItem(candidate.defId)) return false;
  // THE HAND'S CHOICE STANDS. A shield or bag picked up while a TWO-HANDED
  // weapon is held would silently put that weapon in the bag — and the next
  // two-hander off the floor would put the shield back, so the hero would
  // ping-pong between builds on whatever the horde happened to drop. The two
  // are not comparable on one scale (armor points against damage per second),
  // so this refuses to guess: the second arm is filled by hand while a
  // two-hander is drawn.
  if (
    isOffhandItem(candidate.slot) &&
    isTwoHandedWeapon(player.equipment.weapon)
  )
    return false;
  const current = wornRival(state, player, candidate);
  if (current === undefined) return false;
  return current === null || gearScore(candidate) > gearScore(current);
}

/**
 * The piece `candidate` would DISPLACE if it were worn right now: whatever
 * occupies the slot it lands in, or null when that slot is empty. For a RING
 * that is the weaker of the two worn rings (see `ringSlotFor`), so a find is
 * judged against the ring it would actually replace rather than always
 * against `ring1`. Returns `undefined` for a piece that is never worn at all
 * (a trinket), which every caller treats as "not an upgrade".
 */
function wornRival(
  state: GameState,
  player: Player,
  candidate: Equipment,
): Equipment | null | undefined {
  const slot = wearSlotFor(state, player, candidate);
  if (!slot) return undefined;
  return player.equipment[slot];
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
function specStatWeight(
  state: GameState,
  player: Player,
  stat: StatName,
): number {
  const stats = player.stats;
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
function specGearScore(
  state: GameState,
  player: Player,
  gear: Equipment,
): number {
  let score = gearScore(gear);
  for (const affix of gear.affixes) {
    // gearScore counted these at their flat worth; re-weight only the stat
    // portion by the hero's spec (a bonus of value×15, a %-bonus of value×600).
    if (affix.kind === "stat") {
      score +=
        affix.value * 15 * (specStatWeight(state, player, affix.stat) - 1);
    } else if (affix.kind === "statPct") {
      score +=
        affix.value * 600 * (specStatWeight(state, player, affix.stat) - 1);
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
  player: Player,
  candidate: Equipment,
): boolean {
  if (!canEquip(state, player, candidate)) return false;
  if (candidate.slot === "weapon") {
    return (
      weaponScore(state, player, candidate) >
      weaponScore(state, player, player.equipment.weapon)
    );
  }
  const current = wornRival(state, player, candidate);
  // A trinket is never worn, but a stronger one still READS as an upgrade —
  // the marker drops the auto-equip exclusions on purpose. With no slot to
  // compare against, judge it against nothing: it is always worth keeping.
  if (current === undefined) return true;
  return (
    current === null ||
    specGearScore(state, player, candidate) >
      specGearScore(state, player, current)
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
  player: Player,
  item: Equipment,
): boolean {
  if (isAutoEquipEnabled() && isBetterEquipment(state, player, item))
    return true;
  return player.inventory.indexOf(null) !== -1;
}

// ---- Bulk scrap (the "clear out junk" sweep) -----------------------------------

/**
 * A "special" bag piece the bulk-scrap sweep always spares, whatever the raw
 * numbers say: a passive trinket (it pays its bonus just by riding in the bag,
 * so a plain stat comparison misses its worth), a top-tier find (a SET green
 * and everything above it — the hand-authored drops, kept as trophies, for
 * their fat affix rolls, and because a set piece is worth banking until its
 * siblings turn up), a travel-gate key (a zero-stat trinket whose worth is
 * the door it opens — see LevelDef.gates), or a REVIVE item (a zero-stat
 * trinket the player PAID for, and the only thing in the game that puts a
 * downed companion back on its feet — see `GearDef.revive`). Everything else is
 * ordinary loot the sweep may cull.
 */
export function isSpecialItem(item: Equipment): boolean {
  // Everything from SET up — the authored chase tiers. Keyed off the ladder
  // rather than a hand-listed set, which is what let ARTIFACT (added above
  // legendary later) fall through and be scrapped as ordinary loot.
  if (tierRank(item.tier) >= tierRank("set")) return true;
  if (gateKeyIds().includes(item.defId)) return true;
  if (isWeaponDef(item.defId)) return false;
  const def = gearDef(item.defId);
  // Both of the zero-stat "the worth is what it DOES" trinkets read the same
  // way here: a stat comparison prices them at nothing, so the sweep would sell
  // the bottle of salts the hero bought two rooms ago for exactly this.
  if (def.revive) return true;
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
function isAtLeastAsGoodAsEquipped(
  state: GameState,
  player: Player,
  item: Equipment,
): boolean {
  if (item.slot === "weapon") {
    return (
      weaponScore(state, player, item) >=
      weaponScore(state, player, player.equipment.weapon)
    );
  }
  const current = wornRival(state, player, item);
  // A TRINKET has no worn rival to be outgrown by — it works from the bag, so
  // it is always a keeper and the scrap sweep never touches it.
  if (current === undefined || current === null) return true;
  return gearScore(item) >= gearScore(current);
}

/**
 * True when the bulk-scrap sweep would destroy this bag piece: it is neither
 * special (see `isSpecialItem`) nor as good as what's already worn in its slot
 * (see `isAtLeastAsGoodAsEquipped`) — the loot the hero has outgrown. The UI
 * reads this to count the cull and enable the SCRAP button.
 */
export function isScrappableLoot(
  state: GameState,
  player: Player,
  item: Equipment,
): boolean {
  return (
    !isSpecialItem(item) && !isAtLeastAsGoodAsEquipped(state, player, item)
  );
}

/**
 * The SCRAP-JUNK sweep: permanently destroy every bag piece the hero has
 * outgrown — loot that is neither special nor at least as good as what's worn
 * in its slot (see `isScrappableLoot`). Keepers stay: upgrades, side-grades,
 * trinkets, trophies, and anything bound for an empty slot. Returns the culled
 * pieces (empty when nothing was junk) so the UI can announce the count; there
 * is no undo, exactly like a single `discardFromInventory`.
 */
export function scrapInferiorLoot(
  state: GameState,
  player: Player,
): Equipment[] {
  const inv = player.inventory;
  const scrapped: Equipment[] = [];
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (!item || !isScrappableLoot(state, player, item)) continue;
    inv[i] = null;
    scrapped.push(item);
  }
  return scrapped;
}

// ---- Auto-equip everything (the "optimize my gear" sweep) ----------------------

/** The wearable slots the auto-equip sweep fills, in paperdoll order after the
 * weapon: the four armor slots, the neck and fingers, and the second arm. */
const GEAR_SLOTS: readonly Exclude<EquipSlot, "weapon">[] = [
  ...ARMOR_SLOTS,
  "amulet",
  ...RING_SLOTS,
  "offhand",
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
 *
 * `opts.weapon: false` plans the GEAR SLOTS ONLY, leaving the hand exactly as
 * it is — what the autopilot's own sweep asks for, because its POCKET ARSENAL
 * (bot/economy.ts `stepBotWeaponSwap`) already owns the hand and deliberately
 * holds a banked shot while the stronger blade rides the bag. A sweep that
 * re-drew the blade every tick would just flap against it.
 */
function planAutoEquip(
  state: GameState,
  player: Player,
  opts: { weapon?: boolean } = {},
): number[] {
  const inv = player.inventory;
  const plan: number[] = [];
  let twoHandedPlanned: boolean;

  // Weapon: the bag weapon that most out-scores what's held for this build.
  if (opts.weapon !== false) {
    let bestWeapon = -1;
    let bestWeaponScore = weaponScore(state, player, player.equipment.weapon);
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item || item.slot !== "weapon") continue;
      if (item.durability !== undefined && item.durability <= 0) continue;
      if (!canEquip(state, player, item)) continue;
      const score = weaponScore(state, player, item);
      if (score > bestWeaponScore) {
        bestWeaponScore = score;
        bestWeapon = i;
      }
    }
    if (bestWeapon >= 0) plan.push(bestWeapon);
    // Which weapon the sweep will END on — the planned one, else what is held.
    // A TWO-HANDED answer claims the second arm, so the offhand is not planned
    // at all below: `freeHandsFor` would only bank whatever the sweep put there
    // one line earlier. The hand is decided FIRST and wins, deliberately —
    // `weaponScore` already prices a two-hander's damage premium, and there is
    // no honest exchange rate between that and a shield's armor.
    twoHandedPlanned = isTwoHandedWeapon(
      bestWeapon >= 0
        ? (inv[bestWeapon] as Equipment)
        : player.equipment.weapon,
    );
  } else {
    twoHandedPlanned = isTwoHandedWeapon(player.equipment.weapon);
  }

  // Gear: the highest-worth wearable find for each body/amulet/ring/bag slot,
  // provided it beats what that slot wears now (an empty slot takes anything).
  // The two RING fingers both draw from the one `ring` item kind, so a cell
  // already claimed by an earlier slot is struck out — otherwise the same
  // strong ring would be planned onto both fingers.
  const claimed = new Set<number>();
  for (const slot of GEAR_SLOTS) {
    if (slot === "offhand" && twoHandedPlanned) continue;
    const current = player.equipment[slot];
    let bestGear = -1;
    let bestGearScore = current ? gearScore(current) : -Infinity;
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item || claimed.has(i)) continue;
      if (!fitsEquipSlot(item.slot, slot)) continue;
      if (!canEquip(state, player, item)) continue;
      // A passive trinket earns its bonus just by riding in the bag, so it is
      // never worn — no slot is spent on it.
      if (isPassiveItem(item.defId)) continue;
      const score = gearScore(item);
      if (score > bestGearScore) {
        bestGearScore = score;
        bestGear = i;
      }
    }
    if (bestGear >= 0) {
      plan.push(bestGear);
      claimed.add(bestGear);
    }
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
export function autoEquipBest(state: GameState, player: Player): number {
  let changed = 0;
  for (const index of planAutoEquip(state, player)) {
    if (equipFromInventory(state, player, index)) changed++;
  }
  return changed;
}

/**
 * The auto-equip sweep MINUS the hand: wear the best banked piece in every
 * ARMOR / charm / bag slot, leaving whatever the hero is holding alone. The
 * autopilot's sweep (bot/economy.ts `botAutoEquip`) — its pocket arsenal owns
 * the weapon slot, swapping the hand between the blade and a banked shot by
 * the moment, so a sweep that also re-drew the strongest weapon every tick
 * would fight it. Returns how many slots changed, like `autoEquipBest`.
 */
export function autoEquipGear(state: GameState, player: Player): number {
  let changed = 0;
  for (const index of planAutoEquipGear(state, player)) {
    if (equipFromInventory(state, player, index)) changed++;
  }
  return changed;
}

/**
 * The cells {@link autoEquipGear} would wear, without touching a thing — the
 * autopilot's own read of "is there anything to put on?", asked every tick so
 * it can decide whether to send the sweep at all (multiplayer plan §7.2.5).
 * Empty means the worn kit is already the best the bag holds.
 */
export function planAutoEquipGear(state: GameState, player: Player): number[] {
  return planAutoEquip(state, player, { weapon: false });
}

/**
 * How many slots the auto-equip sweep would improve right now, without touching
 * a thing — the count the inventory reads to label the button and disable it on
 * an already-optimal loadout. Mirrors `autoEquipBest` exactly (it plans the same
 * swaps), so the badge never promises a change the sweep won't make.
 */
export function autoEquipUpgradeCount(
  state: GameState,
  player: Player,
): number {
  return planAutoEquip(state, player).length;
}
