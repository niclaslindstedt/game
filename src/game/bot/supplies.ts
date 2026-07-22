// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's SUPPLY SENSE: which ground pickups are worth wanting (the
// GPS-disciplined loot detours, the golden-arrow reads and the learned arrow
// worth, the repair-kit stocking cycle, the pass-over top-off reach) and the
// BRAVERY gauge — how boldly the stamina pool gets spent, judged off recent
// kill power and the depth of the pockets. Pure reads of the GameState; the
// only mutations are the bot's own bravery/arrow memories, so botted runs
// stay deterministic.

import { clamp, distance } from "@game/lib/vec.ts";
import { canBankAbility, magnetRadius } from "../abilities.ts";
import { abilityValue } from "./economy.ts";
import { travelHeading } from "./macro.ts";
import { THREAT_RADIUS } from "./perception.ts";
import type { Bot } from "./state.ts";
import type { BotTuning } from "./tuning.ts";
import { CONSUMABLES, PLAYER } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { levelDef } from "../defs/levels/index.ts";
import {
  canCollectEquipment,
  equipmentMaxDurability,
  isWeaponBroken,
  medkitTierIndex,
  weaponDamageFor,
} from "../items/index.ts";
import { blockedByObstacle } from "../obstacles.ts";
import type { Equipment, GameState, Item } from "../types.ts";

/** Bots pop a medkit once health falls below this fraction of the bar. */
export const HEAL_HP_FRAC = 0.55;
/** Top up stamina when the pool dips below this AND a threat is near — a winded
 * hero (empty pool) is capped to a jog and gets run down. */
export const STAMINA_TOPUP_FRAC = 0.3;
/** How near a pickup must be to be worth a detour. */
export const ITEM_REACH = 240;
/** PASS-OVER TOP-OFF reach (world px): a capped consumable is spent-to-refill
 * only when the same kind lies basically underfoot — the switch happens in
 * passing, never as a detour (capped supplies are very low priority). A
 * running MAGNET widens this to its pull radius: everything inside is coming
 * to the hero anyway (see {@link topOffReach}). */
const TOP_OFF_REACH = 56;

/** The pass-over top-off's live reach: the underfoot {@link TOP_OFF_REACH},
 * widened to a running MAGNET's INT-scaled pull radius — everything inside
 * the ring is being reeled in, so the stack can be opened for each item the
 * pull is about to land. Pure read of the running abilities. */
export function topOffReach(state: GameState): number {
  let reach = TOP_OFF_REACH;
  for (const ability of state.player.abilities) {
    const def = abilityDef(ability.defId);
    if (def.magnet) reach = Math.max(reach, magnetRadius(state, def));
  }
  return reach;
}

// === BRAVERY — how boldly the pool gets spent ===

/** The recent-performance window the bravery read looks back over (ms). */
const BRAVERY_WINDOW_MS = 60_000;
/** Cadence of the bravery damage samples (ms) — sparse, so the trail stays
 * ~30 entries deep over the whole window. */
const BRAVERY_SAMPLE_MS = 2_000;
/** A single blow stripping this fraction of the average local health bar
 * reads as FULLY brave on the weapon axis. */
const BRAVE_BLOW_BAR_FRAC = 0.5;
/** Shredding this many average health bars per second over the recent window
 * reads as FULLY brave on the performance axis. */
const BRAVE_BARS_PER_SEC = 1;
/** Medkits in the pockets that read as a full safety net. */
const BRAVE_MEDKITS = 3;
/** Stamina potions in the pockets that read as a full sprint reserve. */
const BRAVE_STAMINA_POTS = 3;
/** Banked powerup VALUE ({@link abilityValue} summed) that reads as a full
 * emergency arsenal — a nuke (4) plus a storm (3) covers it. */
const BRAVE_POWERUP_VALUE = 6;
/** At FULL bravery the pre-fight top-up settles for this fraction of the pool
 * instead of demanding 100% — a shredder doesn't idle for the last drops. */
export const TOPUP_BRAVE_MIN_FRAC = 0.7;

/**
 * Keep the bravery damage trail fresh: a sparse (timeMs, damageDealt) sample
 * every {@link BRAVERY_SAMPLE_MS}, pruned to {@link BRAVERY_WINDOW_MS} — the
 * "how hard have I been hitting lately" memory {@link braveryScore} reads.
 */
export function trackBravery(bot: Bot, state: GameState): void {
  bot.bravery ??= { samples: [] };
  const samples = bot.bravery.samples;
  const t = state.stats.timeMs;
  const last = samples[samples.length - 1];
  if (!last || t - last.t >= BRAVERY_SAMPLE_MS) {
    samples.push({ t, dmg: state.stats.damageDealt });
  }
  while (samples.length > 0 && t - samples[0]!.t > BRAVERY_WINDOW_MS) {
    samples.shift();
  }
}

/**
 * How BRAVE the hero can afford to be right now, 0 (naked rookie on a starter
 * blade) to 1 (kitted shredder) — the read that slides the stamina reserve
 * floor and relaxes the pre-fight top-up. A human spends the pool freely when
 * the run is going well and hoards it when it isn't, judged off:
 *   • KILL POWER (half the score): the better of (a) how much of the average
 *     LOCAL health bar one blow of the held weapon strips
 *     ({@link BRAVE_BLOW_BAR_FRAC}) and (b) how many bars per second he has
 *     ACTUALLY shredded over the last minute ({@link BRAVE_BARS_PER_SEC},
 *     off the {@link trackBravery} trail) — so a proven massacre reads brave
 *     even on a modest weapon, and a fresh monster of a weapon reads brave
 *     before its first swing. An empty field reads fully brave (nothing to
 *     fear).
 *   • SUPPLIES (the other half): medkits, stamina potions, and banked
 *     powerup value — the deeper the pockets, the deeper the pool can dip,
 *     since a mistake can be paid for.
 * Pure (state + the bot's own trail), so determinism holds.
 */
export function braveryScore(bot: Bot, state: GameState): number {
  const player = state.player;
  let barSum = 0;
  let barN = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    barSum += enemy.maxHp;
    barN++;
  }
  const meanBar = barN > 0 ? barSum / barN : 0;
  let killPower = 1; // an empty field — nothing to fear
  if (meanBar > 0) {
    const blow = weaponDamageFor(state, player.equipment.weapon);
    const blowPower = clamp(blow / (meanBar * BRAVE_BLOW_BAR_FRAC), 0, 1);
    let recentPower = 0;
    const samples = bot.bravery?.samples ?? [];
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (first && last && last.t - first.t >= 5_000) {
      const dps = (last.dmg - first.dmg) / ((last.t - first.t) / 1000);
      recentPower = clamp(dps / (meanBar * BRAVE_BARS_PER_SEC), 0, 1);
    }
    killPower = Math.max(blowPower, recentPower);
  }
  const medkits = player.medkits.reduce((sum, n) => sum + n, 0);
  // A DINGING golden arrow in the local ring is a banked full heal (the
  // level-up restores hp and stamina — see Bot.arrowXp): with one close by
  // the hero can afford to fight braver, so it credits the safety net like a
  // couple of pocketed kits.
  const arrowHeals = dingArrowNearby(bot, state, THREAT_RADIUS) ? 2 : 0;
  const powerupValue = player.heldAbilities.reduce(
    (sum, id) => sum + abilityValue(id),
    0,
  );
  return clamp(
    0.5 * killPower +
      0.2 * Math.min(1, (medkits + arrowHeals) / BRAVE_MEDKITS) +
      0.15 * Math.min(1, player.staminaPotions / BRAVE_STAMINA_POTS) +
      0.15 * Math.min(1, powerupValue / BRAVE_POWERUP_VALUE),
    0,
    1,
  );
}

/** The bravery-slid stamina reserve floor: the timid `walkStaminaFrac` at
 * bravery 0, `walkBraveFloorFrac` at bravery 1. */
export function reserveFloorFrac(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): number {
  const bravery = braveryScore(bot, state);
  return (
    tune.walkBraveFloorFrac +
    (tune.walkStaminaFrac - tune.walkBraveFloorFrac) * (1 - bravery)
  );
}

/** Below this fraction of its max durability the held weapon is "nearly spent"
 * — worth SPENDING a held repair kit before it breaks mid-fight. */
const REPAIR_DURABILITY_FRAC = 0.2;

/** Below this (looser) fraction the held weapon is "wearing thin" — worth going
 * out of the way to SCOOP a repair kit off the ground now, so one is in hand
 * before the blade actually gives out. Higher than the spend threshold so the
 * hero stocks the kit early, then spends it late (`REPAIR_DURABILITY_FRAC`). */
const REPAIR_SEEK_FRAC = 0.45;

/** Is a spent weapon (durability 0) sitting in the bag, shed there when it broke
 * out of the hand — waiting on a repair kit to wake it? */
function hasBrokenBagWeapon(state: GameState): boolean {
  return state.player.inventory.some(
    (cell) => cell !== null && isWeaponBroken(cell),
  );
}

/** The held weapon's remaining wear as a fraction of its full budget (1 = fresh,
 * 0 = about to break), or 1 for the unbreakable sidearm — the "how spent is my
 * blade" gauge the repair heuristics read. */
function weaponWearFrac(state: GameState): number {
  const weapon = state.player.equipment.weapon;
  if (weapon.durability === undefined) return 1; // unbreakable sidearm
  const max = equipmentMaxDurability(weapon);
  return max > 0 ? weapon.durability / max : 1;
}

/** Is there anything a repair kit would meaningfully mend right now — a broken
 * weapon shed into the bag, or a held weapon worn down near breaking? */
export function needsRepair(state: GameState): boolean {
  if (hasBrokenBagWeapon(state)) return true;
  return weaponWearFrac(state) <= REPAIR_DURABILITY_FRAC;
}

/** Is there ANY wear a repair kit would mend — a worn or broken piece anywhere
 * in the loadout (held weapon, worn armor, bag spares)? Looser than
 * {@link needsRepair} (which waits for a weapon near breaking): this is the
 * pass-over TOP-OFF's gate, where a free refill is on the ground and even
 * light wear makes the spend worthwhile. Mirrors what `repairAll` touches. */
export function hasWear(state: GameState): boolean {
  const p = state.player;
  const worn = (piece: Equipment | null): boolean => {
    if (!piece || piece.durability === undefined) return false;
    const max = equipmentMaxDurability(piece);
    return max > 0 && piece.durability < max;
  };
  if (worn(p.equipment.weapon)) return true;
  if (
    worn(p.equipment.head) ||
    worn(p.equipment.chest) ||
    worn(p.equipment.legs) ||
    worn(p.equipment.feet)
  )
    return true;
  return p.inventory.some((cell) => worn(cell));
}

/** Should the bot go pick up a repair kit? Only when it holds NONE (a kit on
 * hand is spent via {@link needsRepair}, not hoarded) AND its weapon is wearing
 * thin or a broken spare waits in the bag — the "stock a kit before the blade
 * gives out" read that makes the downgrade → repair → re-equip cycle work. */
export function wantsRepairKitPickup(state: GameState): boolean {
  if (state.player.repairKits > 0) return false;
  return hasBrokenBagWeapon(state) || weaponWearFrac(state) <= REPAIR_SEEK_FRAC;
}

/** The nearest grounded REPAIR-KIT pickup, or undefined when none is on the
 * field — the detour target for {@link wantsRepairKitPickup}. */
export function nearestRepairKit(state: GameState): Item | undefined {
  let best: Item | undefined;
  let bestD = Infinity;
  for (const item of state.items) {
    if (item.kind !== "repair") continue;
    const d = distance(item.pos, state.player.pos);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}

/** Whether a touched pickup would actually BANK right now — the same stack-cap
 * gates the engine's pickup pass applies (step/). A full stack turns the
 * pickup away (it stays on the ground), so steering at one parks the hero ON
 * an item he can never collect, standing there forever (measured: the
 * full-pockets stall). A capped kind is simply not wanted until one is spent. */
function canBankPickup(state: GameState, item: Item): boolean {
  const player = state.player;
  switch (item.kind) {
    case "medkit":
      return (
        (player.medkits[medkitTierIndex(item.tier)] ?? 0) < CONSUMABLES.stackCap
      );
    case "repair":
      return player.repairKits < CONSUMABLES.stackCap;
    case "drink":
      return player.staminaPotions < CONSUMABLES.stackCap;
    case "mana":
      return player.manaPotions < CONSUMABLES.stackCap;
    case "ability":
      return canBankAbility(state, item.defId);
    default:
      return true;
  }
}

/** The nearest ground pickup WORTH walking to: skips a mercy drop still being
 * flown in (not collectable yet), equipment the hero couldn't keep (bag full
 * and no upgrade — see `canCollectEquipment`), a consumable whose stack is
 * already full (the pickup would be refused and the hero would stand on it —
 * see {@link canBankPickup}), and — crucially — anything his
 * body can't sweep STRAIGHT to (a drop scattered into/behind a wall): steering
 * at a walled-off item ground the sweep into a grab → wedge → unstick loop for
 * whole minutes (measured; it was a dominant cause of runs never reaching the
 * boss). A walled drop is simply not wanted — the route will pass it or it
 * stays where it lies. */
export function nearestWantedItem(state: GameState): Item | undefined {
  let best: Item | undefined;
  let bestD = Infinity;
  for (const item of state.items) {
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (
      item.kind === "equipment" &&
      !canCollectEquipment(state, item.equipment)
    )
      continue;
    if (!canBankPickup(state, item)) continue;
    const d = distance(item.pos, state.player.pos);
    if (d >= bestD) continue;
    if (blockedByObstacle(state, state.player.pos, item.pos, PLAYER.radius))
      continue;
    best = item;
    bestD = d;
  }
  return best;
}

/** Are this map's GOLDEN ARROWS still WARM — the hero under the rung's arrow
 * XP cap (`arrowCapByDifficulty`)? A warm arrow pays a real share of the
 * current level's XP bar (the catch-up faucet), so it outranks every other
 * ground pickup; past the cap it goes cold (a sliver) and drops back to
 * ordinary loot. A rung with no cap entry never goes cold. */
function arrowsWarm(state: GameState): boolean {
  const cap = levelDef(state.level.id).loot.arrowCapByDifficulty?.[
    state.difficulty
  ];
  return cap === undefined || state.player.level < cap;
}

/** The nearest collectable GOLDEN ARROW within `reach` the body can
 * sweep straight to — the "level up now" pickup {@link wantedItemNearby} puts
 * ahead of everything else while the arrows are warm. */
function nearestXpArrow(
  state: GameState,
  reach: number = ITEM_REACH,
): Item | undefined {
  let best: Item | undefined;
  let bestD = reach;
  for (const item of state.items) {
    if (item.kind !== "xp") continue;
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    const d = distance(item.pos, state.player.pos);
    if (d >= bestD) continue;
    if (blockedByObstacle(state, state.player.pos, item.pos, PLAYER.radius))
      continue;
    best = item;
    bestD = d;
  }
  return best;
}

/**
 * Keep the LEARNED arrow worth fresh: whenever this tick's events carry a
 * collected GOLDEN ARROW's "+N XP" figure, remember what share of the XP bar
 * it paid, rounded to 5% increments (see {@link Bot.arrowXp}). A step whose
 * events also carry a level-up is skipped — the bar itself changed under the
 * award, so the ratio is unreadable that tick (the next arrow re-teaches it).
 * Reads only `state.events` + the bot's own memory, so determinism holds.
 */
export function trackArrowXp(bot: Bot, state: GameState): void {
  let award: number | undefined;
  for (const event of state.events) {
    if (event.type === "levelUp") return; // bar replaced mid-step — unreadable
    if (event.type === "itemCollected" && event.kind === "xp") {
      award = event.xp ?? award;
    }
  }
  if (award === undefined) return;
  const share = award / Math.max(1, state.player.xpToNext);
  bot.arrowXp = {
    pct: clamp(Math.round(share * 20) / 20, 0, 1),
    level: state.player.level,
  };
}

/**
 * A GOLDEN ARROW within `reach` that would DING — push the hero over the
 * level-up line, by the bot's LEARNED read of what an arrow pays
 * ({@link Bot.arrowXp}) — or undefined. A ding is a free FULL HEAL (grantXp
 * refills hp and stamina on level-up), so a dinging arrow nearby is a
 * strategic resource: it substitutes for a medkit and buys bravery. Nothing
 * fires before the first arrow has taught its worth, and cold arrows teach
 * ~0%, which disables the read on outgrown maps.
 */
export function dingArrowNearby(
  bot: Bot,
  state: GameState,
  reach: number,
): Item | undefined {
  const learned = bot.arrowXp;
  if (!learned || learned.pct <= 0) return undefined;
  if (!arrowsWarm(state)) return undefined;
  const player = state.player;
  if (player.xpToNext - player.xp > learned.pct * player.xpToNext)
    return undefined; // an arrow would not tip the bar
  return nearestXpArrow(state, reach);
}

/** An item this close (world px) is stooped for freely — drops land where the
 * fight happened, so the ring around the hero costs no real detour. */
const ITEM_CLOSE_REACH = 120;

/** A farther loot detour (out to {@link ITEM_REACH}) must not pull the hero
 * BACKWARD off the GPS heading: minimum dot of the item bearing against the
 * route heading. −0.2 allows anything up to ~100° off-route (sideways scoops
 * are fine) and refuses walking away from the destination — the discipline
 * that stops a loot-rich field from yanking the march around in circles. */
const ITEM_DETOUR_MIN_ALONG = -0.2;

/** The nearest wanted ground pickup worth a detour NOW, GPS-disciplined: a
 * WARM golden arrow first at any reach (a share of the level bar beats any
 * other pickup — see {@link arrowsWarm}), then a
 * close drop ({@link ITEM_CLOSE_REACH}) is always grabbed, and EQUIPMENT (and
 * story pieces) at any reach — a gear upgrade is worth any detour. A farther
 * CONSUMABLE only if it doesn't drag the hero backward off the current route
 * heading ({@link ITEM_DETOUR_MIN_ALONG}) — it's the endless scatter of
 * medkit/drink drops on a loot-rich field that yanks the march around in
 * circles, not the rare gear. The emergency medkit grab bypasses this and
 * uses {@link nearestWantedItem} directly — bleeding out beats making time. */
export function wantedItemNearby(
  bot: Bot,
  state: GameState,
  tune: BotTuning,
): Item | undefined {
  if (arrowsWarm(state)) {
    const arrow = nearestXpArrow(state);
    if (arrow) return arrow;
  }
  const item = nearestWantedItem(state);
  if (!item) return undefined;
  const d = distance(item.pos, state.player.pos);
  if (d > ITEM_REACH) return undefined;
  if (d <= ITEM_CLOSE_REACH) return item;
  if (item.kind === "equipment" || item.kind === "story") return item;
  const heading = travelHeading(bot, state, tune);
  if (!heading) return item;
  const ax = (item.pos.x - state.player.pos.x) / d;
  const ay = (item.pos.y - state.player.pos.y) / d;
  const along = ax * heading.x + ay * heading.y;
  return along >= ITEM_DETOUR_MIN_ALONG ? item : undefined;
}
