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

import { clamp } from "@game/lib/vec.ts";
import { companionMaxHp, companionXpToLevelUp } from "./companion-stats.ts";
import { foldCorpseGear } from "./downed.ts";
import {
  AMMO,
  AMMO_TYPES,
  ARRIVAL,
  CONSUMABLES,
  HELD_ITEMS,
  LEVELING,
  MEDKIT,
  VAULT,
} from "./config/index.ts";
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
import {
  levelsBefore,
  type LevelDef,
  type MissionDef,
} from "./defs/levels/index.ts";
import { resolveLevelDef } from "./mapgen/index.ts";
import {
  ARMOR_SLOTS,
  inventoryCapacity,
  isLiveItemSlot,
  isTwoHandedWeapon,
  recomputeMaxHp,
  recomputeMaxStamina,
  RING_SLOTS,
  startingAmmo,
} from "./items/index.ts";
import { reconcileTalentPoints } from "./talents.ts";
import { statPointsAt, xpToLevelUp } from "./leveling.ts";
import type {
  Difficulty,
  Equipment,
  GameState,
  Loadout,
  Player,
  StatName,
} from "./types/index.ts";

/** XP required to leave `level` (the same curve grantXp walks — difficulty
 * carries the per-tier leveling slowdown). */
function xpToNextAt(level: number, difficulty?: Difficulty): number {
  return xpToLevelUp(level, difficulty);
}

/**
 * A complete stat record from a carried one that may predate a stat. A loadout
 * banked before a stat existed has no key for it, so a bare spread leaves that
 * stat `undefined` — which the level-up chooser renders as "<STAT> UNDEFINED".
 * Backfilling every StatName to 0 keeps an old build wieldable and the chooser
 * honest. (It also DROPS any key no longer in `STAT_NAMES` — a retired stat's
 * points are refunded in `applyLoadout` rather than carried.)
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
export function extractLoadout(state: GameState, player: Player): Loadout {
  return {
    level: player.level,
    xp: player.xp,
    stats: { ...player.stats },
    spentStats: { ...player.spentStats },
    talents: { ...player.talents },
    // Unspent points ride along too — normally 0, but the AUTO PILOT refund
    // banks a build with the ride's allocations handed back as pending for the
    // player to re-spend (see `refundAutopilotBuild`).
    pendingStatPoints: player.pendingStatPoints,
    equipment: {
      weapon: copyPiece(player.equipment.weapon) as Equipment,
      head: copyPiece(player.equipment.head),
      chest: copyPiece(player.equipment.chest),
      legs: copyPiece(player.equipment.legs),
      feet: copyPiece(player.equipment.feet),
      amulet: copyPiece(player.equipment.amulet),
      ring1: copyPiece(player.equipment.ring1),
      ring2: copyPiece(player.equipment.ring2),
      offhand: copyPiece(player.equipment.offhand),
    },
    inventory: player.inventory.map(copyPiece),
    // The LOST & FOUND rides along too, so what a multi-lap flight threw away
    // on level three is still buyable back after it lands (items/vault.ts) —
    // and whatever this hero's UNRECOVERED CORPSES still hold is folded in
    // beside it (downed.ts): banking is the one moment a body's gear
    // would otherwise be lost, and the vault is the shelf that exists for
    // exactly this kind of not-chosen loss. Deliberately past the vault's cap
    // if it must be — the cap disciplines the bot's banking sweep, and
    // enforcing it here would DELETE a player's kit to honour a tidiness rule.
    vault: [
      ...player.vault.map((piece) => copyPiece(piece) as Equipment),
      ...foldCorpseGear(state, player).map(
        (piece) => copyPiece(piece) as Equipment,
      ),
    ],
    heldAbilities: [...player.heldAbilities],
    medkits: [...player.medkits],
    staminaPotions: player.staminaPotions,
    repairKits: player.repairKits,
    ammo: { ...player.ammo },
    cleanSlates: player.cleanSlates,
    coins: player.coins,
    // The party rides along: each companion's def, its EARNED level and XP (so
    // it keeps leveling across every level and difficulty), whether it is DOWN,
    // and its worn kit. A standing companion's health re-derives on apply —
    // it arrives rested like the hero. A DOWNED one arrives exactly as it fell:
    // the walk to the next venue is not a revive, and only the salts are.
    companions: state.companions.map((companion) => ({
      defId: companion.defId,
      level: companion.level,
      xp: companion.xp,
      ...(companion.downed ? { downed: true as const } : {}),
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
export function applyLoadout(
  state: GameState,
  player: Player,
  loadout: Loadout,
): void {
  player.level = Math.max(1, loadout.level);
  player.xpToNext = xpToNextAt(player.level, state.difficulty);
  player.xp = clamp(loadout.xp, 0, player.xpToNext - 1);
  // Backfill every StatName to 0 so a loadout banked before a stat existed
  // arrives whole rather than with an `undefined` the chooser would render as
  // "<STAT> UNDEFINED".
  player.stats = fillStats(loadout.stats);
  // The player's own spent tally rides along; a pre-`spentStats` loadout falls
  // back to the carried stats (best-effort — the chooser then shows the whole
  // carried build rather than crashing on a missing field).
  const carriedSpent = loadout.spentStats ?? loadout.stats;
  player.spentStats = fillStats(carriedSpent);
  // Points a veteran spent into a since-RETIRED stat (the removed SPEED and
  // SPIRIT stats)
  // are refunded as pending picks rather than silently lost — `fillStats` drops
  // any key no longer in `STAT_NAMES`, so we sum those orphaned points back into
  // the chooser queue for the hero to re-spend on the surviving attributes.
  let refunded = 0;
  for (const [name, points] of Object.entries(carriedSpent)) {
    if (!(STAT_NAMES as string[]).includes(name)) refunded += points ?? 0;
  }
  // Plus any UNSPENT points the build carried (the AUTO PILOT refund banks the
  // ride's allocations as pending) — the run's opener greets the hero with the
  // chooser so they place them under their own control (see `dismissIntro`).
  player.pendingStatPoints =
    refunded + Math.max(0, loadout.pendingStatPoints ?? 0);

  // Re-mint every carried piece with THIS run's ids so nothing collides
  // with the level's own drops.
  const mint = (piece: Equipment | null): Equipment | null => {
    const copy = copyPiece(piece);
    if (copy) copy.id = state.nextId++;
    return copy;
  };
  const weapon = mint(loadout.equipment.weapon);
  if (weapon) player.equipment.weapon = weapon;
  // Pre-revamp saves carry kinds this build has no home for (the old `suit`
  // slot, and the old `charm` before it became a carried trinket) — those
  // pieces are simply left behind, so a legacy loadout loads bare-chested
  // rather than crashing. `stillWearable` guards every cell below the same
  // way, including the bag and the vault.
  const stillWearable = (piece: Equipment | null): Equipment | null =>
    piece && isLiveItemSlot(piece.slot) ? piece : null;
  for (const slot of ARMOR_SLOTS) {
    player.equipment[slot] = stillWearable(
      mint(loadout.equipment[slot] ?? null),
    );
  }
  player.equipment.amulet = stillWearable(
    mint(loadout.equipment.amulet ?? null),
  );
  for (const slot of RING_SLOTS) {
    player.equipment[slot] = stillWearable(
      mint(loadout.equipment[slot] ?? null),
    );
  }
  // The worn OFFHAND must be restored BEFORE the carry is sized — a bag in it
  // is part of what `inventoryCapacity` counts (older saves without one mint
  // null). `bag` is the slot's LEGACY key, from before it grew to hold a
  // shield: a save banked then still carries it, and it reads as the offhand.
  player.equipment.offhand = mint(
    loadout.equipment.offhand ?? loadout.equipment.bag ?? null,
  );
  // THE TWO-HANDED RULE holds across a level hop too: a loadout banked before a
  // weapon was made two-handed (or hand-edited) can carry both, and a hero who
  // arrived with a greatsword AND a shield would be wearing a combination the
  // equip paths refuse. The second arm is what gives — the weapon slot can
  // never be emptied — and the piece falls into the carry below like any other
  // banked find.
  const displacedOffhand = isTwoHandedWeapon(player.equipment.weapon)
    ? player.equipment.offhand
    : null;
  if (displacedOffhand) player.equipment.offhand = null;

  // LEGACY MIGRATION: a save banked before the trinket revamp carries a WORN
  // `charm`. There is no such slot anymore — a trinket pays out from the BAG —
  // so the piece moves into the first free cell and keeps working. (Its KIND
  // was already rewritten to `trinket` on load, by `adoptEquipment`, which
  // every persisted piece passes through.) Appended when the bag is full,
  // where the capacity cut below may still leave it behind, exactly like any
  // other over-capacity carry.
  const banked = [...loadout.inventory];
  for (const piece of [loadout.equipment.charm ?? null, displacedOffhand]) {
    if (!piece) continue;
    const free = banked.indexOf(null);
    if (free === -1) banked.push(piece);
    else banked[free] = piece;
  }
  // The bag re-sizes to the carried STRENGTH and worn bag, then refills in
  // order; anything past the capacity (shrunken saves) stays behind.
  player.inventory = new Array<Equipment | null>(
    inventoryCapacity(state, player),
  )
    .fill(null)
    .map((_, i) => stillWearable(mint(banked[i] ?? null)));
  // The LOST & FOUND carries across untouched but re-minted, capped like the
  // bank itself (a legacy or hand-edited save can't smuggle in an unbounded
  // list). Pieces the body can no longer wear are dropped as everywhere else.
  player.vault = (loadout.vault ?? [])
    .map((piece) => stillWearable(mint(piece)))
    .filter((piece): piece is Equipment => piece !== null)
    .slice(0, VAULT.capacity);
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
    .map((_, i) => clamp(loadout.medkits?.[i] ?? 0, 0, CONSUMABLES.stackCap));
  player.staminaPotions = clamp(
    loadout.staminaPotions ?? 0,
    0,
    CONSUMABLES.stackCap,
  );
  player.repairKits = Math.max(
    0,
    Math.min(loadout.repairKits ?? 0, CONSUMABLES.stackCap),
  );
  // THE POUCH RIDES ALONG, clamped per kind like every other stack — what the
  // hero walked off the last level with is what he lands with. A loadout from
  // before ammunition shipped carries no pouch at all; rather than land a
  // returning hero unable to fire the weapon in his own hand, that case falls
  // back to the opening holster (`startingAmmo`).
  const carried = loadout.ammo;
  player.ammo = carried ? {} : startingAmmo(player.equipment.weapon.defId);
  for (const type of AMMO_TYPES) {
    const held = carried?.[type];
    if (held) player.ammo[type] = clamp(held, 0, AMMO.stackCap);
  }
  // CLEAN SLATES are deliberately NOT capped at the consumable stack: they are
  // a chase reward, not a floor pickup, and a hero who has earned two has a
  // reason to be carrying two.
  player.cleanSlates = Math.max(0, loadout.cleanSlates ?? 0);
  // The purse rides along; loadouts banked before the economy existed carry
  // no coins field and load as an empty purse.
  player.coins = Math.max(0, loadout.coins ?? 0);

  // Trained TALENTS ride along by id→rank. A loadout banked before talents
  // existed carries none — but its CHOSEN stats still imply a pile of earned
  // points, which `reconcileTalentPoints` mints into the picker queue below. So
  // an adopted veteran converts for free: the points fall out of the stats the
  // loadout already carries, no bespoke migration code needed.
  player.talents = { ...(loadout.talents ?? {}) };
  reconcileTalentPoints(state, player);

  recomputeMaxHp(state, player);
  recomputeMaxStamina(state, player);
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;

  // The party walks in with him: each carried companion re-minted at the
  // hero's side, rested (full hp at its OWN earned level), wearing its carried
  // kit — unless it is DOWN, in which case it arrives face-down at 0 hp,
  // waiting for the salts exactly as it was. Its level and XP ride along so it
  // keeps climbing across levels AND difficulties; a loadout banked before
  // companion leveling carries no level (falls back to the hero's) and no XP (a
  // fresh bar). A since-deleted companion def is simply left behind, like
  // legacy gear.
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
      hp: carried.downed ? 0 : maxHp,
      maxHp,
      ...(carried.downed ? { downed: true } : {}),
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

/**
 * The seed and size the derivation carves a cleared mission at.
 *
 * A mission has no roster of its own any more — the horde is knots on a carved
 * grid — so the estimate has to look at a map, and the ONE requirement is that
 * it always looks at the same one: `deriveArrivalLoadout` is documented as
 * deterministic per (levelId, difficulty), and rolling the run's own seed in
 * here would make a dev warp's starting build depend on which map the player
 * happened to get. A fixed seed at the shipped size is a representative carve
 * of that mission, and it is the same one every time.
 */
const ROSTER_SEED = 1;

/** A cleared mission's map, carved for the roster estimate above. */
function rosterCarve(def: MissionDef): LevelDef {
  return resolveLevelDef(def.id, ROSTER_SEED, "medium");
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
function signatureWeapon(def: MissionDef): string | undefined {
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
function issueGear(def: MissionDef, slot: string): string | undefined {
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
  const byIndex = new Map<number, MissionDef>();
  for (const def of levelsBefore(levelId)) {
    if (!byIndex.has(def.index)) byIndex.set(def.index, def);
  }
  const cleared = [...byIndex.values()];
  if (cleared.length === 0) return null;

  // The derived level: the cleared rosters' XP through the real curve.
  let xp = Math.round(
    cleared.reduce(
      (sum, def) => sum + rosterXp(rosterCarve(def), difficulty),
      0,
    ) * ARRIVAL.clearShare,
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
    luck: 0,
  };
  const order = ARRIVAL.statOrder as readonly StatName[];
  for (let i = 0; i < points; i++) {
    stats[order[i % order.length] as StatName]++;
  }

  // The previous level's parting kit; with no pool to draw from, fall back
  // to the difficulty's own starting weapon (the piece off the wall).
  const previous = cleared[cleared.length - 1] as MissionDef;
  const weaponId =
    signatureWeapon(previous) ?? difficultyDef(difficulty).startingWeapon;
  const trinketId = issueGear(previous, "trinket");
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
      // No stand-in jewellery: rings and amulets are deep-ladder finds, so a
      // derived arrival kit leaves the neck and both fingers bare.
      amulet: null,
      ring1: null,
      ring2: null,
      // Nothing in the second arm either — no stand-in bag (the kit leans on
      // the STRENGTH floor) and no shield.
      offhand: null,
    },
    // The best TRINKET the previous level's pool pays out, carried: a trinket
    // works from the bag, so the stand-in kit hands it over as loot.
    inventory: trinketId ? [regularPiece(trinketId, "trinket")] : [],
    heldAbilities: previous.loot.abilityPool.slice(0, ARRIVAL.heldAbilities),
  };
}
