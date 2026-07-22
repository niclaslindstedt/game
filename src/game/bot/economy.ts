// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's ECONOMY: bag discipline and the merchant errand. The bot
// itself (the bot/ modules) is a PURE consumer of the state — it only produces GameInput
// — so the mutating half of playing the economy (dropping outgrown loot,
// selling at the counter, buying an upgrade) lives here and is invoked by the
// HARNESSES that drive a botted run (the campaign simulator and the app's
// `?bot=` autoplay), exactly like `autoEquipBest`. The predicates are pure so
// `macro.ts` can read them for movement (walk to the stall when a visit pays).
//
// It also owns the POCKET ARSENAL: a blade hero deals ZERO damage whenever
// his blade can't land — airborne (step/ holsters melee above
// JUMP.dodgeHeight), closing on a pack still out of arm's reach, walking off
// to fetch loot with mobs pot-shot distance away. So the bot banks one RANGED
// and one MAGIC weapon in the bag at all times and swaps hands to whatever
// maximizes damage THIS moment: the blade when a body is in blade reach, the
// pocket shot everywhere else a target presents itself (see
// `stepBotWeaponSwap`) — extra damage bought with two bag cells. It also
// keeps the bag SORTED like the powerup dock (`sortBotInventory`): pockets up
// front, then the loot by preciousness, so a glance (or a bag hotkey) always
// finds the good stuff in the same place.

import { distance } from "@game/lib/vec.ts";
import {
  autoEquipBest,
  canEquip,
  equipFromInventory,
  equipmentMaxDurability,
  isScrappableLoot,
  isWeaponBroken,
  repairAllCost,
  setSpellSlot,
  unlockedSpellIds,
  weaponCooldownFor,
  weaponDps,
  weaponRangeFor,
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
import { JUMP } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { weaponDef } from "../defs/equipment.ts";
import { SPELL_SLOTS, spellDef } from "../defs/spells.ts";
import type { SpellDef } from "../defs/spells.ts";
import type { Equipment, GameState, MerchantStock } from "../types.ts";

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
  const w = state.player.equipment.weapon;
  if (w.defId === "blaster") return true; // dumped onto the fallback sidearm
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
  const keep = new Set(botPocketKeepIndices(state));
  const inv = state.player.inventory;
  let n = 0;
  for (let i = 0; i < inv.length; i++) {
    const cell = inv[i];
    if (cell && !keep.has(i) && isScrappableLoot(state, cell)) n++;
  }
  return n;
}

/**
 * BAG DISCIPLINE: keep {@link BOT_BAG_KEEP_FREE} cell(s) open by dropping the
 * bag's obviously-bad pieces, worst first — the least-valuable OUTGROWN item
 * (lowest `sellValue` among `isScrappableLoot`) goes over the shoulder until a
 * slot is free. Keepers are never dropped: specials (uniques/sets/legendaries,
 * gate keys, passive trinkets), upgrades and side-grades all stay, the bot's
 * POCKET SHOOTERS stay ({@link botPocketKeepIndices} — the jump-shot weapons a
 * blade hero banks on purpose), and the junk that survives the cull stays too
 * — it is the merchant fodder the hero carries to the counter. A bag full of
 * nothing but keepers stays full (a human doesn't trash a unique for pocket
 * room either). Returns the dropped pieces. Called by the bot harnesses each
 * tick; cheap when a slot is already open.
 */
export function cullWorstLoot(state: GameState): Equipment[] {
  const inv = state.player.inventory;
  const dropped: Equipment[] = [];
  let free = 0;
  for (const cell of inv) {
    if (cell === null) free++;
  }
  if (free >= BOT_BAG_KEEP_FREE) return dropped;
  const keep = new Set(botPocketKeepIndices(state));
  while (free < BOT_BAG_KEEP_FREE) {
    let worst = -1;
    let worstWorth = Infinity;
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item || keep.has(i) || !isScrappableLoot(state, item)) continue;
      const worth = sellValue(item);
      if (worth < worstWorth) {
        worstWorth = worth;
        worst = i;
      }
    }
    if (worst < 0) break; // nothing but keepers — a full bag of value stands
    dropped.push(inv[worst] as Equipment);
    inv[worst] = null;
    free++;
  }
  return dropped;
}

// ---- The POCKET ARSENAL (damage-maximizing weapon swap) -------------------------

/** How near a live boss/elite must be (world px) for the pocket shot to prize
 * one hard-hitting round (`weaponDps`, per-target) over crowd-credited value
 * (`weaponScore`) — the "we are meeting a boss, bring the single-target gun"
 * read. Sized a little past a boss arena's engagement ring. */
const POCKET_BOSS_RADIUS = 340;

/** Minimum gap (sim ms) between the swap system's HAND CHANGES, so a foe
 * dancing on the blade-reach line can't make the hero juggle weapons every
 * tick. Short enough that a real transition (closing from shot range into
 * blade range) still feels instant; the airborne draw bypasses it (a hop's
 * whole window is shorter than this). */
const SWAP_COOLDOWN_MS = 400;

/** How far past the blade's own reach a body may stand before the blade hero
 * puts the blade away again (the sticky exit band of the melee hold): drawn
 * at `reach`, pocketed at `reach × MELEE_STICK`, so the hand doesn't flap on
 * a foe orbiting the boundary. */
const MELEE_STICK = 1.5;

/** The pocket CANDIDATES: RANGED and MAGIC weapons banked in the bag — the
 * projectile classes an airborne (or out-of-arm's-reach) hero can still hurt
 * something with (step/ holsters melee above `JUMP.dodgeHeight`). Broken,
 * under-leveled, or under-statted pieces are passed over (`canEquip`). */
function pocketCandidates(
  state: GameState,
): { index: number; item: Equipment }[] {
  const out: { index: number; item: Equipment }[] = [];
  const inv = state.player.inventory;
  for (let index = 0; index < inv.length; index++) {
    const item = inv[index];
    if (!item || item.slot !== "weapon") continue;
    const def = weaponDef(item.defId);
    if ((def.class !== "ranged" && def.class !== "magic") || !def.projectile) {
      continue;
    }
    if (!canEquip(state, item)) continue;
    out.push({ index, item });
  }
  return out;
}

/** Does the bag hold ANY drawable pocket shot? The pure read `fight.ts` gates
 * its forward reposition-hops on: a blade hero with a pocket banked keeps
 * dealing damage mid-air (the swap draws it at the top of the hop), so the
 * "an airborne melee blade is dead weight" rule stops applying to him. */
export function hasPocketShooter(state: GameState): boolean {
  return pocketCandidates(state).length > 0;
}

/**
 * The bag cell holding the best pocket shooter FOR THIS MOMENT, or -1 with
 * nothing worth drawing. The pick is context-aware — the "which magic (or
 * ranged) weapon serves best" logic: with a boss/elite inside
 * {@link POCKET_BOSS_RADIUS} it ranks by single-target `weaponDps` (a spread
 * gun's pellets are wasted on one big body), otherwise by the crowd-credited
 * `weaponScore` (the damage-budget model's AoE realization). A candidate only
 * counts when a live foe stands inside its reach — drawing a gun with nobody
 * to shoot is churn, not damage.
 */
export function botPocketShooterIndex(state: GameState): number {
  const player = state.player;
  let bossNear = false;
  for (const enemy of state.enemies) {
    const role = enemyDef(enemy.defId).role;
    if (role !== "boss" && role !== "elite") continue;
    if (distance(player.pos, enemy.pos) <= POCKET_BOSS_RADIUS) {
      bossNear = true;
      break;
    }
  }
  let best = -1;
  let bestValue = -Infinity;
  for (const { index, item } of pocketCandidates(state)) {
    const range = weaponRangeFor(state, item);
    if (!state.enemies.some((e) => distance(player.pos, e.pos) <= range)) {
      continue;
    }
    const value = bossNear ? weaponDps(state, item) : weaponScore(state, item);
    if (value > bestValue) {
      bestValue = value;
      best = index;
    }
  }
  return best;
}

/** The hero's MAIN weapon — the strongest he owns (hand + bag, ranked by the
 * build-aware `weaponScore`), with the bag cell it sits in (-1 = in hand).
 * Stable across the swap system's hand changes, when the blade rides the bag
 * and a pocket gun rides the hand. */
function bestOwnedWeapon(state: GameState): { item: Equipment; index: number } {
  const inv = state.player.inventory;
  let item = state.player.equipment.weapon;
  let index = -1;
  let bestScore = weaponScore(state, item);
  for (let i = 0; i < inv.length; i++) {
    const cell = inv[i];
    if (!cell || cell.slot !== "weapon" || !canEquip(state, cell)) continue;
    const score = weaponScore(state, cell);
    if (score > bestScore) {
      bestScore = score;
      item = cell;
      index = i;
    }
  }
  return { item, index };
}

/**
 * Bag cells the bot's bag discipline SPARES for the pocket arsenal — the
 * "keep one ranged and one magic item in the bag at all times" rule. Spared,
 * whatever their raw numbers read against the hand: the best banked RANGED
 * weapon and the best banked MAGIC weapon (each by the crowd-credited
 * `weaponScore`), the best SINGLE-TARGET shot overall (`weaponDps` — the
 * boss round, usually one of the former), and — while the swap system has
 * the blade riding the bag — the main weapon's own cell. Read by
 * {@link cullWorstLoot} and {@link tradeAtMerchant} so neither the field
 * cull nor the counter sell-run eats the pocket.
 */
export function botPocketKeepIndices(state: GameState): number[] {
  const keep = new Set<number>();
  const main = bestOwnedWeapon(state);
  if (main.index >= 0) keep.add(main.index); // the stashed main, mid-swap
  let ranged = -1;
  let rangedValue = -Infinity;
  let magic = -1;
  let magicValue = -Infinity;
  let single = -1;
  let singleValue = -Infinity;
  for (const { index, item } of pocketCandidates(state)) {
    const cls = weaponDef(item.defId).class;
    const score = weaponScore(state, item);
    if (cls === "ranged" && score > rangedValue) {
      rangedValue = score;
      ranged = index;
    } else if (cls === "magic" && score > magicValue) {
      magicValue = score;
      magic = index;
    }
    const dps = weaponDps(state, item);
    if (dps > singleValue) {
      singleValue = dps;
      single = index;
    }
  }
  if (ranged >= 0) keep.add(ranged);
  if (magic >= 0) keep.add(magic);
  if (single >= 0) keep.add(single);
  return [...keep];
}

/** The slice of bot memory the swap system writes: when the hand last
 * changed, for the anti-juggle cooldown. Structural, so `state.ts` needs no
 * import from here — the `Bot` type carries the field. */
export type SwapMemory = { lastSwapMs?: number };

/** Swap the hand to bag cell `index`, carrying the attack clock across: the
 * new hand inherits the shorter of the carried wait and its own full
 * cooldown, so juggling weapons never mints free shots (the UI's
 * `equipFromInventory` zeroes it — instant gratification for a hand-picked
 * swap; the bot, swapping every fight, plays fair). */
function swapHand(bot: SwapMemory, state: GameState, index: number): boolean {
  const player = state.player;
  const carried = player.weaponCooldownMs;
  if (!equipFromInventory(state, index)) return false;
  player.weaponCooldownMs = Math.min(
    carried,
    weaponCooldownFor(state, player.equipment.weapon),
  );
  bot.lastSwapMs = state.stats.timeMs;
  return true;
}

/**
 * THE WEAPON-SWAP SYSTEM — a harness-side action (like `autoEquipBest`,
 * called each tick by the campaign sim and the app's autoplay, never from
 * the pure `botAct`): keep the hand on whatever maximizes damage THIS
 * moment. A blade hero swings the blade when a body stands in blade reach —
 * nothing out-damages it there — but the blade deals ZERO damage everywhere
 * else, so out of reach (closing on a pack, kiting, walking off to fetch
 * loot) and through every airborne frame (step/ holsters melee above
 * `JUMP.dodgeHeight`) the hand holds the pocket shot instead
 * ({@link botPocketShooterIndex} — boss near: the single-target round;
 * otherwise the crowd shot). A shooter build never swaps — its gun already
 * fires in every stance. The bot simply manipulates the inventory — no UI,
 * the same `equipFromInventory` a player's bag hotkey drives — with the
 * attack clock carried across so the juggle never mints free shots, and a
 * {@link SWAP_COOLDOWN_MS} anti-flap gap (the airborne draw bypasses it — a
 * hop's window is shorter than the gap). Returns whether the hand changed
 * (so the app can refresh its HUD). Deterministic: memory lives on the bot,
 * keyed off pure state, exactly like the rest of the bot's latches.
 */
export function stepBotWeaponSwap(bot: SwapMemory, state: GameState): boolean {
  if (state.phase !== "playing") return false;
  const player = state.player;
  if (player.disarmed) return false;
  const main = bestOwnedWeapon(state);
  if (weaponDef(main.item.defId).projectile) return false; // shooter build
  const heldProjectile =
    weaponDef(player.equipment.weapon.defId).projectile !== undefined;
  const airborne = player.z > JUMP.dodgeHeight;
  // Nearest live body, against the MAIN blade's true reach (stat-widened, the
  // same distance stepWeapon lands swings at) with a sticky exit band.
  let nearest = Infinity;
  for (const enemy of state.enemies) {
    const d = distance(player.pos, enemy.pos);
    if (d < nearest) nearest = d;
  }
  const reach = weaponRangeFor(state, main.item);
  const wantBlade =
    !airborne && nearest <= reach * (heldProjectile ? 1 : MELEE_STICK);
  const coolingDown =
    bot.lastSwapMs !== undefined &&
    state.stats.timeMs - bot.lastSwapMs < SWAP_COOLDOWN_MS;
  if (wantBlade) {
    // A body in blade reach: nothing out-damages the blade — draw it.
    if (!heldProjectile || main.index < 0 || coolingDown) return false;
    return swapHand(bot, state, main.index);
  }
  // Out of blade business: hold the pocket shot while anything presents a
  // target, and go back to the blade when the field is empty (the idle hand).
  const pocket = botPocketShooterIndex(state);
  if (pocket >= 0) {
    if (heldProjectile || (coolingDown && !airborne)) return false;
    return swapHand(bot, state, pocket);
  }
  // Nothing to shoot: the blade is the resting hand (and the next fight
  // usually opens at reach). Never mid-air — the blade is dead weight there.
  if (heldProjectile && main.index >= 0 && !airborne && !coolingDown) {
    return swapHand(bot, state, main.index);
  }
  return false;
}

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
export function sortBotInventory(state: GameState): boolean {
  const inv = state.player.inventory;
  const items = inv.filter((cell): cell is Equipment => cell !== null);
  if (items.length === 0) return false;
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
  return changed;
}

// ---- The SPELL BAR (best unlocked powers, always) -------------------------------

/**
 * THE SPELL-BAR LOADOUT — a harness-side action (like `autoEquipBest`, called
 * each tick by the campaign sim and the app's autoplay, never from the pure
 * `botAct`): keep the {@link SPELL_SLOTS}-slot bar carrying the STRONGEST
 * powers the hero has unlocked. The app's own `autofillSpellSlots` only fills
 * EMPTY slots, so a bar that filled up at low stat keeps the ladder's weakest
 * four rungs forever while the capstones sit unlocked and unslotted — a human
 * re-slots the bar as they grow; this does it for the bot.
 *
 * The pick is the bot's damage-first doctrine: the strongest ATTACK (bolt) and
 * the strongest AOE (nova/rain) — the two damage schools its cast picker
 * (arsenal.ts `pickSpellToCast`) spends mana through — plus the strongest BUFF
 * (the martial classes' weapon amp, itself a damage multiplier) and the
 * strongest HEAL (the emergency exit when the medkits run dry), with any slots
 * left filled by the next-strongest damage spells. Within a school the ladder
 * ascends with its unlock stat, so "strongest" is the highest `minStat`.
 * Deterministic (pure state read + the same `setSpellSlot` mutator the picker
 * UI drives); a no-op when the bar already matches, so it's cheap every tick.
 * Returns whether the bar changed (so the app can refresh its HUD).
 */
export function botAssignSpellBar(state: GameState): boolean {
  const unlocked = unlockedSpellIds(state); // ascending by minStat
  if (unlocked.length === 0) return false;
  const defs = unlocked.map((id) => spellDef(id));
  const isDamage = (d: SpellDef) =>
    d.effect.kind === "bolt" ||
    d.effect.kind === "nova" ||
    d.effect.kind === "rain";
  // The strongest def of a school = the LAST match in the ascending list.
  const strongest = (pred: (d: SpellDef) => boolean): SpellDef | undefined => {
    for (let i = defs.length - 1; i >= 0; i--) {
      const def = defs[i] as SpellDef;
      if (pred(def)) return def;
    }
    return undefined;
  };
  const desired: string[] = [];
  const take = (def: SpellDef | undefined) => {
    if (def && desired.length < SPELL_SLOTS && !desired.includes(def.id)) {
      desired.push(def.id);
    }
  };
  take(strongest((d) => d.effect.kind === "bolt"));
  take(strongest((d) => d.effect.kind === "nova" || d.effect.kind === "rain"));
  take(strongest((d) => d.effect.kind === "buff"));
  take(strongest((d) => d.effect.kind === "heal"));
  // Any room left: the next-strongest damage spells, strongest first.
  for (let i = defs.length - 1; i >= 0 && desired.length < SPELL_SLOTS; i--) {
    const def = defs[i] as SpellDef;
    if (isDamage(def)) take(def);
  }
  // Reconcile — only touch the bar when the SET differs (order is cosmetic;
  // the cast picker scans every slot), so a settled bar costs nothing.
  const slots = state.player.spellSlots;
  const current = new Set(slots.filter((s): s is string => s !== null));
  if (
    current.size === desired.length &&
    desired.every((id) => current.has(id))
  ) {
    return false;
  }
  let changed = false;
  for (let i = 0; i < SPELL_SLOTS; i++) {
    const want = desired[i] ?? null;
    if (slots[i] !== want && setSpellSlot(state, i, want)) changed = true;
  }
  return changed;
}

/** Is a stall weapon on the counter that the hero could buy, wield, and that
 * genuinely beats what's in his hand? The "the walk would re-arm me" probe. */
function affordableStallUpgrade(state: GameState): boolean {
  const held = weaponScore(state, state.player.equipment.weapon);
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.sold) continue;
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
  if (state.player.inventory.some((c) => c !== null && isWeaponBroken(c))) {
    return true;
  }
  const w = state.player.equipment.weapon;
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
  if (state.player.repairKits === 0 && kitWornOut(state)) {
    const cost = repairAllCost(state);
    if (cost > 0 && state.player.coins >= cost) return true;
  }
  return false;
}

/**
 * How precious a powerup is to the bot — its one ranking of the whole ability
 * catalog, shared by the stall (buy the best first) and the field play
 * (arsenal.ts `pickPowerupMoment`/`pickPowerupBurn`: save the best for its moment, burn the cheapest
 * for shelf space). The NUKE tops it (a banked bomb changes how bravely the
 * bot can play — see arsenal.ts `hasNukeBanked`); the STORM out-damages the ORBIT
 * ring; the STASIS slow and the MAGNET's convenience pull bring up the rear.
 * An unknown future kind lands mid-table, treated like a combat power.
 */
export function abilityValue(defId: string): number {
  switch (abilityDef(defId).kind) {
    case "nuke":
      return 4;
    case "storm":
      return 3;
    case "orbit":
      return 2;
    case "stasis":
      return 1;
    case "magnet":
      return 0;
    default:
      return 2;
  }
}

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
  const inv = state.player.inventory;
  const keep = new Set(botPocketKeepIndices(state));
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (item && !keep.has(i) && isScrappableLoot(state, item)) {
      sellItem(state, i);
    }
  }
  // BUY the single best wieldable weapon upgrade the purse covers.
  let bestId = -1;
  let bestScore = weaponScore(state, state.player.equipment.weapon);
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.sold) continue;
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
  // POWERUPS with the spare coins — most precious first (abilityValue) —
  // keeping a reserve big enough to pay for the kit's next mend. `buyStock`
  // restocks abilities, so keep buying a useful one until the purse (or the
  // carry cap) says stop.
  const reserve = repairAllCost(state);
  const powerups = state.merchant.stock
    .filter(
      (e): e is Extract<MerchantStock, { kind: "ability" }> =>
        e.kind === "ability",
    )
    .sort((a, b) => abilityValue(b.defId) - abilityValue(a.defId));
  for (const entry of powerups) {
    while (
      state.player.coins - entry.price >= reserve &&
      buyStock(state, entry.id)
    ) {
      // keep stocking up while it pays
    }
  }
  closeShop(state);
  // Wear the purchase (and anything freed by the mend) on the spot.
  autoEquipBest(state);
  return true;
}
