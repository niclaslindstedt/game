// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Breakable crates: the loot boxes scattered on a level (`breakable` obstacles,
// minted in create.ts). A crate is ordinary jumpable cover that also carries
// break `hp` — the hero's autonomous weapon SMASHES it (his melee cone and his
// shots damage it in step/, and with no foe in reach the auto-attack turns on
// the nearest crate). A smashed crate keels over like a slain mob and ALWAYS
// spills loot: mostly healing and stamina, sometimes gear, and — rolled hotter
// than a mob's drop — a unique more often than a plain kill would. Breakable
// PROPS (vending machines, wine racks — `Obstacle.lootChance`/`lootDrop`) ride
// the same machinery but only SOMETIMES pay, with themed drop weights.
// Extracted from step//loot.ts so the crate rules live in one place.

import {
  clamp,
  distanceSq,
  segmentDistanceSq,
  segmentIntersectsBox,
  type Vec2,
} from "@game/lib/vec.ts";
import { AMMO, CHESTS, CRATES, LEVELING } from "./config/index.ts";
import {
  ammoAppetite,
  ammoKindFor,
  consumableAppetite,
  dropItem,
  medkitAppetite,
  rollAmmoCount,
  rollEquipment,
} from "./items/index.ts";
import { rollMedkitTier } from "./loot.ts";
import { visibleTo } from "./sight.ts";
import { nearestHero } from "./party.ts";
import { currentMobLevel, mobHpScaleFor } from "./menace.ts";
import { lineOfSight } from "./obstacles.ts";
import type { GameState, Obstacle, Player } from "./types/index.ts";

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

/**
 * The nearest breakable crate within `range` of `from` that `owner` can SEE,
 * with a clear line to it — the fallback target the hero's auto-attack smashes
 * when no foe is in reach (see stepWeapon). Enemies always win the pick; this
 * only runs once they're all out of range, so a lone crate in an empty room
 * still gets cracked open.
 *
 * The sight rule is the horde's (`sight.ts` `visibleTo`): a box off the screen,
 * or on ground the hero has not uncovered, is exactly as invisible as a mob
 * standing there, so the auto-attack does not swing at it. Walk up and it is a
 * target.
 *
 * `reachable` is the caller's own reading of what stands in the way, and a GUN
 * has to supply one, because the line to a box is the ROUND's rather than the
 * eye's: `lineOfSight` — the default here, and the right answer for a blade —
 * deliberately looks past a lone boulder, and that same boulder eats every shot
 * fired past it. A box never moves, so a pick the round cannot get to is not one
 * wasted shot but an endless one: the same crate fed the whole pouch for as long
 * as the hero stands there. See stepWeapon, which hands its projectile's own
 * physical probe down.
 */
export function nearestCrate(
  state: GameState,
  from: Vec2,
  range: number,
  owner: Player | undefined,
  reachable?: (obstacle: Obstacle) => boolean,
): Obstacle | undefined {
  const rangeSq = range * range;
  let best: Obstacle | undefined;
  let bestSq = rangeSq;
  for (const obstacle of state.obstacles) {
    if (!obstacle.breakable) continue;
    const dSq = distanceSq(from, obstacle.pos);
    if (dSq > bestSq) continue;
    if (!visibleTo(state, owner, obstacle.pos)) continue;
    if (
      reachable ? !reachable(obstacle) : !lineOfSight(state, from, obstacle.pos)
    ) {
      continue;
    }
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

/**
 * The breakable a swept shot `from`→`to` (a circle of `radius`) ran into — the
 * box that STOPPED it.
 *
 * The twin of {@link crateHitByCircle}, for the other half of the field. A
 * hoppable crate is not solid to a round: the shot flies into it and is spent
 * where it overlaps, which is the circle test. A SOLID breakable — a vending
 * machine, a wine rack — stops the round at its face instead, so the overlap
 * never happens and the shot has to be credited to the box it died on
 * (stepProjectiles). Solid is not indestructible, and a hero whose auto-attack
 * cannot break the box in front of him just feeds it the whole pouch.
 *
 * Only run on the tick a shot is actually stopped, so the linear scan over a
 * level's breakables is paid once per dead round rather than per tick.
 */
export function breakableHitBySweep(
  state: GameState,
  from: Vec2,
  to: Vec2,
  radius: number,
): Obstacle | undefined {
  for (const obstacle of state.obstacles) {
    if (!obstacle.breakable) continue;
    const half = obstacle.half;
    if (half) {
      if (
        segmentIntersectsBox(
          from.x,
          from.y,
          to.x,
          to.y,
          obstacle.pos.x,
          obstacle.pos.y,
          half.x + radius,
          half.y + radius,
        )
      ) {
        return obstacle;
      }
      continue;
    }
    const reach = obstacle.radius + radius;
    if (segmentDistanceSq(from, to, obstacle.pos) <= reach * reach) {
      return obstacle;
    }
  }
  return undefined;
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

/** Smash a crate open: announce the break, spill the loot, and pull it off the
 * field (replacing the obstacle array so the spatial grid rebuilds — the doors
 * precedent). A supply crate's spill is guaranteed; a chance-based PROP (a
 * vending machine, a wine rack — `lootChance` < 1) only sometimes pays, so
 * smashing scenery stays a gamble rather than a farm. */
function breakCrate(state: GameState, crate: Obstacle): void {
  state.events.push({
    type: "crateBroken",
    pos: { ...crate.pos },
    sprite: crate.sprite,
  });
  // WHOSE APPETITE THE SPILL IS WEIGHED AGAINST — the hero AT the box, which
  // is the one who just smashed it. A crate's contents lean toward what its
  // opener can use (`medkitAppetite`, `ammoKindFor`, `rollEquipment`), and
  // every one of those is a PRIVATE read: on seat 0 a party's crates all
  // spilled rounds for the host's holster whoever cracked them, and on a
  // joiner the same read is a bag the split never sent. The blow's own
  // attacker is not threaded this far down (a crate is smashed by a swing, a
  // shot, or a cleave), and the box is where the swing landed — so the nearest
  // hero IS the breaker, without a parameter through four call sites.
  const opener = nearestHero(state, crate.pos) ?? state.players[0];
  if (crate.chest) dropChestLoot(state, crate.pos, opener);
  else if (state.rng() < (crate.lootChance ?? 1))
    dropCrateLoot(state, crate.pos, opener, crate.lootDrop);
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

/**
 * Which of the two consumables a spill's coin-flip pays, weighted by APPETITE
 * (`medkitAppetite` / `consumableAppetite`) rather than flipped evenly: the
 * hero whose medkit pouch is full and whose sprint pool is drained gets the
 * drink, so a crate's guaranteed pickup leans toward what he can actually use.
 * Both appetites carry a floor, so the tilt is a lean and never a lockout —
 * either kind can still come out of any crate. Consumes exactly one rng draw,
 * like the flip it replaces.
 */
function pickConsumableKind(
  state: GameState,
  opener: Player,
  mlvl: number,
): "health" | "stamina" {
  const health = medkitAppetite(state, opener, mlvl);
  const stamina = consumableAppetite(state, opener, "drink");
  return state.rng() * (health + stamina) < health ? "health" : "stamina";
}

/** Drop one consumable of `kind` at a scattered spot near `at`. */
function dropConsumable(
  state: GameState,
  kind: "health" | "stamina",
  at: Vec2,
): void {
  if (kind === "health") {
    dropItem(
      state,
      {
        id: state.nextId++,
        kind: "medkit",
        pos: scatter(state, at),
        tier: rollMedkitTier(state),
      },
      at,
    );
  } else {
    dropItem(
      state,
      { id: state.nextId++, kind: "drink", pos: scatter(state, at) },
      at,
    );
  }
}

/** Drop one box of AMMUNITION at a scattered spot near `at`, of the kind the
 * hero's own holster eats (`ammoKindFor` — deterministic, so it shifts no
 * seeded draw) and sized by that kind's authored band. */
function dropAmmo(state: GameState, opener: Player, at: Vec2): void {
  const type = ammoKindFor(state, opener);
  dropItem(
    state,
    {
      id: state.nextId++,
      kind: "ammo",
      pos: scatter(state, at),
      ammo: type,
      count: rollAmmoCount(state, type),
    },
    at,
  );
}

/**
 * A crate's spill (config `CRATES`): exactly one PRIMARY drop — weighted
 * toward healing and stamina, sometimes gear rolled HOTTER than a mob's
 * (`gearTierBonus`, which also fires the natural unique fold more often, so a
 * crate's unique beats a plain kill's) — plus a chance of ONE bonus consumable
 * on top, so cracking a crate always feels like a small haul. A themed PROP
 * passes its own `weights` (`Obstacle.lootDrop` — a vending machine leans
 * stamina drinks, a wine rack healing) over the config default. All equipment
 * inherits the live horde level, so the same tier gates as every other drop
 * apply (no uniques before their mlvl unlocks).
 */
function dropCrateLoot(
  state: GameState,
  at: Vec2,
  opener: Player,
  weights?: {
    health?: number;
    stamina?: number;
    gear?: number;
    ammo?: number;
  },
): void {
  const mlvl = currentMobLevel(state);
  const authoredHealth = weights?.health ?? (weights ? 0 : CRATES.drop.health);
  const authoredStamina =
    weights?.stamina ?? (weights ? 0 : CRATES.drop.stamina);
  const gear = weights?.gear ?? (weights ? 0 : CRATES.drop.gear);
  const authoredAmmo = weights?.ammo ?? (weights ? 0 : CRATES.drop.ammo);
  // APPETITE: a consumable's weight fades with the pouch it would bank into
  // (and grows with how far down the pool it refills has fallen), so a crate
  // leans toward gear — or the other consumable — for a hero already carrying
  // all he can. The appetite floor keeps the lean from ever becoming a lockout,
  // so a themed prop that pays ONLY consumables still spills in character.
  const health = authoredHealth * medkitAppetite(state, opener, mlvl);
  const stamina = authoredStamina * consumableAppetite(state, opener, "drink");
  // AMMUNITION leans the same way, and on one extra axis: what the hero is
  // HOLDING (`ammoAppetite`). A sword build cracking a weapons locker mostly
  // finds the gear and the drinks in it; a shooter finds the rounds.
  const ammo = authoredAmmo * ammoAppetite(state, opener);
  const total = health + stamina + gear + ammo;
  if (total <= 0) return;
  const roll = state.rng() * total;
  if (roll < health) {
    dropConsumable(state, "health", at);
  } else if (roll < health + stamina) {
    dropConsumable(state, "stamina", at);
  } else if (roll < health + stamina + ammo) {
    dropAmmo(state, opener, at);
  } else {
    dropItem(
      state,
      {
        id: state.nextId++,
        kind: "equipment",
        pos: scatter(state, at),
        equipment: rollEquipment(state, opener, {
          tierBonus: CRATES.gearTierBonus,
          mlvl,
        }),
      },
      at,
    );
  }
  // A chance at a second consumable so a break rewards more than one pickup —
  // supply crates only: a themed prop pays exactly its themed drop, so its
  // spill stays in character (and the scenery props, being plentiful, don't
  // out-earn the actual loot boxes).
  if (!weights && state.rng() < CRATES.bonusDropChance) {
    dropConsumable(state, pickConsumableKind(state, opener, mlvl), at);
  }
}

/**
 * A special CHEST's spill (config `CHESTS`): a Diablo-2 locker, not a single
 * crate drop — an 80% shot at a MARQUEE equipment item (rolled at a tier bonus
 * hotter than a crate's, so it reaches magic/rare/unique and folds a natural
 * unique far more often), a smaller chance at a second bonus piece on top, and
 * a couple of guaranteed consumables regardless. The payoff that makes a
 * `quietZone` dead area worth the detour. Tier gates still apply (mlvl-scaled).
 */
function dropChestLoot(state: GameState, at: Vec2, opener: Player): void {
  const mlvl = currentMobLevel(state);
  const dropGear = () => {
    dropItem(
      state,
      {
        id: state.nextId++,
        kind: "equipment",
        pos: scatter(state, at),
        equipment: rollEquipment(state, opener, {
          tierBonus: CHESTS.gearTierBonus,
          mlvl,
        }),
      },
      at,
    );
  };
  // The marquee item — an 80% spill; only on that hit can a second bonus piece
  // follow, so a locker gives one prize most of the time and two now and then.
  if (state.rng() < CHESTS.itemChance) {
    dropGear();
    if (state.rng() < CHESTS.bonusItemChance) dropGear();
  }
  for (let i = 0; i < CHESTS.consumables; i++) {
    dropConsumable(state, pickConsumableKind(state, opener, mlvl), at);
  }
  // …and the ROUNDS, guaranteed and unweighted. Everything else in a locker is
  // a roll; this is the part a player detours for and can count on, which is
  // what makes "there is a cache at the end of that dead end" a decision rather
  // than a lottery ticket.
  for (let i = 0; i < AMMO.chestDrops; i++) dropAmmo(state, opener, at);
}
