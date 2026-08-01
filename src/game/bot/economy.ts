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
// is weapon-swap.ts's call. The bag is also kept SORTED like the powerup dock —
// pockets up front, then the loot by preciousness, so a glance (or a bag
// hotkey) always finds the good stuff in the same place — though that order is
// `items/inventory.ts`'s (`sortInventory`), because it is a pure function of the
// loadout and only the DECISION to tidy is the bot's.
//
// **EVERY MUTATOR HERE IS HALVED, AND THE DECISION IS THE HALF THAT STAYS.**
// `botWantsGearSweep`, `botCullPlan`, `botReviveCell` and `botCompanionToHeal`
// are pure reads that answer WHAT the autopilot wants; the committing forms
// beside them are the in-process convenience, and `bot/intent.ts` turns the same
// decisions into the run commands a bot CLIENT sends (multiplayer plan §7.2.5).

import {
  autoEquipBest,
  autoEquipGear,
  bankSpareItem,
  canEquip,
  equipmentMaxDurability,
  heroLoadoutMemo,
  identifyItem,
  isScrappableLoot,
  isUnidentified,
  isWeaponBroken,
  planAutoEquipGear,
  repairAllCost,
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
} from "../merchant.ts";
import { abilityBlocks, abilityDef } from "../defs/abilities.ts";
import type { AbilityKind } from "../defs/abilities.ts";
import {
  canHealCompanion,
  healCompanionWithMedkit,
  reviveTarget,
  spendReviveItem,
} from "../companions.ts";
import { gateKeyIds } from "../defs/levels/index.ts";
import { gearDef, isGearDef, SIDEARM_DEF_ID } from "../defs/equipment.ts";
import { botPocketKeepIndices } from "./weapon-swap.ts";
import type {
  Equipment,
  GameState,
  MerchantStock,
  Player,
} from "../types/index.ts";

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
export function weaponStarved(state: GameState, hero: Player): boolean {
  const w = hero.equipment.weapon;
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
export function sellableJunkCount(state: GameState, hero: Player): number {
  // Loadout-pure (the pocket-keep set and every `isScrappableLoot` verdict turn
  // only on the worn kit + the bag), and read two or three times a tick by the
  // merchant-visit predicate — so it memoizes off the loadout memo like the
  // other economy reads, collapsing the repeated inventory walks into one.
  const memo = heroLoadoutMemo(state, hero);
  const hit = junkCountByLoadout.get(memo);
  if (hit !== undefined) return hit;
  const keep = new Set(botPocketKeepIndices(state, hero));
  const inv = hero.inventory;
  let n = 0;
  for (let i = 0; i < inv.length; i++) {
    const cell = inv[i];
    if (cell && !keep.has(i) && isScrappableLoot(state, hero, cell)) n++;
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
export function botAutoEquip(state: GameState, hero: Player): boolean {
  if (!botWantsGearSweep(state, hero)) return false;
  return autoEquipGear(state, hero) > 0;
}

/**
 * Is there anything in the bag the hero should be WEARING? The sweep's
 * decision, split from the commit above so it can travel as an intent
 * (multiplayer plan §7.2.5) — the verb behind it is `autoEquipGear`.
 *
 * Asked EVERY tick, which is why the short-circuit lives here: the plan is a
 * pure function of the loadout (it turns only on the worn kit, the bag, and the
 * hero's level/stats — all captured by the loadout memo). A loadout that has
 * been CONSIDERED is marked whether or not the sweep was wanted, so a plan the
 * run then refuses (a piece the two-handed rule won't seat) is asked for once
 * rather than every tick forever — which is exactly what the committing form
 * used to do by marking after its own attempt.
 */
export function botWantsGearSweep(state: GameState, hero: Player): boolean {
  const memo = heroLoadoutMemo(state, hero);
  if (sweptLoadouts.has(memo)) return false;
  const wanted = planAutoEquipGear(state, hero).length > 0;
  sweptLoadouts.add(memo);
  return wanted;
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
export function cullWorstLoot(state: GameState, hero: Player): Equipment[] {
  const dropped: Equipment[] = [];
  for (const cell of botCullPlan(state, hero)) {
    const item = bankSpareItem(state, hero, cell);
    if (item) dropped.push(item);
  }
  return dropped;
}

/**
 * WHICH CELLS THE BAG CAN SPARE, in the order they should go — the cull's
 * decision, split from the commit above so it can travel as an intent
 * (multiplayer plan §7.2.5). The verb behind each cell is `bankSpareItem`.
 *
 * Pure: it reads the bag and answers with indices, counting the cells it has
 * already named as freed rather than emptying them, so the answer is the same
 * sequence the committing loop used to walk. Empty when a cell is already open
 * (the quiet tick) or when every remaining cell is a pocket weapon or a key.
 *
 * It stays in `bot/` rather than moving beside `bankSpareItem` because THIS is
 * the autopilot's opinion — the pocket keep-set and the preciousness ladder are
 * how the bot plays, not how a bag works, and a run command reaching in here
 * for its implementation is the thing decision 3b forbids.
 */
export function botCullPlan(state: GameState, hero: Player): number[] {
  const inv = hero.inventory;
  const plan: number[] = [];
  let free = 0;
  for (const cell of inv) {
    if (cell === null) free++;
  }
  if (free >= BOT_BAG_KEEP_FREE) return plan;
  const keep = new Set(botPocketKeepIndices(state, hero));
  const keys = gateKeyIds();
  /** The bag's least precious cell among those `spare` allows, or -1. */
  const worstCell = (spare: (item: Equipment) => boolean): number => {
    let worst = -1;
    let worstWorth = Infinity;
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item || keep.has(i) || keys.includes(item.defId)) continue;
      if (plan.includes(i)) continue; // already named — count it as gone
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
    let worst = worstCell((item) => isScrappableLoot(state, hero, item));
    if (worst < 0) worst = worstCell(() => true);
    if (worst < 0) break; // every cell is a pocket or a key — nothing to shed
    plan.push(worst);
    free++;
  }
  return plan;
}

// The POCKET ARSENAL — WHICH weapon is in the hand, moment by moment — is its
// own module (`weapon-swap.ts`, one scale for blade/round/spray); the bag
// discipline here only needs to know which cells it has spared.

// ---- Bag ORDER (the powerup-dock discipline, for loot) --------------------------

// ---- The SPELL BAR (best unlocked powers, always) -------------------------------

/** Is a stall weapon on the counter that the hero could buy, wield, and that
 * genuinely beats what's in his hand? The "the walk would re-arm me" probe. */
function affordableStallUpgrade(state: GameState, hero: Player): boolean {
  const held = weaponScore(state, hero, hero.equipment.weapon);
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.qty <= 0) continue;
    // stockUniques can mint unique GEAR into a stall entry — only arms compete
    // (weaponScore throws on a cuirass).
    if (entry.equipment.slot !== "weapon") continue;
    if (
      !canBuyStock(state, hero, entry) ||
      !canEquip(state, hero, entry.equipment)
    ) {
      continue;
    }
    if (weaponScore(state, hero, entry.equipment) > held) return true;
  }
  return false;
}

/** Is the kit worn enough that a PAID mend is worth the counter visit — the
 * held weapon wearing thin, or a broken spare shed into the bag? */
function kitWornOut(state: GameState, hero: Player): boolean {
  if (hero.inventory.some((c) => c !== null && isWeaponBroken(c))) {
    return true;
  }
  const w = hero.equipment.weapon;
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
export function wantsMerchantVisit(state: GameState, hero: Player): boolean {
  if (!state.merchant.discovered) return false;
  const junk = sellableJunkCount(state, hero);
  if (
    weaponStarved(state, hero) &&
    (junk > 0 || affordableStallUpgrade(state, hero))
  ) {
    return true;
  }
  if (junk >= SELL_RUN_MIN_JUNK) return true;
  if (hero.repairKits === 0 && kitWornOut(state, hero)) {
    const cost = repairAllCost(state, hero);
    if (cost > 0 && hero.coins >= cost) return true;
  }
  // A FRIEND IS FACE-DOWN AND THE ANSWER IS ON THE COUNTER. The stall is the
  // only source of SMELLING SALTS, so a downed companion with no bottle in the
  // bag is a reason to walk over on its own — without this clause the bot plays
  // the rest of the campaign a companion short, and every reason it HAD to
  // visit (junk, a worn kit) clears itself long before it would think to.
  if (needsRevive(state, hero) && affordableRevive(state, hero)) return true;
  return false;
}

/** Is a companion down with nothing in the bag to wake it? The bot's read of
 * "I have lost a friend and have not fixed it yet" — pure, so `macro.ts` can
 * steer the errand on it. */
function needsRevive(state: GameState, hero: Player): boolean {
  if (!state.companions.some((c) => c.downed)) return false;
  return !hero.inventory.some(
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
function affordableRevive(state: GameState, hero: Player): boolean {
  const row = reviveRow(state);
  return row !== null && hero.coins >= row.price;
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
export function tradeAtMerchant(state: GameState, hero: Player): boolean {
  if (!openShop(state, hero)) return false;
  // SELL: every outgrown piece across the counter. The cull (cullWorstLoot)
  // only ever drops the cheapest junk in the field, so the good junk lands
  // here — the whole reason the bag hauls it. The pocket shooters stay in
  // the bag (botPocketKeepIndices): a blade hero's jump-shot weapon is banked
  // on purpose, however its raw numbers read against the blade in hand.
  const inv = hero.inventory;
  const keep = new Set(botPocketKeepIndices(state, hero));
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (item && !keep.has(i) && isScrappableLoot(state, hero, item)) {
      sellItem(state, hero, i);
    }
  }
  // IDENTIFY what the sell-run kept: every veiled find still in the bag is one
  // the sweep judged worth keeping (or a chase tier it always spares), so the
  // counter's per-piece fee is paid to make it wearable — the `autoEquipBest`
  // below is what actually collects on it. After the sell so the junk's coins
  // fund the appraisals; a short purse just leaves the rest veiled for the
  // next visit.
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (item && isUnidentified(item)) identifyItem(state, hero, i);
  }
  // WAKE THE FRIEND FIRST. A bottle of SMELLING SALTS outranks the weapon
  // upgrade below it and the whole consumable shelf: those make the next fight
  // a little better, this is the difference between fighting it with a
  // companion and fighting it without one for the rest of the campaign. Bought
  // ahead of the repair reserve too — a hero who cannot afford both a mend and
  // his friend should come back with his friend.
  if (needsRevive(state, hero)) {
    const bottle = reviveRow(state);
    if (bottle && canBuyStock(state, hero, bottle)) {
      buyStock(state, hero, bottle.id);
    }
  }
  // BUY the single best wieldable weapon upgrade the purse covers.
  let bestId = -1;
  let bestScore = weaponScore(state, hero, hero.equipment.weapon);
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.qty <= 0) continue;
    // stockUniques can mint unique GEAR into a stall entry — only arms compete
    // (weaponScore throws on a cuirass).
    if (entry.equipment.slot !== "weapon") continue;
    if (
      !canBuyStock(state, hero, entry) ||
      !canEquip(state, hero, entry.equipment)
    ) {
      continue;
    }
    const score = weaponScore(state, hero, entry.equipment);
    if (score > bestScore) {
      bestScore = score;
      bestId = entry.id;
    }
  }
  if (bestId >= 0) buyStock(state, hero, bestId);
  // MEND the whole kit (refused on its own when nothing needs it or the
  // purse is short — a free no-op).
  repairGear(state, hero);
  // Then the spare coins, keeping a reserve big enough to pay for the kit's
  // next mend. Each shelf is bought DOWN until the purse, the dock stack, or
  // the entry's own `qty` says stop — nothing on the stall restocks, so the
  // loop always terminates on the counter's own supply.
  const reserve = repairAllCost(state, hero);
  const buyDown = (entry: MerchantStock) => {
    while (
      hero.coins - entry.price >= reserve &&
      buyStock(state, hero, entry.id)
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
  closeShop(hero);
  // Wear the purchase (and anything freed by the mend) on the spot.
  autoEquipBest(state, hero);
  // Crack the bottle at the counter if one was just bought — the walk is over
  // and the friend has been down the whole way here.
  careForCompanion(state, hero);
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
export function careForCompanion(state: GameState, hero: Player): boolean {
  const bottleAt = botReviveCell(state, hero);
  if (bottleAt >= 0) return spendReviveItem(state, hero, bottleAt);
  const patient = botCompanionToHeal(state, hero);
  if (patient >= 0) return healCompanionWithMedkit(state, hero, patient);
  return false;
}

/**
 * The bag cell holding a bottle of SALTS worth breaking right now, or -1 — the
 * first half of the care decision, split from the commit above so it can travel
 * as an intent (multiplayer plan §7.2.5). The verb behind it is
 * `spendReviveItem`, and `reviveTarget` is what makes the answer non-null only
 * when somebody is actually face-down.
 */
export function botReviveCell(state: GameState, hero: Player): number {
  if (state.phase !== "playing" || hero.screen !== undefined) return -1;
  if (state.companions.length === 0) return -1;
  return hero.inventory.findIndex(
    (item) => item !== null && reviveTarget(state, item) !== null,
  );
}

/**
 * The companion a spare medkit should go to right now, by id, or -1 — the
 * second half of the care decision. The verb behind it is
 * `healCompanionWithMedkit`. Only asked once no bottle is owed: a corpse wants
 * the salts, not a bandage.
 */
export function botCompanionToHeal(state: GameState, hero: Player): number {
  if (state.phase !== "playing" || hero.screen !== undefined) return -1;
  if (state.companions.length === 0) return -1;
  const kits = hero.medkits.reduce((sum, n) => sum + (n ?? 0), 0);
  if (kits < BOT_COMPANION_MEDKIT_RESERVE) return -1;
  for (const companion of state.companions) {
    if (companion.hp >= companion.maxHp * BOT_COMPANION_HEAL_FRAC) continue;
    // `canHealCompanion` is the same gate the commit runs — a DOWNED friend and
    // a full one are both refused, and the loop moves on exactly as it did when
    // the refusal came back from the attempt itself.
    if (canHealCompanion(state, hero, companion.id) >= 0) return companion.id;
  }
  return -1;
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
