// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's ARSENAL PLAY: pointing the auto-weapon at the foe worth
// hitting (`bestAimTarget`) and playing the powerup dock by VALUE (the timed
// spend, the shelf-space burn, the drop-for-upgrade, the priority sort). All
// pure reads of the GameState — `decideAct` (index.ts) wires the picks into the
// tick's GameInput — so botted runs stay deterministic.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { isSlotActive, magnetRadius } from "../abilities.ts";
import { abilityValue } from "./economy.ts";
import { SURROUND_RADIUS, THREAT_RADIUS, threatsWithin } from "./perception.ts";
import { ITEM_REACH, STAMINA_TOPUP_FRAC } from "./supplies.ts";
import { HELD_ITEMS, PLAYER } from "../config/index.ts";
import { abilityDef } from "../defs/abilities.ts";
import type { AbilityDef } from "../defs/abilities.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { weaponDef } from "../defs/equipment.ts";
import {
  maxMeleeTargets,
  weaponRangeFor,
  weaponSweepHalfAngle,
} from "../items/index.ts";
import { blockedByObstacle, lineOfSight } from "../obstacles.ts";
import type { Enemy, GameState } from "../types/index.ts";

/** Spend the NUKE only into an OVERWHELMING flood — this many foes inside the
 * blast itself (which covers roughly the visible screen). A pack any thinner
 * is left to the guns; the wipe is the break-glass button. */
const NUKE_PACK = 20;
/** Spend a combat power (storm/orbit) once a fight this size is packed close —
 * good value against a few bodies, no need to wait for a horde. */
const POWERUP_FIGHT_PACK = 3;
/** STASIS is the cornered-escape: fired when the hero CAN'T RUN (sprint pool
 * below the top-up line), is BLEEDING (hp under {@link STASIS_HP_FRAC}), and at
 * least this many foes are hunting inside the local threat ring — freezing the
 * chase buys the ground a healthy pair of legs would just outrun. */
const STASIS_HUNT_PACK = 5;
/** The hp fraction under which the cornered-escape stasis arms. */
const STASIS_HP_FRAC = 0.5;
/** Ground drops inside the magnet's pull that make popping it worthwhile. */
const MAGNET_LOOT_MIN = 3;

/** Count of live, non-apparition foes within `radius` of the hero (the
 * powerup-moment reads — a nuke wipes anything, kneeling spareables included,
 * so this deliberately does NOT apply the cast-target `state.choice` guard). */
function foesWithin(state: GameState, radius: number): number {
  let n = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    if (distance(state.player.pos, enemy.pos) <= radius) n++;
  }
  return n;
}

/** Is a NUKE banked in the powerup dock? With one in his pocket the bot can
 * afford to be DARING: it keeps kiting forward and skips the escape-route
 * guard — worst case, the button clears the screen. Pure. */
export function hasNukeBanked(state: GameState): boolean {
  return state.player.heldAbilities.some(
    (id) => abilityDef(id).kind === "nuke",
  );
}

/**
 * The BANKED dock slots — not running, not blocked by a running copy of a
 * non-stackable power (the engine would refuse the spend and waste the edge)
 * — most precious first ({@link abilityValue}): the moment pass hands the
 * crowd to the best power, the burn pass walks the list backwards for the
 * cheapest.
 */
function bankedPowerups(
  state: GameState,
): { defId: string; slot: number; def: AbilityDef }[] {
  const player = state.player;
  return player.heldAbilities
    .map((defId, slot) => ({ defId, slot, def: abilityDef(defId) }))
    .filter(({ slot }) => !isSlotActive(state, slot))
    .filter(
      ({ def, defId }) =>
        def.stackable || !player.abilities.some((a) => a.defId === defId),
    )
    .sort((a, b) => abilityValue(b.defId) - abilityValue(a.defId));
}

/**
 * The dock slot whose MOMENT is now — the spend worth making this tick, or -1.
 * The bot knows the whole catalog by VALUE ({@link abilityValue}: nuke >
 * storm > orbit > stasis > magnet) and times each power for what it's worth:
 * the NUKE only into an OVERWHELMING flood (`NUKE_PACK` foes inside the blast
 * itself), a combat power on a decent fight (`POWERUP_FIGHT_PACK`), the
 * STASIS when he's CORNERED — too winded to run, bleeding under half, a pack
 * hunting him (`STASIS_HUNT_PACK`) — and the MAGNET the moment a lootable
 * spill sits inside its pull. Checked best-first, so a flood eats the nuke,
 * never the stasis. Pure (state only), so determinism holds.
 */
export function pickPowerupMoment(state: GameState): number {
  const player = state.player;
  const banked = bankedPowerups(state);
  if (banked.length === 0) return -1;
  const packedClose = threatsWithin(state, SURROUND_RADIUS).length;
  // CORNERED — the stasis moment: too winded to outrun the hunt, bleeding
  // under half, and a real pack on his heels inside the threat ring.
  const cornered =
    player.stamina < player.maxStamina * STAMINA_TOPUP_FRAC &&
    player.hp < player.maxHp * STASIS_HP_FRAC &&
    threatsWithin(state, THREAT_RADIUS).length >= STASIS_HUNT_PACK;
  for (const { def, slot } of banked) {
    switch (def.kind) {
      case "nuke":
        // Counted inside the blast itself, so "overwhelming" means what the
        // wipe would actually erase — not a wide tail of distant stragglers.
        if (foesWithin(state, def.nuke?.radius ?? SURROUND_RADIUS) >= NUKE_PACK)
          return slot;
        break;
      case "storm":
      case "orbit":
        if (packedClose >= POWERUP_FIGHT_PACK) return slot;
        break;
      case "stasis":
        if (cornered) return slot;
        break;
      case "magnet":
        if (magnetLootClose(state, def)) return slot;
        break;
    }
  }
  return -1;
}

/**
 * The dock slot worth BURNING for shelf space this tick, or -1 — the pressure
 * valve that keeps a slot cycling free for the next strong pickup. The MAGNET
 * (pure convenience) burns as soon as the dock is down to its last open slot;
 * with the dock FULL the cheapest banked power burns too — the STASIS freely
 * (low value, and a fresh drop can re-stock the escape), a combat power only
 * with a foe near enough to actually hit. The NUKE is never burned for shelf
 * space: it's the emergency button (and the DARING read, {@link
 * hasNukeBanked}). Runs AFTER {@link powerupDropForUpgrade} in the decision
 * chain — an instant drop beats a burn whose slot only frees when the power
 * lapses. Pure.
 */
export function pickPowerupBurn(state: GameState): number {
  const banked = bankedPowerups(state);
  if (banked.length === 0) return -1;
  const openSlots = HELD_ITEMS.cap - state.player.heldAbilities.length;
  const anyFoeNear = threatsWithin(state, THREAT_RADIUS).length > 0;
  for (let i = banked.length - 1; i >= 0; i--) {
    const { def, slot } = banked[i]!;
    if (def.kind === "nuke") continue; // never burn the wipe for shelf space
    if (def.kind === "magnet" && openSlots <= 1) return slot;
    if (openSlots <= 0) {
      if (def.kind === "magnet" || def.kind === "stasis") return slot;
      if (anyFoeNear) return slot;
    }
  }
  return -1;
}

/** Enough ground drops inside the magnet's pull to be worth popping it —
 * counts what the field would actually reel in (a mercy drop still riding its
 * angel down is out of the magnet's reach, see stepAbilities). */
function magnetLootClose(state: GameState, def: AbilityDef): boolean {
  const reach = magnetRadius(state, def);
  let count = 0;
  for (const item of state.items) {
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (distance(state.player.pos, item.pos) > reach) continue;
    count++;
    if (count >= MAGNET_LOOT_MIN) return true;
  }
  return false;
}

/**
 * The single dock reorder (`GameInput.moveItem`) that walks the powerup row
 * one step closer to the bot's own priority order — best first ({@link
 * abilityValue}, ties keeping their current order) — or null once sorted. The
 * bot issues one move per tick until the dock reads as its ranking, so a
 * viewer can literally see how it values what it carries (the nuke parked at
 * the head of the row, the magnet at the tail). Running slots shuffle along
 * with their countdowns (`moveHeldSlot` keeps the links). Pure.
 */
export function powerupSortMove(
  state: GameState,
): { from: number; to: number } | null {
  const held = state.player.heldAbilities;
  if (held.length < 2) return null;
  const order = held
    .map((defId, i) => ({ i, v: abilityValue(defId) }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  for (let to = 0; to < order.length; to++) {
    const from = order[to]!.i;
    if (from !== to) return { from, to };
  }
  return null;
}

/**
 * The dock slot to DROP (`GameInput.dropItemIndex`) so a better powerup lying
 * on the ground can be picked up — or -1 to keep the shelf. Only fires with
 * the dock FULL and a grabbable ability item within {@link ITEM_REACH} (clear
 * straight sweep, not a uniqueHeld double the dock would refuse anyway). What
 * gets tossed, in order of preference:
 *   • a RUNNING (non-nuke) slot — the pickup is already spent, so freeing its
 *     shelf space costs nothing and ANY bankable find is a net gain;
 *   • else the cheapest BANKED (non-nuke) slot, and only for a ground find of
 *     strictly higher value — trading a magnet away for a nuke, never a storm
 *     for a stasis.
 * The NUKE is never tossed. Pure; the actual grab happens as the hero walks
 * over the item (nearestWantedItem already steers at ground abilities).
 */
export function powerupDropForUpgrade(state: GameState): number {
  const player = state.player;
  const held = player.heldAbilities;
  if (held.length < HELD_ITEMS.cap) return -1; // room already
  // The best grabbable powerup find in reach.
  let bestGround = -1;
  for (const item of state.items) {
    if (item.kind !== "ability") continue;
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    if (abilityDef(item.defId).uniqueHeld && held.includes(item.defId)) {
      continue; // a second nuke can't bank no matter what's dropped
    }
    if (distance(player.pos, item.pos) > ITEM_REACH) continue;
    if (blockedByObstacle(state, player.pos, item.pos, PLAYER.radius)) {
      continue;
    }
    bestGround = Math.max(bestGround, abilityValue(item.defId));
  }
  if (bestGround < 0) return -1;
  // The slot to toss: a spent (running) one for free, else the cheapest
  // banked one — never the nuke.
  let drop = -1;
  let dropValue = Infinity;
  let dropRunning = false;
  for (let i = 0; i < held.length; i++) {
    const defId = held[i]!;
    if (abilityDef(defId).kind === "nuke") continue;
    const running = isSlotActive(state, i);
    const value = abilityValue(defId);
    const better =
      running !== dropRunning ? running : value < dropValue || drop < 0;
    if (better) {
      drop = i;
      dropValue = value;
      dropRunning = running;
    }
  }
  if (drop < 0) return -1;
  return dropRunning || bestGround > dropValue ? drop : -1;
}

/** Nearest-foe distance under which the bot stops picking clever aim targets
 * and shoots the body about to bite it — killing the immediate threat IS the
 * most damage that matters. */
const AIM_PANIC_RANGE = 90;

/** Half-angle (radians) used to judge how many bodies a PIERCING/CHAINING
 * round's line threads — a narrow corridor read on the same cone math. */
const AIM_LINE_HALF_ANGLE = 0.18;

/** Hard ceiling on how many of the nearest in-range foes the O(n²) cluster
 * scoring considers — the bound that keeps the aim pick from going quadratic
 * against a wall-to-wall horde (see bestAimTarget). Melee tightens it further
 * to what INT actually lets a sweep cleave (maxMeleeTargets). */
const AIM_CLUSTER_CAP = 10;

/**
 * The world point the auto-weapon should be AIMED at this tick — the target
 * that turns the swing/volley into the most damage — or undefined to keep the
 * engine's plain nearest-foe pick. The engine reads `GameInput.aim` exactly
 * like a desktop mouse bearing (`nearestEnemy`'s alignment bias), so pointing
 * it at a foe makes the weapon fight THROUGH that foe:
 *   • A CONE/SPREAD weapon (melee sweep, shotgun fan) aims at the foe whose
 *     direction covers the most bodies inside the arc — the densest cluster.
 *   • A PIERCING/CHAINING round aims down the line that threads the most foes.
 *   • A plain single shot finishes the most WOUNDED foe in range (thinning the
 *     pack beats poking the freshest body), tie-broken nearest.
 * A body already at biting range preempts all of it — the immediate threat is
 * shot first. Candidates need line of sight, so a cluster behind a wall never
 * wins over a hittable foe. Pure (state only), so determinism holds.
 */
export function bestAimTarget(state: GameState): Vec2 | undefined {
  const player = state.player;
  const equipped = player.equipment.weapon;
  const range = weaponRangeFor(state, equipped);
  // Candidates: live, targetable, in range, in sight — the foes a swing or a
  // shot could actually reach this tick.
  const rangeSq = range * range;
  const foes: { enemy: Enemy; d: number; ux: number; uy: number }[] = [];
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    const dx = enemy.pos.x - player.pos.x;
    const dy = enemy.pos.y - player.pos.y;
    const dSq = dx * dx + dy * dy;
    if (dSq > rangeSq) continue;
    if (!lineOfSight(state, player.pos, enemy.pos)) continue;
    // The unit bearing rides along so the cluster scoring below never
    // re-derives it (the old per-pair hypot was this pick's hotspot).
    const d = Math.sqrt(dSq);
    foes.push({ enemy, d, ux: d > 0 ? dx / d : 0, uy: d > 0 ? dy / d : 0 });
  }
  if (foes.length === 0) return undefined;
  foes.sort((a, b) => a.d - b.d);
  const nearest = foes[0]!;
  // A body about to bite is the target, full stop.
  if (nearest.d < AIM_PANIC_RANGE) {
    return { x: nearest.enemy.pos.x, y: nearest.enemy.pos.y };
  }
  const def = weaponDef(equipped.defId);
  const spec = def.projectile;
  // The weapon's damage FOOTPRINT around its aim: a melee sweep's cone, a
  // spread volley's fan, or a piercing round's narrow corridor. 0 = a plain
  // single-target shot.
  let half = 0;
  if (!spec) half = weaponSweepHalfAngle(state, equipped);
  else if ((spec.count ?? 1) > 1 || (spec.spreadDeg ?? 0) > 0) {
    half = Math.max((((spec.spreadDeg ?? 0) / 2) * Math.PI) / 180, 0.12);
  } else if (spec.pierce !== undefined || spec.chain !== undefined) {
    half = AIM_LINE_HALF_ANGLE;
  }
  if (half > 0) {
    // Aim at the foe whose bearing catches the most bodies in the footprint —
    // capped at what INT lets a melee sweep actually cleave, so a wall of
    // twelve doesn't out-score what the blade can really bill.
    const cap = spec ? Infinity : maxMeleeTargets(state);
    const cosHalf = Math.cos(half);
    // The cluster scoring is O(candidates²); against a wall-to-wall horde
    // that blew up to tens of thousands of dot products per tick. Score only
    // the foes the weapon could actually bill: for melee that's what INT lets
    // the sweep cleave (maxMeleeTargets), everything at a hard ceiling of
    // AIM_CLUSTER_CAP. `foes` is distance-sorted, so the trim is
    // deterministic — the densest reachable knot is always among the nearest.
    const consider = Math.min(
      AIM_CLUSTER_CAP,
      spec ? AIM_CLUSTER_CAP : Math.max(1, cap),
    );
    if (foes.length > consider) foes.length = consider;
    let best = nearest;
    let bestCovered = 0;
    for (const c of foes) {
      if (c.d < 1) return { x: c.enemy.pos.x, y: c.enemy.pos.y }; // on top of him
      const ax = c.ux;
      const ay = c.uy;
      let covered = 0;
      for (const o of foes) {
        if (o.ux * ax + o.uy * ay >= cosHalf) covered++;
      }
      covered = Math.min(covered, cap);
      // More bodies wins; a tie goes to the nearer aim (connects sooner).
      if (covered > bestCovered || (covered === bestCovered && c.d < best.d)) {
        bestCovered = covered;
        best = c;
      }
    }
    // With no multi-body line anywhere, fall through to the finisher pick.
    if (bestCovered > 1) return { x: best.enemy.pos.x, y: best.enemy.pos.y };
  }
  // Single-target (or no cluster to catch): FINISH the most wounded foe in
  // range — every body dropped is one less set of teeth — tie-broken nearest.
  let pick = nearest;
  for (const c of foes) {
    if (
      c.enemy.hp < pick.enemy.hp ||
      (c.enemy.hp === pick.enemy.hp && c.d < pick.d)
    ) {
      pick = c;
    }
  }
  return { x: pick.enemy.pos.x, y: pick.enemy.pos.y };
}
