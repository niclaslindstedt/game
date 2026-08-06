// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared primitives and the item/equipment shapes: phases, stats, weapon
// and armor classification, quality/tier/affix vocabulary, and Equipment.

import type { GearDef, WeaponDef } from "../defs/equipment.ts";
import type { Vec2 } from "@game/lib/vec.ts";

/**
 * THE RUN'S OWN PHASE — only what is genuinely GLOBAL.
 * `cutscene` plays the level's prelude scene, `intro` shows the story
 * text box, `title` flashes the level name alone before the drop, `dialogue`
 * holds the world while a character (or a found story item) speaks — a group
 * beat, played for everyone and advanced by anyone — `choice` holds it while
 * a beaten spareable unique awaits the SPARE-or-KILL verdict (a group
 * decision, shown to everybody), `outro` shows a level's post-victory
 * epilogue pages (the intro's black-screen mirror, before the victory
 * splash), `dying` plays the dramatic death tableau (the horde rings the
 * fallen hero, clouds roll in) before the defeat splash; the simulation only
 * advances while `playing` (the `dying` scene runs on its own reduced pass —
 * see `death-scene.ts`).
 *
 * WHAT ONE PLAYER IS LOOKING AT IS NOT A PHASE. The bag, the map, the shop,
 * the pause menu, the level-up chooser and the rest are {@link PlayerScreen}s
 * on the `Player` — per-player, so one hero in their inventory does not
 * freeze the other seven. The world still halts when EVERY hero in play has a
 * screen up (see `partyBlocked` in party.ts), which is what keeps a solo
 * game's bag exactly the freeze it always was.
 */
export type GamePhase =
  | "cutscene"
  | "intro"
  | "title"
  | "playing"
  | "dialogue"
  | "choice"
  | "outro"
  | "dying"
  // The BOSS DEATH RITE — the scripted send-off played over a felled boss
  // before its last words (`boss-death.ts`). A GLOBAL phase, and deliberately
  // so: the per-player split makes the eleven per-player UI phases
  // into `Player.screen`s but keeps the group beats — a boss's arrival
  // dialogue, a cutscene — global, played for everyone, advanced by anyone,
  // with the world frozen for the beat. A boss's DEATH is that same kind of
  // beat, so it belongs on the global side of that split and must not become a
  // per-player screen: half the party watching a finisher while the other half
  // keeps fighting is neither.
  | "bossDeath"
  | "victory"
  | "defeat";

/**
 * WHAT ONE PLAYER IS LOOKING AT — the per-player half of the split above.
 * Each of these was a `GamePhase` when the game had
 * one hero; now it sits on the `Player`, the simulation runs regardless, and
 * a hero with a screen up simply contributes no steering (they are still
 * standing on the field and can still be killed — D2's rule, and what makes
 * opening your bag mid-fight a decision).
 *
 * `paused` is the pause MENU, per player like the rest: in a solo game it
 * still freezes the world (every hero in play has a screen up), in a party it
 * parks one hero. `levelup` is the stat/talent chooser: a ding always banks
 * its points on `Player.pendingStatPoints`, and SOLO the chooser rises on them
 * as the celebration burns out (`openLevelupAfterDing`) while a PARTY leaves
 * them for the HUD's pip and the on-demand opener (`promptPendingPoints`) —
 * a run cannot halt seven people for one player's stat pick. `respec` is the one
 * modal among them: it cannot be closed until the refunded points are
 * re-spent (`confirmRespec`), exactly as before.
 */
export type PlayerScreen =
  | "paused"
  | "levelup"
  | "respec"
  | "inventory"
  | "map"
  | "questLog"
  | "shop"
  // THE CACHE — the garage chest's own window (src/game/cache.ts). A screen
  // like the bag and the stall: this hero stands at the chest while the rest of
  // the party plays on, and solo it freezes the run exactly as the bag does.
  | "cache"
  | "quest"
  | "talk"
  | "companion"
  // The trade window (`src/game/trade.ts`). Unlike the others it is raised
  // on TWO heroes at once — `openTrade` parks both sides at the table — and
  // lowered by whatever ends the trade: a settle, a cancel, or one side
  // leaving play. A hero at the table is a hero in a screen: no steering,
  // still standing on the field, still killable.
  | "trade";

/**
 * A difficulty id: a key into DIFFICULTY_DEFS. Deliberately a bare `string`
 * so the ladder is pure data like every other catalog — adding a difficulty
 * means adding a def entry (and listing it in DIFFICULTY_ORDER), not editing
 * this type. The shipped ladder runs easy → medium → hard → nightmare →
 * jesus; the numbers and menu presentation live in defs/difficulties.ts.
 */
export type Difficulty = string;

/**
 * A RECTANGLE OF THE WORLD, in world px — in practice always the same one: the
 * patch of floor a camera is showing somebody.
 *
 * It is one named shape rather than four repeated fields because THREE
 * different places hold one and they must mean the same thing: what the app
 * reports each tick (`GameInput.view`), what the run remembers of the host's
 * (`GameState.view`), and what each hero is personally watching
 * (`Player.view`). Everything that asks "can this player SEE that" reads one
 * of the three through `game/sight.ts`.
 */
export type ViewRect = { x: number; y: number; width: number; height: number };

/**
 * The five trainable stats, points awarded per level-up. (Move speed is no
 * longer its own stat — DEXTERITY is the mobility attribute; the base walk and
 * gear supply the rest. SPIRIT is retired too: it bought nothing but a slow
 * out-of-combat health trickle, so it never competed with the five below —
 * points banked in it are refunded by `applyLoadout`.)
 */
export type StatName =
  "stamina" | "strength" | "dexterity" | "intelligence" | "luck";

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
 * THE THREE KINDS OF AMMUNITION a RANGED weapon spends (`WeaponDef.ammo`),
 * and deliberately only three. The split is by WHAT THE THING IS, not by what
 * fires it: every firearm in the game eats the same `bullets`, from the
 * service revolver to the sawn-off, because a game that asks the player to
 * keep four calibres straight has bought a spreadsheet and sold a shooter.
 * What genuinely reads different on the ground gets its own kind.
 *
 *   bullets  every firearm: pistols, revolvers, rifles, shotguns, nailguns
 *   arrows   anything drawn and loosed — bows, and the crossbow idiom
 *   cells    charged shot: rails, tasers, plasma, the printed sidearm
 *
 * MELEE and MAGIC weapons carry none. Magic is powered by the hero, which is
 * the whole distinction between a wand and a gun; melee needs no argument.
 * Both keep DURABILITY, which ranged weapons gave up in exchange for this —
 * a ranged weapon never breaks and never wants a repair kit; it runs dry.
 * The per-kind presentation and economy is config `AMMO_KINDS` / `AMMO`.
 */
export type AmmoType = "bullets" | "arrows" | "cells";

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

/**
 * What an item IS — its kind, stamped on the def and carried by every minted
 * instance. Distinct from {@link EquipSlot}, which names WHERE a piece is
 * worn: the hero wears two rings, so the single `ring` kind fills either
 * `ring1` or `ring2`, and a `trinket` is never worn at all (see below).
 */
export type ItemSlot =
  "weapon" | ArmorSlot | "amulet" | "ring" | "trinket" | "bag" | "shield";

/**
 * WHERE a piece is worn — the keys of `Player.equipment`. The four armor
 * slots plus the weapon, the neck (`amulet`), TWO ring fingers, and the
 * SECOND ARM (`offhand`).
 *
 * The offhand is ONE slot holding either of two kinds, and that is the whole
 * shape of the build choice it exists to pose: a SHIELD (armor points and
 * survivability, behind a STRENGTH gate only a bruiser clears) or a BAG (room
 * to carry, and the DEX/INT a light build actually wants). A melee hero brings
 * a wall; an archer or a caster brings a pack — and a TWO-HANDED weapon
 * (`WeaponDef.twoHanded`) says "neither", paying for the empty arm in damage
 * and in the width of its swing.
 *
 * There is deliberately no trinket slot: a TRINKET (the old charm) pays out
 * from the BAG's cells, D2's inventory-charm rule — carrying it is what makes
 * it work, and bag space is what it costs (see `carriedTrinkets`). That is why
 * this type is narrower than {@link ItemSlot}.
 */
export type EquipSlot =
  "weapon" | ArmorSlot | "amulet" | "ring1" | "ring2" | "offhand";

/** The two ring fingers (the runtime list is `RING_SLOTS` in items/derived.ts). */
export type RingSlot = "ring1" | "ring2";

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

/** The always-on GRANTED spells — the forever powers a worn `spell` affix or a
 * trained magic-tree CONJURATION talent (`TalentEffect.conjure`) projects,
 * stepped off `player.itemSpells` every tick (`stepItemSpells`). `orbit`/
 * `storm`/`stasis` are the forever twins of the timed powerups; `seeker`
 * (homing arcane orbs that burst on impact), `singularity` (a periodic vortex
 * that drags a cluster together and crushes it), and `immolation` (a burning
 * aura that scorches everything adjacent) are the deep-INT magic tree's own,
 * carried by no item today. */
export type SpellKind =
  "orbit" | "storm" | "stasis" | "seeker" | "singularity" | "immolation";

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
 * where a bolt falls on the nearest foe to `pos` instead. `seat` is the hero
 * whose proc this is (the striker for hit/kill triggers, the struck hero for
 * "struck" ones), so the resolution scales off their own power rather than
 * seat 0's; absent reads as seat 0.
 */
export type PendingProc = {
  spell: ProcSpell;
  rank: number;
  pos: Vec2;
  enemyId?: number;
  seat?: number;
};

/**
 * A MAGIC CRIT BLOB waiting to burst (see config `MAGIC_CRIT`): queued by
 * `hitEnemy` when the hero's own direct magic weapon crit lands, drained by
 * `stepMagicCritBlobs` after the combat passes — like a proc, resolving it
 * inline would splice the enemy list out from under the projectile loop that
 * spawned it. `pos` is the struck foe (the blob's centre), `blowDamage` the
 * PRE-crit damage of the blow, and `victimId` the foe that already took the
 * crit — excluded from the splash so it is never billed twice. `seat` is the
 * hero whose crit it was, so the splash reads that hero's INTELLIGENCE; absent
 * reads as seat 0.
 */
export type PendingCritBlob = {
  pos: Vec2;
  blowDamage: number;
  victimId: number;
  seat?: number;
};

/** A droppable, equippable item instance (medkits are consumables, not this). */
export type Equipment = {
  id: number;
  /** Key into WEAPON_DEFS or GEAR_DEFS. */
  defId: string;
  /** What this piece IS (its def's kind) — not where it is worn. A `ring`
   * instance sits in `ring1` or `ring2`; a `trinket` sits in the bag. */
  slot: ItemSlot;
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
   * BAGS only: the rolled CELL count this instance carries — the def's authored
   * `bagSlots` grown by the drop's item level (`LOOT.bagSlotsPerIlvl`), stamped
   * at mint and frozen for life exactly like `armor`. Room is a bag's whole
   * growth axis, so this is the number that makes a deep find of an old satchel
   * worth swapping to. Absent on weapons, armor, shields, and pre-revamp
   * instances, which fall back to the def's own count (see `equippedBagSlots`).
   */
  bagSlots?: number;
  /**
   * A hand-authored UNIQUE's fixed display name (BOUNDSTRIDE), overriding the
   * base/affix-composed name. Absent on rolled items, which name themselves
   * from their affixes (see `equipmentName`).
   */
  name?: string;
  /**
   * ENHANCED DAMAGE — D2's `+X% Enhanced Damage`, as a FRACTION (1.37 = +137%).
   * The multiplier a MAGIC-or-better WEAPON puts on its base's catalog damage,
   * rolled uniformly inside its tier's band (`content/item_rarity.yaml`) at
   * mint and frozen for life. It is the whole reason a rarer weapon hits
   * harder than a white one of the same base — weapons carry no hidden damper
   * and no item-level growth (see config `WEAPON`) — and it is printed on the
   * item card, so the number the player chases is the number the engine uses.
   * Two copies of one artifact roll differently, which is what makes a perfect
   * one worth farming. Absent (= no bonus) on white weapons and on all gear.
   */
  enhancedDamage?: number;
  /**
   * A UNIQUE's per-drop base ROLL: a small ±band on the ARMOR of a named gear
   * piece, baked into `armor` at mint, so two copies differ slightly and a
   * better-rolled one is worth chasing. The FIXED bonuses are identical on
   * every copy. Weapons don't use it — their per-drop variance is the much
   * wider, visible `enhancedDamage` roll above. Absent (= 1) on everything
   * else.
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
  /**
   * The D2 rule: a MAGIC-or-better find drops UNIDENTIFIED — its rolls are all
   * made at mint (so the seeded loot stream never shifts), but the piece cannot
   * be worn and its name/stats stay hidden until it is identified at a
   * merchant's counter or with an ITEM LOOKUP TICKET in the field (see
   * items/identify.ts). Identifying DELETES the flag, so an identified piece —
   * and every instance minted before this shipped — reads unchanged. Never set
   * on staged/stall/reward mints, which are handed over already known.
   */
  unidentified?: true;
  /**
   * STACKABLE trinkets only (`GearDef.stack` — the ITEM LOOKUP TICKET): how
   * many units this bag cell holds. `addToInventory` merges a new unit into an
   * existing stack up to the def's cap; spending one decrements it and frees
   * the cell at zero. Absent (= 1) on everything else.
   */
  qty?: number;
};

/** One burning patch of an ION WAKE (`trail`): where it landed, how long it
 * still burns, and how long until its next scorch tick. */
export type TrailPatch = {
  pos: Vec2;
  remainingMs: number;
  tickMs: number;
};

/** One deployed gun of a SENTRY GRID (`turret`): where it is bolted down and
 * how long until it fires again. */
export type TurretNode = {
  pos: Vec2;
  cooldownMs: number;
};

/**
 * A running time-limited power granted by an ability pickup (fire orbs,
 * lightning storm, stasis field). `defId` keys into ABILITY_DEFS; the
 * scratch fields mean different things per ability kind.
 */
export type ActiveAbility = {
  defId: string;
  remainingMs: number;
  /** Orbit abilities: the current sweep angle in radians. A def carries at
   * most one `orbit` block, so this needs no per-block split. */
  angle: number;
  /**
   * Ms until the next bite, PER EFFECT BLOCK — keys are `AbilityKind`.
   *
   * A power is a COMPOSITION of effects and each one keeps its own cadence. A
   * single shared clock was safe only while every def carried exactly one
   * block: the moment one carries two, an orbit's bite resets a storm's strike
   * timer, and two effects that decrement the clock themselves tick it twice a
   * frame. Read and written through `abilityClock`/`tickAbilityClock`/
   * `setAbilityClock` so a missing key reads as "ready" rather than NaN.
   */
  clocks: Record<string, number>;
  /**
   * `well` powers: where the core sits right now — the spend point for an
   * anchored one (EVENT HORIZON), walked toward the nearest body each tick for
   * a roaming one (DUST DEVIL). Absent on every other kind.
   */
  pos?: Vec2;
  /**
   * `barrier` powers: the damage the shell can still eat. Stamped from
   * `barrier.poolFrac × maxHp` when the power starts and drained by
   * `absorbPlayerDamage`; the power ends the moment it reaches 0 (the shell
   * shatters — a barrier is a budget, not a timer).
   */
  pool?: number;
  /**
   * `trail` powers: the burning patches the hero has shed so far, oldest
   * first — each with its own remaining burn and its own scorch-tick clock.
   * They lapse with the wake that laid them.
   */
  patches?: TrailPatch[];
  /**
   * `turret` powers: the deployed guns, planted on a ring around the spend
   * point and each running its own fire clock.
   */
  nodes?: TurretNode[];
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
