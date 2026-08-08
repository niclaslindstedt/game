// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WANDERING MERCHANT and his coin economy (config MERCHANT / ECONOMY).
// One merchant roams every level — the horde ignores him and nothing hurts
// him. Until met he drifts between short wander legs on his OWN seeded rng
// stream (never the run's, so his strolling can't perturb a single loot
// roll); the first close encounter roots him to the spot for the rest of
// the run, pins the level map, and stocks his stall against the hero he
// just met. `openShop` opens the SHOPPER's own screen (the rest
// of the party plays on, and the world only freezes solo, like the bag);
// the buy/sell mutators are safe to call from the app's UI outside `step()`.
//
// THREE POSTINGS, AND THE LEVEL DEF PICKS ONE (`LevelDef.merchant`):
//
//   the WANDERER   the default — met out in the level, then rooted for good.
//   PARKED         `parked:` — stood at the carve's counter from the first
//                  tick, revealed, and he never takes a step.
//   A BEAT         `beat:` — revealed like a parked trader and then WALKING,
//                  end to end along the strip the map carves him
//                  (`LevelDef.merchantBeat`). He is a counter that moves, so
//                  he is also the one a car can run down and the one a tap
//                  has to be able to STOP: `hailMerchant` roots him where he
//                  stands, the open shop holds him there, and closing it puts
//                  him back on the pavement.

import {
  createRngFromState,
  randomRange,
  rngState,
  type Rng,
} from "@game/lib/rng.ts";
import { clamp, distance, moveToward, type Vec2 } from "@game/lib/vec.ts";
import { abilityBankRoom, canBankAbility } from "./abilities.ts";
import {
  CONSUMABLES,
  ECONOMY,
  MEDKIT,
  MERCHANT,
  UNIQUE,
} from "./config/index.ts";
import {
  ABILITY_DEFAULT_RARITY,
  abilityDef,
  abilityRarity,
  pickAbility,
} from "./defs/abilities.ts";
import { gearDef, identifyGearIds, reviveGearIds } from "./defs/equipment.ts";
import { levelDef, runLevelDef } from "./defs/levels/index.ts";
import { uniqueDef } from "./defs/uniques.ts";
import {
  addToInventory,
  bankConsumable,
  bankMedkit,
  consumableName,
  equipmentName,
  hasStackRoom,
  inventoryRoomFor,
  markIdentified,
  medkitTierIndex,
  mintUnique,
  repairAll,
  repairAllCost,
  rollEquipment,
  sellValue,
  topMedkitTier,
} from "./items/index.ts";
import { addMapMarker, removeMapMarkers } from "./map.ts";
import { lineOfSight, resolveObstacles } from "./obstacles.ts";
import { nearestHeroWhere, partyLevel } from "./party.ts";
import { zonesBounds, type Zone } from "./zones.ts";
import type {
  Equipment,
  GameState,
  Merchant,
  MerchantBuyback,
  MerchantConsumable,
  MerchantStock,
  Player,
} from "./types/index.ts";

/**
 * Mint a level's merchant at creation. He spawns well away from the player
 * (config `MERCHANT.minSpawnDistance` — he is met out in the level, never
 * handed over at the door) and clear of obstacles, placed and forever rolled
 * by his OWN rng stream derived from the run seed, so adding him changed no
 * existing roll sequence and his wandering never will.
 */
export function createMerchant(
  seed: number,
  level: {
    id: string;
    width: number;
    height: number;
    merchant?: { sprite?: string; parked?: boolean; beat?: boolean };
    /** Authored spots the trader may first appear at (LevelDef.merchantSpawns). */
    merchantSpawns?: Vec2[];
  },
  playerSpawn: Vec2,
  blocked: (pos: Vec2, radius: number) => boolean,
  // Met here on a prior run (persisted per level+difficulty): stand him right
  // by the door so a restart-after-death can walk straight to the counter and
  // repair. `revealMerchant` (called once the run's state exists) then opens him
  // for business. When false he spawns out in the level, met the usual way.
  preDiscovered = false,
): Merchant {
  // A fixed XOR keeps his stream distinct from the run's (same seed).
  const rng: Rng = createRngFromState((seed ^ 0x5eed) >>> 0 || 1);
  const margin = MERCHANT.radius + 8;
  // Authored MERCHANT SPAWN POINTS: when the level names them, drop the trader
  // at one designed spot (rolled on his own stream) instead of searching the
  // whole map — the shop lands somewhere intended. A pre-placed (met-before)
  // trader keeps his door post, so this only steers a fresh placement.
  const spawnPoints = level.merchantSpawns ?? [];
  // A RESIDENT trader — parked at his counter, or working a beat — starts on
  // the carve's own spot even on a met-before restart: the pitch IS his door
  // post, so `preDiscovered` must not pull him over to the hero's spawn.
  const resident =
    level.merchant?.parked === true || level.merchant?.beat === true;
  const authored =
    (resident || !preDiscovered) && spawnPoints.length > 0
      ? ([...spawnPoints]
          .sort(() => rng() - 0.5)
          .find((p) => !blocked(p, MERCHANT.radius)) ?? spawnPoints[0])
      : null;
  // COPIED, never aliased: the trader WALKS from wherever he is put, and `pos`
  // is written every tick. Handing him the level's own point made his stall
  // drag the def's `merchantSpawns` entry (and the safe zone that shares it)
  // around the map behind him — invisible in a single run, and a desync the
  // moment a second machine builds the same level and compares.
  let pos: Vec2 = authored
    ? { x: authored.x, y: authored.y }
    : preDiscovered
      ? nearSpawnSpot(playerSpawn, level, blocked)
      : { x: level.width / 2, y: level.height / 2 };
  if (!preDiscovered && !authored) {
    for (let attempts = 0; attempts < 60; attempts++) {
      const candidate = {
        x: randomRange(rng, margin, level.width - margin),
        y: randomRange(rng, margin, level.height - margin),
      };
      // Small levels may not have the full clearance to give — halve the
      // demand every 20 failed attempts rather than parking him on the spawn.
      const clearance =
        MERCHANT.minSpawnDistance / (1 + Math.floor(attempts / 20));
      if (distance(candidate, playerSpawn) < clearance) continue;
      if (blocked(candidate, MERCHANT.radius)) continue;
      pos = candidate;
      break;
    }
  }
  return {
    pos,
    // The trader dresses for the venue: the level def names his look.
    sprite: level.merchant?.sprite ?? "merchant",
    wanderTarget: null,
    idleMs: 0,
    legMs: 0,
    faceLeft: false,
    moving: false,
    discovered: false,
    // Nobody has hailed him and nothing has hit him yet.
    haltMs: 0,
    dead: false,
    // A pre-placed trader owes a "welcome back" line (delivered on approach);
    // one met live greets through the first-meeting scene, so he owes none.
    greetedReturn: !preDiscovered,
    stock: [],
    // Nothing has been sold to him yet — the shelf fills from `sellItem`.
    buyback: [],
    // Parked as a plain number so the merchant serializes with the run.
    rngState: rngState(rng),
  };
}

/** A clear spot a short walk from the player spawn for a pre-placed merchant —
 * near enough to reach at once, not on top of the hero. Rings out from the
 * spawn, falling back to the spawn itself if terrain refuses every offset. */
function nearSpawnSpot(
  playerSpawn: Vec2,
  level: { width: number; height: number },
  blocked: (pos: Vec2, radius: number) => boolean,
): Vec2 {
  const margin = MERCHANT.radius + 8;
  const reach = MERCHANT.tradeRadius + MERCHANT.radius + 12;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const candidate = {
      x: clamp(
        playerSpawn.x + Math.cos(angle) * reach,
        margin,
        level.width - margin,
      ),
      y: clamp(
        playerSpawn.y + Math.sin(angle) * reach,
        margin,
        level.height - margin,
      ),
    };
    if (!blocked(candidate, MERCHANT.radius)) return candidate;
  }
  return { ...playerSpawn };
}

/**
 * One draw off the merchant's private stream: rebuild the generator at his
 * parked state, pull a float, park the advanced state back. A closure per
 * draw is nothing at his draw rate (a few per wander leg), and keeping the
 * state a plain number is what lets a saved run freeze him losslessly.
 */
function draw(merchant: Merchant): number {
  const rng = createRngFromState(merchant.rngState);
  const value = rng();
  merchant.rngState = rngState(rng);
  return value;
}

/**
 * Advance the merchant one tick: wander while unmet, and latch DISCOVERED
 * the first time the hero comes close enough (in line of sight). Discovery
 * roots him for good, pins the level map, rolls his stall, and emits
 * `merchantDiscovered`. All randomness draws his own stream.
 *
 * A trader on a BEAT is the exception at both ends: discovery does not root
 * him (he keeps pacing his strip for the whole run), and a HAIL does — until
 * the shop closes. A trader who has been RUN DOWN does nothing ever again.
 */
export function stepMerchant(state: GameState, dt: number, dtMs: number): void {
  const merchant = state.merchant;
  merchant.moving = false;
  if (merchant.dead) return;
  const beat = beatOf(state);
  if (merchant.discovered) {
    maybeGreetReturn(state, merchant);
    // Everybody but the beat trader is rooted by the meeting, for good.
    if (!beat) return;
    // THE COUNTER STANDS STILL WHILE IT IS OPEN. Solo the world is halted
    // anyway (`partyBlocked`), but in a party the run plays on around the
    // shopper — and a trader who strolled off mid-purchase would leave the
    // shop open at a range that can no longer be walked back into.
    if (state.players.some((hero) => hero.screen === "shop")) {
      merchant.haltMs = MERCHANT.hailMs;
    }
    if (merchant.haltMs > 0) {
      merchant.haltMs = Math.max(0, merchant.haltMs - dtMs);
      merchant.wanderTarget = null;
      return;
    }
    stepBeat(state, merchant, beat, dt, dtMs);
    return;
  }

  // The meeting: close enough to see each other, and nothing in the way.
  // WHOEVER FINDS HIM FINDS HIM FOR EVERYBODY — the stall is a fixture of the
  // run, not a private acquaintance, and a merchant seven players could not
  // trade with because the eighth walked past first would be a bug nobody
  // could diagnose from the field. (The town hub retires the question outright
  // by standing him there.)
  const finder = nearestHeroWhere(state, merchant.pos, (hero) =>
    lineOfSight(state, hero.pos, merchant.pos),
  );
  if (
    finder &&
    distance(finder.pos, merchant.pos) <= MERCHANT.discoverRadius &&
    lineOfSight(state, finder.pos, merchant.pos)
  ) {
    merchant.discovered = true;
    // Met live — the first-meeting scene IS his greeting, so he owes no
    // separate "welcome back" on this run.
    merchant.greetedReturn = true;
    merchant.wanderTarget = null;
    merchant.faceLeft = finder.pos.x < merchant.pos.x;
    merchant.stock = rollStock(state, merchant, finder);
    addMapMarker(state, "merchant", merchant.pos, "merchant");
    state.events.push({
      type: "merchantDiscovered",
      pos: { ...merchant.pos },
    });
    // The meeting scene: his own story for being here, and the sales pitch —
    // played once, through the ordinary dialogue box. It yields to any scene
    // already on stage (the meeting still happened; only the line is lost).
    const greeting = runLevelDef(state).merchant?.greeting;
    if (
      greeting &&
      greeting.length > 0 &&
      state.dialogue === null &&
      !state.dialogueMuted
    ) {
      state.dialogue = {
        source: { kind: "merchant", levelId: state.level.id },
        page: 0,
      };
      state.phase = "dialogue";
      state.events.push({
        type: "dialogueStarted",
        speaker: merchantName(state.level.id),
      });
    }
    return;
  }

  // A PARKED trader never wanders — the counter is where he is, discovered
  // or not. (A parked merchant is normally revealed at creation; this guard
  // is what keeps a modded or adopted state honest about it.)
  if (runLevelDef(state).merchant?.parked) return;
  // …and an UNMET beat trader still walks his strip, on the same reasoning.
  if (beat) {
    stepBeat(state, merchant, beat, dt, dtMs);
    return;
  }

  // Wandering: idle a beat, pick a leg, stroll it, idle again. A leg that
  // terrain refuses (walking into a wall) simply times out and re-rolls.
  if (merchant.idleMs > 0) {
    merchant.idleMs = Math.max(0, merchant.idleMs - dtMs);
    return;
  }
  if (!merchant.wanderTarget) {
    const angle = draw(merchant) * Math.PI * 2;
    const reach =
      MERCHANT.wanderRange[0] +
      draw(merchant) * (MERCHANT.wanderRange[1] - MERCHANT.wanderRange[0]);
    const margin = MERCHANT.radius + 8;
    merchant.wanderTarget = {
      x: clamp(
        merchant.pos.x + Math.cos(angle) * reach,
        margin,
        state.level.width - margin,
      ),
      y: clamp(
        merchant.pos.y + Math.sin(angle) * reach,
        margin,
        state.level.height - margin,
      ),
    };
    // Time budget: the leg's length at his pace, with slack — then give up.
    merchant.legMs = (reach / MERCHANT.speed) * 1000 * 1.5;
  }
  walkLeg(state, merchant, dt, dtMs);
}

/** The strip this level's trader PACES, or undefined if he does not pace one
 * — the level def has to ASK for a beat and the map has to have carved him
 * one, because either half alone is a trader standing in the wrong place. */
function beatOf(state: GameState): readonly Zone[] | undefined {
  const def = runLevelDef(state);
  if (def.merchant?.beat !== true) return undefined;
  const beat = def.merchantBeat;
  return beat !== undefined && beat.length > 0 ? beat : undefined;
}

/**
 * One tick of a trader WORKING HIS PITCH: he crosses his strip end to end,
 * pauses, and comes back — up and down the street all run.
 *
 * The turn is what makes it a beat rather than a fenced wander, and it needs
 * no heading on the merchant to remember: every leg is aimed at the FAR end
 * of the strip's long axis, so reaching one end can only produce a leg back
 * towards the other. His own stream rolls how far along he actually goes and
 * where across the strip he drifts, which is what keeps the pacing from
 * reading as a shuttle on a rail.
 */
function stepBeat(
  state: GameState,
  merchant: Merchant,
  beat: readonly Zone[],
  dt: number,
  dtMs: number,
): void {
  if (merchant.idleMs > 0) {
    merchant.idleMs = Math.max(0, merchant.idleMs - dtMs);
    return;
  }
  if (!merchant.wanderTarget) {
    const bounds = zonesBounds(beat);
    if (!bounds) return;
    const margin = MERCHANT.radius + 4;
    // The LONG axis is the street; the short one is how wide the pavement is.
    const alongY = bounds.maxY - bounds.minY >= bounds.maxX - bounds.minX;
    const lo = (alongY ? bounds.minY : bounds.minX) + margin;
    const hi = (alongY ? bounds.maxY : bounds.maxX) - margin;
    const crossLo = (alongY ? bounds.minX : bounds.minY) + margin;
    const crossHi = (alongY ? bounds.maxX : bounds.maxY) - margin;
    const at = alongY ? merchant.pos.y : merchant.pos.x;
    const far = at < (lo + hi) / 2 ? hi : lo;
    const along = clamp(
      at + (far - at) * (MERCHANT.beatLegFraction + draw(merchant) * 0.4),
      Math.min(lo, hi),
      Math.max(lo, hi),
    );
    const cross = crossLo + draw(merchant) * Math.max(0, crossHi - crossLo);
    merchant.wanderTarget = alongY
      ? { x: cross, y: along }
      : { x: along, y: cross };
    merchant.legMs =
      (distance(merchant.pos, merchant.wanderTarget) / MERCHANT.speed) *
      1000 *
      1.5;
  }
  walkLeg(state, merchant, dt, dtMs);
}

/**
 * Walk the current leg one tick — shared by the free wander and the beat, so
 * both answer for terrain, facing and the give-up timer identically. A leg
 * that arrives (or times out against a wall) is dropped, and he stands there
 * for a rolled beat before the next one is picked.
 */
function walkLeg(
  state: GameState,
  merchant: Merchant,
  dt: number,
  dtMs: number,
): void {
  const target = merchant.wanderTarget;
  if (!target) return;
  const before = merchant.pos;
  merchant.pos = moveToward(merchant.pos, target, MERCHANT.speed * dt);
  const dx = merchant.pos.x - before.x;
  if (Math.abs(dx) > 0.01) merchant.faceLeft = dx < 0;
  merchant.moving = true;
  resolveObstacles(state, merchant.pos, MERCHANT.radius);
  merchant.legMs -= dtMs;
  if (distance(merchant.pos, target) < 2 || merchant.legMs <= 0) {
    merchant.wanderTarget = null;
    merchant.idleMs =
      MERCHANT.idleMs[0] +
      draw(merchant) * (MERCHANT.idleMs[1] - MERCHANT.idleMs[0]);
  }
}

/**
 * HAIL him: root a beat trader where he stands so the hero can walk up to a
 * counter that has stopped moving. The app sends this on a tap that lands on
 * him — whether or not the hero is close enough for the shop to open, which
 * is the whole point of it, since a trader you cannot catch is a trader you
 * cannot buy from.
 *
 * It expires on its own (`MERCHANT.hailMs`) so a hail nobody follows up on
 * costs the street its dealer for twenty seconds rather than for the run; the
 * open shop keeps topping it up, and `closeShop` clears it outright — which
 * is what puts him back on the pavement the moment the modal is dismissed.
 * A no-op (returning false, so a stray tap is simply ignored) for a trader
 * who is dead, undiscovered, or not walking anywhere in the first place.
 */
export function hailMerchant(state: GameState): boolean {
  const merchant = state.merchant;
  if (merchant.dead || !merchant.discovered) return false;
  if (!beatOf(state)) return false;
  merchant.haltMs = MERCHANT.hailMs;
  merchant.wanderTarget = null;
  merchant.moving = false;
  return true;
}

/**
 * RUN DOWN — a driven car caught the trader (`runDownMerchant`, vehicles.ts).
 * The stall closes on the spot: every open counter is dropped, the map pin
 * comes off, and nothing about him is stepped again for the rest of the run.
 *
 * Nothing here is persisted, and that is the design rather than an omission:
 * a merchant is minted per run (`createMerchant`), so the next visit finds
 * somebody else working the same pitch. Dealers are replaced.
 */
export function killMerchant(state: GameState): void {
  const merchant = state.merchant;
  if (merchant.dead) return;
  merchant.dead = true;
  merchant.moving = false;
  merchant.wanderTarget = null;
  merchant.haltMs = 0;
  for (const hero of state.players) {
    if (hero.screen === "shop") delete hero.screen;
  }
  removeMapMarkers(state, "merchant");
  state.events.push({ type: "merchantKilled", pos: { ...merchant.pos } });
}

/**
 * Reveal the merchant WITHOUT the walk-up meeting — used at map start when the
 * hero has already met him here (persisted per level+difficulty, fed in via
 * `createGame`). Roots him and rolls his stall against the arriving hero, just
 * like a live discovery, but plays NO scene: his "welcome back" line waits for
 * the hero to come near (`maybeGreetReturn`), and `greetedReturn` stays false
 * until then. Call once the run's state exists and the loadout is applied (so
 * his stock is priced off the hero who actually arrived).
 */
export function revealMerchant(state: GameState): void {
  const merchant = state.merchant;
  if (merchant.discovered) return;
  merchant.discovered = true;
  // A RESIDENT trader owes no "welcome back" — the hub is re-entered
  // constantly, and a scene on every approach would make the counter a toll
  // booth. The met-before wanderer keeps his line for the walk-up.
  const def = runLevelDef(state).merchant;
  merchant.greetedReturn = def?.parked === true || def?.beat === true;
  merchant.wanderTarget = null;
  // SEAT 0 IS CORRECT HERE. A met-before reveal runs inside `createGame`,
  // before the run has been handed to a session and therefore before anybody
  // can have joined it: the party is one hero by construction, and that hero
  // is the arriving one the stall prices itself against. (A joiner arriving
  // later meets a stall that is already stocked — the shelf is a fixture of
  // the run, shared by the whole party, exactly like the trader himself.)
  merchant.stock = rollStock(state, merchant, state.players[0]);
  addMapMarker(state, "merchant", merchant.pos, "merchant");
}

/**
 * Deliver the "welcome back" line the first time the hero comes near a merchant
 * REVEALED at the door (met here before). Same proximity trigger as a live
 * meeting, but it plays the per-level `returnGreeting` + the difficulty's
 * send-off instead of the first-meeting scene, and only once the run is live.
 */
function maybeGreetReturn(state: GameState, merchant: Merchant): void {
  if (merchant.greetedReturn || state.phase !== "playing") return;
  const finder = nearestHeroWhere(state, merchant.pos, (hero) =>
    lineOfSight(state, hero.pos, merchant.pos),
  );
  if (!finder) return;
  if (distance(finder.pos, merchant.pos) > MERCHANT.discoverRadius) return;
  if (!lineOfSight(state, finder.pos, merchant.pos)) return;
  merchant.greetedReturn = true;
  merchant.faceLeft = finder.pos.x < merchant.pos.x;
  if (state.dialogueMuted) return;
  state.dialogue = {
    source: {
      kind: "merchant",
      levelId: state.level.id,
      returning: true,
      difficulty: state.difficulty,
    },
    page: 0,
  };
  state.phase = "dialogue";
  state.events.push({
    type: "dialogueStarted",
    speaker: merchantName(state.level.id),
  });
}

/**
 * Mend the hero's WHOLE kit for coins at the counter — the worn weapon and
 * armor plus every breakable piece in the bag, each priced by `repairAllCost`
 * (dearer for high required level, rarer tier, finer make). Only with the shop
 * open; refused when nothing needs mending or the purse is short. Returns the
 * coins paid, else null (so the app can ignore a dud tap).
 */
export function repairGear(state: GameState, hero: Player): number | null {
  if (hero.screen !== "shop") return null;
  const cost = repairAllCost(state, hero);
  if (cost <= 0) return null; // nothing to mend
  if (hero.coins < cost) return null; // can't afford it
  repairAll(state, hero);
  hero.coins -= cost;
  state.events.push({ type: "gearRepaired", paid: cost });
  return cost;
}

/**
 * A stall powerup's price: the level-scaled base, marked up by how RARE the
 * power is (`AbilityDef.rarity` — see `ECONOMY.abilityRarityMarkupCap`). The
 * markup is what stops the counter being a way to buy past the drop ladder's
 * rationing of the strong powers; an ordinary power sits at exactly the base.
 */
function abilityPrice(hero: Player, defId: string): number {
  const base = ECONOMY.abilityBase + ECONOMY.abilityPerLevel * hero.level;
  const rarity = abilityRarity(defId);
  const markup =
    rarity > 0
      ? Math.min(
          ECONOMY.abilityRarityMarkupCap,
          Math.max(1, ABILITY_DEFAULT_RARITY / rarity),
        )
      : ECONOMY.abilityRarityMarkupCap;
  return Math.round(base * markup);
}

/** A stall consumable's price: the kind's level-scaled base, and for a MEDKIT
 * scaled again by how much of the bar its quality mends against the lightest
 * kit's — so a SUPERIOR costs what it is worth rather than what a LIGHT does. */
function consumablePrice(
  hero: Player,
  item: MerchantConsumable,
  tier: number | undefined,
): number {
  const { base, perLevel } = ECONOMY.consumablePrices[item];
  let price = base + perLevel * hero.level;
  if (item === "medkit") {
    const lightest = MEDKIT.tiers[0];
    const quality = MEDKIT.tiers[medkitTierIndex(tier)];
    if (lightest && quality) price *= quality.healPct / lightest.healPct;
  }
  return Math.round(price);
}

/**
 * Stock the stall for the hero just met, ONCE and for good: a few POWERUPS off
 * the level's own ability pool (drawn on their `rarity` weights, so the counter
 * offers the same powers the field does at the same odds), a pile each of the
 * three CONSUMABLES, and a couple of WEAPONS rolled from the level's base pool
 * with the stall's tier skew (Diablo 2's gamble counter) — priced at their own
 * sell value × the vendor markup, so a stall weapon costs roughly what selling
 * a handful of magic finds brings in, ×10.
 *
 * NOTHING HERE RUNS TWICE. The stall is rolled at the meeting and spent down by
 * purchases; a hero who empties it has emptied it for the level. That is the
 * whole reason the counter is a decision — a restocking shelf turns every trip
 * back into "sell loot, re-buy the same power", and the merchant becomes a
 * better source of powerups than the entire drop ladder.
 *
 * Every roll draws the MERCHANT's rng (the run's stream is swapped out for
 * the duration), so when the meeting happens can never reshuffle the drops
 * the rest of the run would have paid.
 */
function rollStock(
  state: GameState,
  merchant: Merchant,
  // The customer he stocks AGAINST — the hero who met him (or, on a met-before
  // reveal, the arriving one). The stall is shared by the whole party, so the
  // mlvl and the medkit tier read the party; only the price scaling and the
  // gamble rolls are his.
  hero: Player,
): Merchant["stock"] {
  const stock: Merchant["stock"] = [];
  const level = runLevelDef(state);
  const abilityPool = level.loot.abilityPool;
  for (let i = 0; i < MERCHANT.stockAbilities && abilityPool.length > 0; i++) {
    const defId = pickAbility(abilityPool, draw(merchant));
    if (defId === null) break;
    // One stall slot per distinct powerup — a duplicate roll collapses.
    if (stock.some((s) => s.kind === "ability" && s.defId === defId)) continue;
    stock.push({
      id: state.nextId++,
      kind: "ability",
      defId,
      price: abilityPrice(hero, defId),
      // ONE unit: the dock holds three powers, and three slots of one is
      // already a full dock bought over the counter.
      qty: 1,
    });
  }
  // The consumable shelf: a medkit of the deepest quality the HERO's own level
  // has unlocked (the same yardstick the stall's weapon rolls use — he stocks
  // for the customer in front of him), a repair kit, an energy drink. No roll:
  // these are the shop's staples, and a trader who sometimes had no bandages
  // would just be a trader you learn not to visit.
  const medkitTier = topMedkitTier(partyLevel(state));
  const shelf: MerchantConsumable[] = ["medkit", "repair", "drink"];
  for (const item of shelf.slice(0, MERCHANT.stockConsumables)) {
    const tier = item === "medkit" ? medkitTier : undefined;
    stock.push({
      id: state.nextId++,
      kind: "consumable",
      item,
      ...(tier !== undefined ? { tier } : {}),
      price: consumablePrice(hero, item, tier),
      // Never deeper than the dock's own stack, so clearing the shelf in one
      // visit can't leave units the bank would refuse.
      qty: Math.min(MERCHANT.stockConsumableQty, CONSUMABLES.stackCap),
    });
  }
  // SMELLING SALTS: the one cure for a downed companion, and the only reason
  // losing a friend is a setback rather than an ending. Stocked on every stall
  // — see `MERCHANT.stockRevives` for why it does not wait until the hero
  // actually has somebody to wake. Rolled through no dice at all: a staple, not
  // a find, exactly like the medkit shelf above it.
  for (const defId of reviveGearIds()) {
    stock.push({
      id: state.nextId++,
      kind: "weapon",
      equipment: {
        id: state.nextId++,
        defId,
        slot: gearDef(defId).slot,
        tier: "regular",
        ilvl: Math.max(1, partyLevel(state)),
        affixes: [],
      },
      price: Math.round(
        ECONOMY.revivePrice.base + ECONOMY.revivePrice.perLevel * hero.level,
      ),
      qty: MERCHANT.stockRevives,
    });
  }
  // ITEM LOOKUP TICKETS (`GearDef.identify`): the take-home identify, D2's
  // scroll shelf. A staple like the salts — no dice, stocked on every stall —
  // because a hero drowning in unidentified finds with no way to read them in
  // the field is exactly the customer this counter exists for. Each purchase
  // MERGES into the bag's ticket stack (`addToInventory`), so buying the shelf
  // down fills one cell, not twenty.
  for (const defId of identifyGearIds()) {
    stock.push({
      id: state.nextId++,
      kind: "weapon",
      equipment: {
        id: state.nextId++,
        defId,
        slot: gearDef(defId).slot,
        tier: "regular",
        ilvl: 1,
        affixes: [],
      },
      price: Math.round(
        ECONOMY.lookupTicketPrice.base +
          ECONOMY.lookupTicketPrice.perLevel * hero.level,
      ),
      qty: MERCHANT.stockLookupTickets,
    });
  }
  // The weapon rolls ride the ordinary loot pipeline (level pool, levelReq
  // gates, tiers, affixes) — on the merchant's dice, not the run's: swap a
  // generator built at his parked state in for the rolls, park it back after.
  const runRng = state.rng;
  const merchantRng = createRngFromState(merchant.rngState);
  state.rng = merchantRng;
  try {
    for (let i = 0; i < MERCHANT.stockWeapons; i++) {
      // Identified on the shelf: the trader knows his own stock, and a price
      // tag on a veiled roll would be a gamble the stall doesn't sell — the
      // sellValue below already reads the piece's true tier.
      const equipment = markIdentified(
        rollEquipment(state, hero, {
          slot: "weapon",
          tierBonus: MERCHANT.stockTierBonus,
          // Stocked against the hero himself — his level is the stall's mlvl.
          mlvl: partyLevel(state),
        }),
      );
      stock.push({
        id: state.nextId++,
        kind: "weapon",
        equipment,
        price: sellValue(equipment) * ECONOMY.weaponBuyMarkup,
        qty: 1,
      });
    }
    // Stall UNIQUES (`merchant.stockUniques`): the level's persona fences
    // named uniques, each ROLLED at the standing boss-unique odds
    // (`UNIQUE.dropChance × mlvl/ilvl`, capped — the hero's level standing
    // in for the killer's, exactly like the stall's weapon rolls). Same
    // rarity as any unique, different venue: it appears on the counter
    // instead of a corpse, and costs coins instead of a kill — the loop a
    // fallen oligarch's expensive-but-useless valuables exist to fund.
    for (const id of level.merchant?.stockUniques ?? []) {
      const ilvl = Math.max(1, uniqueDef(id).ilvl);
      const chance = Math.min(
        UNIQUE.dropChanceCap,
        UNIQUE.dropChance * (partyLevel(state) / ilvl),
      );
      if (state.rng() >= chance) continue;
      // A fenced unique is sold BY NAME — identified like the rest of the
      // counter, or the price tag would spoil what the label withheld.
      const equipment = markIdentified(mintUnique(state, id));
      stock.push({
        id: state.nextId++,
        kind: "weapon",
        equipment,
        price: sellValue(equipment) * ECONOMY.weaponBuyMarkup,
        qty: 1,
      });
    }
  } finally {
    merchant.rngState = rngState(merchantRng);
    state.rng = runRng;
  }
  return stock;
}

/**
 * What a stall entry is CALLED — the one accessor for a stock row's label, so
 * the counter names a thing exactly as the pickup card and the dock do (a
 * medkit by its quality, a kit by its pickup name, a power and a weapon by
 * their own). The app reads this rather than re-deriving a name per kind, which
 * is how a mod's power ends up labelled correctly on the counter for free.
 */
export function stockName(entry: MerchantStock): string {
  switch (entry.kind) {
    case "ability":
      return abilityDef(entry.defId).name;
    case "weapon":
      return equipmentName(entry.equipment);
    case "consumable":
      return entry.item === "medkit"
        ? (MEDKIT.tiers[medkitTierIndex(entry.tier)]?.name ?? "MEDKIT")
        : consumableName(entry.item);
  }
}

/** What the dialogue box calls this level's trader. */
export function merchantName(levelId: string): string {
  return levelDef(levelId).merchant?.name ?? "THE MERCHANT";
}

/**
 * HIS COUNTER LINE — the one thing this level's trader says when the shop
 * opens (`LevelDef.merchant.line`), or null where the venue authored none.
 *
 * Deliberately NOT a dialogue scene: a greeting the player reads every single
 * visit has to be something they can trade straight through, so it is drawn
 * across the counter with his face and his name rather than through the box
 * that stops the world. The app reads it here so the counter never has to
 * know what a level def looks like.
 */
export function merchantLine(levelId: string): string | null {
  return levelDef(levelId).merchant?.line ?? null;
}

/**
 * The merchant's WARD (config `MERCHANT.repelRadius`): push a monster's
 * position out to the rim whenever it strays inside — his stall never
 * drowns in the horde, so the hero can always reach the counter. Called
 * from the enemy pass in step/ alongside obstacle resolution; the caller
 * decides who is exempt (bosses, apparitions).
 */
export function repelFromMerchant(state: GameState, pos: Vec2): void {
  const merchant = state.merchant;
  const r = MERCHANT.repelRadius;
  const dx = pos.x - merchant.pos.x;
  const dy = pos.y - merchant.pos.y;
  const dSq = dx * dx + dy * dy;
  if (dSq >= r * r) return;
  if (dSq === 0) {
    // Dead center (a spawn on top of him): any direction will do.
    pos.x = merchant.pos.x + r;
    return;
  }
  const d = Math.sqrt(dSq);
  pos.x = merchant.pos.x + (dx / d) * r;
  pos.y = merchant.pos.y + (dy / d) * r;
}

// What a piece of loot is worth in coins — the one valuation every surface
// reads (the sell action below, the stall's weapon prices, the app's price
// tags, the autopilot's bag discipline). It is pure ITEM math, so it lives in
// items/worth.ts; re-exported here because the merchant is where callers
// expect to find a price.
export { sellValue };

/**
 * Open the shop for this hero: only mid-run, only with the merchant met, and
 * only with the hero actually at the stall (config `MERCHANT.tradeRadius`).
 * The screen is the SHOPPER's own — the rest of the party plays
 * on, and two heroes can stand at the counter at once (the shelf is shared,
 * exactly like the stall itself). Returns false when any gate refuses, so the
 * app can ignore a stray tap.
 */
export function openShop(state: GameState, hero: Player): boolean {
  if (state.phase !== "playing" || hero.screen !== undefined) return false;
  const merchant = state.merchant;
  if (!merchant.discovered || merchant.dead) return false;
  // The SHOPPER has to be at the counter — this one is emphatically not "any
  // hero", or a player across the map would find the stall open in front of
  // them because somebody else walked up to it. `hero` is the one who tapped,
  // which on the wire is the seat the session admitted the client into.
  if (distance(hero.pos, merchant.pos) > MERCHANT.tradeRadius) {
    return false;
  }
  hero.screen = "shop";
  // A counter being leaned on stands still (a no-op for everyone who was
  // standing still already) — see `hailMerchant`.
  merchant.haltMs = MERCHANT.hailMs;
  merchant.wanderTarget = null;
  return true;
}

/**
 * Close the shop — and, for a trader who works a beat, PUT HIM BACK ON IT.
 * The halt is cleared rather than left to expire: dismissing the counter is
 * the player saying they are done, and a dealer who stood there for another
 * twenty seconds afterwards would read as a man waiting to be run over.
 *
 * `state` is a parameter for exactly that half, so a hero closing his own
 * screen in a party still hands the street its trader back.
 */
export function closeShop(state: GameState, hero: Player): void {
  if (hero.screen !== "shop") return;
  delete hero.screen;
  if (!state.players.some((other) => other.screen === "shop")) {
    state.merchant.haltMs = 0;
  }
}

/**
 * Sell the piece in bag cell `index` across the counter: its `sellValue`
 * lands in the purse and the piece goes onto the trader's BUY-BACK shelf
 * (`buybackItem` below — it is recoverable until the shelf pushes it off or
 * the hero leaves the level). Only while the shop is open. Returns the coins
 * paid, or null on an empty cell (no mutation).
 *
 * A sale is the ONE way coins come into a run, so it is also where the AUTO
 * PILOT ride books its takings (`autopilot.coinsEarned`) — the counterpart to
 * the meter's `coinsSpent`, shown side by side on the ride's scoreboard.
 */
export function sellItem(
  state: GameState,
  hero: Player,
  index: number,
): number | null {
  if (hero.screen !== "shop") return null;
  const item = hero.inventory[index];
  if (!item) return null;
  const paid = sellValue(item);
  hero.inventory[index] = null;
  hero.coins += paid;
  // The recycling faucet's tally, beside the gold faucet's (`goldCollected`):
  // the two together are what the run's play was worth in coins, which is the
  // figure `GOLD.dropMult` is calibrated against.
  state.stats.coinsSold += paid;
  if (state.autopilot.active) state.autopilot.coinsEarned += paid;
  shelveForBuyback(state.merchant, item, paid, state.autopilot.active);
  return paid;
}

/**
 * Put a just-sold piece on the trader's BUY-BACK shelf at the front (most
 * recent first — the mistake a player wants back is almost always the LAST
 * thing that left the bag, and a SELL JUNK sweep of a full bag would otherwise
 * bury it under eleven mops). At `MERCHANT.buybackSlots` the OLDEST entry
 * falls off the end for good.
 */
function shelveForBuyback(
  merchant: Merchant,
  item: Equipment,
  price: number,
  ride: boolean,
): void {
  merchant.buyback.unshift(ride ? { item, price, ride } : { item, price });
  if (merchant.buyback.length > MERCHANT.buybackSlots) {
    merchant.buyback.length = MERCHANT.buybackSlots;
  }
}

/** Why a buy-back can't go through — the piece has fallen off the shelf (or
 * somebody beat you to it), the purse is short, or the bag has no free cell.
 * Named apart from the LOST & FOUND's `VaultRefusal` on purpose: the two
 * happen to refuse for the same three reasons today, and a shared alias would
 * quietly tie the trader's counter to the AUTO PILOT's vault. */
export type BuybackRefusal = "gone" | "coins" | "bag";

/**
 * The BUY-BACK shelf as the counter lists it: most recently sold first. A copy
 * — the caller never reorders the shelf itself, because the shelf's order IS
 * its eviction order.
 */
export function buybackContents(merchant: Merchant): MerchantBuyback[] {
  return [...merchant.buyback];
}

/**
 * Buy a sold piece back off the shelf, by the ITEM's own id: the purse pays
 * exactly what the trader paid for it and the piece lands in the first free
 * bag cell, the same instance that left it — its affixes, its ilvl and its
 * worn-down durability all intact.
 *
 * **A BUY-BACK IS NOT A PURCHASE, IT IS AN UNDO**, which is why it is priced
 * at the sale rather than at the stall's markup and why it books its coins
 * back out of the same tallies `sellItem` booked them into. A shelf that
 * charged the vendor gap would make a mis-tap on the deal card cost ten times
 * what the piece was worth, and a shelf that left `stats.coinsSold` inflated
 * would tell the balance sim the run recycled loot it still has in the bag.
 *
 * Refused (with nothing spent and nothing moved) when the piece is no longer
 * shelved, the purse is short, or there is nowhere to put it. Returns `null`
 * on success, else the refusal — the same shape the LOST & FOUND's buy-back
 * answers in, so one browser reads both.
 */
export function buybackItem(
  state: GameState,
  hero: Player,
  itemId: number,
): BuybackRefusal | null {
  if (hero.screen !== "shop") return "gone";
  const merchant = state.merchant;
  const at = merchant.buyback.findIndex((entry) => entry.item.id === itemId);
  if (at < 0) return "gone";
  const entry = merchant.buyback[at] as MerchantBuyback;
  if (hero.coins < entry.price) return "coins";
  const cell = hero.inventory.indexOf(null);
  if (cell < 0) return "bag";
  hero.coins -= entry.price;
  hero.inventory[cell] = entry.item;
  merchant.buyback.splice(at, 1);
  // Un-book the sale: the piece is back in the bag, so the run did not recycle
  // it after all. Both tallies can only fall by what the same sale added.
  state.stats.coinsSold -= entry.price;
  if (entry.ride) {
    state.autopilot.coinsEarned = Math.max(
      0,
      state.autopilot.coinsEarned - entry.price,
    );
  }
  return null;
}

/**
 * Whether this entry can be TAKEN right now, purse aside: the dock has room for
 * the powerup (`canBankAbility` — the carry cap, and the `uniqueHeld` rule that
 * refuses a second NUKE), the bag has a free cell for the weapon, the
 * consumable's own stack isn't already full. Split out because `buyStock` and
 * `canBuyStock` must agree exactly — a row the app offers and the purchase then
 * refuses is a dud tap, and a row it greys out that would have worked is a lost
 * sale.
 */
function canCarryStock(
  state: GameState,
  hero: Player,
  entry: MerchantStock,
): boolean {
  switch (entry.kind) {
    case "ability":
      return canBankAbility(state, hero, entry.defId);
    case "weapon":
      // A STACKABLE row (the lookup tickets) still fits a full bag while an
      // existing stack has room — the same merge `buyStock`'s add performs.
      return (
        hero.inventory.includes(null) || hasStackRoom(hero, entry.equipment)
      );
    case "consumable":
      return entry.item === "medkit"
        ? (hero.medkits[medkitTierIndex(entry.tier)] ?? 0) <
            CONSUMABLES.stackCap
        : hero[entry.item === "repair" ? "repairKits" : "staminaPotions"] <
            CONSUMABLES.stackCap;
  }
}

/**
 * HOW MANY units of this row the hero could TAKE right now, purse aside — the
 * counting form of `canCarryStock`, and it must agree with it exactly for the
 * same reason: the two answer the same question at two arities.
 */
function stockCarryRoom(
  state: GameState,
  hero: Player,
  entry: MerchantStock,
): number {
  switch (entry.kind) {
    case "ability":
      return abilityBankRoom(state, hero, entry.defId);
    case "weapon":
      return inventoryRoomFor(hero, entry.equipment);
    case "consumable": {
      const held =
        entry.item === "medkit"
          ? (hero.medkits[medkitTierIndex(entry.tier)] ?? 0)
          : hero[entry.item === "repair" ? "repairKits" : "staminaPotions"];
      return Math.max(0, CONSUMABLES.stackCap - held);
    }
  }
}

/**
 * Buy one unit of the stall entry with `stockId`, spending the entry's `qty`.
 * A POWERUP goes to the powerup dock, a WEAPON into the bag, a CONSUMABLE into
 * its dock stack — each refused (with no coins spent and no unit spent) when
 * there is nowhere to put it. NOTHING RESTOCKS: the entry's `qty` only ever
 * falls, and at zero it is sold out for the rest of the level. False = the
 * purchase was refused (missing entry, sold out, too poor, or no room).
 */
export function buyStock(
  state: GameState,
  hero: Player,
  stockId: number,
): boolean {
  if (hero.screen !== "shop") return false;
  const entry = state.merchant.stock.find((s) => s.id === stockId);
  if (!entry) return false;
  if (entry.qty <= 0) return false;
  if (hero.coins < entry.price) return false;
  switch (entry.kind) {
    case "ability":
      if (!canBankAbility(state, hero, entry.defId)) return false;
      hero.heldAbilities.push(entry.defId);
      break;
    case "weapon": {
      // A stall row may hold SEVERAL of one thing (the salts shelf), so every
      // purchase hands over its own fresh instance. Passing `entry.equipment`
      // itself was safe only while every such row was `qty: 1`: buy a second
      // and one object would sit in two bag cells at once, sharing an id, a
      // durability counter and a destroy.
      const piece = { ...structuredClone(entry.equipment), id: state.nextId++ };
      if (!addToInventory(state, hero, piece)) return false;
      break;
    }
    case "consumable": {
      const banked =
        entry.item === "medkit"
          ? bankMedkit(state, hero, entry.tier)
          : bankConsumable(state, hero, entry.item);
      if (!banked) return false;
      break;
    }
  }
  entry.qty -= 1;
  hero.coins -= entry.price;
  return true;
}

/**
 * Can `hero` afford (and carry) this stall entry right now? The app reads it to
 * gray out unbuyable rows; `buyStock` re-checks everything itself.
 *
 * **`hero` IS A PARAMETER BECAUSE THIS CRASHED A CLIENT.** A purse, a bag and a
 * pouch are PRIVATE — the split sends a hero's to that hero and to
 * nobody else — and this used to read `state.players[0]` whoever asked. On a
 * JOINER seat 0 belongs to somebody else, so its `inventory` simply is not
 * there, and the autopilot's perfectly ordinary "would a walk to the stall
 * re-arm me?" read (`bot/economy.ts affordableStallUpgrade`) died on
 * `undefined.includes`.
 *
 * It is the exact failure the bot client exists to catch and the one no other
 * test can: `split.ts` declares what TRAVELS, and every suite around it asserts
 * that a field which changed arrived. None of them asks whether the set of
 * fields a client HAS is enough to make a decision with. A human would have met
 * this as a crash on a joiner's machine, minutes into a session, in a build
 * where every test was green.
 */
export function canBuyStock(
  state: GameState,
  hero: Player,
  entry: Merchant["stock"][number],
): boolean {
  if (entry.qty <= 0) return false;
  if (hero.coins < entry.price) return false;
  return canCarryStock(state, hero, entry);
}

/**
 * How many units of this row a BUY ALL would actually take: the pile's own
 * depth, what the purse covers, and what the hero can carry — the smallest of
 * the three. The counter reads it for the stacked row's second button, both to
 * price the tap before it happens and to decide whether that button is worth
 * offering at all; a promise of seven when the dock holds three is a button
 * that lies about what it does.
 *
 * The purchase itself is still `buyStock` per unit, which re-checks all three
 * — this only says how far that loop will get.
 */
export function stockBuyableCount(
  state: GameState,
  hero: Player,
  entry: Merchant["stock"][number],
): number {
  if (entry.qty <= 0) return 0;
  // A free row (a mod's, or a giveaway) is bounded by the pile, not the purse.
  const affordable =
    entry.price > 0 ? Math.floor(hero.coins / entry.price) : entry.qty;
  return Math.max(
    0,
    Math.min(entry.qty, affordable, stockCarryRoom(state, hero, entry)),
  );
}
