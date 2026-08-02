// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's SUPPLY SENSE: which ground pickups are worth wanting (the
// GPS-disciplined loot detours, the XP-scroll reads, the repair-kit stocking
// cycle, the pass-over top-off reach) and the BRAVERY gauge — how boldly the
// stamina pool gets spent, judged off recent kill power and the depth of the
// pockets. Pure reads of the GameState; the only mutations are the bot's own
// bravery memories, so botted runs stay deterministic.

import { clamp, distance } from "@game/lib/vec.ts";
import { canBankAbility, magnetRadius } from "../abilities.ts";
import { abilityValue } from "./economy.ts";
import { questTokenWanted } from "./errands.ts";
import { insideWellPull } from "./nav.ts";
import { travelHeading } from "./macro.ts";
import type { Bot } from "./state.ts";
import type { BotTuning } from "./tuning.ts";
import { AMMO, CONSUMABLES, PLAYER } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import {
  ammoCount,
  canCollectEquipment,
  equipmentMaxDurability,
  isWeaponBroken,
  medkitTierIndex,
  weaponDamageFor,
} from "../items/index.ts";
import { xpScrollDurationMs } from "../leveling.ts";
import { blockedByObstacle } from "../obstacles.ts";
import type { Equipment, GameState, Item, Player } from "../types/index.ts";
import { inertEnemy } from "../disposition.ts";

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
export function topOffReach(state: GameState, hero: Player): number {
  let reach = TOP_OFF_REACH;
  for (const ability of hero.abilities) {
    const def = abilityDef(ability.defId);
    if (def.magnet) reach = Math.max(reach, magnetRadius(state, hero, def));
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
 * blade) to 1 (kitted shredder) — the read that relaxes the pre-fight top-up's
 * rested bar (see fight.ts `topUpBeforeFight`; the run/walk pacing threshold
 * itself is FIXED — `walkStaminaFrac` — bravery never overrides the stamina
 * discipline). A human settles for a partial pool before an easy fight and
 * demands a full one before a scary one, judged off:
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
export function braveryScore(bot: Bot, state: GameState, hero: Player): number {
  const player = hero;
  let barSum = 0;
  let barN = 0;
  for (const enemy of state.enemies) {
    if (inertEnemy(enemy)) continue;
    barSum += enemy.maxHp;
    barN++;
  }
  const meanBar = barN > 0 ? barSum / barN : 0;
  let killPower = 1; // an empty field — nothing to fear
  if (meanBar > 0) {
    const blow = weaponDamageFor(state, player, player.equipment.weapon);
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
  const powerupValue = player.heldAbilities.reduce(
    (sum, id) => sum + abilityValue(id),
    0,
  );
  return clamp(
    0.5 * killPower +
      0.2 * Math.min(1, medkits / BRAVE_MEDKITS) +
      0.15 * Math.min(1, player.staminaPotions / BRAVE_STAMINA_POTS) +
      0.15 * Math.min(1, powerupValue / BRAVE_POWERUP_VALUE),
    0,
    1,
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
function hasBrokenBagWeapon(state: GameState, hero: Player): boolean {
  return hero.inventory.some((cell) => cell !== null && isWeaponBroken(cell));
}

/** The held weapon's remaining wear as a fraction of its full budget (1 = fresh,
 * 0 = about to break), or 1 for the unbreakable sidearm — the "how spent is my
 * blade" gauge the repair heuristics read. */
function weaponWearFrac(state: GameState, hero: Player): number {
  const weapon = hero.equipment.weapon;
  if (weapon.durability === undefined) return 1; // unbreakable sidearm
  const max = equipmentMaxDurability(weapon);
  return max > 0 ? weapon.durability / max : 1;
}

/** Is there anything a repair kit would meaningfully mend right now — a broken
 * weapon shed into the bag, or a held weapon worn down near breaking? */
export function needsRepair(state: GameState, hero: Player): boolean {
  if (hasBrokenBagWeapon(state, hero)) return true;
  return weaponWearFrac(state, hero) <= REPAIR_DURABILITY_FRAC;
}

/** Is there ANY wear a repair kit would mend — a worn or broken piece anywhere
 * in the loadout (held weapon, worn armor, bag spares)? Looser than
 * {@link needsRepair} (which waits for a weapon near breaking): this is the
 * pass-over TOP-OFF's gate, where a free refill is on the ground and even
 * light wear makes the spend worthwhile. Mirrors what `repairAll` touches. */
export function hasWear(state: GameState, hero: Player): boolean {
  const p = hero;
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
export function wantsRepairKitPickup(state: GameState, hero: Player): boolean {
  if (hero.repairKits > 0) return false;
  return (
    hasBrokenBagWeapon(state, hero) ||
    weaponWearFrac(state, hero) <= REPAIR_SEEK_FRAC
  );
}

/** The nearest grounded REPAIR-KIT pickup, or undefined when none is on the
 * field — the detour target for {@link wantsRepairKitPickup}. */
export function nearestRepairKit(
  state: GameState,
  hero: Player,
): Item | undefined {
  let best: Item | undefined;
  let bestD = Infinity;
  for (const item of state.items) {
    if (item.kind !== "repair") continue;
    const d = distance(item.pos, hero.pos);
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
function canBankPickup(state: GameState, hero: Player, item: Item): boolean {
  const player = hero;
  switch (item.kind) {
    case "medkit":
      return (
        (player.medkits[medkitTierIndex(item.tier)] ?? 0) < CONSUMABLES.stackCap
      );
    case "repair":
      return player.repairKits < CONSUMABLES.stackCap;
    case "drink":
      return player.staminaPotions < CONSUMABLES.stackCap;
    case "ability":
      return canBankAbility(state, player, item.defId);
    // A box of AMMUNITION is the one pickup that PARTIALLY banks: a stack with
    // room for six of a twenty-round box takes six and the box stays on the
    // ground carrying the rest (`bankAmmo`). So the question is only whether
    // the stack has ANY room — at the cap the box is refused whole and steering
    // at it is the full-pockets stall this function exists to prevent.
    case "ammo":
      return ammoCount(player, item.ammo) < AMMO.stackCap;
    // A QUEST TOKEN banks only on an ACTIVE errand whose collect tally still
    // has room — the pickup pass refuses everything else (a leftover from a
    // failed or handed-in quest stays on the ground), so wanting one the
    // errand can't bank is the same full-pockets stall as a capped medkit.
    case "quest":
      return questTokenWanted(state, item);
    // AN XP SCROLL IS NEVER ORDINARY LOOT. It has its own read
    // ({@link wantedScrollNearby}) because whether it is worth walking to
    // depends on the FIGHT — is anything alive to double, is my own window
    // already running — and none of that is a question about pockets. Left in
    // the generic pool it would be scooped as "a close drop", which is exactly
    // the judgement the scroll model exists to make.
    case "xp":
      return false;
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
 * stays where it lies. A drop anywhere inside a gravity well's PULL is
 * skipped the same way (`insideWellPull`): the hole drags loose loot to its
 * rim from a screen away, so a wanted drop still SLIDING toward the core
 * walks the bot into the pull chasing it — measured as repeated core deaths
 * at the rift's chest-guard well. The rim hoard is a dare for players with
 * a dash; the bot has none. */
export function nearestWantedItem(
  state: GameState,
  hero: Player,
): Item | undefined {
  let best: Item | undefined;
  let bestD = Infinity;
  for (const item of state.items) {
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (insideWellPull(state, item.pos)) continue;
    if (
      item.kind === "equipment" &&
      !canCollectEquipment(state, hero, item.equipment)
    )
      continue;
    if (!canBankPickup(state, hero, item)) continue;
    const d = distance(item.pos, hero.pos);
    if (d >= bestD) continue;
    if (blockedByObstacle(state, hero.pos, item.pos, PLAYER.radius)) continue;
    best = item;
    bestD = d;
  }
  return best;
}

/** Is this map's XP still WORTH DOUBLING — the hero under the rung's intended
 * exit level (`intendedLevelByDifficulty`)? A scroll multiplies what the hero
 * earns, and on ground he has outgrown the per-map cap has already throttled
 * that to a trickle, so twice a trickle is not worth a detour. Under the level
 * it is the best pickup on the floor; past it a scroll drops back to ordinary
 * loot. A rung with no entry never goes cold. */
function scrollsWarm(state: GameState, hero: Player): boolean {
  const cap =
    runLevelDef(state).loot.intendedLevelByDifficulty?.[state.difficulty];
  return cap === undefined || hero.level < cap;
}

/** Is a fresh scroll worth walking to RIGHT NOW, or would it overwrite a window
 * that has most of its life left? A scroll REFRESHES rather than stacks, so
 * reading one at 25 of 30 seconds remaining throws almost the whole thing away
 * — the same judgement a human makes when he steps around one to come back for
 * it later. Under this share of the window left, the top-up is worth it. */
const SCROLL_REFRESH_FRAC = 0.4;

/**
 * How far out the bot looks for SOMETHING TO SPEND A WINDOW ON before it walks
 * to a scroll (world px). Deliberately far wider than the local pack radius:
 * thirty seconds is a long time and the hero crosses this well inside it, so
 * anything alive in here will be in the fight before the window runs out. This
 * is the whole difference between the scroll and the golden arrow it replaced —
 * an arrow paid the moment it was touched, so grabbing one was never wrong,
 * while a scroll read on an empty floor doubles thirty seconds of nothing.
 */
const SCROLL_FIGHT_RADIUS = 900;

/** A scroll THIS close is read whatever the field is doing — at arm's length it
 * costs no detour worth the name, and the alternative is stepping over free
 * value on the off-chance the floor stays empty. */
const SCROLL_FREE_REACH = 90;

/** Is anything still alive within {@link SCROLL_FIGHT_RADIUS} — is there a
 * fight for a window to double? Bystanders and downed apparitions don't count:
 * a room full of quest-givers is an empty room to a scroll. */
function foeWithinScrollReach(state: GameState, hero: Player): boolean {
  for (const enemy of state.enemies) {
    if (inertEnemy(enemy)) continue;
    if (distance(enemy.pos, hero.pos) <= SCROLL_FIGHT_RADIUS) return true;
  }
  return false;
}

/**
 * The nearest XP SCROLL worth READING right now, or undefined — the bot's whole
 * model of the item, and the reason it is not simply "the best pickup on the
 * floor". Three questions, in the order a human asks them:
 *
 *  1. Is this map's XP still worth doubling ({@link scrollsWarm})? Past the
 *     rung's intended exit level the per-map cap has already throttled the
 *     hero's income to a trickle, and twice a trickle is not worth a step.
 *  2. Is my own window spent ({@link SCROLL_REFRESH_FRAC})? A scroll refreshes
 *     rather than stacks, so reading a second one at 25 of 30 seconds left
 *     throws the difference away — leave it lying and come back.
 *  3. Is there anything to spend it ON ({@link SCROLL_FIGHT_RADIUS})? This is
 *     the judgement the golden arrow never needed. A scroll at arm's length
 *     ({@link SCROLL_FREE_REACH}) is read regardless — it is free — but a walk
 *     across a cleared floor to light a window over nothing is a walk to waste
 *     it, and the scroll will still be there after the next pack spawns.
 */
function wantedScrollNearby(
  state: GameState,
  hero: Player,
  reach: number = ITEM_REACH,
): Item | undefined {
  if (!scrollsWarm(state, hero)) return undefined;
  const duration = xpScrollDurationMs();
  if (duration <= 0) return undefined; // the faucet is off — a scroll is litter
  if ((hero.xpBoostMs ?? 0) > duration * SCROLL_REFRESH_FRAC) return undefined;
  const worthLighting = foeWithinScrollReach(state, hero);
  let best: Item | undefined;
  let bestD = reach;
  for (const item of state.items) {
    if (item.kind !== "xp") continue;
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    const d = distance(item.pos, hero.pos);
    if (d >= bestD) continue;
    if (!worthLighting && d > SCROLL_FREE_REACH) continue;
    if (blockedByObstacle(state, hero.pos, item.pos, PLAYER.radius)) continue;
    best = item;
    bestD = d;
  }
  return best;
}

/**
 * Is this hero's double-XP window LIT — is the clock running? Read by the
 * fight code to press the pack instead of circling it, and to walk past the
 * errands (a locker to smash) that would spend the window on nothing. The
 * window burns in real time whether or not he is swinging, which is exactly why
 * it changes how he plays rather than only what he picks up.
 */
export function xpWindowLit(hero: Player): boolean {
  return (hero.xpBoostMs ?? 0) > 0;
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
 * WORTH-READING XP scroll first at any reach (doubling the next half-minute of
 * the fight beats any other pickup — see {@link wantedScrollNearby}), then a
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
  hero: Player,
  tune: BotTuning,
): Item | undefined {
  const scroll = wantedScrollNearby(state, hero);
  if (scroll) return scroll;
  const item = nearestWantedItem(state, hero);
  if (!item) return undefined;
  const d = distance(item.pos, hero.pos);
  if (d > ITEM_REACH) return undefined;
  if (d <= ITEM_CLOSE_REACH) return item;
  // Worth a sideways step whatever the march is doing: a piece of gear, a plot
  // piece, a QUEST TOKEN (a bankable one — `canBankPickup` already gated it on
  // the errand being active with room in its tally — is progress on work the
  // player signed up for, the same any-detour class as a plot piece), and
  // MONEY — gold can never be refused (no cell, no cap), so a pile
  // inside reach is guaranteed value, and walking past one is the autopilot
  // declining to pay for its own ride.
  if (
    item.kind === "equipment" ||
    item.kind === "story" ||
    item.kind === "quest" ||
    item.kind === "gold"
  ) {
    return item;
  }
  const heading = travelHeading(bot, state, hero, tune);
  if (!heading) return item;
  const ax = (item.pos.x - hero.pos.x) / d;
  const ay = (item.pos.y - hero.pos.y) / d;
  const along = ax * heading.x + ay * heading.y;
  return along >= ITEM_DETOUR_MIN_ALONG ? item : undefined;
}
