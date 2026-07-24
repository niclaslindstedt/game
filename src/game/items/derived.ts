// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Derived hero stats: which worn pieces currently count (broken armor goes
// silent), the flattened affix/set-bonus reads, effective vs raw attributes,
// and the hp/stamina/mana pool sizing that hangs off them.

import { MANA, PLAYER, STAMINA } from "../config/index.ts";
import { gearDef, isWeaponDef, STAT_NAMES } from "../defs/equipment.ts";
import { activeSetDefs, setForItem, setsEpoch } from "../defs/sets.ts";
import { autoStatGainsOn, baseStatBonus, diminishStat } from "../leveling.ts";
import { talentMaxHpPct } from "../talent-effects.ts";
import type {
  Affix,
  Equipment,
  GameState,
  Player,
  ProcSpell,
  ProcTrigger,
  StatName,
} from "../types/index.ts";

// ---- Derived stats -----------------------------------------------------------

/** The equipment slots, in their canonical order — the allocation-free walks
 * below iterate these instead of building a fresh pieces array per read (the
 * derived-stat getters run per hit at horde scale, where per-call array churn
 * is measurable GC pressure). */
const EQUIP_SLOTS = [
  "weapon",
  "head",
  "chest",
  "legs",
  "feet",
  "charm",
  "bag",
] as const;

// ---- Hero loadout memo ---------------------------------------------------
// The derived-stat reads below walk the worn loadout, the set catalog, and the
// whole bag on EVERY call — and the hot paths read them per enemy and per blow
// (stasis slow per mob per tick, miss/dodge/crit per hit, procs per landed
// blow), so at horde scale those walks were the tick's single biggest repeated
// cost. Everything they read is captured EXACTLY by a small numeric snapshot
// (level, chosen points, worn piece identities + broken bits, carried piece
// identities, the auto-gain flag, and the set-catalog epoch — affixes never
// mutate after minting, and passive/armor values hang off the def id), so the
// memo below revalidates with one cheap numeric walk and only re-derives when
// the loadout actually changed. Derivations that hang off the same inputs
// (armor total, crit bonus, procs, flattened affixes) share the bag.

/** One derived-stat read's two halves (see `statParts`). */
type StatParts = { value: number; pct: number };

export type HeroLoadoutMemo = {
  /** The exact-loadout snapshot this memo was derived from. */
  snapshot: number[];
  parts: Partial<Record<StatName, StatParts>>;
  /** Final `effectiveStat` values (the diminish curve folded in — level is in
   * the snapshot, so the rounded result is loadout-pure too). */
  effective: Partial<Record<StatName, number>>;
  setAffixes?: readonly Affix[];
  activeAffixes?: readonly Affix[];
  hasAffix: Partial<Record<Affix["kind"], boolean>>;
  armorPen?: number;
  /** Cached by durability.ts (`totalArmor`). */
  totalArmor?: number;
  /** Cached by combat-stats.ts (`playerCritChance`): gear + affix + set crit. */
  critBonus?: number;
  /** Cached by spells.ts (`equippedProcs`), keyed by trigger. */
  procs: Partial<
    Record<ProcTrigger, { spell: ProcSpell; chance: number; rank: number }[]>
  >;
};

const loadoutMemos = new WeakMap<Player, HeroLoadoutMemo>();

/** Append everything the derived reads depend on, as plain numbers. */
function writeLoadoutSnapshot(state: GameState, out: number[]): void {
  const player = state.player;
  out.push(player.level, autoStatGainsOn() ? 1 : 0, setsEpoch());
  for (const stat of STAT_NAMES) out.push(player.stats[stat]);
  const equipment = player.equipment;
  for (const slot of EQUIP_SLOTS) {
    const piece = equipment[slot];
    if (!piece) out.push(-1, 0);
    else out.push(piece.id, isArmorBroken(piece) ? 1 : 0);
  }
  for (const piece of player.inventory) out.push(piece ? piece.id : -1);
}

/**
 * The hero's loadout-derived memo, revalidated against the exact snapshot on
 * every call. Keyed by the Player OBJECT (WeakMap), so previews
 * (`previewEquipped`), saves, and parallel headless states never collide.
 * The hit path walks-and-compares in place — no allocation, no writes.
 */
export function heroLoadoutMemo(state: GameState): HeroLoadoutMemo {
  const cached = loadoutMemos.get(state.player);
  if (cached && snapshotMatches(state, cached.snapshot)) return cached;
  const snapshot: number[] = [];
  writeLoadoutSnapshot(state, snapshot);
  const memo: HeroLoadoutMemo = {
    snapshot,
    parts: {},
    effective: {},
    hasAffix: {},
    procs: {},
  };
  loadoutMemos.set(state.player, memo);
  return memo;
}

/** Does `snap` still describe this player's loadout exactly? The mirror of
 * `writeLoadoutSnapshot`, walked without building anything. */
function snapshotMatches(state: GameState, snap: number[]): boolean {
  const player = state.player;
  let i = 0;
  if (snap[i++] !== player.level) return false;
  if (snap[i++] !== (autoStatGainsOn() ? 1 : 0)) return false;
  if (snap[i++] !== setsEpoch()) return false;
  for (const stat of STAT_NAMES) {
    if (snap[i++] !== player.stats[stat]) return false;
  }
  const equipment = player.equipment;
  for (const slot of EQUIP_SLOTS) {
    const piece = equipment[slot];
    if (snap[i++] !== (piece ? piece.id : -1)) return false;
    if (snap[i++] !== (piece && isArmorBroken(piece) ? 1 : 0)) return false;
  }
  const inventory = player.inventory;
  if (snap.length - i !== inventory.length) return false;
  for (const piece of inventory) {
    if (snap[i++] !== (piece ? piece.id : -1)) return false;
  }
  return true;
}

export function equippedPieces(state: GameState): Equipment[] {
  const { weapon, head, chest, legs, feet, charm, bag } =
    state.player.equipment;
  return [weapon, head, chest, legs, feet, charm, bag].filter(
    (e): e is Equipment => e !== null,
  );
}

/**
 * True when this worn piece is a BROKEN armor piece: its durability has hit
 * zero, so it stays on the body but counts for NOTHING — no armor, no flat
 * bonuses, no affixes — until a repair kit restores it. Only armor breaks
 * this way; a weapon at zero is trashed instead (see `wearEquippedWeapon`),
 * and charms/bags never wear.
 */
export function isArmorBroken(piece: Equipment): boolean {
  return (
    piece.slot !== "weapon" &&
    piece.slot !== "charm" &&
    piece.slot !== "bag" &&
    piece.durability === 0
  );
}

/**
 * The hero's total GEAR armor piercing — the summed `armorPen` affixes across
 * every worn piece (a broken armor piece counts for nothing). Added ON TOP of
 * the class baseline (`STATS.armorPenByClass`) in `mobArmorMult`, so a physical
 * hero's uniques/legendaries deepen how much of the armored endgame their
 * blows punch through. The whole late-game ranged (and melee) chase stat.
 */
export function heroArmorPen(state: GameState): number {
  const memo = heroLoadoutMemo(state);
  if (memo.armorPen !== undefined) return memo.armorPen;
  let pen = 0;
  for (const piece of equippedPieces(state)) {
    if (isArmorBroken(piece)) continue;
    for (const affix of piece.affixes) {
      if (affix.kind === "armorPen") pen += affix.value;
    }
  }
  memo.armorPen = pen;
  return pen;
}

/**
 * True when the hero's WORN loadout carries the KNOCKBACK signature (the
 * `knockback` affix on any active piece — a set-bonus capstone counts too). It
 * is the gate on the shove: only a hero wielding one of the rare authored
 * knockback weapons pushes struck survivors back (see `applyKnockback`), so
 * most builds never knock back at all. A marker affix, so this reads as a
 * boolean — the magnitude is the shared `KNOCKBACK.distance`.
 */
export function heroHasKnockback(state: GameState): boolean {
  return hasActiveAffix(state, "knockback");
}

/**
 * True when this is a BROKEN weapon: its durability has hit zero, so it can no
 * longer be wielded until a repair kit mends it. Unlike the old rule that
 * TRASHED a spent weapon, a broken weapon now falls into the bag at durability
 * 0 (see `wearEquippedWeapon`) and hangs there, unequippable, until repaired —
 * `canEquip` refuses it and the on-break swap skips over it. The held weapon is
 * never in this state (breaking boots it out the same tick).
 */
export function isWeaponBroken(piece: Equipment): boolean {
  return piece.slot === "weapon" && piece.durability === 0;
}

/** The worn pieces whose bonuses/affixes actually apply right now — everything
 * equipped minus broken armor. Every derived-stat read routes through this so
 * a worn-out piece goes silent the moment it breaks. */
export function activePieces(state: GameState): Equipment[] {
  return equippedPieces(state).filter((piece) => !isArmorBroken(piece));
}

/**
 * Every affix currently APPLYING from the worn loadout, flattened — the read
 * the granted-spell/proc/sure-strike systems (spells.ts, `playerMissChance`)
 * share, so a broken armor piece silences its forever spell exactly as it
 * silences its stats.
 */
export function activeEquippedAffixes(state: GameState): readonly Affix[] {
  const memo = heroLoadoutMemo(state);
  if (memo.activeAffixes) return memo.activeAffixes;
  const affixes: Affix[] = [];
  for (const piece of activePieces(state)) affixes.push(...piece.affixes);
  affixes.push(...setBonusAffixes(state));
  memo.activeAffixes = affixes;
  return affixes;
}

/**
 * Does any APPLYING affix (worn pieces + set bonuses) carry this kind? The
 * allocation-free twin of `activeEquippedAffixes(...).some(...)` for the
 * boolean marker checks that run per hit (sure-strike, knockback) — at horde
 * scale the flattened-array form was measurable GC pressure.
 */
export function hasActiveAffix(state: GameState, kind: Affix["kind"]): boolean {
  const memo = heroLoadoutMemo(state);
  const cached = memo.hasAffix[kind];
  if (cached !== undefined) return cached;
  let found = false;
  const equipment = state.player.equipment;
  outer: for (const slot of EQUIP_SLOTS) {
    const piece = equipment[slot];
    if (!piece || isArmorBroken(piece)) continue;
    for (const affix of piece.affixes) {
      if (affix.kind === kind) {
        found = true;
        break outer;
      }
    }
  }
  if (!found) {
    for (const affix of setBonusAffixes(state)) {
      if (affix.kind === kind) {
        found = true;
        break;
      }
    }
  }
  memo.hasAffix[kind] = found;
  return found;
}

/**
 * How many pieces of the set `setId` are currently worn in an ACTIVE armor
 * slot (broken pieces don't count — a set bonus goes quiet with its piece).
 * The item card reads it to highlight which set thresholds are live.
 */
export function wornSetCount(state: GameState, setId: string): number {
  let count = 0;
  for (const piece of activePieces(state)) {
    if (!piece.uniqueId) continue;
    const set = setForItem(piece.uniqueId);
    if (set?.id === setId) count++;
  }
  return count;
}

/**
 * The extra affixes granted by SET BONUSES from the worn loadout — the whole
 * point of a green set. For each active set, count its worn (non-broken)
 * members; every bonus threshold at or below that count contributes its affixes
 * (D2-style CUMULATIVE partial-set bonuses — the full set carries every tier).
 * Folded into the four affix reads so a set's stat lifts (`statParts`,
 * `computeMaxHp`, `playerCritChance`) AND its capstone spell/proc/sure-strike
 * (`activeEquippedAffixes`, the read spells.ts and the sure-strike check share)
 * all land through the same paths a worn piece's own affixes do. Two members
 * never share a slot, so a member is worn at most once.
 */
// The overwhelmingly common loadout wears fewer than two named pieces, so the
// set scan below exits with this shared empty result before allocating.
const NO_AFFIXES: readonly Affix[] = Object.freeze([]);

export function setBonusAffixes(state: GameState): readonly Affix[] {
  const memo = heroLoadoutMemo(state);
  if (memo.setAffixes) return memo.setAffixes;
  const affixes = computeSetBonusAffixes(state);
  memo.setAffixes = affixes;
  return affixes;
}

function computeSetBonusAffixes(state: GameState): readonly Affix[] {
  const equipment = state.player.equipment;
  // Count worn named pieces first — with fewer than two, no set can reach its
  // 2-piece threshold and the whole scan (and its allocations) is skipped.
  let named = 0;
  for (const slot of EQUIP_SLOTS) {
    const piece = equipment[slot];
    if (piece && piece.uniqueId && !isArmorBroken(piece)) named++;
  }
  if (named < 2) return NO_AFFIXES;
  const worn = new Set<string>();
  for (const slot of EQUIP_SLOTS) {
    const piece = equipment[slot];
    if (piece && piece.uniqueId && !isArmorBroken(piece)) {
      worn.add(piece.uniqueId);
    }
  }
  const out: Affix[] = [];
  for (const set of activeSetDefs()) {
    let count = 0;
    for (const id of set.members) if (worn.has(id)) count++;
    if (count < 2) continue; // set bonuses start at the 2-piece threshold
    for (const tier of set.bonuses) {
      if (tier.pieces <= count) out.push(...tier.bonuses);
    }
  }
  return out;
}

/**
 * A shallow view of `state` with `candidate` slotted into its equip slot —
 * for previewing what a bag item would do to the derived stats (the "+3
 * DAMAGE" upgrade hints in the inventory) without disturbing the real
 * loadout. Only `player.equipment` is replaced; everything else is shared, so
 * the stat getters below read straight through it.
 */
export function previewEquipped(
  state: GameState,
  candidate: Equipment,
): GameState {
  const player = state.player;
  const equipment = { ...player.equipment, [candidate.slot]: candidate };
  return { ...state, player: { ...player, equipment } };
}

/**
 * Flat passive stat bonus from carried trinkets — the PASSAGE CHIP pays out
 * its `+INT` just by riding in the bag (or a slot; either way, once). Weapons
 * carry no passive; gear opts in via `GearDef.passive`.
 */
function passiveStatBonus(state: GameState, stat: StatName): number {
  // The worn slots and the bag cells, walked in place — the same reach
  // `carriedPieces` flattens, minus its per-call array allocations.
  let total = 0;
  const equipment = state.player.equipment;
  for (const slot of EQUIP_SLOTS) {
    const piece = equipment[slot];
    if (!piece || isWeaponDef(piece.defId)) continue;
    total += gearDef(piece.defId).passive?.[stat] ?? 0;
  }
  for (const piece of state.player.inventory) {
    if (!piece || isWeaponDef(piece.defId)) continue;
    total += gearDef(piece.defId).passive?.[stat] ?? 0;
  }
  return total;
}

/**
 * True when the def id names a passive trinket — gear that pays its bonus
 * while merely carried (a PASSAGE CHIP). Such an item is banked in the bag
 * like ordinary loot rather than auto-equipped into a slot, since the effect
 * needs no slot to land (and grabbing the charm slot would block a real
 * charm).
 */
export function isPassiveItem(defId: string): boolean {
  return !isWeaponDef(defId) && gearDef(defId).passive !== undefined;
}

/**
 * Stat points from level-ups — the AUTOMATIC base growth leveling itself
 * grants (`baseStatBonus`, WoW-style) plus the points the player chose —
 * any equipped `+N <stat>` affixes, and the flat bonus of every passive
 * trinket carried (bag or worn). The flat total then runs through the
 * DIMINISHING-RETURNS curve (`diminishStat`): linear to the soft cap,
 * flattening past it, so a grown hero's stat pile saturates instead of
 * compounding forever (the horde's compensation rides the same curve — see
 * `autoPowerScale`).
 */
export function effectiveStat(state: GameState, stat: StatName): number {
  const memo = heroLoadoutMemo(state);
  const cached = memo.effective[stat];
  if (cached !== undefined) return cached;
  const { value, pct } = statParts(state, stat);
  const result = Math.round(
    diminishStat(value, state.player.level) * (1 + pct),
  );
  memo.effective[stat] = result;
  return result;
}

/**
 * The two pieces every stat read is built from: the flat `value` (chosen +
 * automatic points, `+N` affixes, passive-trinket bonuses) and the scaling
 * `pct` (unique `statPct` bonuses). `effectiveStat` runs the flat total through
 * the diminishing-returns curve then applies the percentage; `rawStat` skips
 * the diminish to recover the honest points-invested figure. Shared so the two
 * never drift.
 */
function statParts(state: GameState, stat: StatName): StatParts {
  const memo = heroLoadoutMemo(state);
  const cached = memo.parts[stat];
  if (cached) return cached;
  const parts = computeStatParts(state, stat);
  memo.parts[stat] = parts;
  return parts;
}

function computeStatParts(state: GameState, stat: StatName): StatParts {
  let value =
    state.player.stats[stat] + baseStatBonus(state.player.level, stat);
  // Scaling `statPct` bonuses (uniques) multiply the whole total, so they grow
  // with the hero — a +2% STRENGTH is worth more the stronger you are.
  let pct = 0;
  const equipment = state.player.equipment;
  for (const slot of EQUIP_SLOTS) {
    const piece = equipment[slot];
    if (!piece || isArmorBroken(piece)) continue;
    for (const affix of piece.affixes) {
      if (affix.kind === "stat" && affix.stat === stat) value += affix.value;
      else if (affix.kind === "statPct" && affix.stat === stat)
        pct += affix.value;
    }
  }
  // SET BONUSES contribute stat/statPct just like a worn piece's own affixes.
  for (const affix of setBonusAffixes(state)) {
    if (affix.kind === "stat" && affix.stat === stat) value += affix.value;
    else if (affix.kind === "statPct" && affix.stat === stat)
      pct += affix.value;
  }
  value += passiveStatBonus(state, stat);
  return { value, pct };
}

/**
 * A hero's attribute BEFORE diminishing returns — the honest count of points
 * invested (chosen + automatic + affixes + trinkets), the measure equipment
 * stat requirements gate against (`meetsStatReq`). Requirements must use this,
 * not `effectiveStat`: the automatic per-level growth piles raw points far past
 * the soft cap where `diminishStat` flattens them, so an endgame requirement
 * expressed against the diminished value could exceed what any single stat can
 * ever DISPLAY — while the raw total still rises point-for-point, keeping the
 * "invest a fraction of your chosen points" contract exact at every level.
 */
export function rawStat(state: GameState, stat: StatName): number {
  const { value, pct } = statParts(state, stat);
  return value * (1 + pct);
}

/** Max hp from the base pool + the STAMINA stat + gear bonuses and affixes.
 * STAMINA now feeds BOTH the sprint pool (see `computeMaxStamina`) and the
 * health bar — a hardy sprinter is a sturdier hero. */
export function computeMaxHp(state: GameState): number {
  let max = PLAYER.maxHp + effectiveStat(state, "stamina") * STAMINA.hpPerPoint;
  // BULWARK (melee tree) deepens the whole pool by a flat % per rank, alongside
  // the maxHpPct affixes below.
  let pct = talentMaxHpPct(state);
  for (const piece of activePieces(state)) {
    if (!isWeaponDef(piece.defId)) {
      max += gearDef(piece.defId).bonuses.maxHp ?? 0;
    }
    for (const affix of piece.affixes) {
      if (affix.kind === "maxHp") max += affix.value;
      // Scaling `maxHpPct` (uniques) grows with the hero's whole health pool.
      else if (affix.kind === "maxHpPct") pct += affix.value;
    }
  }
  // SET BONUSES add their maxHp/maxHpPct on top (e.g. the Sentinel's Vigil).
  for (const affix of setBonusAffixes(state)) {
    if (affix.kind === "maxHp") max += affix.value;
    else if (affix.kind === "maxHpPct") pct += affix.value;
  }
  return Math.round(max * (1 + pct));
}

/**
 * Re-derive max hp after stats or equipment changed. Gaining max hp raises
 * current hp by the same amount (a level-up or a fresh suit feels good);
 * losing it only clamps.
 */
export function recomputeMaxHp(state: GameState): void {
  const player = state.player;
  const next = computeMaxHp(state);
  const delta = next - player.maxHp;
  player.maxHp = next;
  player.hp = delta > 0 ? player.hp + delta : Math.min(player.hp, next);
}

/** Max stamina from the base pool + the STAMINA stat (affixes folded in). */
export function computeMaxStamina(state: GameState): number {
  return STAMINA.base + effectiveStat(state, "stamina") * STAMINA.maxPerPoint;
}

/**
 * Re-target a resource pool's max after its governing stat changed: a deeper
 * pool lifts the current reserve by the same amount (a level-up feels good);
 * a shallower one only clamps. The one rule both the stamina and mana pools
 * follow — `recomputeMaxStamina` and `recomputeMaxMana` are its two faces.
 */
function resizePool(
  player: Player,
  pool: "stamina" | "mana",
  max: "maxStamina" | "maxMana",
  next: number,
): void {
  const delta = next - player[max];
  player[max] = next;
  player[pool] =
    delta > 0 ? player[pool] + delta : Math.min(player[pool], next);
}

/** Re-derive max stamina after the STAMINA stat changed (`resizePool`). */
export function recomputeMaxStamina(state: GameState): void {
  resizePool(state.player, "stamina", "maxStamina", computeMaxStamina(state));
}

/** Max mana from the base pool + the INTELLIGENCE stat (affixes folded in) —
 * the spell fuel INT both sizes and unlocks (see MANA / defs/spells.ts). */
export function computeMaxMana(state: GameState): number {
  return MANA.base + effectiveStat(state, "intelligence") * MANA.perInt;
}

/** Re-derive max mana after INTELLIGENCE changed (`resizePool`). */
export function recomputeMaxMana(state: GameState): void {
  resizePool(state.player, "mana", "maxMana", computeMaxMana(state));
}
