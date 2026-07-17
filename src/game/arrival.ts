// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Loadout carry-over between levels. In the real game the player's progress
// PERSISTS: clearing a level banks a snapshot of the hero — level, stats,
// worn equipment, bag, pocketed powerups (`extractLoadout`) — and the app
// hands that snapshot back to `createGame` when the next level starts
// (`applyLoadout`). For dev jumps and playtests that skip straight to a
// mid-campaign level with nothing banked, `deriveArrivalLoadout` builds a
// realistic stand-in instead: a player level DERIVED from the earlier
// levels' rosters (mob count × hp through the real XP curve, discounted by
// ARRIVAL.clearShare), stat points auto-spent round-robin, and the previous
// level's signature kit. The derivation is deterministic data — no RNG, no
// saved state.

import { companionMaxHp, companionXpToLevelUp } from "./companion-stats.ts";
import {
  ARRIVAL,
  CONSUMABLES,
  HELD_ITEMS,
  LEVELING,
  MEDKIT,
} from "./config.ts";
import { abilityDef } from "./defs/abilities.ts";
import { companionDef, isCompanionDef } from "./defs/companions.ts";
import { difficultyDef, meetsMinDifficulty } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import {
  equipmentLevelReq,
  gearDef,
  STAT_NAMES,
  weaponDef,
} from "./defs/equipment.ts";
import { levelsBefore, type LevelDef } from "./defs/levels/index.ts";
import {
  ARMOR_SLOTS,
  inventoryCapacity,
  recomputeMaxHp,
  recomputeMaxMana,
  recomputeMaxStamina,
} from "./items.ts";
import { SPELL_SLOTS } from "./defs/spells.ts";
import { statPointsAt, xpToLevelUp } from "./leveling.ts";
import type {
  Difficulty,
  Equipment,
  GameState,
  Loadout,
  StatName,
} from "./types.ts";

/** XP required to leave `level` (the same curve grantXp walks — difficulty
 * carries the per-tier leveling slowdown). */
function xpToNextAt(level: number, difficulty?: Difficulty): number {
  return xpToLevelUp(level, difficulty);
}

/**
 * A complete stat record from a carried one that may predate a stat. A loadout
 * banked before a stat existed (e.g. SPIRIT, added with the mana/spell system)
 * has no key for it, so a bare spread leaves that stat `undefined` — which the
 * level-up chooser renders as "SPIRIT UNDEFINED". Backfilling every StatName to
 * 0 keeps an old build wieldable and the chooser honest.
 */
function fillStats(
  carried: Partial<Record<StatName, number>>,
): Record<StatName, number> {
  const stats = {} as Record<StatName, number>;
  for (const name of STAT_NAMES) stats[name] = carried[name] ?? 0;
  return stats;
}

/** A deep copy of an equipment piece (or null), safe to carry across runs. */
function copyPiece(piece: Equipment | null): Equipment | null {
  if (!piece) return null;
  return { ...piece, affixes: piece.affixes.map((affix) => ({ ...affix })) };
}

/**
 * Snapshot the hero's progress from a (finished) run: everything a level
 * hands to the next one. The app banks this on victory and passes it back
 * into `createGame` when the following level starts.
 */
export function extractLoadout(state: GameState): Loadout {
  const player = state.player;
  return {
    level: player.level,
    xp: player.xp,
    stats: { ...player.stats },
    spentStats: { ...player.spentStats },
    equipment: {
      weapon: copyPiece(player.equipment.weapon) as Equipment,
      head: copyPiece(player.equipment.head),
      chest: copyPiece(player.equipment.chest),
      legs: copyPiece(player.equipment.legs),
      feet: copyPiece(player.equipment.feet),
      charm: copyPiece(player.equipment.charm),
      bag: copyPiece(player.equipment.bag),
    },
    inventory: player.inventory.map(copyPiece),
    heldAbilities: [...player.heldAbilities],
    medkits: [...player.medkits],
    staminaPotions: player.staminaPotions,
    manaPotions: player.manaPotions,
    repairKits: player.repairKits,
    spellSlots: [...player.spellSlots],
    coins: player.coins,
    // The party rides along: each companion's def, its EARNED level and XP (so
    // it keeps leveling across every level and difficulty), and its worn kit.
    // Health re-derives on apply — companions arrive rested like the hero.
    companions: state.companions.map((companion) => ({
      defId: companion.defId,
      level: companion.level,
      xp: companion.xp,
      equipment: {
        weapon: copyPiece(companion.equipment.weapon) as Equipment,
        head: copyPiece(companion.equipment.head),
        chest: copyPiece(companion.equipment.chest),
      },
    })),
  };
}

/**
 * Dress a freshly-created run in a carried-over loadout: level and stats
 * restored (any pending points considered spent — the chooser never reopens
 * for old points), equipment and bag re-minted with this run's ids, powerups
 * pocketed — and the hero arrives rested: full health, full sprint, plating
 * fastened. Called from createGame when a loadout is passed.
 */
export function applyLoadout(state: GameState, loadout: Loadout): void {
  const player = state.player;
  player.level = Math.max(1, loadout.level);
  player.xpToNext = xpToNextAt(player.level, state.difficulty);
  player.xp = Math.max(0, Math.min(loadout.xp, player.xpToNext - 1));
  // Backfill every StatName to 0 so a loadout banked before a stat existed
  // (SPIRIT, added with mana/spells) arrives whole rather than with an
  // `undefined` the chooser would render as "SPIRIT UNDEFINED".
  player.stats = fillStats(loadout.stats);
  // The player's own spent tally rides along; a pre-`spentStats` loadout falls
  // back to the carried stats (best-effort — the chooser then shows the whole
  // carried build rather than crashing on a missing field).
  player.spentStats = fillStats(loadout.spentStats ?? loadout.stats);
  player.pendingStatPoints = 0;

  // Re-mint every carried piece with THIS run's ids so nothing collides
  // with the level's own drops.
  const mint = (piece: Equipment | null): Equipment | null => {
    const copy = copyPiece(piece);
    if (copy) copy.id = state.nextId++;
    return copy;
  };
  const weapon = mint(loadout.equipment.weapon);
  if (weapon) player.equipment.weapon = weapon;
  // Pre-revamp saves carry a `suit` slot (and suit-slot pieces) the four-slot
  // body can't wear — those pieces are simply left behind, so a legacy
  // loadout loads bare-chested rather than crashing. `stillWearable` also
  // guards every armor/charm cell below the same way.
  const stillWearable = (piece: Equipment | null): Equipment | null =>
    piece && piece.slot in player.equipment ? piece : null;
  for (const slot of ARMOR_SLOTS) {
    player.equipment[slot] = stillWearable(
      mint(loadout.equipment[slot] ?? null),
    );
  }
  player.equipment.charm = mint(loadout.equipment.charm);
  // The worn bag must be restored BEFORE the carry is sized — it is part of
  // what `inventoryCapacity` counts (older saves without a bag mint null).
  player.equipment.bag = mint(loadout.equipment.bag ?? null);

  // The bag re-sizes to the carried STRENGTH and worn bag, then refills in
  // order; anything past the capacity (shrunken saves) stays behind.
  player.inventory = new Array<Equipment | null>(inventoryCapacity(state))
    .fill(null)
    .map((_, i) => stillWearable(mint(loadout.inventory[i] ?? null)));
  // A `uniqueHeld` power (the NUKE) docks at most once — loadouts banked
  // before the rule existed may carry doubles, so the extras stay behind.
  player.heldAbilities = loadout.heldAbilities
    .filter((id, i, all) => !abilityDef(id).uniqueHeld || all.indexOf(id) === i)
    .slice(0, HELD_ITEMS.cap);
  // Stacked consumables ride along, re-fit to this build's tier count and
  // clamped to the stack cap; loadouts banked before consumables stacked carry
  // no field and load with empty stacks.
  player.medkits = new Array<number>(MEDKIT.tiers.length)
    .fill(0)
    .map((_, i) =>
      Math.max(0, Math.min(loadout.medkits?.[i] ?? 0, CONSUMABLES.stackCap)),
    );
  player.staminaPotions = Math.max(
    0,
    Math.min(loadout.staminaPotions ?? 0, CONSUMABLES.stackCap),
  );
  player.manaPotions = Math.max(
    0,
    Math.min(loadout.manaPotions ?? 0, CONSUMABLES.stackCap),
  );
  player.repairKits = Math.max(
    0,
    Math.min(loadout.repairKits ?? 0, CONSUMABLES.stackCap),
  );
  // The spell bar rides along, re-fit to this build's slot count; a loadout
  // banked before spells shipped (or a stale slot count) loads an empty bar the
  // app then auto-fills from the hero's unlocked spells. Only ids the hero can
  // still cast survive — an entry the carried INT no longer unlocks is dropped
  // (`castSpell` re-checks anyway, but a clean bar reads better).
  player.spellSlots = new Array<string | null>(SPELL_SLOTS)
    .fill(null)
    .map((_, i) => loadout.spellSlots?.[i] ?? null);
  // The purse rides along; loadouts banked before the economy existed carry
  // no coins field and load as an empty purse.
  player.coins = Math.max(0, loadout.coins ?? 0);

  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  recomputeMaxMana(state);
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;
  player.mana = player.maxMana;

  // The party walks in with him: each carried companion re-minted at the
  // hero's side, rested (full hp at its OWN earned level), wearing its carried
  // kit. Its level and XP ride along so it keeps climbing across levels AND
  // difficulties; a loadout banked before companion leveling carries no level
  // (falls back to the hero's) and no XP (a fresh bar). A since-deleted
  // companion def is simply left behind, like legacy gear.
  state.companions = [];
  for (const carried of loadout.companions ?? []) {
    if (!isCompanionDef(carried.defId)) continue;
    const def = companionDef(carried.defId);
    const level = Math.max(1, carried.level ?? player.level);
    const maxHp = companionMaxHp(def, level);
    const index = state.companions.length;
    const weapon = mint(carried.equipment.weapon) ?? {
      id: state.nextId++,
      defId: def.weapon,
      slot: "weapon" as const,
      tier: "regular" as const,
      ilvl: Math.max(1, player.level),
      affixes: [],
    };
    state.companions.push({
      id: state.nextId++,
      defId: carried.defId,
      pos: {
        x: state.playerSpawn.x - 20 - index * 14,
        y: state.playerSpawn.y + 14,
      },
      hp: maxHp,
      maxHp,
      level,
      xp: Math.max(0, carried.xp ?? 0),
      xpToNext: companionXpToLevelUp(level),
      faceLeft: false,
      moving: false,
      weaponCooldownMs: 0,
      quoteCooldownMs: 0,
      equipment: {
        weapon,
        head: mint(carried.equipment.head),
        chest: mint(carried.equipment.chest),
      },
    });
  }
}

/** The XP a full clear of `def`'s roster pays at this difficulty: every
 * placed spawn and wave-budget mob (base counts — the derivation is a story
 * baseline, not a difficulty simulation), with difficulty-gated lines the
 * cleared run never fielded left out. Live kill XP is LEVEL-based
 * (`mobLevelXp`) now, but the derivation has no live mob level here; a mob's
 * catalog `hp` (≈ `refMobHp` for typical fodder) is a good-enough PROXY for its
 * level-based reward, so the estimate stays in the right ballpark. */
function rosterXp(def: LevelDef, difficulty: Difficulty): number {
  const mobXp = (enemyId: string) => {
    const enemy = enemyDef(enemyId);
    return enemy.xp ?? Math.round(enemy.hp * LEVELING.xpPerHp);
  };
  let total = 0;
  for (const spawn of def.spawns) {
    if (!meetsMinDifficulty(difficulty, spawn.minDifficulty)) continue;
    total += mobXp(spawn.enemy) * ("count" in spawn ? spawn.count : 1);
  }
  for (const entry of def.waves?.budget ?? []) {
    if (!meetsMinDifficulty(difficulty, entry.minDifficulty)) continue;
    total += mobXp(entry.enemy) * entry.count;
  }
  // Spawn points — the finite-horde alternative to waves; every queued member is
  // killed on a full clear, so it pays like the wave budget it replaced.
  for (const spawner of def.spawners ?? []) {
    if (!meetsMinDifficulty(difficulty, spawner.minDifficulty)) continue;
    for (const member of spawner.members) {
      total += mobXp(member.enemy) * member.count;
    }
  }
  return total;
}

/** The weapon a clear of `def` is assumed to leave in hand: its scripted
 * early-drop weapon (the run's signature blade), else its all-clear trophy,
 * else the hardest-hitting entry of its random pool. */
function signatureWeapon(def: LevelDef): string | undefined {
  for (const drop of def.loot.earlyDrops ?? []) {
    if ("weapon" in drop) return drop.weapon;
  }
  if (def.loot.allClearWeapon) return def.loot.allClearWeapon;
  return [...def.loot.weaponPool].sort(
    (a, b) => weaponDef(b).damage - weaponDef(a).damage,
  )[0];
}

/** The best piece of `def`'s gear pool worn in `slot` — highest armor for a
 * body slot (a cleared level is assumed to have yielded its best wardrobe),
 * first entry otherwise (charms). Undefined when the pool has none. */
function issueGear(def: LevelDef, slot: string): string | undefined {
  const fits = def.loot.gearPool.filter((id) => gearDef(id).slot === slot);
  if (fits.length === 0) return undefined;
  return fits.reduce((best, id) =>
    (gearDef(id).armor ?? 0) > (gearDef(best).armor ?? 0) ? id : best,
  );
}

/** A plain regular-tier instance of `defId` (ids are re-minted on apply).
 * Minted at the base's own requirement as its item level — the natural level
 * such a piece would have dropped at (cosmetic on an affixless regular).
 * Gear stamps its base armor and full durability, like a fresh drop. */
function regularPiece(
  defId: string,
  slot: Equipment["slot"],
  durability?: number,
): Equipment {
  const piece: Equipment = {
    id: 0,
    defId,
    slot,
    tier: "regular",
    ilvl: equipmentLevelReq(defId),
    affixes: [],
  };
  if (slot !== "weapon") {
    const def = gearDef(defId);
    if (def.armor !== undefined) piece.armor = def.armor;
    if (durability === undefined && def.durability !== undefined) {
      piece.durability = def.durability;
    }
  }
  if (durability !== undefined) piece.durability = durability;
  return piece;
}

/**
 * A realistic stand-in loadout for starting `levelId` with nothing banked —
 * the TESTING/dev-jump path (`?level=`, playtest bots, wiped storage): the
 * hero "as if" he cleared the campaign so far. Derived from the earlier
 * levels' rosters through the real XP curve; stat points spent round-robin;
 * the previous level's signature weapon, issue gear, and a couple of its
 * powerups in hand. Null on the campaign opener — there is nothing to have
 * cleared. Deterministic per (levelId, difficulty).
 */
export function deriveArrivalLoadout(
  levelId: string,
  difficulty: Difficulty = "medium",
): Loadout | null {
  // The campaign so far is one level per story index (variants sharing an
  // index — fixture catalogs do this — count once, first registered wins).
  const byIndex = new Map<number, LevelDef>();
  for (const def of levelsBefore(levelId)) {
    if (!byIndex.has(def.index)) byIndex.set(def.index, def);
  }
  const cleared = [...byIndex.values()];
  if (cleared.length === 0) return null;

  // The derived level: the cleared rosters' XP through the real curve.
  let xp = Math.round(
    cleared.reduce((sum, def) => sum + rosterXp(def, difficulty), 0) *
      ARRIVAL.clearShare,
  );
  let level = 1;
  let points = 0;
  while (xp >= xpToNextAt(level) && level < LEVELING.maxLevel) {
    xp -= xpToNextAt(level);
    level++;
    points += statPointsAt(level);
  }

  // Spend the banked points the way a steady hand would: round-robin, so
  // the build arrives broad and the run's own level-ups pick the specialty.
  const stats: Record<StatName, number> = {
    stamina: 0,
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    speed: 0,
    luck: 0,
    spirit: 0,
  };
  const order = ARRIVAL.statOrder as readonly StatName[];
  for (let i = 0; i < points; i++) {
    stats[order[i % order.length] as StatName]++;
  }

  // The previous level's parting kit; with no pool to draw from, fall back
  // to the difficulty's own starting weapon (the piece off the wall).
  const previous = cleared[cleared.length - 1] as LevelDef;
  const weaponId =
    signatureWeapon(previous) ?? difficultyDef(difficulty).startingWeapon;
  const charmId = issueGear(previous, "charm");
  // The previous level's best wardrobe, one piece per body slot (a slot its
  // pool never dressed stays bare — the campaign's own gaps carry through).
  const armorPiece = (slot: (typeof ARMOR_SLOTS)[number]) => {
    const id = issueGear(previous, slot);
    return id ? regularPiece(id, slot) : null;
  };
  return {
    level,
    xp,
    stats,
    // A dev/stand-in arrival auto-spends its whole banked pool, so every
    // derived point counts as the hero's own pick on the chooser.
    spentStats: { ...stats },
    equipment: {
      weapon: regularPiece(weaponId, "weapon", weaponDef(weaponId).durability),
      head: armorPiece("head"),
      chest: armorPiece("chest"),
      legs: armorPiece("legs"),
      feet: armorPiece("feet"),
      charm: charmId ? regularPiece(charmId, "charm") : null,
      // No stand-in bag: the derived arrival kit leans on the STRENGTH floor.
      bag: null,
    },
    inventory: [],
    heldAbilities: previous.loot.abilityPool.slice(0, ARRIVAL.heldAbilities),
  };
}
