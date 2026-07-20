// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Data shapes for the simulation. The state is a plain mutable object the
// renderer reads every frame; `step()` advances it and reports what happened
// as events so the app layer can drive sound and visual feedback without the
// engine knowing either exists. The state holds a seeded RNG closure for
// in-run rolls (crits, drops), so it is deterministic but not JSON-plain.
//
// Entities reference the content catalogs (defs/) by id: an Enemy carries a
// `defId` into ENEMY_DEFS, an Equipment a `defId` into WEAPON_DEFS/GEAR_DEFS.
// The catalogs scale to hundreds of entries without these shapes changing.

import type { GearDef, WeaponDef } from "./defs/equipment.ts";
import type { DifficultyMobLevels } from "./defs/levels/types.ts";
import type { CutsceneState } from "@game/lib/cutscene.ts";
import type { Rng } from "@game/lib/rng.ts";
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
 * The seven trainable stats, points awarded per level-up. SPIRIT is the
 * caster-support stat: it drives mana and health REGEN (see config REGEN),
 * where INTELLIGENCE sizes the mana pool and unlocks spells.
 */
export type StatName =
  | "stamina"
  | "strength"
  | "dexterity"
  | "intelligence"
  | "speed"
  | "luck"
  | "spirit";

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

export type Player = {
  pos: Vec2;
  /** Height above the ground (world px) and vertical speed while jumping. */
  z: number;
  vz: number;
  hp: number;
  maxHp: number;
  /**
   * Current stamina — the sprint pool. Any movement spends it (in proportion
   * to pace); only standing still refills it. An empty pool caps the top speed
   * (see config `STAMINA`).
   */
  stamina: number;
  /** Max stamina, from the base pool + STAMINA stat (see `computeMaxStamina`). */
  maxStamina: number;
  /**
   * Current mana — the spell pool. Spent by casting; refilled by the mana
   * potion or, after `manaRegenMs` idles out, by SPIRIT-driven regen (config
   * MANA / REGEN). Sized by INTELLIGENCE (`computeMaxMana`).
   */
  mana: number;
  /** Max mana, from the base pool + INTELLIGENCE (see `computeMaxMana`). */
  maxMana: number;
  /**
   * Ms until mana regen resumes — set to `REGEN.manaDelayMs` on every cast and
   * counted down each tick (`stepRegen`). While positive the pool holds; the
   * "5 seconds of no spell being used" rule. 0 = regenerating.
   */
  manaRegenMs: number;
  /**
   * Ms until health regen resumes — set to `REGEN.hpDelayMs` whenever the hero
   * takes a hit and counted down each tick. Gates the SPIRIT-driven hp trickle
   * so it only mends out of the line of fire. 0 = regenerating.
   */
  hpRegenMs: number;
  /**
   * Active magical SHIELD (a defensive spell): `shieldHp` absorbs incoming
   * damage before the hero's own hp for `shieldMs`. Both count to 0 (the shield
   * lapses when either its pool is drained or its timer runs out — see the
   * player-damage path and `stepRegen`). 0/0 = no shield.
   */
  shieldHp: number;
  shieldMs: number;
  /**
   * Active SELF-BUFF (a martial-class `buff` power — war cry, berserk, rapid
   * fire, take aim). While `buffMs > 0` the hero's own weapon blows, attack
   * cadence, and walk speed are scaled by `buffDamageMult` / `buffHasteMult` /
   * `buffSpeedMult` (all 1 when idle). A re-cast refreshes to the stronger of
   * each and the longer timer (no stacking); the timer ebbs in `stepRegen`,
   * which resets the mults to 1 when it hits 0. The mults are read through
   * `heroBuffMult` at the three combat sites (`weaponDamageFor`,
   * `weaponCooldownFor`, `playerSpeed`).
   */
  buffMs: number;
  buffDamageMult: number;
  buffHasteMult: number;
  buffSpeedMult: number;
  /** Unit vector of the last movement direction; drives sprite facing. */
  facing: Vec2;
  /**
   * Realized velocity this tick (world px/s; zero while standing). Distinct
   * from `facing`, which persists while idle — this is what the smarter
   * shooters LEAD with on the hard rungs (see stepRangedAttacks), so a
   * standing hero is aimed at dead-on and a running one ahead of his path.
   */
  vel: Vec2;
  /**
   * Which way the sprite mirrors. Updated with hysteresis (see
   * PLAYER.faceFlipMinX) so near-vertical movement doesn't flicker the flip.
   */
  faceLeft: boolean;
  /** Time-limited powers currently running (spent ability pickups). */
  abilities: ActiveAbility[];
  /**
   * GRANTED SPELLS from worn equipment (`spell` affixes) — the forever
   * powers, alive as long as the piece is worn. Re-derived from the loadout
   * each tick (`syncItemSpells`), preserving each spell's sweep/cooldown
   * scratch state across the sync.
   */
  itemSpells: ItemSpell[];
  /**
   * The HUD spell bar: one entry per slot (`SPELL_SLOTS` long), each a
   * SPELL_DEFS id assigned to that slot or null for an empty slot. Tapping a
   * slot casts its spell (`GameInput.castSpell`); a long-press opens the picker
   * to reassign it from the hero's UNLOCKED spells (of the hero's class —
   * effective governing stat ≥ the spell's `minStat`). Carried between levels
   * via the loadout, so a caster's bar persists.
   */
  spellSlots: (string | null)[];
  /**
   * Per-spell cast cooldowns (ms remaining, keyed by SPELL_DEFS id), counted
   * down each tick (`stepRegen`). A spell with time on its clock can't be cast
   * again; absent/0 = ready. Keyed by spell id (not slot) so the same spell in
   * two slots shares one cooldown.
   */
  spellCooldowns: Record<string, number>;
  /**
   * Queued spell-bar SLOT indices awaiting cast (FIFO). A press ENQUEUES its
   * slot (`GameInput.castSpell`); `stepSpellQueue` drains the front one per
   * GLOBAL cooldown while mana lasts — so a press casts ONCE and a burst of
   * presses fires in order instead of holding a spell "on". Deduped by slot
   * (a slot already waiting isn't queued twice), so it holds at most one entry
   * per slot. The first queued cast the pool can't afford FLUSHES the whole
   * queue: cast until mana runs out, then wait for regen.
   */
  spellQueue: number[];
  /**
   * The GLOBAL COOLDOWN remaining (ms). After any cast, every spell — and the
   * queue's next dequeue — is locked out until this hits 0. Ticked down each
   * frame in `stepRegen`; distinct from the per-spell `spellCooldowns`.
   */
  globalCooldownMs: number;
  /**
   * The powerup dock (ABILITY_DEFS ids, oldest first, HELD_ITEMS.cap deep). A
   * slot holds a pickup from the moment it is scooped: first as a banked power
   * the `useItem` input can spend, then — once spent — as the running copy,
   * which keeps its slot and counts down in place until it lapses. Only then is
   * the slot freed and the rest shift down (`ActiveAbility.slot` links a running
   * copy back to its slot). A slot occupied by a running power can neither be
   * re-spent nor banked over, so the dock stays full while a power runs.
   */
  heldAbilities: string[];
  /**
   * Stacked medkits, one count per MEDKIT tier (index i is the tally of
   * `MEDKIT.tiers[i]` kits held), each capped at `CONSUMABLES.stackCap`.
   * Medkits stack only within their own quality — a LIGHT MEDKIT never
   * merges with a SUPERIOR one — so the array is a per-quality inventory the
   * HUD's single medkit slot shows the best-quality entry of. Spent
   * best-first by `consumeMedkit`; carried between levels via the loadout.
   */
  medkits: number[];
  /**
   * Stacked stamina potions (the energy-drink consumable), capped at
   * `CONSUMABLES.stackCap`. Spent by `consumeStaminaPotion` to refill the
   * sprint pool; carried between levels via the loadout.
   */
  staminaPotions: number;
  /**
   * Stacked BLUE GATORADE mana potions (capped at `CONSUMABLES.stackCap`).
   * Spent by `consumeManaPotion` to refill the spell pool; carried between
   * levels via the loadout. Mirrors `staminaPotions`.
   */
  manaPotions: number;
  /**
   * Stacked weapon repair kits (capped at `CONSUMABLES.stackCap`). A touched
   * kit now banks into the consumable dock rather than firing on contact;
   * `useRepairKit` spends one on the player's call to mend the WHOLE kit — the
   * held weapon, every weapon in the bag (waking any that broke), and the worn
   * armor — then re-equips the weapons durability booted from the hand. Carried
   * between levels via the loadout.
   */
  repairKits: number;
  /** True while the player moved this step; drives the walk animation. */
  moving: boolean;
  /** Remaining ms until the weapon may fire again. */
  weaponCooldownMs: number;
  /**
   * True while the hero's weapon is holstered — set on levels with a scripted
   * `openingStrike` (SpaceZ HQ). The auto-attack sits out entirely until the
   * vanguard's soft first swing arms him (see story.ts `tryOpeningStrike`);
   * cleared for good once armed. Absent/false everywhere else — the hero opens
   * ready to fight.
   */
  disarmed?: boolean;
  /** Remaining ms of post-hit invulnerability flash (visual only). */
  hurtFlashMs: number;
  /**
   * KNOCKED OUT: ms the hero lies prone and HELPLESS on the floor (config
   * SANDSTORMS.knockoutMs, landed by a sand storm). While `> 0` he can't move,
   * jump, attack, cast, or use an item — every player-driven pass is gated on
   * it (`stepPlayer` freezes him; `stepWeapon`/spells/consumables sit out) —
   * yet he stays fully vulnerable to the horde. Ticked down in `stepPlayer`;
   * 0 = up and in control. Not carried between levels (a fresh run starts up).
   */
  knockoutMs: number;
  /**
   * KNOCKBACK impulse (an asteroid blast flung him — see `stepKnockback` in
   * hazards.ts). While `knockMs > 0` the hero coasts along `knockVel` (world
   * px/s) on top of whatever he steers, so the shockwave shoves him to the
   * side; the velocity bleeds down as the fling settles. `knockMs` 0 and
   * `knockVel` zero at rest. Not carried between levels.
   */
  knockMs: number;
  knockVel: Vec2;
  level: number;
  xp: number;
  /** XP still needed to reach the next level. */
  xpToNext: number;
  /** Stat points awarded but not yet spent (spent via `allocateStat`). */
  pendingStatPoints: number;
  /**
   * COINS — the merchant economy's currency (see merchant.ts / config
   * ECONOMY). Earned by selling loot to a discovered merchant, spent on his
   * stall; carried between levels via the loadout.
   */
  coins: number;
  stats: Record<StatName, number>;
  /**
   * The stat points the PLAYER personally spent on the level-up/respec
   * chooser — a display-only tally the two overlays show so the chooser
   * reflects only the player's own picks. Distinct from `stats`, which also
   * carries the difficulty head-start (create.ts) and, through
   * `effectiveStat`, folds in the automatic per-level growth and gear; none
   * of those are "spent" by the player. Incremented by `allocateStat`,
   * decremented by `deallocateStat`, zeroed by `beginRespec` (a respec
   * re-places the whole refunded pool from scratch). Carried between levels
   * via the loadout.
   */
  spentStats: Record<StatName, number>;
  equipment: {
    /** Never empty — the character always fights with something. */
    weapon: Equipment;
    /** The four armor slots. Broken pieces stay worn but count for nothing
     * until repaired (see `isArmorBroken`). */
    head: Equipment | null;
    chest: Equipment | null;
    legs: Equipment | null;
    feet: Equipment | null;
    charm: Equipment | null;
    /**
     * A worn BAG that widens the carry (its `GearDef.bagSlots` add cells on
     * top of the STRENGTH-scaled floor — see `inventoryCapacity`). Null = no
     * bag; the base bag is all the hero has. More bag types arrive later.
     */
    bag: Equipment | null;
  };
  /** Fixed-size bag; `null` cells are empty. */
  inventory: (Equipment | null)[];
};

/** The three slots a companion can be equipped in: a weapon, a helmet, and a
 * chest piece — never legs or feet (their own boots carried them through
 * whatever they fell out of). */
export type CompanionSlot = "weapon" | "head" | "chest";

/**
 * A recruited COMPANION (see companions.ts): a spareable unique the player
 * chose to SPARE joins the party, follows the hero, and fights with whatever
 * is in its weapon slot. `defId` keys COMPANION_DEFS (name, sprite, starting
 * weapon, aura, kill quotes). Companions are never killed — at 0 hp one goes
 * DOWN (kneels out of the fight, aura silent) and stands back up on its own
 * after `COMPANIONS.reviveMs`.
 */
export type Companion = {
  id: number;
  /** Key into COMPANION_DEFS. */
  defId: string;
  pos: Vec2;
  hp: number;
  maxHp: number;
  /**
   * The companion's OWN level, earned by fighting (config
   * `COMPANIONS.levelKills`) and decoupled from the hero: hp, damage, and its
   * signature POWER all grow with it (`companion-stats.ts`). It starts trained
   * to the hero's level on recruit and climbs from there forever — the level
   * rides the loadout, so it persists across every level and difficulty.
   */
  level: number;
  /** XP banked toward the next level, from this companion's OWN kills. */
  xp: number;
  /** XP needed to cross out of the current level (`companionXpToLevelUp`). */
  xpToNext: number;
  /** Sprite mirror, following the walk direction like the player's. */
  faceLeft: boolean;
  /** True while it walked this step; drives the walk animation. */
  moving: boolean;
  /** Remaining ms until its weapon may strike again. */
  weaponCooldownMs: number;
  /** Combat-heat timer (ms): set to `COMPANIONS.regenCalmMs` whenever the
   * companion has a live target or takes a hit, counting down otherwise. Out-of-
   * combat regen (see stepCompanion) kicks in only once it reaches 0. */
  combatMs?: number;
  /** Ms left kneeling; undefined while up and fighting. See COMPANIONS. */
  downedMs?: number;
  /**
   * True while the companion is in screen-edge FOLLOW mode: the hero moved far
   * enough that it drifted to the camera's edge, so it drops the fight and
   * moves WITH him until he stops (config `COMPANIONS.screenEdgeMargin`, logic
   * in `stepCompanion`). Absent/false when it is free to hold formation and
   * engage the horde around the hero.
   */
  following?: boolean;
  /** Ms until this companion may float another kill quote. */
  quoteCooldownMs: number;
  /**
   * Ms until this companion's FROST NOVA may pulse again (companions with a
   * `CompanionDef.nova` — see `companionNova`). Held at 0 while there is no
   * foe in reach, so the ring goes off the instant one drifts into it, then
   * counts down `nova.everyMs` between pulses. Undefined on companions with no
   * nova.
   */
  novaCooldownMs?: number;
  equipment: {
    /** Never empty — a companion always fights with something. */
    weapon: Equipment;
    head: Equipment | null;
    chest: Equipment | null;
  };
};

/**
 * The pending SPARE-or-KILL verdict while `phase === "choice"`: a spareable
 * unique (`EnemyDef.spareable`) was beaten to 0 hp and kneels awaiting the
 * player's call (`resolveChoice`). `damage`/`crit` remember the withheld
 * killing blow so an execution books it exactly as it landed.
 */
export type ChoiceState = {
  enemyId: number;
  defId: string;
  damage: number;
  crit: boolean;
  /** The withheld blow's damage-variance roll (crits only) — carried so an
   * execution's popup sizes exactly as the blow would have. */
  critPower?: number;
};

export type Enemy = {
  id: number;
  /** Key into ENEMY_DEFS (hp/speed/damage/AI live on the def). */
  defId: string;
  pos: Vec2;
  /** Spawn point: monsters return here when the player escapes their aggro. */
  home: Vec2;
  hp: number;
  maxHp: number;
  /**
   * MONSTER LEVEL, stamped at spawn: the player's level plus the difficulty's
   * `mobLevelOffset` (plus the def's own `levelBonus` — elites and bosses run
   * a few levels hot). Loot reads it for everything Diablo-shaped: which base
   * items may drop (`levelReq` gate), which tiers are unlocked
   * (`LOOT.tierUnlockMlvl`), and the dropped item's own level (see
   * `rollItemLevel`). Elites/bosses re-stamp it when their fight engages
   * (maybePowerScale), so their loot matches the hero who actually beat them.
   */
  mlvl: number;
  /** Snapshot of def speed × per-instance jitter. */
  speed: number;
  /** Remaining ms until this enemy may deal contact damage again. */
  contactCooldownMs: number;
  /**
   * Remaining ms of the "that was a CRIT" flash — the renderer blinks the
   * sprite while this runs. Visual only, set by critical player hits.
   */
  critFlashMs?: number;
  /**
   * Elites sleep at their post until the player wanders close (or wounds
   * them); once true they hunt forever — no drifting back home. Minions use
   * it as their aggro latch: waking needs line of sight (some minions
   * excepted),
   * the chase then holds even through walls, and escaping the aggro radius
   * puts them back to sleep. Unused by bosses, whose wakefulness is derived
   * per tick.
   */
  awake?: boolean;
  /**
   * True once this enemy's dialogue has played (or been skipped by killing
   * the speaker mid-rush). Speakers only ever get one scene.
   */
  spoke?: boolean;
  /**
   * Evolution stage stamped on a minion when the menace meter was high at its
   * spawn (see config MENACE). Its extra hp is already baked into `hp`/`maxHp`;
   * this field is what the loot roll reads to sweeten an evolved mob's drop,
   * and the renderer reads to mark it as evolved. 0/undefined = un-evolved.
   */
  evo?: number;
  /**
   * Elite/boss power-match bookkeeping. `powerScaled` latches true the first
   * time the fight engages so the scale is applied exactly once;
   * `contactMult` is the (softened) multiplier its contact damage carries
   * afterwards. See maybePowerScale in menace.ts.
   */
  powerScaled?: boolean;
  contactMult?: number;
  /**
   * A HARD-CODED monster level from the level spec (an elite/boss's authored
   * per-difficulty `level`, or a regular mob's rolled `mobLevels` band). When
   * set, `maybePowerScale` keeps this as the mob's `mlvl` instead of re-stamping
   * it from the player-relative `currentMobLevel` — the level spec owns the
   * number, not the difficulty offset. Unset on JESUS and on any spawn that
   * still runs player-relative.
   */
  authoredMlvl?: number;
  /**
   * FROST CHILL bookkeeping (a companion's frost nova — see `companionNova`):
   * `chillMs` counts down the slow's remaining life, and `chillFactor` is the
   * movement multiplier (0..1) applied while it runs — `moveEnemy` folds it in
   * alongside a stasis field, so a chilled mob crawls. Both absent once the
   * chill lapses.
   */
  chillMs?: number;
  chillFactor?: number;
  /**
   * The scripted opening striker (a level's `openingStrike`): a lone vanguard
   * that rushes ahead of the pack, and whose first contact — harmless — draws
   * the hero's holstered weapon. Set at creation; only this mob can arm him.
   */
  vanguard?: boolean;
  /**
   * SUMMON RUN-IN (config SPAWNERS): a mob summoned by a spawn point appears
   * just OFF-SCREEN and SPRINTS toward the hero (`runInSpeedMult` × its speed)
   * until it crosses the APPROACH CIRCLE of this radius (world px) around him —
   * the shorter viewport dimension, stamped at summon time so the chase needs no
   * live camera. On crossing it, the field is cleared and the mob drops into its
   * normal AI at its own pace. Absent on every mob placed or woken the old way.
   */
  approachRadius?: number;
  /**
   * An apparition's dissolve countdown (config APPARITION.lingerMs), armed on
   * the first playing tick after its scene ends. At 0 the figure leaves the
   * board with an `apparitionVanished` event. Absent on everything else.
   */
  vanishMs?: number;
  /**
   * A SHOOTER's reload clock (enemies with `EnemyDef.ranged`): ms until it
   * may fire again. Counts down every tick; firing resets it to the def's
   * `ranged.cooldownMs`. The cover AI also reads it — a freshly-fired
   * shooter scrambles behind a rock and only peeks back out as the clock
   * runs down (see moveRangedEnemy in ranged.ts). Absent on melee mobs.
   */
  rangedCooldownMs?: number;
  /**
   * Set-piece MECHANICS bookkeeping (elites/bosses with `EnemyDef.mechanics`
   * or `phases` — see src/game/mechanics.ts; absent on everything else).
   * The renderer reads `telegraph` to sell the windup (the freeze + flash)
   * and `dashMs` for the charge streak; everything else is clocks.
   */
  mech?: EnemyMech;
  /**
   * KNOCKBACK impulse bookkeeping (an asteroid blast flung it — see
   * `stepKnockback` in hazards.ts). While `knockMs > 0` the mob is owned by
   * the launch: `moveEnemy` sits its AI out and the body coasts along
   * `knockVel` (world px/s), which bleeds down as the fling settles. Both
   * absent once the launch has spent itself.
   */
  knockMs?: number;
  knockVel?: Vec2;
};

/** Runtime state of one enemy's set-piece mechanics (see `Enemy.mech`). */
export type EnemyMech = {
  /** The windup in progress: which move, ms left, and the LOCKED bearing
   * (charge only). While set the mob is rooted — the readable tell. */
  telegraph?: { kind: "charge" | "slam"; remainingMs: number; dir?: Vec2 };
  /** Ms of dash left, and the locked unit bearing it rides. */
  dashMs?: number;
  dashDir?: Vec2;
  /** Contact-damage multiplier while `dashMs` runs (the charge's impact). */
  dashDamageMult?: number;
  /** Cooldown clocks (ms) per mechanic. */
  chargeCooldownMs?: number;
  slamCooldownMs?: number;
  summonCooldownMs?: number;
  /** Latched true when the enrage threshold is crossed (fires the event and
   * the multipliers once — an enrage never calms back down). */
  enraged?: boolean;
  /** Live ids of this mob's summoned adds (pruned as they die), holding the
   * summon's `maxAlive` cap. */
  summons?: number[];
};

/**
 * A black hole built from the level def (LevelDef.wells): a static gravity
 * well that drags the grounded player, enemies, and loose items toward
 * `pos`. Numbers are resolved from the config WELLS defaults at creation.
 */
export type GravityWell = {
  id: number;
  pos: Vec2;
  /** Reach of the pull on the player and enemies (world px). */
  pullRadius: number;
  /** Inside this the hole devours minions and the grounded player alike. */
  coreRadius: number;
  /** Peak pull at the core's edge (px/s), linear falloff to the reach. */
  pullSpeed: number;
  /** Reach of the pull on loose loot (world px) — about a screen away, so
   * drops slide in from well beyond the player's own pull. */
  lootRadius: number;
};

/**
 * A meteor strike (config ASTEROIDS; a level turns the rain on with
 * LevelDef.asteroids): falls out of the sky on a slant toward a target patch
 * near the player and DETONATES on impact — an AoE that vaporizes minions in
 * the lethal core, flings everything else (and the grounded hero) to the
 * sides, bites the hero's hp by how near the centre he stood, and leaves a
 * crater. The engine tracks the fall by its timer (`ageMs`/`fallMs`); the
 * renderer derives the rock's air position and shadow from the same progress.
 * Ignores obstacles and level bounds.
 */
export type Asteroid = {
  id: number;
  /** Ground impact point — where the shadow sits, the telegraph firms, and the
   * blast lands. */
  target: Vec2;
  /** Ground-projected entry point, offset up-range from `target` along the
   * incoming bearing, so the rock streaks in on a slant from a varied angle. */
  entry: Vec2;
  /** Total fall time from entry (high) to impact (ms). */
  fallMs: number;
  /** Elapsed fall time (ms); at `fallMs` the rock detonates. */
  ageMs: number;
  /** Explosion (AoE) radius on impact (world px). */
  blastRadius: number;
  /** Visual rock radius (world px; the renderer sizes the sprite off it). */
  rockRadius: number;
  /** Visual spin rate in radians/s (rolled at spawn; renderer only). */
  spin: number;
};

/**
 * A crater left where a meteor struck (config ASTEROIDS): a ground scar that
 * lingers then fades once the dust settles. Purely cosmetic — it never blocks
 * movement or sight. Levels whose surface can scar name the sprite pool via
 * `asteroids.craterSprites`; a scar picks one at birth.
 */
export type Crater = {
  id: number;
  pos: Vec2;
  /** Scar radius (world px; the renderer sizes the sprite off it). */
  radius: number;
  /** Elapsed life (ms). */
  ageMs: number;
  /** Total lifetime (ms) before it is gone; the last `craterFadeMs` fade out. */
  ttlMs: number;
  /** The sprite drawn for this scar, chosen from the level's crater pool. */
  sprite: string;
  /** Visual rotation (radians; rolled at birth) so scars don't tile in
   * lockstep. */
  angle: number;
};

/**
 * A spinning HAY BALL (config HAY_BALLS; a level rolls them in with
 * LevelDef.hayBalls): mints just past the right screen edge and rolls straight
 * to the LEFT across the field, spinning and hopping (both renderer-only). It
 * costs the grounded hero a very slight flat hp once on contact and SHOVES him
 * left every tick it overlaps, plows minions aside, and despawns once past the
 * player's stage. Ignores obstacles and level bounds.
 */
export type HayBall = {
  id: number;
  pos: Vec2;
  /** Roll speed to the left (px/s). */
  speed: number;
  radius: number;
  /** Visual spin rate in radians/s (rolled at spawn; renderer only). */
  spin: number;
  /** Latched once it has taken its one slight hp bite from the hero — the
   * shove keeps coming every tick, but the bale only nicks him once. */
  struck: boolean;
};

/**
 * A drifting SAND STORM (config SANDSTORMS; a level turns the squalls on with
 * LevelDef.sandstorms): a small dust gust that crosses the field in a straight
 * line, shoves minions aside like an asteroid, and — catching the grounded
 * hero — strikes him ONCE (a scaled bite AND a knockout, `Player.knockoutMs`)
 * before drifting on and thinning out. Ignores obstacles and level bounds.
 */
export type SandStorm = {
  id: number;
  pos: Vec2;
  /** Unit direction of drift. */
  dir: Vec2;
  speed: number;
  /** Body radius (world px). */
  radius: number;
  /** Visual swirl phase (rolled at spawn; renderer only). */
  spin: number;
  /** Latched once it has caught the hero — one knockout per storm. */
  struck: boolean;
  /**
   * Ms left in the fade-out that begins when the storm strikes (config
   * SANDSTORMS.fadeMs). `null` until it strikes; once it hits 0 the storm is
   * spent and despawns. The renderer thins the gust as it counts down, so the
   * storm visibly passes over the fallen hero and vanishes.
   */
  fadeMs: number | null;
};

/**
 * One panicked staffer in a stampede herd — a renderer/spawn record only (the
 * herd's collision is a single band around the anchor, not per-runner). Its
 * offset from the herd anchor, which of the three employee sprites it wears,
 * and a bob phase so the pack's legs don't pump in lockstep.
 */
export type StampedeRunner = {
  /** Offset from the herd anchor along the charge (px) — the ragged column. */
  dx: number;
  /** Offset from the herd anchor across the charge (px) — the wall's spread. */
  dy: number;
  /** Which employee sprite (0..2 → the three runner looks). */
  variant: number;
  /** Per-runner bob phase (0..1) so the legs pump out of step. */
  phase: number;
};

/**
 * An EMPLOYEE STAMPEDE (config STAMPEDES; a level turns them on with
 * LevelDef.stampedes): a herd of `runnerCount` staffers that mints past the
 * right screen edge and charges straight LEFT at great speed as one wall,
 * trailing a dust cloud. It bowls minions in its band OVER (flung aside AND
 * knocked out for a few seconds, not killed — no farm, no thinning), shoves
 * elites/bosses, and — catching the grounded hero — strikes him ONCE (a
 * difficulty-scaled max-hp bite AND a knockdown, `Player.knockoutMs`) before
 * charging on. A jump sails clean over its thin collision line. Ignores
 * obstacles and bounds.
 */
export type Stampede = {
  id: number;
  /** Herd anchor — the collision band's centre; the runners ride offsets. */
  pos: Vec2;
  /** Charge speed to the left (px/s). */
  speed: number;
  /** The individual runners, rolled at spawn (renderer + spawn only). */
  runners: StampedeRunner[];
  /** Latched once it has trampled the hero — one knockdown per herd. */
  struck: boolean;
};

/**
 * The APPROACH TELEGRAPH for a coming EMPLOYEE STAMPEDE (config
 * STAMPEDES.telegraphMs, difficulty-scaled): over the last stretch of the spawn
 * countdown a line of DUST kicks up along the exact lane the wall will charge
 * down, so the player can read WHICH band to clear before the runners appear.
 * The lane `y` is rolled the instant the telegraph lights and the herd then
 * mints on it, so the dust and the wall never disagree. Renderer-only state
 * (like `Stampede`); the app draws the dust from it and its `ageMs / leadMs`
 * progress (fading in as the spawn nears).
 */
export type StampedeWarn = {
  /** The world-y lane centre the herd will charge down (absolute, locked at
   * telegraph time so the dust marks exactly where the wall arrives). */
  y: number;
  /** Total telegraph lead (ms) — the difficulty-scaled `STAMPEDES.telegraphMs`. */
  leadMs: number;
  /** How long the telegraph has been up (ms); `ageMs / leadMs` is its 0..1 fade. */
  ageMs: number;
};

export type Projectile = {
  id: number;
  pos: Vec2;
  /** Unit direction of travel. */
  dir: Vec2;
  speed: number;
  radius: number;
  /** Damage before the on-hit crit roll. */
  damage: number;
  /** Where `damage` landed in the weapon's variance band, in [0, 1] (see
   * `rollWeaponHit`) — carried so a crit's popup can be sized by how hard the
   * shot rolled. */
  damageRoll?: number;
  /** Remaining ms before the projectile despawns. */
  lifetimeMs: number;
  /** Which weapon class fired it (drives sound and hit resolution). */
  weaponClass: WeaponClass;
  /** The sprite the renderer draws for this shot (staple, zap, vial…). */
  sprite: string;
  /**
   * Foes this shot may still punch THROUGH (a railgun's line) — decremented
   * per body; the shot dies when a hit lands with this at 0. Absent = 0.
   */
  pierceLeft?: number;
  /** Homing turn rate in radians/s (a smart pistol's darts); absent = 0. */
  homing?: number;
  /**
   * Chain-lightning leaps still owed on the first hit (see
   * `WEAPON.chainRange` / `chainDamageFrac`). Absent = no chaining.
   */
  chain?: number;
  /** Enemy ids already struck by this shot, so a piercing round never bills
   * the same body twice while passing through it. */
  hitIds?: number[];
  /** The VOLLEY this shot belongs to — one trigger pull's `count` pellets share
   * a single id (set only on the HERO's shots). Rides out on each hit's
   * `enemyHit.fromVolley` so the ranged AoE calibration can group a volley's
   * hits and count the DISTINCT foes it reached. Absent on companion shots. */
  volley?: number;
  /**
   * The COMPANION that fired this shot (a `Companion.id`) — carried so a
   * kill downstream can float its quote (see maybeCompanionQuote), and so
   * the hit skips the hero's accuracy roll (companions never miss; they
   * have no DEXTERITY to earn it back with). Absent on the hero's shots.
   */
  companionId?: number;
  /**
   * A HOSTILE shot — fired by an enemy (`EnemyDef.ranged`) at the PLAYER.
   * It never touches the horde: `stepProjectiles` moves it, walls eat it,
   * and it resolves against the hero alone (armor applies; a jump sails
   * over it like it clears enemy contact). Absent on the hero's and the
   * companions' shots.
   */
  hostile?: boolean;
  /**
   * A hostile shot's firing MONSTER LEVEL — the attacker level the hero's
   * armor reduction is judged against (see `armorReduction`), stamped from
   * the shooter's `mlvl` when it fires. Absent on friendly shots.
   */
  sourceMlvl?: number;
  /** The firing weapon's crit-damage multiplier (see `weaponCritMult`) —
   * carried so the hit resolves with the cadence-weighted crit. Absent =
   * the global `STATS.critMultiplier`. */
  critMult?: number;
  /**
   * Height above the ground at which the shot is drawn — inherited from a
   * jumping shooter, sinking back to 0 in flight. Visual only.
   */
  z: number;
};

export type Item =
  /** `tier` indexes config MEDKIT.tiers (the D2-style kit sizes) — absent
   * on items minted before tiers shipped, read as the lightest kit. */
  (
    | { id: number; kind: "medkit"; pos: Vec2; tier?: number }
    /** The golden level-up arrow: grants a share of the XP to the next level. */
    | { id: number; kind: "xp"; pos: Vec2 }
    /** A repair kit: restores the equipped weapon's durability to full. */
    | { id: number; kind: "repair"; pos: Vec2 }
    /** An energy drink: resets the sprint pool to full on touch. Like the repair
     * kit it stays grounded when there is nothing to top up (stamina already
     * full), so it is never wasted on a rested hero. */
    | { id: number; kind: "drink"; pos: Vec2 }
    /** A blue gatorade: refills the mana pool on touch (banked into the dock).
     * Like the energy drink it stays grounded when there's nothing to top up
     * (mana already full), so it is never wasted on a full caster. */
    | { id: number; kind: "mana"; pos: Vec2 }
    | { id: number; kind: "equipment"; pos: Vec2; equipment: Equipment }
    /** A time-limited power pickup; `defId` keys into ABILITY_DEFS. */
    | { id: number; kind: "ability"; pos: Vec2; defId: string }
    /**
     * A plot piece — a keycard, a dossier, the anti-grav unit. `defId` keys
     * into STORY_ITEM_DEFS; picking one up banks it in `state.storyItems`
     * (never the bag) and plays its lore as a dialogue.
     */
    | { id: number; kind: "story"; pos: Vec2; defId: string }
  ) & {
    /**
     * A MERCY DROP still being flown in by its ANGEL. When set (and > 0) the
     * rescue is airborne — cradled by the guardian as it descends to `pos` (the
     * spot the mob died) — and NOT yet collectable; the magnet ignores it and
     * `stepItems` counts it down (see `MERCY.angelDeliverMs`). At 0 the gift has
     * landed and the item behaves like any other. Absent on every ordinary drop,
     * so a plain drop is `deliverMs === undefined` and grounded from birth. The
     * renderer draws the descending angel + falling pickup off this timer
     * (`render.ts`); the engine only gates the pickup and never mentions angels.
     */
    deliverMs?: number;
  };

/** A decorative feature scattered at level creation — rendered, no collision. */
export type Decor = {
  /** Def key for the piece (debugging/analytics); the renderer draws `sprite`. */
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  pos: Vec2;
};

/**
 * A solid feature neither the player nor monsters can move through. Low ones
 * (`jumpable`) can be cleared mid-jump — monsters never jump, so a low rock
 * is a wall to the horde and a hop to the player. Tall ones block everyone.
 */
export type Obstacle = {
  id: number;
  /** Def key for the piece (analytics/debugging). */
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  pos: Vec2;
  /**
   * Bounding radius in world px — the collision radius for a round obstacle,
   * and the coarse cull/spacing radius for a rectangular one (see `half`).
   */
  radius: number;
  /**
   * Rectangular footprint (half-extents in world px), present on sized rocks.
   * When set, collision, line-of-sight and shots test the box; when absent the
   * obstacle is the plain circle of `radius`.
   */
  half?: Vec2;
  /** True when a jumping player sails over it. */
  jumpable: boolean;
  /**
   * BREAKABLE (a crate — see crates.ts): the hero's weapon smashes it. When
   * set, `hp`/`maxHp` are live and the obstacle drops loot and is removed from
   * the field once `hp` reaches 0. Absent on ordinary solid features (rocks,
   * walls, craters), which never take damage.
   */
  breakable?: boolean;
  /** Current break hp (breakable obstacles only). */
  hp?: number;
  /** Full break hp (breakable obstacles only). */
  maxHp?: number;
  /**
   * A special CHEST (see `LevelDef.chests` / crates.ts): a breakable that spills
   * a richer, guaranteed haul than a scattered crate. Absent on plain crates.
   */
  chest?: boolean;
};

/** A fixed story prop (a lander, a flag, …) placed by the level def. */
export type Landmark = {
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  /**
   * Where the sprite meets its pos: `base` pins the sprite's foot to `pos`
   * (a standing prop like a flag or mast), `center` centers it. Data, so the
   * renderer never special-cases a particular prop kind.
   */
  anchor: "base" | "center";
  pos: Vec2;
};

/**
 * How the renderer paints a level's ground. Data on the level def, so a new
 * biome is a new entry — no renderer edit. `ground.rare` scatters into
 * `ground.common` every `rareEvery`-th cell; an optional `patch` clusters a
 * second pair on a coarse grid for gravel/vent-style clumps.
 */
export type TileSpec = {
  ground: { common: string; rare: string; rareEvery: number };
  patch?: { a: string; b: string; every: number };
  /**
   * Regional overrides: inside `rect` (world px) the zone's own ground/patch
   * pair replaces the level-wide one — how a single level shifts terrain, e.g.
   * martian dust outside giving way to deck plating inside the base. Zones are
   * checked in order; the first rect containing the tile wins. Purely
   * presentational (the renderer picks tiles from it) — collision never reads
   * tiles.
   */
  zones?: {
    rect: { x: number; y: number; width: number; height: number };
    ground: { common: string; rare: string; rareEvery: number };
    patch?: { a: string; b: string; every: number };
  }[];
};

/**
 * A locked door from the level def: a wall segment of `door_locked`
 * obstacles that vanishes when the player brings the matching key (a story
 * item whose `unlocks` names this door) up to it.
 */
export type DoorState = {
  /** The LevelDef door id story items reference via `unlocks`. */
  id: string;
  /** Midpoint of the door segment (event anchor, proximity checks). */
  center: Vec2;
  /** The obstacle ids to remove from `state.obstacles` when it opens. */
  obstacleIds: number[];
  open: boolean;
};

/**
 * An OPEN travel gate — a doorway to another level, torn open by using its
 * key trinket (`spendGateKey`; the latent defs live on `LevelDef.gates`).
 * Purely logical: the visual is a landmark pushed alongside it, so the
 * renderer never learns gates exist. Stepping within GATES.enterRadius books
 * a one-shot `gateEntered` event; the app owns the actual travel.
 */
export type GateState = {
  /** The LevelDef gate id this came from. */
  id: string;
  /** Destination level id. */
  to: string;
  /** Where it stands (proximity checks, event anchor). */
  pos: Vec2;
  /** Latched once the crossing is booked, so it fires exactly once. */
  entered: boolean;
};

/**
 * The running conversation while `phase === "dialogue"`: an elite or boss
 * delivering its scene, a unique mob gasping its last words as it dies, or a
 * picked-up story item revealing its lore. The pages live on the def
 * (EnemyDef.dialogue / EnemyDef.lastWords / StoryItemDef.lore); this tracks
 * only who speaks and how far the player has tapped. `enemyDeath` carries no
 * `enemyId` — the speaker is already off the board.
 */
export type DialogueState = {
  source:
    | { kind: "enemy"; enemyId: number; defId: string }
    | { kind: "enemyDeath"; defId: string }
    | { kind: "story"; defId: string }
    /**
     * The hero's own inner monologue — a story beat pinned to an event (the
     * first kill of a given enemy on a level), not to a speaker on the board.
     * `defId` keys THOUGHT_DEFS.
     */
    | { kind: "playerThought"; defId: string }
    /**
     * The wandering merchant's meeting scene — played once, the moment he is
     * first discovered. `levelId` keys the level whose `merchant` def carries
     * the greeting (each level's trader has his own story for being there).
     * When `returning` is set (he was already met here on a prior run and is
     * revealed at map start), his shorter "welcome back" line plays instead —
     * the per-level `returnGreeting` paired with `difficulty`'s send-off.
     */
    | {
        kind: "merchant";
        levelId: string;
        returning?: boolean;
        difficulty?: Difficulty;
      }
    /**
     * A spared figure's joining scene — the thanks, the life owed, the
     * promise to follow — played the moment the SPARE verdict lands. `defId`
     * keys COMPANION_DEFS (its `joinWords` pages).
     */
    | { kind: "companionJoin"; defId: string };
  /** Index of the page currently on screen. */
  page: number;
};

/**
 * What a level-map pin commemorates: a `story` plot piece picked up, an
 * `elite` slain, a `boss` beaten (a fleeing unique counts — the fight was won
 * where it fled), or a `merchant` met (his stall stays put once discovered, so
 * the pin leads straight back to the shop).
 */
export type MapMarkerKind = "story" | "elite" | "boss" | "merchant";

/**
 * A pin on the level map (see map.ts): something memorable happened at
 * `pos`. `defId` keys the catalog its `kind` implies — STORY_ITEM_DEFS for
 * `story`, WEAPON_DEFS/GEAR_DEFS for `loot`, ENEMY_DEFS for `elite`/`boss` —
 * so the app can resolve a name or icon. Markers are shown even where the
 * fog still stands: the player was there when it happened.
 */
export type MapMarker = {
  kind: MapMarkerKind;
  pos: Vec2;
  defId: string;
};

/**
 * One entry on the merchant's stall (see merchant.ts). Powerups restock —
 * buy as many as the purse allows; a weapon is a one-off piece, latched
 * `sold` once bought (Diablo 2 style: the stall empties, the run moves on).
 */
export type MerchantStock = { id: number; price: number } & (
  | { kind: "ability"; defId: string }
  | { kind: "weapon"; equipment: Equipment; sold: boolean }
);

/**
 * The WANDERING MERCHANT: one per level, roaming until met (config
 * MERCHANT). The horde ignores him and nothing hurts him — he is a trader,
 * not a combatant. `discovered` latches on the first close encounter: he
 * stays put from then on, pinned on the level map, his stall stocked
 * against the hero he just met. `rng` is his own seeded stream so his
 * wandering never perturbs the run's roll sequence.
 */
export type Merchant = {
  pos: Vec2;
  /**
   * Sprite family the renderer draws (`<sprite>_0/_1` walk frames) — resolved
   * from the level def at creation, so the trader dresses for the venue (a
   * vendor's uniform at HQ, a patched 70s suit on the moon, …).
   */
  sprite: string;
  /** Where the current wander leg heads; null while idling (or discovered). */
  wanderTarget: Vec2 | null;
  /** Ms of idling left before the next wander leg starts. */
  idleMs: number;
  /** Ms left on the current leg — a leg blocked by terrain gives up here. */
  legMs: number;
  /** Sprite mirror, following the walk direction like the player's. */
  faceLeft: boolean;
  /** True while he walked this step; drives the walk animation. */
  moving: boolean;
  /** Latched on the first encounter: rooted, mapped, shop open for business. */
  discovered: boolean;
  /**
   * True once his "welcome back" line has been delivered (or was never owed).
   * A merchant MET live this run greets through the first-meeting scene and is
   * marked true then; a merchant REVEALED at map start (met here on a prior
   * run — see `revealMerchant`) starts false and gives his return greeting the
   * first time the hero comes near.
   */
  greetedReturn: boolean;
  /** The stall (empty until discovered — stock is rolled at the meeting). */
  stock: MerchantStock[];
  /**
   * Private seeded stream for wander legs and stall rolls, parked as its
   * plain uint32 state (not a closure) so the whole merchant serializes with
   * the run — see `createRngFromState` and saved-run.ts.
   */
  rngState: number;
};

export type GameStats = {
  kills: number;
  totalEnemies: number;
  shotsFired: number;
  damageDealt: number;
  damageTaken: number;
  itemsCollected: number;
  xpGained: number;
  /** Total mana spent casting spells this run — the spell-economy readout the
   * balance sim reports (alongside `spellsCast`). */
  manaSpent: number;
  /** Total spells cast this run (successful casts only). */
  spellsCast: number;
  /** Wall-clock ms of simulated play time — ticks every frame, drives every
   * timed sub-system (spawner, menace, effects). */
  timeMs: number;
  /**
   * The farm-proof survival clock: ms that only accrue while a fight is LIVE —
   * at least one foe on the field, or within `RUN.combatGraceMs` of the last
   * kill (see step.ts). A cleared field can't be loitered on for survival
   * time, so this — not `timeMs` — is what the high-score board banks.
   */
  combatMs: number;
  /** The highest menace (RAMPAGE) stage reached this run — the high-water
   * escalation, banked to the score board (see menace.ts `menaceStage`). */
  peakMenace: number;
};

/**
 * Something notable that happened during one `step()`, for the app layer to
 * react to (play a sound, flash the screen). Cleared at the start of every
 * step.
 */
export type GameEvent =
  /**
   * A projectile weapon fired. `pos` is the muzzle (the shooter), `dir` the
   * unit aim — the app draws a firing flash (ranged) or a cast burst (magic)
   * oriented along it.
   */
  | { type: "shot"; weaponClass: WeaponClass; pos: Vec2; dir: Vec2 }
  /**
   * A melee weapon swung. `pos` is the swinger, `dir` the unit aim, `range`
   * the effective reach, `arc` the full cone angle (radians) that the swing
   * strikes — the app sweeps a slash across that cone at that radius (a wide
   * arc for a blade, a narrow thrust for a spear).
   */
  | {
      type: "swing";
      pos: Vec2;
      dir: Vec2;
      range: number;
      arc: number;
      /**
       * How many foes fell inside the cone this swing — the UNCAPPED eligible
       * count (within range + arc + line of sight), BEFORE the
       * `maxMeleeTargets` cap trims it to the nearest few. It is the geometry ×
       * crowd-density read the AoE-budget calibration measures (see
       * `src/sim/aoe-calibration.ts`): "at this effective `arc`, how many
       * targets does the swing actually reach." The realized hits are
       * `min(targets, maxMeleeTargets)`.
       */
      targets: number;
    }
  | { type: "jump" }
  | { type: "land" }
  | {
      type: "enemyHit";
      pos: Vec2;
      crit: boolean;
      damage: number;
      defId: string;
      /** On a crit, how strong the blow was in [0, 1] (its position in the
       * weapon's damage-variance band) — the app sizes the crit popup by it, so
       * a top-of-band crit slams a bigger figure. Absent when the source has no
       * variance (abilities); ignored for non-crits. */
      critPower?: number;
      /** The struck enemy's unique id (`Enemy.id`) — telemetry, so a consumer
       * can tell WHICH foe was hit, not just its type. */
      enemyId?: number;
      /** The hero VOLLEY (one trigger pull's worth of projectiles share one id)
       * this hit belongs to, if it came from a ranged shot — set only on the
       * hero's own projectile hits. The ranged AoE calibration groups hits by it
       * to count the DISTINCT foes one volley reaches (see
       * `src/sim/aoe-calibration.ts`). Absent on melee, ability, and companion
       * blows. */
      fromVolley?: number;
    }
  | {
      type: "enemyKilled";
      pos: Vec2;
      defId: string;
      /** The killing blow, so death also pops a damage number. */
      damage: number;
      /** The victim's FULL health. The app sizes the death launch off the
       * OVERKILL (`damage − maxHp`): an overpowered blow flings the corpse
       * flying away from the hero, further the harder it was overkilled — a
       * legendary one-shot punts a minion clear off the screen. */
      maxHp: number;
      crit: boolean;
      /** See `enemyHit.critPower`. */
      critPower?: number;
      /** XP this kill awarded — the app floats it as rising blue combat text. */
      xp: number;
      /** The slain enemy's unique id (`Enemy.id`) — telemetry (see
       * `enemyHit.enemyId`). */
      enemyId?: number;
      /** The hero VOLLEY this killing blow belongs to, if a ranged shot — see
       * `enemyHit.fromVolley`. Absent on melee/ability/companion kills. */
      fromVolley?: number;
    }
  | { type: "playerHurt"; crit: boolean }
  /** The player sidestepped a blow entirely (see `playerDodgeChance`). `pos`
   * is the hero — the app floats a "DODGE" tag and pips a light whiff. */
  | { type: "playerDodge"; pos: Vec2 }
  /** An enemy sidestepped the player's weapon blow (see `enemyDodgeChance`).
   * `pos` is the foe — the app floats a "DODGE" tag off it. */
  | { type: "enemyDodge"; pos: Vec2; defId: string }
  /**
   * A blow bounced off a SHIELDED unique (`EnemyDef.shieldedBy` — it cannot
   * be hurt while its named guardians live). `pos` is the foe — the app
   * floats a "SHIELDED" tag so the immunity reads as a rule, not a bug.
   */
  | { type: "enemyShielded"; pos: Vec2; defId: string }
  /**
   * An enemy fired a projectile at the player (`EnemyDef.ranged`). `pos` is
   * the shooter's muzzle, `dir` the unit aim — the app draws the flash and
   * pips the hostile shot sound.
   */
  | { type: "enemyShot"; pos: Vec2; dir: Vec2; defId: string }
  /** The player's weapon blow whiffed of its own accord (see
   * `playerMissChance`). `pos` is the foe — the app floats a "MISS" tag. */
  | { type: "enemyMiss"; pos: Vec2; defId: string }
  /**
   * A set-piece mob began a telegraphed move (mechanics.ts): it stands
   * rooted for `ms` before the move lands — the app sells the windup (flash,
   * sound) so the dodge is earnable. `dir` is the charge's locked bearing.
   */
  | {
      type: "enemyTelegraph";
      kind: "charge" | "slam";
      pos: Vec2;
      defId: string;
      ms: number;
      dir?: Vec2;
    }
  /** A telegraphed slam landed: the shockwave around `pos` (radius for the
   * app's ring/shake; the damage was resolved engine-side). */
  | { type: "enemySlam"; pos: Vec2; radius: number; defId: string }
  /** An elite/boss crossed its enrage threshold — speed and damage are up
   * for the rest of the fight (the app tints it and stings the turn). */
  | { type: "enemyEnraged"; pos: Vec2; defId: string }
  /** A summoner called adds out of the ground around it. */
  | { type: "enemySummoned"; pos: Vec2; defId: string; count: number }
  | {
      type: "itemCollected";
      kind: Item["kind"];
      tier?: Tier;
      /**
       * The piece's MAKE quality (equipment pickups only, regular tier). The
       * pickup card reads it as the second visual axis: a broken/crude find
       * stays dull, while superior/perfect make earns the glow and shine a
       * magic-or-better tier would. Absent for loose pickups and normal make.
       */
      quality?: Quality;
      /** Human-readable label for the "picked up X" pickup feed. */
      name?: string;
      /**
       * The equipment's def id (equipment pickups only) — lets the app resolve
       * the piece's icon for the framed pickup card. Absent for loose pickups
       * (medkits, arrows, powerups), which never carry an inventory icon.
       */
      defId?: string;
      /**
       * The picked-up piece's stable `Equipment.id` (equipment pickups only) —
       * lets the app find it in the bag to click-equip straight from the pickup
       * card, robust to the bag being rearranged while the card is up.
       */
      itemId?: number;
      /**
       * A hand-authored UNIQUE's catalog id (see `Equipment.uniqueId`) — lets
       * the app book WHICH unique was found (the achievement ledger) without
       * matching on the display name. Absent on rolled items.
       */
      uniqueId?: string;
      /**
       * True when the piece was good enough to be worn on the spot (the
       * auto-equip path). The pickup card reads it to badge the find
       * "EQUIPPED" rather than offering a tap-to-equip.
       */
      equipped?: boolean;
      /**
       * True when wearing this piece would improve its slot over what's there
       * now (equipment pickups only). Auto-equipped finds are always upgrades;
       * a bagged find is an upgrade only when it out-scores the worn piece yet
       * wasn't force-equipped (a passive charm, say). Drives the card's
       * "UPGRADE" marker.
       */
      upgrade?: boolean;
      /**
       * XP this pickup awarded (golden XP arrows only) — the app floats it as
       * rising blue combat text above the hero's head, mirroring the "+N XP"
       * that flows off a slain foe. Absent for pickups that grant no XP.
       */
      xp?: number;
    }
  | { type: "itemDropped"; pos: Vec2 }
  /**
   * A breakable crate took a hero blow but survived (see crates.ts). `pos` is
   * the crate — the app puffs a splinter chip and pips a wooden thunk so the
   * hit reads before the box gives way.
   */
  | { type: "crateHit"; pos: Vec2 }
  /**
   * A crate was smashed open: off the field, its loot already spilled around
   * `pos`. `sprite` is the crate's sprite name so the app can keel the box
   * over (like a slain mob) and burst it into splinters before it blinks out,
   * leaving just the loot.
   */
  | { type: "crateBroken"; pos: Vec2; sprite: string }
  /**
   * A MERCY DROP was rolled and is being flown in by its ANGEL (the item's
   * `deliverMs` is now ticking). `pos` is where the guardian will release it —
   * the spot the mob died. Fires once, the instant the rescue is minted, so the
   * app can answer with the angel's chime and swoop; the `itemDropped` cue still
   * fires alongside it for the drop itself.
   */
  | { type: "mercyDrop"; pos: Vec2 }
  /**
   * The player walked over loot he couldn't carry — the bag is full, so the
   * piece stays on the ground. `pos` is the hero (the app floats a "bags full"
   * thought over him and pulses the inventory button to nudge a cleanup).
   * Throttled by `LOOT.bagFullHintCooldownMs` so standing on the loot fires it
   * once, not every frame.
   */
  | { type: "pickupBlocked"; reason: "bagFull"; pos: Vec2 }
  /** A picked-up piece was better than the equipped one and replaced it. */
  | { type: "autoEquipped"; defId: string }
  /** The equipped weapon's durability ran out; `defId` is the broken one. */
  | { type: "weaponBroke"; defId: string }
  /** A worn armor piece's durability ran out. It stays worn but INACTIVE
   * (no armor, no bonuses) until a repair kit restores it. */
  | { type: "armorBroke"; defId: string }
  /** A screen-nuke pickup went off at the player's position. */
  | { type: "nuke"; pos: Vec2 }
  /** A storm ability bolt struck at `pos` (drives the flash + crack). */
  | { type: "lightning"; pos: Vec2 }
  /** A NOVA burst around `pos` (a `proc` affix, a magic-crit blob, or a
   * companion's FROST NOVA): `radius` sizes the app's expanding ring; the
   * damage was resolved engine-side. `frost` recolours the ring icy blue for
   * the chilling companion pulse (the plain violet arcane burst otherwise). */
  | { type: "nova"; pos: Vec2; radius: number; frost?: boolean }
  /**
   * A stacked medkit was spent from the consumable dock: `name` is the
   * quality's label (`MEDKIT.tiers[tier].name`) and `heal` the hp actually
   * restored (clamped at max hp). Drives the heal chime and a "+N" float.
   */
  | { type: "medkitUsed"; tier: number; name: string; heal: number }
  /** A stacked stamina potion was spent from the consumable dock — the sprint
   * pool is now full. Drives the fizz-and-lift chime. */
  | { type: "staminaPotionUsed" }
  /** A stacked BLUE GATORADE mana potion was spent — the spell pool is now
   * full. `restored` is the mana actually returned (clamped at max). Drives the
   * fizz chime and a "+N MANA" float. */
  | { type: "manaPotionUsed"; restored: number }
  /**
   * A spell was CAST (sorcery.ts): `spellId` keys SPELL_DEFS, `pos` the hero,
   * `cost` the mana spent. The app echoes the name in the status line, pips the
   * cast chime, and plays the spell's signature effect (bolt/nova/heal/shield/
   * slow — most reuse the existing `lightning`/`nova` cues).
   */
  | { type: "spellCast"; spellId: string; pos: Vec2; cost: number }
  /**
   * A cast was REFUSED and nothing was spent: `reason` says why (not enough
   * mana, still on cooldown, or the slot's spell is no longer unlocked). The
   * app flashes the reason in the status line and pips a soft denial. */
  | {
      type: "spellFizzled";
      spellId: string;
      /** Why the cast was refused: not enough `mana`, still on `cooldown`, the
       * slot's spell is no longer `locked` (INT dropped below its unlock), or
       * there was `nothing` to do (an attack bolt with no foe in range, a heal
       * at full hp). */
      reason: "mana" | "cooldown" | "locked" | "nothing";
    }
  /** A defensive spell raised a magical SHIELD around the hero (`shieldHp`
   * absorb for `ms`). The app wraps him in a ward glow. */
  | { type: "playerShielded"; shieldHp: number; ms: number }
  /** A defensive HEAL spell restored the hero's hp (`heal` actually healed).
   * Distinct from `medkitUsed` so the app can give a spell its arcane cue. */
  | { type: "spellHealed"; heal: number }
  /** A martial SELF-BUFF power went off (a `buff` effect): the hero is amped for
   * `durationMs`. The app blooms a self-aura tinted to the power and echoes its
   * name; the mults live on the player (see `buffMs`). */
  | { type: "playerBuffed"; durationMs: number }
  /** A stacked weapon repair kit was spent from the consumable dock — the held
   * weapon, every bagged weapon, and the worn armor are mended, and any
   * durability-booted weapon is back in rotation. Drives the toolbox chime. */
  | { type: "repairKitUsed" }
  /** An ability pickup kicked in (or refreshed its timer). */
  | { type: "abilityStarted"; defId: string }
  | { type: "abilityEnded"; defId: string }
  /**
   * The hero crossed a level threshold. `gains` lists the AUTOMATIC base
   * attribute growth this ding granted (config LEVELING.autoGainsPerLevel —
   * on top of the chooser's point), so the app can print them in the feed.
   * The run does NOT pause here: the celebration window
   * (`GameState.levelUpFxMs`) burns first, and the `levelup` phase opens
   * when it runs out.
   */
  | {
      type: "levelUp";
      level: number;
      gains: { stat: StatName; amount: number }[];
    }
  /**
   * The menace meter crossed into a new evolution stage — the horde has grown
   * more dangerous in answer to the player's rampage. The app sounds the
   * escalation and can flash a "the horde evolves" cue.
   */
  | { type: "menaceRose"; stage: number }
  | { type: "bossDefeated"; pos: Vec2 }
  /**
   * A fleeing unique (see `EnemyDef.flees`) was beaten down to 0 hp and
   * escaped instead of dying — off the board, loot paid, and a landmark (the
   * rift it tore open) left at `pos`. Distinct from `bossDefeated` so the app
   * can play the escape as a warp, not a death.
   */
  | { type: "bossFled"; pos: Vec2; defId: string }
  /** A speaker took the stage: the run paused into the `dialogue` phase. */
  | { type: "dialogueStarted"; speaker: string }
  /**
   * A unique mob (elite/boss) died and its parting line took the stage — the
   * run paused into the `dialogue` phase on a `enemyDeath` source. Distinct
   * from `dialogueStarted` so the app can give the death its own somber cue
   * instead of the arrival knock.
   */
  | { type: "enemyLastWords"; defId: string }
  /** A plot piece was picked up (`defId` keys into STORY_ITEM_DEFS). */
  | { type: "storyItemCollected"; defId: string }
  /** A locked door recognized its key and slid open. */
  | { type: "doorOpened"; pos: Vec2 }
  /**
   * A travel gate tore open at `pos` (its key trinket was USED — see
   * `spendGateKey`). The app plays the rupture; the gate now stands on the
   * board waiting to be stepped into.
   */
  | { type: "gateOpened"; pos: Vec2; to: string }
  /**
   * The hero stepped into an open travel gate. The engine only books the
   * crossing (once per gate) — the APP owns the travel: bank the build,
   * start a run of level `to` carrying it.
   */
  | { type: "gateEntered"; pos: Vec2; to: string }
  /**
   * The hero met the wandering merchant for the first time: he stops
   * wandering, pins the level map, and his stall is now open at `pos`. The
   * app toasts the meeting and can chime a till.
   */
  | { type: "merchantDiscovered"; pos: Vec2 }
  /** The hero paid the merchant to mend his whole kit — `paid` coins spent (the
   * app chimes the till and can toast the repair). */
  | { type: "gearRepaired"; paid: number }
  /**
   * A minion was dragged into a black hole's core and devoured — off the
   * board with no kill, no XP and no loot. `defId` names the meal; the app
   * plays the gulp and the swirl at `pos`.
   */
  | { type: "wellSwallowed"; pos: Vec2; defId: string }
  /**
   * The grounded hero was dragged all the way into a black hole's core and
   * devoured — instant death (the run drops to `defeat` this same tick).
   * `pos` is the core he fell into; the app plays the swallow at the hole.
   */
  | { type: "wellDeath"; pos: Vec2 }
  /**
   * A rolling hay bale shoved the grounded hero (config HAY_BALLS). `pos` is
   * the bale — the app plays a soft thump and a puff. Fires once per bale (the
   * tick it first bites), even though the leftward shove continues while it
   * overlaps.
   */
  | { type: "hayBallHit"; pos: Vec2 }
  /**
   * A falling meteor detonated on the surface (config ASTEROIDS). `pos` is the
   * impact point and `radius` the blast reach; the app plays the flash, the
   * expanding dust cloud and shockwave, and a low boom. The blast's kills
   * (`asteroidKill`) and the hero's hurt/knockback ride their own events.
   */
  | { type: "asteroidImpact"; pos: Vec2; radius: number }
  /**
   * A minion was vaporized at the lethal core of a meteor blast — off the
   * board with no kill, no XP and no loot (like a well swallow). `defId` names
   * it; the app can poof it at `pos`, though the blast usually covers it.
   */
  | { type: "asteroidKill"; pos: Vec2; defId: string }
  /**
   * A sand storm caught the grounded hero: it took its scaled bite AND knocked
   * him out (he drops prone for SANDSTORMS.knockoutMs). `pos` is the hero at
   * the moment the gust hit; the app plays the whump + dust and shakes the
   * camera. The storm keeps drifting and thins out from here.
   */
  | { type: "sandstormHit"; pos: Vec2 }
  /**
   * An employee stampede trampled the grounded hero (config STAMPEDES): it took
   * its difficulty-scaled max-hp bite AND knocked him down (he drops prone for
   * STAMPEDES.knockdownMs). `pos` is the hero at the moment the herd hit; the
   * app plays the thunder of feet + a body drop and shakes the camera. The herd
   * charges on over him.
   */
  | { type: "stampedeHit"; pos: Vec2 }
  /**
   * A stampede BOWLED a MINION over — flung aside and left KNOCKED OUT for a few
   * seconds (config STAMPEDES.trampleStunMs), not killed: no damage, no XP, no
   * loot, and the mob survives to scramble back up (a herd can't be farmed and
   * doesn't thin the horde). `pos`/`defId` are the mob; the app plays a quick
   * knock and a scuff of dust.
   */
  | { type: "stampedeTrample"; pos: Vec2; defId: string }
  /**
   * The approach rumble of an employee stampede (config STAMPEDES): a low roll
   * of feet emitted at `rumbleEveryMs` cadence, first while a herd is still
   * DUE (the last `warnMs` of the countdown, so the hero hears it before the
   * wall appears) and then all the while a herd charges. `intensity` (0..1)
   * swells toward the spawn, peaks as the wall passes, and fades as it leaves;
   * the app scales a puff of low noise by it. Carries no position — it is the
   * whole-floor rumble, not a point sound.
   */
  | { type: "stampedeRumble"; intensity: number }
  /**
   * The hero shook off a knockout and got back to his feet (his `knockoutMs`
   * hit 0). `pos` is where he stood up; the app plays a small "up you get"
   * cue.
   */
  | { type: "knockoutRecovered"; pos: Vec2 }
  /**
   * An apparition finished its scene, walked off, and dissolved (see
   * `EnemyDef.apparition`). The app sparkles it out at `pos`.
   */
  | { type: "apparitionVanished"; pos: Vec2; defId: string }
  /**
   * A spareable unique was beaten to 0 hp and the run paused into the
   * `choice` phase: the player must SPARE it (it joins the party) or KILL it
   * (the withheld killing blow lands). The app raises the verdict overlay.
   */
  | { type: "spareOffered"; defId: string; pos: Vec2 }
  /** A spared unique joined the party as a companion (`defId` keys
   * COMPANION_DEFS). The app can toast the recruitment. */
  | { type: "companionJoined"; defId: string; pos: Vec2 }
  /** A companion was beaten down (0 hp): it kneels out of the fight until
   * `COMPANIONS.reviveMs` runs out. Its aura goes silent meanwhile. */
  | { type: "companionDowned"; defId: string; pos: Vec2 }
  /** A downed companion got back up (at `COMPANIONS.reviveHpFraction`). */
  | { type: "companionRevived"; defId: string; pos: Vec2 }
  /**
   * A companion earned a level from its own kills (`companion-stats.ts`): the
   * app floats a "LVL n" tag off its head and, on a power rank-up, cues the
   * signature growing stronger. `level` is the new companion level.
   */
  | { type: "companionLeveledUp"; defId: string; level: number; pos: Vec2 }
  /**
   * A companion's kill earned one of its def's `killQuotes`: the app floats
   * `text` above the companion at `pos` — banter, not a dialogue scene, so
   * the run never pauses for it.
   */
  | { type: "companionQuote"; defId: string; text: string; pos: Vec2 }
  /**
   * A PLACED PACK woke: the player closed to its trigger radius and its
   * members boiled up around `at` and gave chase (see stepPacks). `count` is
   * how many spawned — the app can sting the ambush and shake the turn.
   */
  | { type: "packAwoken"; pos: Vec2; count: number }
  /**
   * A placed pack was wiped out — that patch of ground is CLEARED (stepPacks).
   * `pos` is the pack anchor and `remaining` how many packs still stand on
   * the level; the app floats an "AREA CLEARED" cue and chimes it.
   */
  | { type: "packCleared"; pos: Vec2; remaining: number }
  | { type: "victory" }
  | { type: "defeat" }
  /**
   * The AUTO PILOT disengaged itself mid-flight (see autopilot.ts) — today
   * only because the purse ran dry (`reason: "coins"`). Pushed inside
   * `step()` so the app reliably sees it; a player-driven stop goes through
   * the `stopAutopilot` mutator and cues its own feedback.
   */
  | { type: "autopilotStopped"; reason: "coins" };

/** Per-step player intent, produced by the app's input layer. */
export type GameInput = {
  /** True while the pointer/touch is held down. */
  steering: boolean;
  /** Steering target in world coordinates (meaningful while steering). */
  target: Vec2;
  /**
   * Walk throttle in [0, 1]: how hard the player is pushing the dpad (or how
   * far the cursor sits from the character). 1 = full speed; smaller values
   * ease the character into a gentle walk when the finger barely leaves the
   * dpad center. Absent (headless tests, bots) defaults to full speed.
   */
  throttle?: number;
  /** True on the step a jump was requested (tap / space edge, not hold). */
  jump: boolean;
  /**
   * True on the step the player asked to use a carried ability pickup
   * (mouse click / HUD button edge). Spends one held ability; a no-op with
   * empty hands. `useItemIndex` chooses which one.
   */
  useItem?: boolean;
  /**
   * When `useItem` is set, which banked ability to spend (index into
   * `heldAbilities`, oldest first). Tapping a powerup dock slot names its
   * index; click / E / auto-use omit it and spend the oldest (index 0). An
   * out-of-range index falls back to the oldest too.
   */
  useItemIndex?: number;
  /**
   * True on the step the player asked to spend a stacked medkit (the medkit
   * consumable-dock slot / its key). Heals with the best quality held; a
   * no-op with none held or at full hp (`consumeMedkit`).
   */
  useMedkit?: boolean;
  /**
   * True on the step the player asked to spend a stacked stamina potion (the
   * stamina consumable-dock slot / its key). Refills the sprint pool; a no-op
   * with none held or already rested (`consumeStaminaPotion`).
   */
  useStaminaPotion?: boolean;
  /**
   * True on the step the player asked to spend a stacked repair kit (the repair
   * consumable-dock slot / its key). Mends the whole kit and re-equips any
   * durability-booted weapons; a no-op with none held or nothing to mend
   * (`useRepairKit`).
   */
  useRepairKit?: boolean;
  /**
   * True on the step the player asked to spend a stacked BLUE GATORADE mana
   * potion (its consumable-dock slot / key). Refills the spell pool; a no-op
   * with none held or mana already full (`consumeManaPotion`).
   */
  useManaPotion?: boolean;
  /**
   * True on the step the player tapped a spell-bar slot — a discrete EDGE (like
   * `useItem`), driven by the HUD button / cast key / bot. It ENQUEUES the slot
   * (`castSpellIndex`, index into `Player.spellSlots`); the engine then drains
   * the queue one cast per GLOBAL cooldown while mana lasts (`stepSpellQueue`).
   * A queued cast is a no-op — dropped — when the slot is empty, the spell is
   * still on its own cooldown, there's nothing to hit, or the hero's stat no
   * longer unlocks it; the first cast the pool can't afford flushes the queue.
   * Must be reset to false each tick so a single press casts exactly ONCE.
   */
  castSpell?: boolean;
  /** Which spell-bar slot `castSpell` fires (index into `Player.spellSlots`). */
  castSpellIndex?: number;
  /**
   * The world rect currently on screen (the camera view). When set, the
   * auto-weapon only targets monsters inside it — the character never
   * shoots at enemies the player cannot see yet. Absent (headless tests,
   * bots) targeting falls back to weapon range alone.
   */
  view?: { x: number; y: number; width: number; height: number };
  /**
   * The desktop mouse pointer's world position — the aim dimension. When set,
   * the auto-weapon prefers the monster in the pointer's direction over a
   * merely-closer one elsewhere (see `AIM.biasStrength`), so a desktop player
   * steers where the hero fires. Absent (touch, keyboard-only, bots) or
   * resting on the hero: targeting stays the plain nearest foe.
   */
  aim?: Vec2;
  /**
   * Manual-fire gate (desktop AIM & SHOOT with AUTO-FIRE off): while `false`
   * the auto-attack holds its blow — the weapon cooldown keeps recovering, so
   * the strike is ready the instant the trigger is pressed. `true` or absent
   * (touch, bots, headless tests, every auto-fire scheme) the character
   * fights autonomously as always.
   */
  fire?: boolean;
};

/**
 * The hero's carry-over between levels: the snapshot `extractLoadout` takes
 * from a finished run — level, stats, worn equipment, bag, pocketed
 * powerups — and `createGame` dresses the next run in via `applyLoadout`.
 * The app banks one per cleared level (per difficulty); dev jumps with
 * nothing banked use `deriveArrivalLoadout`'s stand-in instead. Plain JSON
 * data so it persists in storage as-is.
 */
export type Loadout = {
  level: number;
  /** Progress into the current level (clamped below its threshold on apply). */
  xp: number;
  stats: Record<StatName, number>;
  /**
   * The player's own spent stat points (see `Player.spentStats`). Optional so
   * loadouts banked before this shipped load without it — `applyLoadout` then
   * falls back to `stats`.
   */
  spentStats?: Record<StatName, number>;
  equipment: {
    weapon: Equipment;
    head: Equipment | null;
    chest: Equipment | null;
    legs: Equipment | null;
    feet: Equipment | null;
    charm: Equipment | null;
    bag: Equipment | null;
  };
  inventory: (Equipment | null)[];
  /** Banked ability pickups (ABILITY_DEFS ids). */
  heldAbilities: string[];
  /** Stacked medkits per quality (see `Player.medkits`). Optional so loadouts
   * banked before consumables stacked load with empty stacks. */
  medkits?: number[];
  /** Stacked stamina potions (see `Player.staminaPotions`). Optional for the
   * same backward-compatibility reason. */
  staminaPotions?: number;
  /** Stacked blue-gatorade mana potions (see `Player.manaPotions`). Optional so
   * loadouts banked before mana shipped load with none held. */
  manaPotions?: number;
  /** The HUD spell-bar assignment (see `Player.spellSlots`). Optional so
   * loadouts banked before spells shipped load with an empty bar (the app then
   * auto-fills it from the hero's unlocked spells). */
  spellSlots?: (string | null)[];
  /** Stacked weapon repair kits (see `Player.repairKits`). Optional so
   * loadouts banked before repair kits stacked load with none held. */
  repairKits?: number;
  /** The purse — merchant coins ride along between levels. Optional so
   * loadouts banked before the economy shipped load as an empty purse. */
  coins?: number;
  /**
   * The recruited party rides along between levels AND difficulties: each
   * companion's def, its earned LEVEL and XP (so a companion levels up forever
   * across the whole save), and its worn equipment. They arrive rested — hp
   * re-derives from the carried level on apply. Optional so loadouts banked
   * before companions shipped load as an empty party; `level`/`xp` are optional
   * so a loadout banked before companion leveling loads at the hero's level.
   */
  companions?: {
    defId: string;
    /** The companion's earned level (defaults to the hero's on an old save). */
    level?: number;
    /** XP banked toward the next level (defaults to 0 on an old save). */
    xp?: number;
    equipment: {
      weapon: Equipment;
      head: Equipment | null;
      chest: Equipment | null;
    };
  }[];
};

/** Static facts about the running level, snapshotted from its LevelDef. */
export type LevelInfo = {
  /** Key into LEVELS. */
  id: string;
  /** Story order (1-based). */
  index: number;
  name: string;
  width: number;
  height: number;
  /** Downward acceleration in world px/s² — lower gravity floats jumps. */
  gravity: number;
  /** Tileset/mood key for the renderer. */
  biome: string;
  /** How the renderer paints the ground for this level. */
  tiles: TileSpec;
  /** What the HUD calls this level's hostiles. */
  foes: string;
};

/**
 * Runtime state for one PLACED PACK (see `PackSpec` / stepPacks), built at
 * level creation from `LevelDef.packs` in order. A pack sleeps (`dormant`)
 * until the player closes to its trigger radius, at which point its members
 * spawn around the anchor and it goes `active`; once every spawned member is
 * dead it is `cleared`. Serialized with the run, so a resumed game remembers
 * which patches of ground are already emptied.
 */
/**
 * A SPAWN POINT's live state (parallel to `LevelDef.spawners`, see spawners.ts).
 * Dormant until the hero trips it, then it emits its `queue` a few at a time on
 * the `emitAtMs` clock until drained. A chained point watches its predecessor's
 * `drainedAtMs`.
 */
export type SpawnerRuntime = {
  /** Author id (for chaining), or null. */
  id: string | null;
  /** The spawn point's anchor (world px). */
  at: Vec2;
  triggerRadius: number;
  spawnRadius: number;
  intervalMs: number;
  perEmit: number;
  /** Concurrent-alive cap: the most of THIS point's live members allowed near
   * the hero at once. At the cap the point pauses and drips only to replace
   * kills; a member left behind (out of `approachRadius × SPAWNERS.leashMult`
   * of the hero) is counted as gone (replaced), and emission is suspended while
   * the hero is out of trigger range. */
  maxAlive: number;
  /** POST-KILL RESPAWN DELAY (ms): once at the alive cap, the wait after a
   * member dies (or is left behind) before the replacement is summoned in.
   * Resolved at level creation from `SPAWNERS.respawnDelayMs` scaled by
   * difficulty, boss proximity, and campaign progress (see create.ts). */
  respawnDelayMs: number;
  /** The live-member count from the previous tick — a drop signals a kill so the
   * respawn delay can be armed. */
  lastLive: number;
  /** The enemy defIds still to emit, resolved for the run's difficulty. */
  queue: string[];
  /** The queue's original length — the foe count still owed while it drains. */
  total: number;
  /** dormant → arming pending; active → emitting; drained → empty. */
  status: "dormant" | "active" | "drained";
  /** Sim time (ms) the point emptied, or null until then (for chaining). */
  drainedAtMs: number | null;
  /** Next emission time (sim ms) while active. */
  emitAtMs: number;
  /** `Enemy.id`s emitted so far (for "is this wave cleared?"). */
  memberIds: number[];
  /** Chain: arm after the spawner with this id drains, this long after. */
  after: string | null;
  afterDelayMs: number;
  /** This point's HARD-CODED per-difficulty mob levels (a within-map override of
   * the level default), carried so `emitBatch` scales its drip like its lingering
   * cluster. Undefined = the point uses the level's `mobLevels`. */
  mobLevels?: DifficultyMobLevels;
};

export type PackState = {
  /** Where the pack sits on the map — the anchor its members spawn around. */
  at: Vec2;
  /** How close (world px) the player must get to wake it. */
  triggerRadius: number;
  /** Radius (world px) members scatter within when the pack wakes. */
  spawnRadius: number;
  /** Life cycle: asleep, spawned-and-fighting, or wiped out. */
  status: "dormant" | "active" | "cleared";
  /** How many members will spawn when this pack wakes (resolved for the run's
   * difficulty at creation) — folded into the HUD foe total up front, and the
   * count still OWED while the pack is dormant (see `unspawnedMinions`). */
  total: number;
  /** `Enemy.id`s of the members spawned when the pack woke — the pack clears
   * when none of them are alive anymore. Empty until it wakes. */
  memberIds: number[];
};

/**
 * The AUTO PILOT meter (see autopilot.ts): while `active` the app feeds the
 * engine bot's steering into `step()` and fast-forwards the loop at `speed`,
 * and the engine drains the purse at `AUTOPILOT.coinsPerSecond × speed` per
 * game-second — disengaging itself (with an `autopilotStopped` event) the
 * moment the coins run out.
 */
export type AutopilotState = {
  /** The autopilot is flying the hero (and the meter is running). */
  active: boolean;
  /** The engaged speed rung (config `AUTOPILOT.speeds`) — scales both the
   * app's fast-forward and the per-game-second price. */
  speed: number;
  /** Fractional coins accrued but not yet deducted — whole coins leave the
   * purse, the remainder carries so no tick rounds the bill away. */
  drainCarry: number;
  /** Whole coins this RUN's meter has burned (session totals live app-side —
   * a new run starts a fresh count). */
  coinsSpent: number;
};

export type GameState = {
  phase: GamePhase;
  /**
   * The running prelude scene while `phase === "cutscene"` (see
   * @game/lib/cutscene and defs/cutscenes.ts); null once it played out.
   */
  cutscene: CutsceneState | null;
  /**
   * The prelude scenes still waiting behind the running one (`LevelDef.
   * prelude` as a list — the launch, then the flight). When the current
   * scene ends, the next id here starts; SKIP drops the whole queue.
   */
  cutsceneQueue: string[];
  /**
   * Which page of the level's opening monologue is on screen while
   * `phase === "intro"` — the hero's black-screen briefing dialogue. Turning
   * past the last page drops into the `title` card; unused in other phases.
   */
  introPage: number;
  /**
   * Which page of the level's post-victory EPILOGUE is on screen while
   * `phase === "outro"` (`LevelDef.outro` — the intro's black-screen mirror,
   * entered when the victory countdown runs out on a level that ships one).
   * Turning past the last page lands on the `victory` splash. 0 and unused
   * on levels without an outro.
   */
  outroPage: number;
  /**
   * Ms of VICTORY QUAKE left: on a level with an `outro`, clearing the
   * objective arms this alongside the victory countdown (the world shakes
   * itself apart while the hero grabs the last loot). Purely presentational —
   * the renderer jitters the camera off it; ticks down only while `playing`,
   * like the countdown it mirrors. 0 everywhere else.
   */
  quakeMs: number;
  /**
   * Developer POSE switch (set by a scenario's `freeze` — see scenario.ts):
   * while true the world's actors hold still — enemies neither move, strike,
   * nor fire, and the merchant stops wandering (so a pose can't be broken by
   * his discovery scene). The hero still moves, jumps, and fights freely.
   * Purely a staging tool for screenshots and visual judgement; nothing in
   * gameplay ever sets it.
   */
  freeze: boolean;
  /**
   * A LEVEL TOKEN respec is owed at this run's start: the hero jumped a rung
   * on a spent token, so before play begins the whole banked build is refunded
   * into a pool for a from-scratch reallocation (a Diablo-style respec). Set at
   * creation, consumed by `dismissIntro` (which enters the `respec` phase in
   * its place) and cleared by `beginRespec`; false on every ordinary run.
   */
  respecPending: boolean;
  level: LevelInfo;
  /** The run's chosen difficulty (scales spawns, hp, and loot). */
  difficulty: Difficulty;
  /**
   * The escalation meter (see config MENACE). Heated by the player's rolling
   * combat output (`combatDps` / `combatKillRate`) and jolted by overpowered
   * kills; idling bleeds it off — but never below `menaceFloor`. Read as an
   * uncapped stage that lures, evolves, and scales the horde. Starts at 0.
   */
  menace: number;
  /**
   * The PERMANENT menace floor the evolution ratchet has earned (see
   * `bankOverkill`): raised a full stage each time the current stage's mobs
   * keep getting one-shot, never lowered — the horde that evolved because it
   * was too easy stays evolved for the rest of the run. Starts at 0.
   */
  menaceFloor: number;
  /**
   * Healthbars of overkill banked toward the NEXT ratchet stage (only blows
   * against mobs of the current evolution crop count; the crop's CLEAN kills
   * refund it — see `MENACE.ratchetReliefPerKill`). Capped at twice the
   * threshold; spends `MENACE.ratchetHealthbars` each time the floor rises.
   * Starts at 0.
   */
  evoProof: number;
  /**
   * Ms until the ratchet may lift the floor another stage (the "one evolve
   * per malice round" pacing, `MENACE.ratchetCooldownMs`). Counts down each
   * playing tick. Starts at 0.
   */
  evoRatchetMs: number;
  /**
   * Rolling estimate of the player's damage-per-second, an EMA smoothed over
   * MENACE.rateWindowSec and updated each step from that step's damage. The
   * main fuel the menace meter reads: sustained high DPS heats it. Starts at 0.
   */
  combatDps: number;
  /**
   * Rolling estimate of the player's kills-per-second, an EMA smoothed over
   * MENACE.rateWindowSec and updated each step from that step's kills. Heats
   * the menace meter alongside `combatDps` — a fast clear rate escalates on top
   * of raw damage output. Starts at 0.
   */
  combatKillRate: number;
  /**
   * Rolling estimate of the horde's SPAWN rate — minions/sec appearing from the
   * wave spawner and woken packs, an EMA smoothed over `MENACE.clearanceWindowSec`.
   * Paired with `minionKillRate` to answer "is the screen getting MORE or LESS
   * crowded" — the CLEARANCE GATE that decides whether the rolling menace heat is
   * allowed to fire (`tickMenace`): output only heats the meter while the player
   * out-clears the spawn rate. Starts at 0.
   */
  minionSpawnRate: number;
  /**
   * Rolling estimate of the player's minion KILL rate — minions/sec felled by the
   * hero's own hand (powerup kills exempt, like `combatKillRate`), an EMA over the
   * same window as `minionSpawnRate`. Net kills over the throughput is the
   * clearance fraction the gate reads. Starts at 0.
   */
  minionKillRate: number;
  /**
   * This step's minion spawns and the hero's own minion kills, awaiting the next
   * `tickMenace` fold into the rate EMAs above (consumed and zeroed there). The
   * spawner runs AFTER the menace tick within a step, so a spawn is booked on the
   * following tick — a one-frame lag the EMA smooths over. Both start at 0.
   */
  pendingMinionSpawns: number;
  pendingMinionKills: number;
  /**
   * Cumulative damage dealt by sources that are not the hero's own weapon —
   * powerups (the screen-nuke bomb, the fire orbs, the storm cell) and the
   * COMPANIONS' attacks. Booked alongside `stats.damageDealt` but kept out of
   * the menace meter: `step` subtracts this step's slice from the damage
   * `tickMenace` reads, so a bomb clearing the screen or a party carrying the
   * fight never heats the escalation the player didn't earn with their own
   * weapon. Starts at 0.
   */
  menaceExemptDamage: number;
  /**
   * Cumulative kills scored by non-hero sources — the same powerup and
   * COMPANION sources as `menaceExemptDamage`. Booked alongside `stats.kills`
   * but subtracted from the kills `tickMenace` reads, so those kills never feed
   * the menace kill-rate heat (and they skip the overkill jolt and evolution
   * ratchet entirely — see `killEnemy`). Starts at 0.
   */
  menaceExemptKills: number;
  /** Where the run begins; also the origin difficulty scales out from. */
  playerSpawn: Vec2;
  /** Story props to draw (the lander, the boss's flag, …). */
  landmarks: Landmark[];
  /** The running conversation while `phase === "dialogue"`; null otherwise. */
  dialogue: DialogueState | null;
  /**
   * Latched true when the player taps the dialogue MUTE button: every
   * in-world scene (elite/boss dialogue, unique last words, companion join
   * words, the hero's inner monologues, story-item lore, and the merchant's
   * greeting) is suppressed for the rest of this level. A new level builds a
   * fresh state, so the mute lifts on the next map. Cutscenes are unaffected —
   * they own a SKIP button of their own.
   */
  dialogueMuted: boolean;
  /** The pending SPARE-or-KILL verdict while `phase === "choice"`. */
  choice: ChoiceState | null;
  /** The recruited party, in join order (see companions.ts). */
  companions: Companion[];
  /**
   * Which companion's equip screen is open while `phase === "companion"`
   * (a `Companion.id`); null otherwise.
   */
  companionFocus: number | null;
  /** Collected story items (STORY_ITEM_DEFS ids) — keys, dossiers, the lot. */
  storyItems: string[];
  /**
   * Level ids the hero has already CLEARED on this run's difficulty (seeded by
   * the app from the character's clears; empty on a dev jump or fresh hero).
   * Read only by `requiresClear`-gated guaranteed drops — the bunker key
   * (RASPUTIN's SEVERED HAND) stays latent until this contains "eastworld", so
   * the secret level unlocks only after the campaign is beaten.
   */
  clearedLevels: string[];
  /**
   * THOUGHT_DEFS ids the hero has already thought through — each first-kill
   * inner monologue plays exactly once per run.
   */
  thoughtsSeen: string[];
  /**
   * SPELL_DEFS ids newly UNLOCKED but not yet shown to the player — filled by
   * `allocateStat` when spending an INTELLIGENCE point pushes effective INT
   * across a spell's ×10 threshold (10, 20, … 250). The app drains this queue
   * to raise the "SPELL UNLOCKED" modal, one entry at a time
   * (`takeSpellUnlock`). Not an event (which would die at the next step's
   * `events = []`) because stat allocation runs OUTSIDE `step()`; a persistent
   * queue survives until the modal consumes it.
   */
  pendingSpellUnlocks: string[];
  /**
   * Cooldown (ms, counts down each step) gating the RECURRING cap-farm mutter
   * (`maybeCapThought`): the "these enemies are pathetic — go find Ada" thought
   * that replays while the hero grinds an out-levelled map. 0 = ready to fire;
   * a firing re-arms it to `DIALOGUE.capThoughtCooldownMs`. Kept off
   * `thoughtsSeen` precisely because it must repeat.
   */
  capThoughtMs: number;
  /**
   * Round-robin cursor into `CAP_THOUGHT_IDS` — which cap-farm variation fires
   * next. Bumped each time `maybeCapThought` speaks so a long farm cycles the
   * moods instead of repeating one line.
   */
  capThoughtIdx: number;
  /** Locked doors built from the level def, open or not. */
  doors: DoorState[];
  /**
   * Travel gates torn open this run (`spendGateKey`) — empty until a key
   * trinket is used; the level def's `gates` entries stay latent until then.
   */
  gates: GateState[];
  /** The level's wandering merchant (see merchant.ts). */
  merchant: Merchant;
  /**
   * The fog of war: one byte per `MAP.cellSize` grid cell, row-major
   * (`mapCols(level)` cells per row), 1 once the cell has been on screen.
   * Stamped by `revealRect` each step from the camera view (so everything
   * seen is remembered) and by `revealAround` once at creation around the
   * spawn; never re-fogged. See map.ts.
   */
  explored: Uint8Array;
  /** Pins on the level map: story finds, rare loot, elite/boss victories. */
  mapMarkers: MapMarker[];
  /**
   * Progress along the level's INTENDED PATH (`LevelDef.path`): the index of the
   * next waypoint the hero is steering toward. Advanced by `advancePath` each
   * step as he reaches each node; read by the autopilot (to navigate) and the
   * app (to point the guidance arrow). 0 with no path — inert.
   */
  pathIndex: number;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  items: Item[];
  decor: Decor[];
  /** Solid features scattered at level creation — see Obstacle. */
  obstacles: Obstacle[];
  /** Black holes built from the level def's `wells` — static all run. */
  wells: GravityWell[];
  /** Meteors currently falling (levels with LevelDef.asteroids). */
  asteroids: Asteroid[];
  /** Ms until the next asteroid spawns (levels with LevelDef.asteroids). */
  asteroidTimerMs: number;
  /** Craters left by past strikes, fading out (levels with LevelDef.asteroids
   * whose ground can scar — see `asteroids.craterSprites`). */
  craters: Crater[];
  /** Hay bales currently rolling (levels with LevelDef.hayBalls). */
  hayBalls: HayBall[];
  /** Ms until the next hay bale rolls in (levels with LevelDef.hayBalls). */
  hayBallTimerMs: number;
  /** Sand storms currently drifting (levels with LevelDef.sandstorms). */
  sandstorms: SandStorm[];
  /** Ms until the next sand storm spawns (levels with LevelDef.sandstorms). */
  sandstormTimerMs: number;
  /** Employee herds currently charging (levels with LevelDef.stampedes). */
  stampedes: Stampede[];
  /** Ms until the next stampede charges in (levels with LevelDef.stampedes). */
  stampedeTimerMs: number;
  /** The approach-dust telegraph for the herd owed next, once the countdown has
   * entered its (difficulty-scaled) lead window — else null. The lane is locked
   * here so the dust marks the exact band the wall will charge down. */
  stampedeWarn: StampedeWarn | null;
  /** Countdown to the next approach-rumble grain (config STAMPEDES.rumbleEveryMs);
   * the herd's roll is emitted on this cadence (levels with LevelDef.stampedes). */
  stampedeRumbleMs: number;
  /**
   * Ms until another "bags are full" nudge may fire. Counts down each step;
   * a blocked pickup emits `pickupBlocked` only when this reaches 0, then
   * resets it to `LOOT.bagFullHintCooldownMs` (see `stepItems`).
   */
  bagFullHintCooldownMs: number;
  /**
   * Ms the sprint pool has sat BONE-DRY — exactly empty, not merely low. Counts
   * up each step while `player.stamina` is 0 and resets to 0 the instant any
   * stamina returns. Drives the stamina-drink MERCY DROP: the longer the hero is
   * stranded winded, the higher each kill's chance of coughing up an energy
   * drink, ramping to the rung's cap over `MERCY.staminaEmptyDrinkRampMs` (see
   * `staminaDrinkChance`).
   */
  staminaEmptyMs: number;
  /**
   * Ms left of the stamina regen LOCKOUT — the frozen-regen window a run or a
   * jump trips when it empties the sprint pool (see `STAMINA.emptyRegenLockMs`).
   * Counts down each step; while it stands the pool refills at nothing, so a
   * hero who bottomed out mid-sprint (or on a takeoff) must walk it off and
   * wait the beat out. Re-armed to the full window whenever a run/jump empties
   * the pool again.
   */
  staminaRegenLockMs: number;
  /**
   * Ms left of the combat-clock grace window (the "combat is still live" tail).
   * Refreshed to `RUN.combatGraceMs` on every kill and counted down each
   * playing tick; while it — or a live foe — stands, `stats.combatMs` accrues.
   * Starts at 0, so a run that opens on an empty field banks no survival time
   * until the first foe appears.
   */
  combatGraceMs: number;
  /** Counts down once the objective clears; the level ends at 0. */
  victoryCountdownMs: number | null;
  /**
   * Where the level's boss fell, left as a clickable corpse once the player
   * chooses to STAY on a cleared field (see `staying`). The victory menu's
   * STAY option drops the hero back into `playing`; this corpse is the marker
   * they walk back to and tap to re-open the menu (and finally move on). Set
   * when a boss dies (`killEnemy`), null on any level the hero never felled a
   * boss on (the bossless hub) — which is exactly when STAY is not offered.
   */
  bossCorpse: { pos: Vec2; sprite: string } | null;
  /**
   * True once the player picks STAY from the victory menu: the win is already
   * banked, but the hero lingers on the cleared field to farm loot and finish
   * off stragglers. It suppresses the auto-victory countdown from re-arming
   * (so a still-cleared objective doesn't yank the menu straight back up) and
   * arms the `bossCorpse` tap that re-opens the menu when the player is ready.
   */
  staying: boolean;
  /** The AUTO PILOT meter (see autopilot.ts) — engaged flag, speed rung, and
   * the coin drain's running fractions. The app steers; the engine bills. */
  autopilot: AutopilotState;
  /**
   * Ms left of the level-up celebration: set to `LEVELING.dingCelebrationMs`
   * when a level lands (grantXp), counted down each playing step, and the
   * `levelup` stat-chooser phase only opens when it reaches 0 — the golden
   * burn (drawn off this field) and the fanfare get their moment before the
   * modal interrupts. Ticks only while `playing`, so a dialogue that cuts in
   * merely postpones the chooser.
   */
  levelUpFxMs: number;
  /**
   * Equipment dropped by regular monsters so far — the pity counter behind
   * LOOT.minEquipmentPerLevel (boss drops don't count toward it).
   */
  minionEquipmentDrops: number;
  /**
   * Monsters spawned so far per wave-budget line (indexed like the level's
   * `waves.budget`). The spawner streams each line in until its count is
   * exhausted; empty when the level has no waves.
   */
  waveSpawned: number[];
  /**
   * PLACED PACKS for this run, parallel to `LevelDef.packs` (see `PackState`
   * / stepPacks): fixed clusters that sleep until the player nears them, then
   * boil up and are cleared by wiping them out. Empty when the level has no
   * packs.
   */
  packs: PackState[];
  /**
   * SPAWN POINTS for this run, parallel to `LevelDef.spawners` (see
   * `SpawnerRuntime` / stepSpawners): finite points that arm on approach and
   * drain their mob count over time. Empty when the level authors none.
   */
  spawners: SpawnerRuntime[];
  /**
   * World px the player has walked that the spawner hasn't converted into
   * monsters yet — moving through the level stirs more of the horde awake
   * (waves.moveSpawnEvery px each).
   */
  moveSpawnCredit: number;
  /**
   * Where the player last SETTLED (config CAMPING): re-anchored to his
   * position whenever he strays past `CAMPING.campRadius` of it. While he
   * stays inside the radius, `campMs` counts up.
   */
  campAnchor: Vec2;
  /**
   * Ms the player has camped inside `campRadius` of `campAnchor`. Past
   * `CAMPING.graceMs` the spawner starves the camper — the live floor and the
   * timed budget stream fade out over `CAMPING.fadeMs` — and the beckoning
   * trickle from the objective direction takes over. Reset by moving on.
   */
  campMs: number;
  /**
   * Cooldown (ms, counts down) between trickle arrivals — shared by the
   * camped-player BEACON spawns and the post-budget STRAGGLER stream, both of
   * which walk in slowly from the objective direction (see stepSpawner).
   */
  trickleMs: number;
  /**
   * Ms of post-NUKE calm still to run (config `NUKE.calmMs`, counts down in
   * stepSpawner). While positive the spawner holds every refill — the live
   * floor, the walk-credit pull, the timed stream, the trickle — so the screen
   * a screen-nuke just cleared actually STAYS clear long enough to break away,
   * instead of the ring instantly repopulating at the screen edge. Set by
   * `detonateNuke`; starts at 0.
   */
  nukeCalmMs: number;
  /**
   * Ms of post-NUKE RECOVERY still to run (config `NUKE.recoverMs`, counts down
   * in stepSpawner only once `nukeCalmMs` has burned off). While positive the
   * live near-floor eases back from 0 to full instead of snapping the cleared
   * swarm back the instant the calm ends — so the horde walks back in at the
   * ordinary rate, not all in a single frame. Set by `detonateNuke`; starts
   * at 0.
   */
  nukeRecoverMs: number;
  /**
   * Resolved kill thresholds for the level's `loot.earlyDrops` schedule,
   * parallel to it: a rolled `[min, max]` entry gets a concrete count here at
   * creation, a fixed entry keeps its number. Empty when the level has no
   * schedule.
   */
  earlyDropKills: number[];
  /**
   * Cursor into the `loot.earlyDrops` schedule: the index of the next unfired
   * entry (entries are authored in ascending kill order). Advances as each
   * scripted opening drop is handed over; equals the schedule length once they
   * have all dropped.
   */
  earlyDropCursor: number;
  stats: GameStats;
  /** Events emitted by the most recent `step()`. */
  events: GameEvent[];
  /**
   * PROCS queued by this tick's weapon blows (`proc` affixes), drained by
   * `stepProcs` after the attack pass — resolving them inline would splice
   * the enemy list out from under the sweep that triggered them.
   */
  pendingProcs: PendingProc[];
  /**
   * MAGIC CRIT BLOBS queued by this tick's magic weapon crits (config
   * `MAGIC_CRIT`), drained by `stepMagicCritBlobs` after the attack pass —
   * same reason as `pendingProcs`: an inline burst would splice the enemy
   * list out from under the loop that spawned it. Empty between ticks (filled
   * and drained within one `step`), so it needs no save serialization.
   */
  pendingCritBlobs: PendingCritBlob[];
  /** Monotonic id source for spawned entities. */
  nextId: number;
  /** Seeded stream for in-run rolls (crits, drops) — keeps runs replayable. */
  rng: Rng;
  /**
   * A SECOND seeded stream, for combat FLAVOR only — currently the per-blow
   * damage-range roll (see `rollWeaponDamage`). Kept apart from `rng` on
   * purpose: damage variance must never advance the loot/crit stream, so drop
   * determinism (and every seeded loot test) is unaffected by how a swing rolls.
   * Not serialized — re-seeded on resume; a reloaded run rolling slightly
   * different flavor damage is invisible, while a fresh run from a seed stays
   * fully reproducible.
   */
  fxRng: Rng;
};
