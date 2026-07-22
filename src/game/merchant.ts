// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WANDERING MERCHANT and his coin economy (config MERCHANT / ECONOMY).
// One merchant roams every level — the horde ignores him and nothing hurts
// him. Until met he drifts between short wander legs on his OWN seeded rng
// stream (never the run's, so his strolling can't perturb a single loot
// roll); the first close encounter roots him to the spot for the rest of
// the run, pins the level map, and stocks his stall against the hero he
// just met. `openShop` freezes the run in the `shop` phase (like the bag);
// the buy/sell mutators are safe to call from the app's UI outside `step()`.

import {
  createRngFromState,
  randomRange,
  rngState,
  type Rng,
} from "@game/lib/rng.ts";
import { clamp, distance, moveToward, type Vec2 } from "@game/lib/vec.ts";
import { canBankAbility } from "./abilities.ts";
import { reviveDownedCompanions } from "./companions.ts";
import { ECONOMY, MERCHANT, UNIQUE } from "./config/index.ts";
import { gearDef, isWeaponDef, weaponDef } from "./defs/equipment.ts";
import { levelDef } from "./defs/levels/index.ts";
import { uniqueDef } from "./defs/uniques.ts";
import {
  addToInventory,
  mintUnique,
  qualityMult,
  repairAll,
  repairAllCost,
  rollEquipment,
} from "./items/index.ts";
import { addMapMarker } from "./map.ts";
import { lineOfSight, resolveObstacles } from "./obstacles.ts";
import type { Equipment, GameState, Merchant } from "./types.ts";

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
    merchant?: { sprite?: string };
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
  const authored =
    !preDiscovered && spawnPoints.length > 0
      ? ([...spawnPoints]
          .sort(() => rng() - 0.5)
          .find((p) => !blocked(p, MERCHANT.radius)) ?? spawnPoints[0])
      : null;
  let pos: Vec2 = preDiscovered
    ? nearSpawnSpot(playerSpawn, level, blocked)
    : (authored ?? { x: level.width / 2, y: level.height / 2 });
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
    // A pre-placed trader owes a "welcome back" line (delivered on approach);
    // one met live greets through the first-meeting scene, so he owes none.
    greetedReturn: !preDiscovered,
    stock: [],
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
 */
export function stepMerchant(state: GameState, dt: number, dtMs: number): void {
  const merchant = state.merchant;
  merchant.moving = false;
  if (merchant.discovered) {
    maybeGreetReturn(state, merchant);
    return;
  }

  // The meeting: close enough to see each other, and nothing in the way.
  if (
    distance(state.player.pos, merchant.pos) <= MERCHANT.discoverRadius &&
    lineOfSight(state, state.player.pos, merchant.pos)
  ) {
    merchant.discovered = true;
    // Met live — the first-meeting scene IS his greeting, so he owes no
    // separate "welcome back" on this run.
    merchant.greetedReturn = true;
    merchant.wanderTarget = null;
    merchant.faceLeft = state.player.pos.x < merchant.pos.x;
    merchant.stock = rollStock(state, merchant);
    addMapMarker(state, "merchant", merchant.pos, "merchant");
    state.events.push({
      type: "merchantDiscovered",
      pos: { ...merchant.pos },
    });
    // Speaking to the merchant brings the party back: any companion beaten
    // down is stood up and the whole party mended (works in hardcore too).
    reviveDownedCompanions(state);
    // The meeting scene: his own story for being here, and the sales pitch —
    // played once, through the ordinary dialogue box. It yields to any scene
    // already on stage (the meeting still happened; only the line is lost).
    const greeting = levelDef(state.level.id).merchant?.greeting;
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
  const target = merchant.wanderTarget;
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
  merchant.greetedReturn = false;
  merchant.wanderTarget = null;
  merchant.stock = rollStock(state, merchant);
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
  if (distance(state.player.pos, merchant.pos) > MERCHANT.discoverRadius)
    return;
  if (!lineOfSight(state, state.player.pos, merchant.pos)) return;
  merchant.greetedReturn = true;
  merchant.faceLeft = state.player.pos.x < merchant.pos.x;
  // The welcome-back also revives the party — the same mercy the first meeting
  // paid, so a companion downed since is stood back up on the return visit.
  reviveDownedCompanions(state);
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
export function repairGear(state: GameState): number | null {
  if (state.phase !== "shop") return null;
  const cost = repairAllCost(state);
  if (cost <= 0) return null; // nothing to mend
  if (state.player.coins < cost) return null; // can't afford it
  repairAll(state);
  state.player.coins -= cost;
  state.events.push({ type: "gearRepaired", paid: cost });
  return cost;
}

/**
 * Stock the stall for the hero just met: a few POWERUPS off the level's own
 * ability pool (restocked — buy as many as the purse allows), priced off the
 * hero's level, and a couple of one-off WEAPONS rolled from the level's base
 * pool with the stall's tier skew (Diablo 2's gamble counter) — priced at
 * their own sell value × the vendor markup, so a stall weapon costs roughly
 * what selling a handful of magic finds brings in, ×10.
 *
 * Every roll draws the MERCHANT's rng (the run's stream is swapped out for
 * the duration), so when the meeting happens can never reshuffle the drops
 * the rest of the run would have paid.
 */
function rollStock(state: GameState, merchant: Merchant): Merchant["stock"] {
  const stock: Merchant["stock"] = [];
  const level = levelDef(state.level.id);
  const abilityPool = level.loot.abilityPool;
  const abilityPrice =
    ECONOMY.abilityBase + ECONOMY.abilityPerLevel * state.player.level;
  for (let i = 0; i < MERCHANT.stockAbilities && abilityPool.length > 0; i++) {
    const defId = abilityPool[
      Math.floor(draw(merchant) * abilityPool.length)
    ] as string;
    // One stall slot per distinct powerup — a duplicate roll collapses.
    if (stock.some((s) => s.kind === "ability" && s.defId === defId)) continue;
    stock.push({
      id: state.nextId++,
      kind: "ability",
      defId,
      price: abilityPrice,
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
      const equipment = rollEquipment(state, {
        slot: "weapon",
        tierBonus: MERCHANT.stockTierBonus,
        // Stocked against the hero himself — his level is the stall's mlvl.
        mlvl: state.player.level,
      });
      stock.push({
        id: state.nextId++,
        kind: "weapon",
        equipment,
        price: sellValue(equipment) * ECONOMY.weaponBuyMarkup,
        sold: false,
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
        UNIQUE.dropChance * (state.player.level / ilvl),
      );
      if (state.rng() >= chance) continue;
      const equipment = mintUnique(state, id);
      stock.push({
        id: state.nextId++,
        kind: "weapon",
        equipment,
        price: sellValue(equipment) * ECONOMY.weaponBuyMarkup,
        sold: false,
      });
    }
  } finally {
    merchant.rngState = rngState(merchantRng);
    state.rng = runRng;
  }
  return stock;
}

/** What the dialogue box calls this level's trader. */
export function merchantName(levelId: string): string {
  return levelDef(levelId).merchant?.name ?? "THE MERCHANT";
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

/**
 * What the merchant pays for a piece of loot, in coins (config ECONOMY):
 * the item's LEVEL carries the base worth, its TIER multiplies by orders of
 * magnitude (magic 10×, rare 100×, …), and its MATERIAL sweetens the scale —
 * metal melts down for double, precious (gold, gems, true magic) for four
 * times. The one valuation every surface reads: the sell action, the stall's
 * weapon prices, and the app's price tags.
 */
export function sellValue(item: Equipment): number {
  const material = isWeaponDef(item.defId)
    ? weaponDef(item.defId).material
    : gearDef(item.defId).material;
  const materialMult =
    material === "metal"
      ? ECONOMY.metalMult
      : material === "precious"
        ? ECONOMY.preciousMult
        : 1;
  return Math.round(
    (ECONOMY.itemBase + ECONOMY.itemPerIlvl * item.ilvl) *
      ECONOMY.tierValueMult[item.tier] *
      materialMult *
      // Craftsmanship carries to the scales: a BROKEN find melts down for
      // less, a PERFECT one commands its premium (config QUALITY.mults).
      qualityMult(item),
  );
}

/**
 * Open the shop: only mid-run, only with the merchant met, and only with the
 * hero actually at the stall (config `MERCHANT.tradeRadius`). Freezes the
 * run in the `shop` phase, exactly like the bag. Returns false when any gate
 * refuses, so the app can ignore a stray tap.
 */
export function openShop(state: GameState): boolean {
  if (state.phase !== "playing") return false;
  const merchant = state.merchant;
  if (!merchant.discovered) return false;
  if (distance(state.player.pos, merchant.pos) > MERCHANT.tradeRadius) {
    return false;
  }
  // At the counter again: mend and revive the party. A companion downed after
  // the merchant was first met (so no fresh greeting fires) still comes back
  // the moment the hero opens the stall.
  reviveDownedCompanions(state);
  state.phase = "shop";
  return true;
}

/** Close the shop and resume (pending level-ups take priority). */
export function closeShop(state: GameState): void {
  if (state.phase !== "shop") return;
  state.phase = state.player.pendingStatPoints > 0 ? "levelup" : "playing";
}

/**
 * Sell the piece in bag cell `index` across the counter: the item is gone
 * for good and its `sellValue` lands in the purse. Only while the shop is
 * open. Returns the coins paid, or null on an empty cell (no mutation).
 */
export function sellItem(state: GameState, index: number): number | null {
  if (state.phase !== "shop") return null;
  const item = state.player.inventory[index];
  if (!item) return null;
  const paid = sellValue(item);
  state.player.inventory[index] = null;
  state.player.coins += paid;
  return paid;
}

/**
 * Buy the stall entry with `stockId`. A POWERUP goes straight to the
 * powerup dock (refused at the carry cap, or when a `uniqueHeld` power like
 * the NUKE is already docked — see `canBankAbility`) and restocks — the entry
 * stays; a WEAPON lands in the bag (refused when full) and is a one-off — the
 * entry latches `sold`. Coins are only spent on success. False = the purchase
 * was refused (missing entry, sold out, too poor, or no room to carry it).
 */
export function buyStock(state: GameState, stockId: number): boolean {
  if (state.phase !== "shop") return false;
  const entry = state.merchant.stock.find((s) => s.id === stockId);
  if (!entry) return false;
  if (state.player.coins < entry.price) return false;
  if (entry.kind === "ability") {
    if (!canBankAbility(state, entry.defId)) return false;
    state.player.heldAbilities.push(entry.defId);
  } else {
    if (entry.sold) return false;
    if (!addToInventory(state, entry.equipment)) return false;
    entry.sold = true;
  }
  state.player.coins -= entry.price;
  return true;
}

/**
 * Can the hero afford (and carry) this stall entry right now? The app reads
 * it to gray out unbuyable rows; `buyStock` re-checks everything itself.
 */
export function canBuyStock(
  state: GameState,
  entry: Merchant["stock"][number],
): boolean {
  if (state.player.coins < entry.price) return false;
  if (entry.kind === "weapon") {
    return !entry.sold && state.player.inventory.includes(null);
  }
  return canBankAbility(state, entry.defId);
}
