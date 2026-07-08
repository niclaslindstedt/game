// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape of one enemy catalog entry. Every monster in the game is one
// `EnemyDef`; the rosters (one file per level/biome under this directory) are
// merged into `ENEMY_DEFS` by ./index.ts. Levels reference entries by id in
// their spawn lists (defs/levels/). Adding a monster = adding an entry to a
// roster + a sprite named after it — no engine changes.

import type { Tier } from "../../types.ts";

/**
 * `minion` is the horde, `boss` guards the objective — and `elite` is a
 * unique story mob: it sleeps at a hand-placed spot, rushes into view when
 * the player nears, delivers its `dialogue`, then fights. Elites drop real
 * loot (a signature weapon, plot items) via `loot`, same as bosses.
 */
export type EnemyRole = "minion" | "elite" | "boss";

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
  /** World px/s before per-instance jitter. */
  speed: number;
  /** Collision radius in world px. */
  radius: number;
  contactDamage: number;
  /** Chance a touch lands critically (2×); the player's LUCK reduces it. */
  critChance: number;
  /** Minimum ms between contact hits from the same enemy. */
  contactCooldownMs: number;
  /**
   * A ghostly monster: senses the player through walls (no line-of-sight
   * aggro check) and drifts straight through every obstacle. The dead
   * don't respect stone.
   */
  phasing?: boolean;
  /**
   * XP granted on kill. Omitted = proportional to max hp
   * (LEVELING.xpPerHp) — the standing rule; set only to override it.
   */
  xp?: number;
  /**
   * What this enemy says the first time it closes to DIALOGUE.speakRadius
   * of the player (elites and bosses). One entry per page, one string per
   * line; the run pauses in the `dialogue` phase until tapped through.
   */
  dialogue?: string[][];
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
};
