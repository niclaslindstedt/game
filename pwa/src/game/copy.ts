// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Game-specific UI copy, gathered in one findable place so a sequel rewrites
// the flavor text here instead of hunting for strings across components.
// Brand identity (title, tagline, links) lives in the identity config
// (game.config.json / identity.ts); per-level story text lives on the level
// defs (intro, foes). This module is for the loose UI strings that are
// neither: the HOW TO PLAY teaching copy.

// The HOW TO PLAY demo (see demo.ts / GameScreen `demo`): the autopilot plays a
// level while these one-time tooltips pop wherever the bot "taps", teaching each
// control the first time the bot uses it. One line per taught action; keep them
// short — they render on one nowrap line at scale 2 over the field.
export const DEMO_TIPS = {
  /** The steer pad — shown the first time the bot commits to a direction. */
  steer: "HOLD & DRAG TO STEER",
  /** A tap on the field jumps (moon gravity carries the hero over ghosts). */
  jump: "TAP THE SCREEN TO JUMP",
  /** The first ground pickup scooped — loot is grabbed by walking over it. */
  loot: "WALK OVER LOOT TO GRAB IT",
  /** The first hit taken — contact with the horde is what drains the bar. */
  hurt: "STAY AWAY FROM MOBS - THEY HURT",
  /** A powerup dock slot the bot spent. */
  powerup: "TAP A POWERUP TO USE IT",
  /** A consumable (medkit / potion / repair kit) the bot spent. */
  item: "TAP AN ITEM TO USE IT",
  /** The level-up chooser — shown the first time the hero banks a stat point. */
  levelstat: "TAP A STAT TO RAISE IT",
} as const;
