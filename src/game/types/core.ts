// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared primitives and the item/equipment shapes: phases, stats, weapon
// and armor classification, quality/tier/affix vocabulary, and Equipment.

import type { GearDef, WeaponDef } from "../defs/equipment.ts";
import type { Vec2 } from "@game/lib/vec.ts";

/**
 * `cutscene` plays the level's prelude scene, `intro` shows the story text
 * box, `title` flashes the level name alone before the drop, `levelup` waits
 * for a stat choice, `inventory` pauses for bag management, `map` pauses over
 * the fog-of-war level map, `dialogue` holds the world while a character (or
 * a found story item) speaks, `choice` holds it while a beaten spareable
 * unique awaits the SPARE-or-KILL verdict, `companion` pauses into a
 * companion's equip screen, `outro` shows a level's post-victory epilogue
 * pages (the intro's black-screen mirror, before the victory splash); the
 * simulation only advances while `playing`.
 */
export type GamePhase =
  | "cutscene"
  | "intro"
  | "title"
  | "playing"
  | "paused"
  | "levelup"
  | "respec"
  | "inventory"
  | "map"
  | "shop"
  | "dialogue"
  | "choice"
  | "companion"
  | "outro"
  | "victory"
  | "defeat";

/**
 * A difficulty id: a key into DIFFICULTY_DEFS. Deliberately a bare `string`
 * so the ladder is pure data like every other catalog — adding a difficulty
 * means adding a def entry (and listing it in DIFFICULTY_ORDER), not editing
 * this type. The shipped ladder runs easy → medium → hard → nightmare →
 * jesus; the numbers and menu presentation live in defs/difficulties.ts.
 */
export type Difficulty = string;

/**
 * The six trainable stats, points awarded per level-up. SPIRIT is the
 * caster-support stat: it drives mana and health REGEN (see config REGEN),
 * where INTELLIGENCE sizes the mana pool and unlocks spells. (Move speed is no
 * longer its own stat — DEXTERITY is the mobility attribute; the base walk and
 * gear/buffs supply the rest.)
 */
export type StatName =
  "stamina" | "strength" | "dexterity" | "intelligence" | "luck" | "spirit";

export type WeaponClass = "melee" | "ranged" | "magic";

/**
 * The four BODY slots armor is worn in. Each worn piece carries flat armor
 * points; the pieces sum, and the total turns into a physical-damage
 * reduction against the attacker's level (see `armorReduction` and config
 * `ARMOR`) — the Diablo/WoW shape where standing still means decaying.
 */
export type ArmorSlot = "head" | "chest" | "legs" | "feet";

/**
 * What a piece of armor is MADE of — the D2/WoW material class, orthogonal to
 * its slot and its grade. It steers three things at once (see config
 * `ARMOR_TYPES`): how much armor the piece carries (heavier materials protect
 * more), how much STRENGTH the hero needs to WEAR it (heavier materials demand
 * a bruiser), and which stats its rolled `+stat` affixes lean toward (cloth →
 * INTELLIGENCE, leather → DEXTERITY, mail/plate → STRENGTH). PLATE is the
 * heaviest, gated to the hardest rungs (`ARMOR_TYPES.plate.minDifficulty`).
 * A piece with no `armorType` (charms, bags, legacy/fixture gear) is treated
 * as `cloth` — the neutral, ungated baseline.
 */
export type ArmorType = "cloth" | "leather" | "mail" | "plate";

/**
 * Item quality, lowest to highest: grey trash, white regular, blue magic,
 * yellow rare, green SET, gold unique, orange legendary (the colors are the
 * app's, see tiers.ts) — the Diablo ladder. Every tier exists engine-wide, but
 * a tier only drops off a monster whose LEVEL has reached its unlock (config
 * `LOOT.tierUnlockMlvl`): magic from monster level 5, rare from 10, unique
 * from 15, legendary from 25 — so rares are the reward of the deeper levels
 * and harder difficulties, never the level-1 rank and file. TRASH sits BELOW
 * regular and never rolls: it exists only for scripted joke drops (zero-damage,
 * zero-stat garbage a story kill pays out on purpose — see EnemyDef.loot) and
 * sells for next to nothing. SET is the D2 GREEN tier — hand-authored pieces
 * that belong to a boss SET (defs/sets.ts) and grow set bonuses when several
 * are worn together. Like uniques, sets are AUTHORED, never rolled: they drop
 * only from their boss (`EnemyDef.uniquesByDifficulty`), so `set` is absent from
 * the random `TIER_ROLL_ORDER`.
 */
export type Tier =
  | "trash"
  | "regular"
  | "magic"
  | "rare"
  | "set"
  | "unique"
  | "legendary"
  | "artifact";

export type EquipSlot = "weapon" | ArmorSlot | "charm" | "bag";

/**
 * Item MAKE quality, worst to best — the D2-style craftsmanship roll: every
 * PLAIN (regular-tier) weapon and armor drop rolls one at mint (see
 * `rollQuality`), and the rank scales the numbers the piece was authored
 * with (a weapon's damage, an armor piece's points, the durability — config
 * `QUALITY.mults`). Low-level monsters mostly drop broken/crude make; the
 * deeper the killer's monster level, the more superior/perfect work falls
 * (config `QUALITY.weightsLow/High`). Craftsmanship and magic are exclusive,
 * the D2 rule: a MAGIC-or-better find is always normal make (already well
 * built — unique/legendary even mint unbreakable), as are charms and bags
 * (nothing to scale).
 */
export type Quality = "broken" | "crude" | "normal" | "superior" | "perfect";

/**
 * One bonus on an item. Magic+ items ROLL these (higher tiers roll more);
 * hand-authored UNIQUES carry a fixed set instead of rolling. Most are FLAT
 * (a fixed `+N`), so they fall behind as the hero grows; the `*Pct` kinds
 * SCALE with the character (a % of the hero's own stat / max hp), so a unique
 * carrying one stays relevant far longer — the "keeper" bonus. Uniques use at
 * most one scaling bonus each, kept small (≤2% — clamped at mint, UNIQUE.scalingPctCap).
 */
export type Affix =
  | { kind: "damagePct"; value: number }
  | { kind: "maxHp"; value: number }
  | { kind: "crit"; value: number }
  | { kind: "armor"; value: number }
  /**
   * ARMOR PIERCING — the fraction of a mob's armor the hero's PHYSICAL blows
   * IGNORE on top of the class baseline (`STATS.armorPenByClass`), summed across
   * worn pieces (see `heroArmorPen`). A ranged (or melee) endgame chase stat:
   * the more pierce a hero's uniques/legendaries carry, the more of the armored
   * late game their shots/blows punch through. Does nothing for magic (it
   * bypasses armor already). Unique/legendary authoring territory.
   */
  | { kind: "armorPen"; value: number }
  | { kind: "stat"; value: number; stat: StatName }
  // Scaling bonuses (uniques): a fraction of the hero's OWN value.
  | { kind: "statPct"; value: number; stat: StatName }
  | { kind: "maxHpPct"; value: number }
  /**
   * A GRANTED SPELL — a forever version of the conjured powers, active while
   * the piece is worn (config `SPELL` sizes each rank; INTELLIGENCE deepens
   * the damage and shortens the interval). Ranks from multiple worn pieces
   * of the same spell ADD — two rank-1 orbit sources ring like one rank-2.
   * Unique/legendary authoring territory (never in the rolled affix pools).
   */
  | { kind: "spell"; spell: SpellKind; rank: number }
  /**
   * A PROC — a magic effect fired by combat events: `trigger` "hit" rolls
   * `chance` on every landed blow of the hero's own weapon, "kill" on every
   * weapon kill, and "struck" on every enemy hit the HERO takes (the D2
   * "% chance to cast when struck" — contact, mechanic blows, hostile
   * shots; impartial hazards never trigger it). The effect (`bolt` strikes
   * the victim/attacker, `nova` bursts around the trigger) is sized by
   * `rank` like a granted spell and scaled by the same INT deepening.
   * Proc blows never re-proc. Legendary authoring territory.
   */
  | {
      kind: "proc";
      trigger: ProcTrigger;
      spell: ProcSpell;
      chance: number;
      rank: number;
    }
  /**
   * SURE STRIKE — the hero's weapon never whiffs on its own: the innate miss
   * chance reads zero while the piece is worn (`playerMissChance`; the foe's
   * dodge is still its own move). Legendary authoring territory.
   */
  | { kind: "sureStrike" }
  /**
   * KNOCKBACK — a landing MELEE or RANGED weapon blow of the hero's own SHOVES
   * the struck survivor straight back, away from him (config `KNOCKBACK`), so a
   * swing or a shot buys ground and kiting the horde gets easier. It is a RARE
   * signature the physical arsenal buys on a HANDFUL of authored uniques/
   * legendaries/artifacts — an overpowered stat kept scarce; it never rolls
   * onto a magic/rare drop and no plain weapon carries it. A marker, not a
   * value: the shove magnitude is the shared `KNOCKBACK.distance`, so a weapon
   * either has the push or it doesn't. Magic blows never push, whatever the
   * weapon carries (INT keeps its crowd control in the cleave/crit blob). The
   * developer BALANCE › KNOCKBACK knob still scales the shove live.
   * Unique/legendary/artifact authoring territory.
   */
  | { kind: "knockback" };

/** The spells an item can GRANT permanently (see the `spell` affix): the
 * forever twins of the orbit/storm/stasis powerups, stepped off worn gear. */
export type SpellKind = "orbit" | "storm" | "stasis";

/** What fires a `proc` affix: a landed weapon blow, a weapon kill, or an
 * enemy blow landing ON the hero ("struck" — the D2 cast-when-struck). */
export type ProcTrigger = "hit" | "kill" | "struck";

/** The effects a `proc` affix can fire: a lightning bolt into the struck
 * enemy, or a damage nova bursting around it. */
export type ProcSpell = "bolt" | "nova";

/**
 * The live state of one GRANTED SPELL (a `spell` affix on worn equipment):
 * re-derived from the loadout every tick (`syncItemSpells`), with `rank`
 * the summed rank across every worn source. `angle`/`cooldownMs` are the
 * same scratch fields an ActiveAbility keeps — the sweep angle for orbit,
 * the ms until the next tick/strike for orbit/storm.
 */
export type ItemSpell = {
  spell: SpellKind;
  rank: number;
  angle: number;
  cooldownMs: number;
};

/**
 * A PROC waiting to resolve (see the `proc` affix): queued by `hitEnemy`
 * when a weapon blow lands/kills, and by the player-damage paths when an
 * enemy blow lands on the hero ("struck"); drained by `stepProcs` after the
 * combat passes so a nova's kills never mutate the enemy list mid-sweep.
 * `enemyId` is the triggering victim/attacker (a bolt strikes it if it
 * still stands) — absent when the attacker is unknown (a hostile shot),
 * where a bolt falls on the nearest foe to `pos` instead.
 */
export type PendingProc = {
  spell: ProcSpell;
  rank: number;
  pos: Vec2;
  enemyId?: number;
};

/**
 * A MAGIC CRIT BLOB waiting to burst (see config `MAGIC_CRIT`): queued by
 * `hitEnemy` when the hero's own direct magic weapon crit lands, drained by
 * `stepMagicCritBlobs` after the combat passes — like a proc, resolving it
 * inline would splice the enemy list out from under the projectile loop that
 * spawned it. `pos` is the struck foe (the blob's centre), `blowDamage` the
 * PRE-crit damage of the blow, and `victimId` the foe that already took the
 * crit — excluded from the splash so it is never billed twice.
 */
export type PendingCritBlob = {
  pos: Vec2;
  blowDamage: number;
  victimId: number;
};

/** A droppable, equippable item instance (medkits are consumables, not this). */
export type Equipment = {
  id: number;
  /** Key into WEAPON_DEFS or GEAR_DEFS. */
  defId: string;
  slot: EquipSlot;
  tier: Tier;
  /**
   * The ITEM LEVEL this piece dropped at: the killer's monster level minus a
   * small rolled deficit (see `rollItemLevel` — rare+ drops sit closer to the
   * mob). Affix magnitudes scale with it, so a deep find genuinely outrolls
   * an early one of the same tier. Purely a birth certificate — it never
   * changes after the drop.
   */
  ilvl: number;
  /** Rolled bonuses; count is dictated by the tier, size by `ilvl`. */
  affixes: Affix[];
  /**
   * The MAKE quality this instance rolled at mint (see `Quality`): scales the
   * base's damage/armor/durability and prefixes the name (CRUDE …, PERFECT
   * …). Absent = normal — the default for hand-minted pieces (starting gear)
   * and every instance from before quality shipped, so old saves read
   * unchanged.
   */
  quality?: Quality;
  /**
   * The specific base-value multiplier this instance ROLLED within its make
   * quality's range (config `QUALITY.ranges`), frozen at mint — the D2 rule
   * that two SUPERIOR copies of the same base can carry different damage/armor.
   * The quality tier sets the range; this is where inside it the piece landed.
   * `qualityMult` returns it whenever present, so damage, armor, durability,
   * and merchant value all read the SAME rolled figure. Absent on charms/bags
   * (no number to scale), magic-or-better finds (always flat normal make), and
   * every instance minted before the range roll shipped — those fall back to
   * the quality's midpoint (`QUALITY.mults`).
   */
  qualityRoll?: number;
  /**
   * Wear left before this piece gives out (the def carries the maximum).
   * Weapons spend one point per attack and are TRASHED at zero; armor spends
   * one per hit taken and merely goes INACTIVE at zero — it stays worn,
   * contributing nothing, until a repair kit restores it. Undefined =
   * unbreakable (the built-in sidearm, unique/legendary finds).
   */
  durability?: number;
  /**
   * Armor pieces only: the rolled armor points this instance carries — the
   * def's base value grown by the drop's item level (see `rollEquipment` and
   * config `ARMOR.armorPerIlvl`), stamped at mint and frozen for life like an
   * affix. Absent on weapons, charms, bags, and pre-revamp instances (which
   * fall back to the def's base value — see `armorValueOf`).
   */
  armor?: number;
  /**
   * A hand-authored UNIQUE's fixed display name (BOUNDSTRIDE), overriding the
   * base/affix-composed name. Absent on rolled items, which name themselves
   * from their affixes (see `equipmentName`).
   */
  name?: string;
  /**
   * A UNIQUE's per-drop base ROLL: a small ±band on the base damage (weapons,
   * read in `weaponDamageFor`) or armor (baked into `armor` at mint), so two
   * copies of the same unique differ slightly and a better-rolled one is worth
   * chasing. The FIXED bonuses are identical on every copy. Absent (= 1) on
   * everything else.
   */
  baseRoll?: number;
  /**
   * A hand-authored UNIQUE's catalog id (key into UNIQUE_DEFS), stamped by
   * `mintUnique` — the stable identity behind the display `name`, so anything
   * that books WHICH unique this is (the app's achievement ledger, a future
   * stash dedup) keys on an id like every other def reference. Absent on
   * rolled items and on unique instances minted before this field shipped.
   */
  uniqueId?: string;
  /**
   * A FROZEN copy of the item's catalog def, captured the instant it was
   * minted (see `rollEquipment`). This is what makes a kept item version-proof:
   * an item a test player carries keeps the stats it dropped with even after we
   * rebalance or delete its `defId` from the live catalog — only NEW drops feel
   * the change. On load, `adoptEquipment` re-homes the instance onto this
   * snapshot (registered under a synthetic frozen id), so every stat read
   * resolves the item AS DROPPED. Absent only on instances minted by a build
   * from before snapshots existed (handled best-effort on load).
   */
  def?: WeaponDef | GearDef;
  /**
   * WEAPONS ONLY: the sequence number stamped when this weapon was booted from
   * the hand because its durability ran out (see `wearEquippedWeapon`). A
   * broken weapon is no longer trashed — it drops into the bag at durability 0
   * (unequippable until repaired), and this monotonic marker records the ORDER
   * the hand shed its weapons so a repair can re-equip them in that order
   * (`repairAll`). Cleared the moment the weapon is mended back above zero.
   * Absent on every weapon that hasn't broken out of the hand.
   */
  unequippedAt?: number;
};

/**
 * A running time-limited power granted by an ability pickup (fire orbs,
 * lightning storm, stasis field). `defId` keys into ABILITY_DEFS; the two
 * scratch fields mean different things per ability kind.
 */
export type ActiveAbility = {
  defId: string;
  remainingMs: number;
  /** Orbit abilities: the current sweep angle in radians. */
  angle: number;
  /** Ms until the ability's next damage tick / strike. */
  cooldownMs: number;
  /**
   * Index into `heldAbilities` of the dock slot this running copy occupies. A
   * spent powerup keeps its slot — showing its countdown in place — until it
   * lapses, and only then does the slot free and the rest shift down; so the
   * dock stays full while a power runs and no new pickup can bank over it.
   * `undefined` for a copy granted straight to the player (tests, scripted
   * grants) with no originating dock slot.
   */
  slot?: number;
};
