// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's ECONOMY: bag discipline and the merchant errand. The bot
// itself (the bot/ modules) is a PURE consumer of the state — it only produces GameInput
// — so the mutating half of playing the economy (dropping outgrown loot,
// selling at the counter, buying an upgrade) lives here and is invoked by the
// HARNESSES that drive a botted run (the campaign simulator and the app's
// `?bot=` autoplay), exactly like `autoEquipBest`. The predicates are pure so
// `macro.ts` can read them for movement (walk to the stall when a visit pays).
//
// The kit the hero HAULS is part of that discipline: the cull and the counter
// sell-run both spare the POCKET ARSENAL's cells (`botPocketKeepIndices` in
// weapon-swap.ts — a boss round, a crowd spray, and the spare his own spec
// would swing), because a blade hero deals ZERO damage whenever his blade
// can't land: airborne (step/ holsters melee above JUMP.dodgeHeight), closing
// on a pack still out of arm's reach, walking off to fetch loot with mobs
// pot-shot distance away. Which of those weapons is IN THE HAND at any moment
// is weapon-swap.ts's call. This module also keeps the bag SORTED like the
// powerup dock (`sortBotInventory`): pockets up front, then the loot by
// preciousness, so a glance (or a bag hotkey) always finds the good stuff in
// the same place.

import {
  autoEquipBest,
  autoEquipGear,
  canEquip,
  equipmentMaxDurability,
  heroLoadoutMemo,
  isScrappableLoot,
  isWeaponBroken,
  repairAllCost,
  vaultItem,
  vaultWorth,
  weaponScore,
} from "../items/index.ts";
import {
  buyStock,
  canBuyStock,
  closeShop,
  openShop,
  repairGear,
  sellItem,
  sellValue,
} from "../merchant.ts";
import { abilityBlocks, abilityDef } from "../defs/abilities.ts";
import type { AbilityKind } from "../defs/abilities.ts";
import {
  healCompanionWithMedkit,
  reviveTarget,
  spendReviveItem,
} from "../companions.ts";
import { gateKeyIds } from "../defs/levels/index.ts";
import {
  gearDef,
  isGearDef,
  SIDEARM_DEF_ID,
  weaponDef,
} from "../defs/equipment.ts";
import { botPocketKeepIndices } from "./weapon-swap.ts";
import type { Equipment, GameState, MerchantStock } from "../types/index.ts";

/** Bag cells the autopilot keeps FREE, so the next find always has a home —
 * the "one slot open" discipline a human keeps so a drop is never refused. */
export const BOT_BAG_KEEP_FREE = 1;

/** Outgrown (sellable) pieces in the bag before a dedicated SELL RUN to the
 * merchant is worth the walk — fewer and the coins don't pay for the detour. */
const SELL_RUN_MIN_JUNK = 3;

/** Held-weapon durability fraction at/below which the hero is one fight from
 * being dumped onto the sidearm — the starvation line the merchant errand
 * (and the campaign sim's autoShop) trip on. */
const STARVED_DURABILITY_FRAC = 0.15;

/** Held-weapon durability fraction at/below which a paid repair at the counter
 * is worth a visit (when no repair kit is stocked). Looser than the starvation
 * line so the kit is mended BEFORE the blade actually gives out. */
const REPAIR_VISIT_FRAC = 0.35;

/**
 * Can the hero no longer fight his way forward with what's in his hand — he's
 * on the unbreakable fallback sidearm, or his held weapon is about to snap?
 * The cue that a merchant visit is URGENT rather than a convenience. Pure.
 */
export function weaponStarved(state: GameState): boolean {
  const w = state.players[0].equipment.weapon;
  if (w.defId === SIDEARM_DEF_ID) return true; // dumped onto the fallback sidearm
  if (w.durability === undefined) return false; // a keeper unique/legendary
  const max = equipmentMaxDurability(w);
  return (
    max > 0 &&
    w.durability <= Math.max(1, Math.floor(max * STARVED_DURABILITY_FRAC))
  );
}

/** How many bag pieces are OUTGROWN junk (see `isScrappableLoot`) — neither
 * special nor as good as what's worn — that the bot would actually PART with:
 * the pocket arsenal ({@link botPocketKeepIndices}) is banked on purpose, so
 * it never counts, keeping this predicate consistent with what the counter
 * routine really sells (a kept pocket that kept counting would leave
 * `wantsMerchantVisit` wanting a sell-run it can never resolve). These are
 * the merchant fodder the bot banks for coins; everything else in the bag is
 * a keeper. Pure. */
export function sellableJunkCount(state: GameState): number {
  // Loadout-pure (the pocket-keep set and every `isScrappableLoot` verdict turn
  // only on the worn kit + the bag), and read two or three times a tick by the
  // merchant-visit predicate — so it memoizes off the loadout memo like the
  // other economy reads, collapsing the repeated inventory walks into one.
  const memo = heroLoadoutMemo(state);
  const hit = junkCountByLoadout.get(memo);
  if (hit !== undefined) return hit;
  const keep = new Set(botPocketKeepIndices(state));
  const inv = state.players[0].inventory;
  let n = 0;
  for (let i = 0; i < inv.length; i++) {
    const cell = inv[i];
    if (cell && !keep.has(i) && isScrappableLoot(state, cell)) n++;
  }
  junkCountByLoadout.set(memo, n);
  return n;
}
const junkCountByLoadout = new WeakMap<object, number>();

/**
 * WEAR THE UPGRADES: the autopilot's own auto-equip sweep, run every tick by
 * the harnesses (the campaign sim and the app's autoplay) exactly like the cull
 * and the sort. The hero puts on the best banked piece for every ARMOR / charm
 * / bag slot; the WEAPON slot is left to the pocket arsenal
 * ({@link stepBotWeaponSwap}), which swaps the hand by the moment and would
 * only flap against a sweep that re-drew the strongest weapon each tick.
 *
 * It exists because the ON-PICKUP auto-equip is a PLAYER SETTING (`autoEquip`,
 * shipped OFF so a human curates their own loadout — see
 * `setAutoEquipEnabled`), and the bot is not a human curating anything: a
 * watched AUTO PILOT run that banked every find and never wore it looked
 * broken, hauled a full bag of upgrades, and fought under-geared. The sweep
 * also catches what the pickup path structurally can't: a find banked while
 * still UNDER-LEVELED is worn the moment the hero grows into it.
 *
 * Returns whether anything was equipped, so the app can refresh its HUD.
 */
export function botAutoEquip(state: GameState): boolean {
  // Called EVERY tick, but the sweep is a pure function of the loadout (the
  // plan turns only on the worn kit, the bag, and the hero's level/stats — all
  // captured by the loadout memo). Once a loadout is swept there is nothing
  // left to wear until something moves, which mints a fresh memo — so the
  // common quiet tick short-circuits before walking the bag at all.
  const memo = heroLoadoutMemo(state);
  if (sweptLoadouts.has(memo)) return false;
  const changed = autoEquipGear(state) > 0;
  sweptLoadouts.add(heroLoadoutMemo(state));
  return changed;
}
const sweptLoadouts = new WeakSet<object>();

/**
 * BAG DISCIPLINE: keep {@link BOT_BAG_KEEP_FREE} cell(s) open so the next find
 * always has a home, shedding the LEAST PRECIOUS piece the bag can spare — in
 * two passes, because "what can I spare?" has two very different answers.
 *
 * PASS 1 — the OUTGROWN loot (`isScrappableLoot`: neither special nor as good
 * as what's worn). Ordinary junk the hero has grown out of, shed worst first.
 *
 * PASS 2 — a bag holding nothing BUT keepers. On a long flight the horde pays
 * out uniques faster than seven cells can hold them, and the old rule ("a
 * human doesn't trash a unique for pocket room") left the bot riding a full
 * bag, refusing every drop for the rest of the ride — so the best find of the
 * flight would be the one lying on the floor. It now sheds the least precious
 * KEEPER instead, which is exactly the human read: a unique only ever leaves a
 * bag whose every other cell holds something at least as precious, and a rare
 * or a magic never displaces one.
 *
 * Both passes rank by {@link vaultWorth} — TIER first, sell value only to
 * break ties inside a tier — so preciousness, not a high-ilvl blue's inflated
 * price tag, decides what goes. Nothing precious is destroyed: anything worth
 * keeping is banked in the LOST & FOUND (`vaultItem`) for the player to buy
 * back afterwards. Two things are never shed at all: the bot's POCKET SHOOTERS
 * ({@link botPocketKeepIndices} — the jump-shot weapons a blade hero banks on
 * purpose) and a travel-gate KEY, whose worth is the door it opens.
 *
 * Returns the shed pieces. Called by the bot harnesses each tick; cheap when a
 * slot is already open.
 */
export function cullWorstLoot(state: GameState): Equipment[] {
  const inv = state.players[0].inventory;
  const dropped: Equipment[] = [];
  let free = 0;
  for (const cell of inv) {
    if (cell === null) free++;
  }
  if (free >= BOT_BAG_KEEP_FREE) return dropped;
  const keep = new Set(botPocketKeepIndices(state));
  const keys = gateKeyIds();
  /** The bag's least precious cell among those `spare` allows, or -1. */
  const worstCell = (spare: (item: Equipment) => boolean): number => {
    let worst = -1;
    let worstWorth = Infinity;
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item || keep.has(i) || keys.includes(item.defId)) continue;
      if (!spare(item)) continue;
      const worth = vaultWorth(item);
      if (worth < worstWorth) {
        worstWorth = worth;
        worst = i;
      }
    }
    return worst;
  };
  while (free < BOT_BAG_KEEP_FREE) {
    // Outgrown junk first; only once there is none left does a keeper go.
    let worst = worstCell((item) => isScrappableLoot(state, item));
    if (worst < 0) worst = worstCell(() => true);
    if (worst < 0) break; // every cell is a pocket or a key — nothing to shed
    const item = inv[worst] as Equipment;
    // Worth rescuing? Into the LOST & FOUND, where coins buy it back. Junk
    // just goes over the shoulder as it always did.
    vaultItem(state, item);
    dropped.push(item);
    inv[worst] = null;
    free++;
  }
  return dropped;
}

// The POCKET ARSENAL — WHICH weapon is in the hand, moment by moment — is its
// own module (`weapon-swap.ts`, one scale for blade/round/spray); the bag
// discipline here only needs to know which cells it has spared.

// ---- Bag ORDER (the powerup-dock discipline, for loot) --------------------------

/**
 * SORT THE BAG the way the powerup dock sorts its slots — so a glance (or a
 * bag hotkey) always finds the good stuff in the same place: the pocket
 * RANGED weapon in slot 1 and the pocket MAGIC weapon in slot 2 (each class's
 * best banked piece, wieldable first), then every other item ordered by
 * PRECIOUSNESS — descending `sellValue`, which folds the tier ladder
 * (artifact → legendary → unique → set → rare …) above ilvl and quality —
 * with the empty cells packed to the tail. A harness-side action like the
 * cull (the bot tidies as it plays; a hand-sorting player is left alone).
 * Ties keep mint order (`Equipment.id`) so the sort is stable and
 * deterministic. Returns whether anything moved.
 */
const sortedLoadouts = new WeakSet<object>();

export function sortBotInventory(state: GameState): boolean {
  // Called EVERY tick by the harness, but the desired order is a pure function
  // of the loadout (the head picks by `weaponScore`/`canEquip`, the tail by
  // `sellValue`/mint id) — all captured by the loadout memo, which the bag's
  // own slot order feeds into. Once a given loadout is sorted the bag stays
  // sorted until something moves (which mints a fresh memo), so a memo already
  // marked sorted short-circuits the whole walk+sort — the common quiet tick.
  const memo = heroLoadoutMemo(state);
  if (sortedLoadouts.has(memo)) return false;
  const inv = state.players[0].inventory;
  const items = inv.filter((cell): cell is Equipment => cell !== null);
  if (items.length === 0) {
    sortedLoadouts.add(memo);
    return false;
  }
  const head: Equipment[] = [];
  for (const cls of ["ranged", "magic"] as const) {
    let best: Equipment | null = null;
    let bestKey = -Infinity;
    let bestWieldable = false;
    for (const item of items) {
      if (item.slot !== "weapon" || head.includes(item)) continue;
      const def = weaponDef(item.defId);
      if (def.class !== cls || !def.projectile) continue;
      const wieldable = canEquip(state, item);
      const key = weaponScore(state, item);
      if (
        (wieldable && !bestWieldable) ||
        (wieldable === bestWieldable && key > bestKey)
      ) {
        best = item;
        bestKey = key;
        bestWieldable = wieldable;
      }
    }
    if (best) head.push(best);
  }
  const rest = items
    .filter((item) => !head.includes(item))
    .sort((a, b) => sellValue(b) - sellValue(a) || a.id - b.id);
  const next = [...head, ...rest];
  let changed = false;
  for (let i = 0; i < inv.length; i++) {
    const want = next[i] ?? null;
    if (inv[i] !== want) {
      inv[i] = want;
      changed = true;
    }
  }
  // Mark the resulting arrangement sorted — a reorder minted a fresh memo that
  // reflects the new slot order; a no-op keeps the same one. Either way the next
  // quiet tick short-circuits until a pickup/drop/equip changes the loadout.
  sortedLoadouts.add(heroLoadoutMemo(state));
  return changed;
}

// ---- The SPELL BAR (best unlocked powers, always) -------------------------------

/** Is a stall weapon on the counter that the hero could buy, wield, and that
 * genuinely beats what's in his hand? The "the walk would re-arm me" probe. */
function affordableStallUpgrade(state: GameState): boolean {
  const held = weaponScore(state, state.players[0].equipment.weapon);
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.qty <= 0) continue;
    // stockUniques can mint unique GEAR into a stall entry — only arms compete
    // (weaponScore throws on a cuirass).
    if (entry.equipment.slot !== "weapon") continue;
    if (!canBuyStock(state, entry) || !canEquip(state, entry.equipment)) {
      continue;
    }
    if (weaponScore(state, entry.equipment) > held) return true;
  }
  return false;
}

/** Is the kit worn enough that a PAID mend is worth the counter visit — the
 * held weapon wearing thin, or a broken spare shed into the bag? */
function kitWornOut(state: GameState): boolean {
  if (state.players[0].inventory.some((c) => c !== null && isWeaponBroken(c))) {
    return true;
  }
  const w = state.players[0].equipment.weapon;
  if (w.durability === undefined) return false;
  const max = equipmentMaxDurability(w);
  return max > 0 && w.durability / max <= REPAIR_VISIT_FRAC;
}

/**
 * Does a walk to the (already met) merchant PAY right now? True when the visit
 * would resolve something: the hero is weapon-starved and the counter can fix
 * it (junk to bank for coins, or an affordable stall upgrade already waiting),
 * the bag has piled up a sell-run's worth of outgrown loot, or the kit is
 * worn out with no repair kit stocked and the purse covers the mend. Every
 * clause clears itself after a `tradeAtMerchant`, so the errand can't loop.
 * Pure — `macro.ts` reads it to steer, the harnesses to trade.
 */
export function wantsMerchantVisit(state: GameState): boolean {
  if (!state.merchant.discovered) return false;
  const junk = sellableJunkCount(state);
  if (weaponStarved(state) && (junk > 0 || affordableStallUpgrade(state))) {
    return true;
  }
  if (junk >= SELL_RUN_MIN_JUNK) return true;
  if (state.players[0].repairKits === 0 && kitWornOut(state)) {
    const cost = repairAllCost(state);
    if (cost > 0 && state.players[0].coins >= cost) return true;
  }
  // A FRIEND IS FACE-DOWN AND THE ANSWER IS ON THE COUNTER. The stall is the
  // only source of SMELLING SALTS, so a downed companion with no bottle in the
  // bag is a reason to walk over on its own — without this clause the bot plays
  // the rest of the campaign a companion short, and every reason it HAD to
  // visit (junk, a worn kit) clears itself long before it would think to.
  if (needsRevive(state) && affordableRevive(state)) return true;
  return false;
}

/** Is a companion down with nothing in the bag to wake it? The bot's read of
 * "I have lost a friend and have not fixed it yet" — pure, so `macro.ts` can
 * steer the errand on it. */
function needsRevive(state: GameState): boolean {
  if (!state.companions.some((c) => c.downed)) return false;
  return !state.players[0].inventory.some(
    (item) => item !== null && reviveTarget(state, item) !== null,
  );
}

/** The cheapest bottle on the stall the purse actually covers, or null. */
function reviveRow(state: GameState): MerchantStock | null {
  let best: MerchantStock | null = null;
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.qty <= 0) continue;
    if (!isGearDef(entry.equipment.defId)) continue;
    if (!gearDef(entry.equipment.defId).revive) continue;
    if (!best || entry.price < best.price) best = entry;
  }
  return best;
}

/** Can the purse cover a bottle right now? Read before the walk, so the bot
 * never crosses a map to stand at a counter it cannot buy from. */
function affordableRevive(state: GameState): boolean {
  const row = reviveRow(state);
  return row !== null && state.players[0].coins >= row.price;
}

/**
 * How precious a powerup is to the bot — its one ranking of the whole ability
 * catalog, shared by the stall (buy the best first) and the field play
 * (arsenal.ts `pickPowerupMoment`/`pickPowerupBurn`: save the best for its moment, burn the cheapest
 * for shelf space). The NUKE tops it (a banked bomb changes how bravely the
 * bot can play — see arsenal.ts `hasNukeBanked`); the STORM out-damages the ORBIT
 * ring; the STASIS slow and the MAGNET's convenience pull bring up the rear.
 * An unknown future block lands mid-table, treated like a combat power.
 */
export function abilityValue(defId: string): number {
  let best = -1;
  // Priced over the BLOCKS a power carries, not its label: a composed power is
  // worth its best part, so bolting a magnet onto a storm can never cheapen it.
  for (const block of abilityBlocks(abilityDef(defId))) {
    best = Math.max(best, BLOCK_VALUE[block] ?? UNRANKED_BLOCK_VALUE);
  }
  return best < 0 ? UNRANKED_BLOCK_VALUE : best;
}

/** What each effect is worth to the bot. A block missing here — a future one,
 * or a mod's — is worth {@link UNRANKED_BLOCK_VALUE}. */
const BLOCK_VALUE: Partial<Record<AbilityKind, number>> = {
  nuke: 4,
  storm: 3,
  orbit: 2,
  stasis: 1,
  magnet: 0,
};

/** An unranked block lands mid-table, treated like a combat power. */
const UNRANKED_BLOCK_VALUE = 2;

/**
 * THE COUNTER ROUTINE — what a competent player does at the stall, in order:
 * bank the bag's outgrown junk for coins (keepers stay), buy the best weapon
 * upgrade the purse covers and the hero can wield, mend the whole kit, then
 * spend what's left on POWERUPS (nuke first) while keeping enough back to
 * afford the next mend. Opens and closes the shop itself; only fires when the
 * hero is actually at the counter (`openShop` is proximity-gated) — returns
 * whether a visit really happened, so callers can cool down on it. Mutates
 * state (a harness-side action, like `autoEquipBest` — never called from the
 * pure `botAct`).
 */
export function tradeAtMerchant(state: GameState): boolean {
  if (!openShop(state)) return false;
  // SELL: every outgrown piece across the counter. The cull (cullWorstLoot)
  // only ever drops the cheapest junk in the field, so the good junk lands
  // here — the whole reason the bag hauls it. The pocket shooters stay in
  // the bag (botPocketKeepIndices): a blade hero's jump-shot weapon is banked
  // on purpose, however its raw numbers read against the blade in hand.
  const inv = state.players[0].inventory;
  const keep = new Set(botPocketKeepIndices(state));
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (item && !keep.has(i) && isScrappableLoot(state, item)) {
      sellItem(state, i);
    }
  }
  // WAKE THE FRIEND FIRST. A bottle of SMELLING SALTS outranks the weapon
  // upgrade below it and the whole consumable shelf: those make the next fight
  // a little better, this is the difference between fighting it with a
  // companion and fighting it without one for the rest of the campaign. Bought
  // ahead of the repair reserve too — a hero who cannot afford both a mend and
  // his friend should come back with his friend.
  if (needsRevive(state)) {
    const bottle = reviveRow(state);
    if (bottle && canBuyStock(state, bottle)) buyStock(state, bottle.id);
  }
  // BUY the single best wieldable weapon upgrade the purse covers.
  let bestId = -1;
  let bestScore = weaponScore(state, state.players[0].equipment.weapon);
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.qty <= 0) continue;
    // stockUniques can mint unique GEAR into a stall entry — only arms compete
    // (weaponScore throws on a cuirass).
    if (entry.equipment.slot !== "weapon") continue;
    if (!canBuyStock(state, entry) || !canEquip(state, entry.equipment)) {
      continue;
    }
    const score = weaponScore(state, entry.equipment);
    if (score > bestScore) {
      bestScore = score;
      bestId = entry.id;
    }
  }
  if (bestId >= 0) buyStock(state, bestId);
  // MEND the whole kit (refused on its own when nothing needs it or the
  // purse is short — a free no-op).
  repairGear(state);
  // Then the spare coins, keeping a reserve big enough to pay for the kit's
  // next mend. Each shelf is bought DOWN until the purse, the dock stack, or
  // the entry's own `qty` says stop — nothing on the stall restocks, so the
  // loop always terminates on the counter's own supply.
  const reserve = repairAllCost(state);
  const buyDown = (entry: MerchantStock) => {
    while (
      state.players[0].coins - entry.price >= reserve &&
      buyStock(state, entry.id)
    ) {
      // keep stocking up while it pays
    }
  };
  // CONSUMABLES first: a pouch of medkits is the difference between finishing
  // the level and restarting it, where a powerup is a good ten seconds. The
  // stall's shelf order (medkit, repair kit, drink) is already that priority.
  for (const entry of state.merchant.stock) {
    if (entry.kind === "consumable") buyDown(entry);
  }
  // POWERUPS with what's left — most precious first (abilityValue).
  const powerups = state.merchant.stock
    .filter(
      (e): e is Extract<MerchantStock, { kind: "ability" }> =>
        e.kind === "ability",
    )
    .sort((a, b) => abilityValue(b.defId) - abilityValue(a.defId));
  for (const entry of powerups) buyDown(entry);
  closeShop(state);
  // Wear the purchase (and anything freed by the mend) on the spot.
  autoEquipBest(state);
  // Crack the bottle at the counter if one was just bought — the walk is over
  // and the friend has been down the whole way here.
  careForCompanion(state);
  return true;
}

/**
 * KEEP THE FRIEND ON ITS FEET — the autopilot's half of the companion economy,
 * run every tick by the harnesses that drive a botted run (the campaign
 * simulator and the app's bot driver), beside `stepBotWeaponSwap`. Two moves,
 * in the order a competent player makes them:
 *
 *   1. WAKE a downed companion with a bottle of SMELLING SALTS from the bag.
 *      Immediately: it wakes at a sliver of health with the fight still on, but
 *      a friend standing badly hurt fights, and one face-down does not.
 *   2. MEND a hurt one with a medkit, but only once the pouch is DEEP enough
 *      (`BOT_COMPANION_MEDKIT_RESERVE`) that the kit was not the hero's own way
 *      out of a bad fight. There is no passive regen any more, so without this
 *      the bot walks a permanently half-dead companion through the campaign —
 *      and with a greedy version of it, it heals a scratch and dies at 15% hp
 *      holding an empty pouch.
 *
 * A harness-side action (it mutates), like `tradeAtMerchant` above — never
 * called from the pure `botAct`. Returns whether anything was spent, so a
 * driver can bump its UI.
 */
export function careForCompanion(state: GameState): boolean {
  if (state.phase !== "playing" || state.companions.length === 0) return false;
  const bottleAt = state.players[0].inventory.findIndex(
    (item) => item !== null && reviveTarget(state, item) !== null,
  );
  if (bottleAt >= 0 && spendReviveItem(state, bottleAt)) return true;
  const kits = state.players[0].medkits.reduce((sum, n) => sum + (n ?? 0), 0);
  if (kits < BOT_COMPANION_MEDKIT_RESERVE) return false;
  for (const companion of state.companions) {
    if (companion.hp >= companion.maxHp * BOT_COMPANION_HEAL_FRAC) continue;
    if (healCompanionWithMedkit(state, companion.id)) return true;
  }
  return false;
}

/**
 * Medkits the bot keeps for ITSELF before it will spend one on a companion.
 * The hero's own emergency read (`HEAL_HP_FRAC` in supplies.ts) fires at under
 * half health and expects something in the pouch when it does; a bot that
 * bandaged its friend down to an empty stack would simply die instead.
 */
const BOT_COMPANION_MEDKIT_RESERVE = 3;

/** How beaten a companion has to be before a kit is worth spending on it —
 * well under the hero's own line, since a companion has no other way back and
 * topping a scratch off is how a pouch empties without anything to show. */
const BOT_COMPANION_HEAL_FRAC = 0.5;
