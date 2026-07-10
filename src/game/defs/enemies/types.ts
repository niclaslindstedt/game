// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape of one enemy catalog entry. Every monster in the game is one
// `EnemyDef`; the rosters (one file per level/biome under this directory) are
// merged into `ENEMY_DEFS` by ./index.ts. Levels reference entries by id in
// their spawn lists (defs/levels/). Adding a monster = adding an entry to a
// roster + a sprite named after it — no engine changes.

import type { Difficulty, Tier } from "../../types.ts";

/**
 * `minion` is the horde, `boss` guards the objective — and `elite` is a
 * unique story mob: it sleeps at a hand-placed spot, rushes into view when
 * the player nears, delivers its `dialogue`, then fights. Elites drop real
 * loot (a signature weapon, plot items) via `loot`, same as bosses.
 */
export type EnemyRole = "minion" | "elite" | "boss";

/**
 * One page of a unique's arrival scene. A plain `string[]` is the speaker's
 * own page (one string per line); `{ hero: [...] }` is the HERO talking back
 * mid-scene — the app swaps in his name and portrait for that page, so a
 * story reveal lands as a conversation instead of a lecture.
 */
export type DialoguePage = string[] | { hero: string[] };

export type EnemyDef = {
  id: string;
  /** Display name (HUD, boss bar). */
  name: string;
  role: EnemyRole;
  /** Sprite family the renderer draws (frames `<sprite>_0`, `<sprite>_1`). */
  sprite: string;
  /**
   * Hit-splash family: what sprays when this enemy is struck. Ghosts
   * splash "ecto", machines throw "sparks"; everything warm-blooded
   * defaults to "blood".
   */
  gore?: "blood" | "ecto" | "sparks";
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
   * A unique mob that ESCAPES instead of dying: beaten to 0 hp it leaves the
   * board like a kill — XP granted, guaranteed drops paid, `lastWords` played
   * (worded as the flight, not a death rattle) — but the engine books a
   * `bossFled` event in place of `enemyKilled`/`bossDefeated`, never counts
   * it as a kill, and drops a `landmark` prop (the rift it tore open, drawn
   * by the sprite of the same name) where it vanished. A `killBoss` objective
   * still clears — the field is rid of it either way.
   */
  flees?: { landmark: string };
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
   * XP granted on kill. Omitted = proportional to max hp
   * (LEVELING.xpPerHp) — the standing rule; set only to override it.
   */
  xp?: number;
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
  ai: {
    /** Wakes and chases when the player gets this close. */
    aggroRadius: number;
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
     */
    items?: (string | { defId: string; tier?: Tier })[];
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
    /** Golden XP arrows (see LEVELING.arrowXpShare). */
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
