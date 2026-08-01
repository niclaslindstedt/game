// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape of one enemy catalog entry. Every monster in the game is one
// `EnemyDef`, authored as a `content/enemies/<biome>/<id>.yaml` file that
// `make levels` compiles into `src/generated/enemies.ts`; ./index.ts
// re-exposes the compiled catalog as `ENEMY_DEFS`. Levels reference entries
// by id in their spawn lists. Adding a monster = adding a YAML file + a
// sprite named after it — no engine changes.

import type { Difficulty, Tier } from "../../types/index.ts";
import type { BossAbility } from "./abilities.ts";

/**
 * `minion` is the horde, `boss` guards the objective — and `elite` is a
 * unique story mob: it sleeps at a hand-placed spot, rushes into view when
 * the player nears, delivers its `dialogue`, then fights. Elites drop real
 * loot (a signature weapon, plot items) via `loot`, same as bosses.
 */
export type EnemyRole = "minion" | "elite" | "boss";

/**
 * The Diablo-style SPECIAL-MONSTER tiers (see config RARE_MOBS). A `rare`
 * mob is a generically-named oddity that turns up about once per map (solo
 * or a small pack); a `unique` mob is a NAMED one-off that only exists on a
 * fraction of runs and is always alone. Both are minion-role defs — no
 * dialogue, no guaranteed `loot` — whose whole tier (hp, contact damage,
 * monster-level head start, multiplied drop rolls) the engine applies at
 * spawn, so the def is authored at ordinary minion numbers.
 */
export type MobRarity = "rare" | "unique";

/**
 * How a monster MOVES, which is what the walk/float animation is drawn from
 * (see `EnemyDef.locomotion`). Three ways of crossing a floor: on `legs`, by
 * `float`ing over it, or rolling across it on `wheels`.
 */
export type EnemyLocomotion = "legs" | "float" | "wheels";

/**
 * What a body is BUILT of, for the one moment it comes apart (see
 * `EnemyDef.anatomy`). `humanoid` has a head to lose; a `beast` is meat, gut
 * and bone with no face in it.
 */
export type EnemyAnatomy = "humanoid" | "beast";

/**
 * WHAT A BODY IS MADE OF (see `EnemyDef.gore`). The engine treats it as an
 * opaque label — nothing in the simulation reads it — and the app turns it into
 * a whole look: a spray, a pool of pieces, a cut face and something in the air.
 */
export type GoreFamily = "blood" | "ecto" | "sparks" | "cosmic";

/**
 * One page of a unique's arrival scene. A plain `string[]` is the speaker's
 * own page (one string per line); `{ hero: [...] }` is the HERO talking back
 * mid-scene — the app swaps in his name and portrait for that page, so a
 * story reveal lands as a conversation instead of a lecture.
 */
export type DialoguePage = string[] | { hero: string[] };

/**
 * The set-piece MECHANICS an elite or boss may carry (see src/game/mechanics.ts
 * — minions never run these). Each is opt-in data; the point of every one is
 * READABLE danger: the dangerous moves are telegraphed (`enemyTelegraph`
 * events + the windup freeze) so the player earns the dodge, instead of the
 * fight just being a bigger health bar.
 */
export type EnemyMechanics = {
  /**
   * TELEGRAPHED CHARGE: off cooldown, with the player in `range` and in
   * sight, the mob roots for `windupMs` (aiming — the bearing LOCKS at the
   * start of the windup, so a sidestep beats it), then dashes along the
   * locked bearing at `speed × speedMult`, its contact blows carrying
   * `damageMult` while the dash lasts. The dash runs `range × 1.3` of
   * ground, then the mob resumes its normal hunt.
   */
  charge?: {
    windupMs: number;
    speedMult: number;
    range: number;
    cooldownMs: number;
    /** Contact-damage multiplier while dashing (default 1.5). */
    damageMult?: number;
  };
  /**
   * TELEGRAPHED SLAM: off cooldown, with the player inside `radius`, the mob
   * roots for `windupMs`, then smashes the ground: every grounded player
   * inside `radius` takes `contactDamage × damageFrac` (armor applies; a
   * jump — z above JUMP.dodgeHeight — sails clean over it, same rule as
   * contact).
   */
  slam?: {
    windupMs: number;
    radius: number;
    damageFrac: number;
    cooldownMs: number;
  };
  /**
   * ENRAGE: at or below `belowHpFrac` of max hp the mob fights like a
   * cornered animal for the rest of the fight — speed and contact damage
   * multiply, and the `enemyEnraged` event lets the app sell the turn.
   * The elite-grade generalization of the boss LAST_STAND (which stays the
   * every-boss default on top).
   */
  enrage?: {
    belowHpFrac: number;
    speedMult: number;
    damageMult: number;
  };
  /**
   * SUMMON ADDS: off cooldown (and awake), the mob calls `count` minions of
   * `defId` out of the ground around it — spawned OUTSIDE the wave budget,
   * capped at `maxAlive` of its own summons alive at once so the arena never
   * floods. Summons are ordinary minions in every other way (xp, loot, the
   * works).
   */
  summon?: {
    defId: string;
    count: number;
    cooldownMs: number;
    maxAlive: number;
  };
  /**
   * THE ABILITY CATALOG (see `BossAbility` in ./abilities.ts): the named
   * set-piece moves, authored as a list rather than as more fields here. The
   * four above are the engine's originals and stay where they are — but they
   * are also the reason every boss in the game reads the same, because four
   * fields is the whole vocabulary a fight could be written in. A catalog
   * ability is data plus one module under src/game/mechanics/, so the next
   * idea costs nothing that the whole engine has to read.
   *
   * Each entry carries its own cooldown, its own windup, and its own
   * `minDifficulty` — which is how nightmare and JESUS ADD a move to a fight
   * the player already knows, instead of only multiplying its numbers.
   */
  abilities?: BossAbility[];
};

/**
 * One hp-breakpoint PHASE of a boss fight: at or below `belowHpFrac` the
 * boss's active mechanics become this set (REPLACING the def's base
 * `mechanics` — composition over machinery: a phase is just a different
 * selection of the four mechanics above). Author phases in DESCENDING
 * `belowHpFrac` order; the deepest crossed entry is the active one.
 */
export type EnemyPhase = {
  belowHpFrac: number;
  mechanics: EnemyMechanics;
};

export type EnemyDef = {
  id: string;
  /** Display name (HUD, boss bar). */
  name: string;
  /**
   * WHAT THIS THING IS — a short paragraph of prose, in the same register as
   * an item's `description`, and required of every monster in the game.
   *
   * A named elite explains itself in its `dialogue`; the rank and file never
   * get to, which is why a horde reads as a texture rather than as a place's
   * inhabitants. This is where a cowbot gets to be a decommissioned park hand
   * with a hat bolted on rather than "the boot_hill fodder tier", and it is
   * the only field on the def written for a READER instead of for the
   * simulation: nothing in the engine reads it, and the library's bestiary
   * prints it under the portrait.
   *
   * It is bound by the story chain like every other piece of story text
   * (docs/story.md, then docs/manuscript.md): it may only ELABORATE what the
   * higher tiers already establish, never introduce a plot fact of its own.
   * Two or three sentences — past that the page stops being a bestiary entry
   * and starts being a chapter.
   */
  lore: string;
  role: EnemyRole;
  /** Sprite family the renderer draws (frames `<sprite>_0`, `<sprite>_1`). */
  sprite: string;
  /**
   * WHAT THIS THING IS MADE OF, which decides everything that comes out of it
   * when it is struck, cut open or burst — the spray, the pieces, the cut face,
   * and what hangs in the air afterwards (`pwa/src/game/game-screen/gore.ts`).
   *
   * `blood` (the default) is everything warm-blooded: red spray, organs, and a
   * haze. `ecto` is the haunted — green goo, a puff of it as it goes. `sparks`
   * is the machines — oil, wire, cells and plate, and smoke. `cosmic` is the
   * things the rift is made of rather than the things that fell into it —
   * light, void and shards, and a glimmer.
   *
   * A family is not a costume: it picks a different set of PIECES, because a
   * rover has no liver and a collapsed star has no ribcage.
   */
  gore?: GoreFamily;
  /**
   * WHAT SHAPE IT IS UNDER THE SKIN — which pieces are left of it when a blunt
   * blow bursts it (`pwa/src/game/render/gibs.ts`). Presentation only, like
   * `gore` and `locomotion`, and read at exactly one moment: the burst.
   *
   * `humanoid` (the default) loses a HEAD — a recognisable face among the meat,
   * which is the piece that makes a burst read as a person coming apart rather
   * than as a red splash. `beast` throws the same viscera and bone with no head
   * in it, because a giant lizard's is not the face in that sprite.
   *
   * Humanoid is the default because on this roster nearly everything that
   * BLEEDS is a person — the rovers and the wisps never reach this question at
   * all (they spark and they haunt, and neither can be burst), so the handful
   * of warm-blooded non-people are the ones that declare themselves.
   */
  anatomy?: EnemyAnatomy;
  /**
   * HOW IT GETS ABOUT — the gait the renderer animates it with (`render/gait.ts`).
   * Presentation only, like `gore`: nothing in the simulation reads it, but it
   * is intrinsic to the creature, so it is authored beside it rather than in an
   * app-side catalog.
   *
   * `legs` (the default) walks — the body tips softly left and right about its
   * feet, faster and harder the faster it moves, and stands breathing when it
   * stops. `float` HOVERS a few px off the ground with a slow drift and casts a
   * shadow beneath it — for ghosts and everything else with no legs to walk on.
   * `wheels` rolls: no tip, no hover — the honest read for a rover, a turret, or
   * anything on treads, which would otherwise wobble like it was strolling.
   */
  locomotion?: EnemyLocomotion;
  /**
   * A SPECIAL monster (see `MobRarity` / config RARE_MOBS): the engine
   * multiplies the def's authored minion baseline up at spawn — hp, contact
   * damage, monster level, and the kill's drop rolls — and the renderer
   * marks it (aura, floating name). Minion-role only; levels place these via
   * `LevelDef.rareSpawns`, never in ordinary spawn/wave lists.
   */
  rarity?: MobRarity;
  /**
   * Rare mobs only: the pack size range `[min, max]` (inclusive) rolled per
   * encounter — "1-5 depending on solo or pack". Omitted = always solo.
   * Ignored on `unique` mobs, which are one of a kind by definition.
   */
  pack?: [number, number];
  /**
   * A HELLBORN mob (config HELLGATES): one of the things a rampage-only
   * HELLGATE (`SpawnerSpec.hellgate`) lets through. Minion-role like a rare
   * mob, but authored at ELITE size and weight — these are the historic
   * cross-universe horrors the meter drags in, unique to each map, and they
   * only ever reach the board through a gate.
   *
   * The flag buys two things. RENDER: a violet rift halo and a floating name,
   * so one is never mistaken for the rank and file. LOOT: the kill is EXEMPT
   * from the evolution tier penalty the rest of the rampaged horde eats, and
   * its drop rolls MULTIPLY with the rampage stage (`HELLGATES.dropMult` +
   * `dropMultPerStage`, whole payouts like a rare mob's) — the gates are the
   * one place a rampage pays in gear rather than costing it. See
   * `dropMinionLoot`.
   */
  hellborn?: boolean;
  /**
   * HOW RICH IT WAS — a multiplier on the GOLD its corpse sheds (config
   * `GOLD`, see `items/gold.ts`). Omitted = 1: ordinary pockets.
   *
   * It is the field the satire is actually about. The rank and file are
   * carrying a shift's pay; the people who own the place are carrying the
   * place, and a corpse that pays out a hundred times what the man guarding it
   * did is the joke told in loot rather than in dialogue. Author it on the
   * moneyed — a founder, an investor, an executive — and leave every guard,
   * clerk and intern alone.
   *
   * IT ALSO DECIDES WHETHER THERE IS A PURSE AT ALL, in both directions, which
   * is why it is one field and not two. Left off, the body is asked the
   * ordinary question (`carriesGold`: does it bleed, and does it have a face?)
   * — so nothing on the roster needs authoring for gold to work. Set to 0, a
   * body that would have paid pays nothing, whatever it is made of. Set above
   * 0 on something that would NOT have paid — a bank rover, a haunted till —
   * and it pays: the exception is data, not a branch in the engine.
   */
  wealth?: number;
  hp: number;
  /**
   * Levels ABOVE the horde's baseline this mob runs at: its monster level is
   * `player level + difficulty offset + this` (see spawnEnemy /
   * maybePowerScale). Elites and bosses set it so the set-piece fights reach
   * the loot tier gates (`LOOT.tierUnlockMlvl`) — and drop higher-level
   * items — a few levels before the rank and file do. Omitted = 0.
   */
  levelBonus?: number;
  /** World px/s before per-instance jitter. */
  speed: number;
  /** Collision radius in world px. */
  radius: number;
  contactDamage: number;
  /** Chance a touch lands critically (2×); the player's LUCK reduces it. */
  critChance: number;
  /**
   * Chance this enemy DODGES the player's weapon blow entirely (no damage). The
   * player's DEXTERITY (hit rate) trims it toward 0. Omitted = the standing
   * `ACCURACY.enemyDodge` default; set higher for a nimble mob, lower (or 0)
   * for a lumbering one. Ignored by conjured abilities, which always connect.
   */
  dodgeChance?: number;
  /** Minimum ms between contact hits from the same enemy. */
  contactCooldownMs: number;
  /**
   * A ghostly monster: senses the player through walls (no line-of-sight
   * aggro check) and drifts straight through every obstacle. The dead
   * don't respect stone.
   */
  phasing?: boolean;
  /**
   * A dialogue-only figure: it seeks the player out for its scene like any
   * elite speaker, but it CANNOT be hit — weapons, abilities, nukes and
   * hazards all pass through it — its own touch deals no contact damage,
   * and it never counts toward the level's foes or objectives. Once its
   * scene has played it walks away and dissolves (config APPARITION,
   * `apparitionVanished` event). Give an apparition the `elite` role (so it
   * sleeps at its post and rushes into view to speak) plus `dialogue`;
   * `lastWords` and `loot` are meaningless on one — it cannot die.
   */
  apparition?: boolean;
  /**
   * WHOSE SIDE THIS BODY IS ON. Omitted means what every monster in the game
   * has always meant: hostile, hunting the hero on sight.
   *
   * `"neutral"` is a body that is not fighting anybody — a clerk at a desk, a
   * surveyor walking his grid, an assessor counting somebody else's tithe. It
   * is INERT (see src/game/disposition.ts): blades pass through it, AoE
   * ignores it, its own touch is harmless, the bot never picks it and the
   * level's foe total leaves it out — all so a bystander cannot be deleted by
   * a stray swing at the horde behind it, which would dead-end a quest chain
   * with no error to explain it.
   *
   * It is not mist, though: it never dissolves, and it can be PROVOKED
   * (`provokeEnemy`), which latches `Enemy.hostile` and makes the very same
   * body an ordinary monster from that tick on. That is the point of the whole
   * field — a conversation whose worst branch turns a bystander into a fight
   * costs the combat code nothing, because every damage site already asks one
   * predicate.
   */
  disposition?: "hostile" | "neutral";
  /**
   * The CONVERSATION this body opens when the hero walks up and talks to it
   * (a `content/conversations/<id>.yaml` tree — see defs/conversations.ts).
   * Neutral mobs only: a monster mid-charge is not taking questions.
   *
   * Distinct from `dialogue`, which is a scene the mob PLAYS AT the hero on
   * its own initiative and he can only page through. A conversation is one he
   * steers, and the branch he picks can set a quest flag, hand something over,
   * or talk the speaker into swinging at him.
   */
  conversation?: string;
  /**
   * A STRUCTURE, not a character: a thing a boss puts on the field that has hp
   * and can be broken, but has no voice and no inner life — THE FLAGBEARER's planted
   * flag (the `flag_plant` ability) is the first. It takes the `elite` role
   * because set-piece mechanics only run on elites and bosses, but it is not an
   * elite in any sense the story cares about, and the content suites that hold
   * every named elite to a spoken arrival and a dying gasp exempt it: an object
   * that gasped when broken would be worse than one that says nothing.
   *
   * Bookkeeping only — nothing in the simulation reads it. Give a structure
   * `xpMobMult: 0` too if a boss can replace it, or the fight becomes a farm.
   */
  structure?: boolean;
  /**
   * A unique mob that ESCAPES instead of dying: beaten to 0 hp it leaves the
   * board like a kill — XP granted, guaranteed drops paid, `lastWords` played
   * (worded as the flight, not a death rattle) — but the engine books a
   * `bossFled` event in place of `enemyKilled`/`bossDefeated`, never counts
   * it as a kill, and drops a `landmark` prop (the rift it tore open, drawn
   * by the sprite of the same name) where it vanished. A `killBoss` objective
   * still clears — the field is rid of it either way.
   *
   * `belowHpFrac` (0..1) makes the flight TRIGGER EARLY: the coward bolts the
   * instant his health crosses that fraction of `maxHp`, rather than only at 0.
   * The fight then reliably RESOLVES (no last-pixel grind against a fast,
   * summoning boss) and the escape reads as a rout. Omitted = the classic
   * flee-at-0 behavior.
   */
  flees?: { landmark: string; belowHpFrac?: number };
  /**
   * A RANGED attacker: instead of only biting on contact, this enemy fires a
   * hostile projectile at the player whenever its reload has run down, the
   * player is within `range`, and it has line of sight. The shot rides the
   * ordinary projectile pass flagged `hostile` (walls eat it, a jump clears
   * it, armor turns its share — see stepProjectiles / ranged.ts). With
   * `takesCover` the shooter also plays hide-and-peek: after firing it
   * scrambles to put the nearest solid obstacle between itself and the
   * player, and only steps back out as the reload runs down (config
   * ENEMY_RANGED). Contact damage still applies if the player closes in.
   */
  ranged?: {
    /** Damage one shot deals before the hero's armor turns its share. */
    damage: number;
    /** Ms between shots (the reload the cover dance is timed against). */
    cooldownMs: number;
    /** Max firing distance (world px); also the range it tries to hold. */
    range: number;
    projectile: {
      speed: number;
      radius: number;
      lifetimeMs: number;
      /** Sprite the renderer draws for the shot. */
      sprite: string;
    };
    /** Hide behind obstacles between shots (see moveRangedEnemy). */
    takesCover?: boolean;
  };
  /**
   * A GUARDED unique: while ANY enemy with one of these def ids is still on
   * the board, this one cannot be hurt — every blow bounces off with an
   * `enemyShielded` event (the app floats "SHIELDED"). How a set-piece boss
   * is wired to its controllers: kill the named guardians first, then the
   * shield falls. Contact damage and its own attacks work throughout.
   */
  shieldedBy?: string[];
  /**
   * A SPAREABLE unique: beaten to 0 hp it kneels instead of dying, and the
   * run pauses into the `choice` phase for the SPARE-or-KILL verdict
   * (`resolveChoice` in companions.ts). Spared, it joins the party as the
   * named COMPANION_DEFS entry — handing over its story items but keeping
   * its equipment loot (the gear IS the companion's kit). Killed, the
   * withheld blow lands and the normal kill path runs: loot, last words,
   * the lot. Meaningless combined with `flees` or `apparition`.
   */
  spareable?: { companion: string };
  /**
   * XP granted on kill. Omitted = the standing rules: every role pays a
   * reward proportional to the mob's LEVEL (`mobLevelXp`, not its hp) —
   * minions times any rare/unique `xpMult`, elites/bosses times the flat
   * `XP_TUNING.eliteXpMobMult` / `bossXpMobMult` (content/leveling.yaml).
   * Set only to override with a FLAT XP figure.
   */
  xp?: number;
  /**
   * Elite/boss only: this kill's XP as a multiple of its own mob-level XP
   * (`mobLevelXp(mlvl)`), overriding the role default
   * (`XP_TUNING.eliteXpMobMult` / `bossXpMobMult`). Set below the default for
   * a set piece that shouldn't pay a full reward — e.g. one head of a
   * multi-part guardian gauntlet, where the whole fight's payouts are meant
   * to sum to a sane reward. Ignored when `xp` (a flat override) is set, and
   * on minions.
   */
  xpMobMult?: number;
  /**
   * The scene played the first time this enemy closes to
   * DIALOGUE.speakRadius of the player (elites and bosses). One entry per
   * page; the run pauses in the `dialogue` phase until tapped through. A
   * page is the speaker's own lines, or `{ hero: [...] }` — the hero's
   * reply, shown with his name and portrait (see DialoguePage).
   */
  dialogue?: DialoguePage[];
  /**
   * A dying gasp a unique mob (elite/boss) coughs out as it falls — played
   * through the same dialogue box as its arrival scene (an `enemyDeath`
   * source), a single short page tapped through to close. Worded to read
   * unmistakably as last words (trailing off, choked mid-sentence) so a
   * story death lands harder than a nameless minion's. One string per line.
   */
  lastWords?: string[];
  /**
   * WHICH DEATH RITE this boss dies by — the scripted send-off played over it
   * before its last words (`death-rites/catalog.ts`, `boss-death.ts`). Named
   * rather than described, exactly as a set-piece ability is: the rite is a
   * catalog entry, so a boss says which end it gets and never how it works.
   *
   * OPTIONAL, AND A MISSING ONE IS NOT A BOSS WITHOUT A SEND-OFF. It falls back
   * to `dismantle`, which reads the victim's own GORE FAMILY and so is already
   * correct for a body, a machine, a haunting and a rift-thing alike — so a
   * boss (a MOD's included) gets the full three beats for free and `death:` is
   * an upgrade it earns. Same bargain the authored cast poses strike.
   *
   * MEANINGLESS ON ANYTHING BUT A BOSS: an elite is on the ordinary gore
   * ladder, and the build refuses a `death:` on a non-boss rather than letting
   * it sit there looking as though it does something.
   */
  death?: string;
  /**
   * WHAT THE HERO SAYS as the rite resolves — the line over the blow, or over
   * the coward going through his own exit.
   *
   * A BARK, not dialogue, and the distinction is the whole reason it exists as
   * its own field: every other spoken line in the game freezes the run into the
   * `dialogue` phase, which is exactly wrong for a line whose job is to land ON
   * a moment the player is watching. It floats over the hero and play never
   * stops — the same rule `BossAbility.bark` follows, and the same event.
   *
   * It is the HERO's, so it answers the boss rather than describing the move:
   * he has just spent a level being lectured by this person, and this is the
   * only place he gets to reply. Manuscript-governed like every other line.
   *
   * Boss-only, and optional: a boss without one simply finishes in silence,
   * which is right for the ones that were never talking to him.
   */
  deathBark?: string[];
  ai: {
    /** Wakes and chases when the player gets this close. */
    aggroRadius: number;
    /**
     * What this mob does while DORMANT (asleep at its post). `"work"` makes
     * it potter around its `home` — stroll a short leg, stand a beat, stroll
     * again (config `ENEMY_AI.work`, see working.ts) — so a staffed venue
     * reads as people at work instead of statues. Waking (aggro + line of
     * sight, wounds) and the fight itself are untouched. Omitted = the mob
     * stands still until woken, as before. Minions and elites only; bosses
     * guard their post.
     *
     * `"roam"` is the same idea at the scale of the WHOLE MAP: long legs
     * anywhere on the floor rather than short ones around `home`, so the body
     * genuinely crosses the venue instead of orbiting a patch of it. It exists
     * for the thing a quest can ask for that nothing else in the game
     * provides — a figure that has to be FOUND, whose spot on the minimap is
     * where he was when you last saw him and not where he is. Costs the same
     * as a stroll and draws on the same private stream, so a herd of roamers
     * perturbs no loot roll and a serialized run resumes mid-leg.
     */
    idle?: "work" | "roam";
    /** Bosses never stray further than this from home; others roam free. */
    leashRadius?: number;
    /** Fraction of speed while drifting back home (default 0.5). */
    returnSpeedFactor?: number;
    /**
     * Elites close in at this speed (world px/s, no jitter) until their
     * dialogue has played — the "rushes into view" beat. Defaults to
     * `speed`.
     */
    rushSpeed?: number;
  };
  /**
   * Set-piece mechanics (elites/bosses only — see `EnemyMechanics`): the
   * telegraphed moves and turns that make a named fight categorically harder
   * than a fat minion, instead of just statier.
   */
  mechanics?: EnemyMechanics;
  /**
   * Boss PHASES: hp-breakpoint switches of the active mechanic set (see
   * `EnemyPhase`). While the deepest crossed phase is active its `mechanics`
   * replace the def's base ones. Descending `belowHpFrac` order.
   */
  phases?: EnemyPhase[];
  /**
   * A tougher regular monster's richer drop profile. Minions with no `loot`
   * roll the level's loot table (see loot.ts `dropMinionLoot`); this sweetens
   * that roll for a heavy hitter without promoting it to guaranteed
   * elite-style drops — `dropBonus` is added to the roll chance and
   * `tierBonus` to the tier roll when it lands, the same knobs the menace
   * evolution applies. Ignored when `loot` is set (elites/bosses pay their
   * pinned drops instead).
   */
  dropProfile?: {
    /** Added to the base drop chance for this mob's kills. */
    dropBonus?: number;
    /** Added to the tier roll when this mob's kill drops equipment. */
    tierBonus?: number;
  };
  /** Guaranteed drops (bosses, elites). Rolled drops are the level's loot
   * table. */
  loot?: {
    /**
     * Specific equipment always dropped, on top of the counts. A bare id
     * rolls its tier like any drop; `{ defId, tier }` forces the tier for
     * story-guaranteed uniques (the epic space suit the level can't roll).
     * `requiresClear` gates the drop on campaign progress: the entry only
     * drops when the run's `clearedLevels` (seeded from the character's clears
     * at this difficulty) contains that level id — how the bunker key
     * (RASPUTIN's SEVERED HAND) stays latent until BOOT HILL is beaten, so the
     * secret level is a post-campaign bonus, not a mid-run detour.
     */
    items?: (string | { defId: string; tier?: Tier; requiresClear?: string })[];
    /** Story items always dropped (STORY_ITEM_DEFS ids — keys, dossiers). */
    storyItems?: string[];
    /**
     * Named UNIQUES always dropped (`defs/uniques.ts` ids), minted via
     * `mintUnique` — the scripted story payouts (a fallen oligarch's brand
     * watches). Distinct from `uniquesByDifficulty`, the chance-rolled
     * per-rung endgame table.
     */
    uniqueItems?: string[];
    /**
     * Per-tier drop CHANCES for this mob's kill, and they may exceed 1: each
     * whole 1.0 is a guaranteed drop of that tier and the remainder is the
     * chance of one more — a boss at `{ magic: 1.5, rare: 0.5 }` always drops
     * one magic item, half the time a second, and half the time a rare on
     * top. Each drop is a random piece from the level's pools forced to that
     * tier. The monster-level gates still hold: a tier the mob's level hasn't
     * unlocked (`LOOT.tierUnlockMlvl`) is skipped outright, so the same boss
     * def pays better on harder difficulties (where its mlvl runs higher).
     */
    tierDrops?: Partial<Record<Tier, number>>;
    weapons: number;
    gear: number;
    /** Golden XP arrows (see `arrowXp` in leveling.ts). */
    xpArrows: number;
    /** Weapon repair kits. */
    repairs: number;
    medkits: number;
    /** Added to every tier chance when rolling this enemy's drops. */
    tierBonus: number;
  };
  /**
   * Hand-authored UNIQUE drops keyed by DIFFICULTY: which named uniques
   * (`defs/uniques.ts` ids) this boss can drop on each rung. Gated to the rung —
   * an easy unique only drops on easy — and each is rolled at
   * `UNIQUE.dropChance × mlvl/ilvl` on the kill (see `maybeDropBossUnique`). A
   * boss may list more than one per rung (its slot piece plus a trinket).
   */
  uniquesByDifficulty?: Partial<Record<Difficulty, string[]>>;
};
