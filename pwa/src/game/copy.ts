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
// short — they render on one nowrap line at scale 2 over the field
// (`tests/demo_tips_test.ts` fails a line that outgrows the narrowest phone or
// uses a character the pixel font has no glyph for).
//
// A tip is raised from one of three places, all in game-screen/:
//   • bot-feedback.ts — an ENGINE EVENT the bot caused (a jump, a scooped
//     pickup, a smashed crate), anchored where it happened on the field;
//   • demo-lessons.ts — an AMBIENT lesson the run state makes true (the sprint
//     pool run low, a worn weapon, a companion recruited), anchored on the HUD
//     control it teaches, raised once the control is actually on screen;
//   • demo-director.ts — a MODAL/CONTROL the demo plays at a human pace (the
//     level-up chooser, the talent picker, the weapon switcher).
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
  /** The talent picker — a ×10 level milestone banked a talent point. */
  talent: "TAP A TALENT TO LEARN IT",
  /** The held-weapon slot, as the bot's pocket arsenal changes hands. */
  weapon: "TAP THE WEAPON TO SWITCH IT",
  /** The sprint pool run low while the hero stands and gets his breath back. */
  stamina: "STAND STILL TO GET YOUR BREATH",
  /** The held weapon's durability ring running down. */
  repair: "MEND A WORN WEAPON WITH A KIT",
  /** The bag pouch, once the pack is carrying finds. */
  bag: "TAP THE BAG TO OPEN YOUR PACK",
  /** A recruited companion's portrait on the party rail. */
  companion: "TAP A PORTRAIT TO GEAR AN ALLY",
  /** The RAMPAGE gauge, the first time the horde escalates. */
  menace: "KILL FAST AND THE HORDE EVOLVES",
  /** A smashed supply crate. */
  crate: "SMASH CRATES FOR SUPPLIES",
  /** The vending-machine merchant, on sight. */
  merchant: "TRADE YOUR LOOT AT THE STALL",
  /** A mercy drop flown in — the moon answers a hero in trouble. */
  mercy: "RUNNING LOW? A DROP FINDS YOU",
  /** The pause hit-zone over the minimap. */
  pause: "TAP THE TIMER TO PAUSE",
  /** The minimap body, which opens the full-screen map. */
  map: "TAP THE MAP TO SEE IT ALL",
  /** The pause menu is where the coin-metered AUTO PILOT is hired. */
  autopilot: "PAUSE TO HIRE THE AUTO PILOT",
} as const;
