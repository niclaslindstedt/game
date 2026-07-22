// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Breakable crates: the loot boxes scattered on a level (`breakable` obstacles,
// minted in create.ts). A crate is ordinary jumpable cover that also carries
// break `hp` — the hero's autonomous weapon SMASHES it (his melee cone and his
// shots damage it in step.ts, and with no foe in reach the auto-attack turns on
// the nearest crate). A smashed crate keels over like a slain mob and ALWAYS
// spills loot: mostly healing and stamina, sometimes gear, and — rolled hotter
// than a mob's drop — a unique more often than a plain kill would. Extracted
// from step.ts/loot.ts so the crate rules live in one place.

import { clamp, distanceSq, type Vec2 } from "@game/lib/vec.ts";
import { CHESTS, CRATES, LEVELING } from "./config/index.ts";
import { rollEquipment } from "./items/index.ts";
import { rollMedkitTier } from "./loot.ts";
import { currentMobLevel, mobHpScaleFor } from "./menace.ts";
import { lineOfSight } from "./obstacles.ts";
import type { GameState, Obstacle } from "./types.ts";

/**
 * The break hp a crate is minted with, scaled to the run's level: a fraction
 * (`CRATES.hpFraction`) of the REFERENCE minion's bar at this level and
 * difficulty (`LEVELING.refMobHp` on the menace hp curve). Because the hero's
 * own damage tracks that same bar all campaign, this keeps a crate smashing
 * open in about as many blows as a weak trash mob takes — opening level to
 * endgame — never a chore, never free. Floored at `CRATES.minHp`.
 */
export function crateMaxHp(playerLevel: number, difficulty: string): number {
  const bar = LEVELING.refMobHp * mobHpScaleFor(playerLevel, difficulty);
  return Math.max(CRATES.minHp, Math.round(bar * CRATES.hpFraction));
}

/** A view rect test mirroring step.ts's `insideView` — a crate the player
 * can't see yet is not an auto-attack target. */
function insideView(
  pos: Vec2,
  view: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    pos.x >= view.x &&
    pos.x <= view.x + view.width &&
    pos.y >= view.y &&
    pos.y <= view.y + view.height
  );
}

/**
 * The nearest breakable crate within `range` of `from`, on screen, with a
 * clear line to it — the fallback target the hero's auto-attack smashes when
 * no foe is in reach (see stepWeapon). Enemies always win the pick; this only
 * runs once they're all out of range, so a lone crate in an empty room still
 * gets cracked open.
 */
export function nearestCrate(
  state: GameState,
  from: Vec2,
  range: number,
  view?: { x: number; y: number; width: number; height: number },
): Obstacle | undefined {
  const rangeSq = range * range;
  let best: Obstacle | undefined;
  let bestSq = rangeSq;
  for (const obstacle of state.obstacles) {
    if (!obstacle.breakable) continue;
    if (view && !insideView(obstacle.pos, view)) continue;
    const dSq = distanceSq(from, obstacle.pos);
    if (dSq > bestSq) continue;
    if (!lineOfSight(state, from, obstacle.pos)) continue;
    best = obstacle;
    bestSq = dSq;
  }
  return best;
}

/**
 * Every breakable crate a melee swing's cone reaches: within `range` of
 * `origin` and inside `halfAngle` of the aim `dir`, with a clear line to it —
 * so a swing that cleaves the horde also smashes the crates it faces (and a
 * swing aimed AT a crate connects). The caller rolls each one its own weapon
 * blow. A crate touching the swinger has no bearing and always counts.
 */
export function cratesInCone(
  state: GameState,
  origin: Vec2,
  dir: Vec2,
  range: number,
  halfAngle: number,
): Obstacle[] {
  const rangeSq = range * range;
  const cosHalf = Math.cos(halfAngle);
  const hit: Obstacle[] = [];
  for (const obstacle of state.obstacles) {
    if (!obstacle.breakable) continue;
    const dx = obstacle.pos.x - origin.x;
    const dy = obstacle.pos.y - origin.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq) continue;
    if (distSq > obstacle.radius * obstacle.radius) {
      const dist = Math.sqrt(distSq);
      const dot = (dx * dir.x + dy * dir.y) / dist;
      if (dot < cosHalf) continue;
    }
    if (!lineOfSight(state, origin, obstacle.pos)) continue;
    hit.push(obstacle);
  }
  return hit;
}

/** The breakable crate a circle at `pos` (radius `radius`) overlaps, if any —
 * the projectile-vs-crate test (a shot that would fly over a jumpable crate
 * instead smashes it). */
export function crateHitByCircle(
  state: GameState,
  pos: Vec2,
  radius: number,
): Obstacle | undefined {
  for (const obstacle of state.obstacles) {
    if (!obstacle.breakable) continue;
    const reach = obstacle.radius + radius;
    if (distanceSq(pos, obstacle.pos) <= reach * reach) return obstacle;
  }
  return undefined;
}

/**
 * Apply one blow to a crate. A survivor spits a splinter chip (`crateHit`); a
 * blow that empties its hp SMASHES it — `breakCrate` spills the loot, keels the
 * box over and takes it off the field. No accuracy/crit rolls: a crate is
 * inert, so every landed hero blow bites it for its face damage.
 */
export function damageCrate(
  state: GameState,
  crate: Obstacle,
  damage: number,
): void {
  crate.hp = (crate.hp ?? 0) - damage;
  if (crate.hp > 0) {
    state.events.push({ type: "crateHit", pos: { ...crate.pos } });
    return;
  }
  breakCrate(state, crate);
}

/** Smash a crate open: announce the break, spill its guaranteed loot, and pull
 * it off the field (replacing the obstacle array so the spatial grid rebuilds —
 * the doors precedent). */
function breakCrate(state: GameState, crate: Obstacle): void {
  state.events.push({
    type: "crateBroken",
    pos: { ...crate.pos },
    sprite: crate.sprite,
  });
  if (crate.chest) dropChestLoot(state, crate.pos);
  else dropCrateLoot(state, crate.pos);
  state.obstacles = state.obstacles.filter((o) => o !== crate);
}

/** A drop position jittered a little off the break point so a crate's haul
 * reads as a small spill rather than a single stacked pickup. */
function scatter(state: GameState, at: Vec2): Vec2 {
  return {
    x: clamp(
      at.x + (state.rng() - 0.5) * CRATES.lootScatter,
      16,
      state.level.width - 16,
    ),
    y: clamp(
      at.y + (state.rng() - 0.5) * CRATES.lootScatter,
      16,
      state.level.height - 16,
    ),
  };
}

/** Drop one consumable of `kind` at a scattered spot near `at`. */
function dropConsumable(
  state: GameState,
  kind: "health" | "stamina",
  at: Vec2,
): void {
  if (kind === "health") {
    state.items.push({
      id: state.nextId++,
      kind: "medkit",
      pos: scatter(state, at),
      tier: rollMedkitTier(state),
    });
  } else {
    state.items.push({
      id: state.nextId++,
      kind: "drink",
      pos: scatter(state, at),
    });
  }
}

/**
 * A crate's GUARANTEED spill (config `CRATES`): exactly one PRIMARY drop —
 * weighted toward healing and stamina, sometimes gear rolled HOTTER than a
 * mob's (`gearTierBonus`, which also fires the natural unique fold more often,
 * so a crate's unique beats a plain kill's) — plus a chance of ONE bonus
 * consumable on top, so cracking a crate always feels like a small haul. All
 * equipment inherits the live horde level, so the same tier gates as every
 * other drop apply (no uniques before their mlvl unlocks).
 */
function dropCrateLoot(state: GameState, at: Vec2): void {
  const mlvl = currentMobLevel(state);
  const { health, stamina, gear } = CRATES.drop;
  const total = health + stamina + gear;
  const roll = state.rng() * total;
  if (roll < health) {
    dropConsumable(state, "health", at);
  } else if (roll < health + stamina) {
    dropConsumable(state, "stamina", at);
  } else {
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: scatter(state, at),
      equipment: rollEquipment(state, {
        tierBonus: CRATES.gearTierBonus,
        mlvl,
      }),
    });
  }
  // A chance at a second consumable so a break rewards more than one pickup.
  if (state.rng() < CRATES.bonusDropChance) {
    dropConsumable(state, state.rng() < 0.5 ? "health" : "stamina", at);
  }
  state.events.push({ type: "itemDropped", pos: { ...at } });
}

/**
 * A special CHEST's spill (config `CHESTS`): a Diablo-2 locker, not a single
 * crate drop — an 80% shot at a MARQUEE equipment item (rolled at a tier bonus
 * hotter than a crate's, so it reaches magic/rare/unique and folds a natural
 * unique far more often), a smaller chance at a second bonus piece on top, and
 * a couple of guaranteed consumables regardless. The payoff that makes a
 * `quietZone` dead area worth the detour. Tier gates still apply (mlvl-scaled).
 */
function dropChestLoot(state: GameState, at: Vec2): void {
  const mlvl = currentMobLevel(state);
  const dropGear = () => {
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: scatter(state, at),
      equipment: rollEquipment(state, {
        tierBonus: CHESTS.gearTierBonus,
        mlvl,
      }),
    });
  };
  // The marquee item — an 80% spill; only on that hit can a second bonus piece
  // follow, so a locker gives one prize most of the time and two now and then.
  if (state.rng() < CHESTS.itemChance) {
    dropGear();
    if (state.rng() < CHESTS.bonusItemChance) dropGear();
  }
  for (let i = 0; i < CHESTS.consumables; i++) {
    dropConsumable(state, state.rng() < 0.5 ? "health" : "stamina", at);
  }
  state.events.push({ type: "itemDropped", pos: { ...at } });
}
