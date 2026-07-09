// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Game-specific UI copy, gathered in one findable place so a sequel rewrites
// the flavor text here instead of hunting for strings across components.
// Brand identity (title, tagline, links) lives in the identity config
// (game.config.json / identity.ts); per-level story text lives on the level
// defs (intro, foes). This module is for the loose UI strings that are
// neither: the how-to-play screen.

/** The HOW TO PLAY screen, one entry per rendered line ("" = a blank gap). */
export const HELP_LINES = [
  "STEER WITH THE POINTER - ON DESKTOP",
  "YOUR CHARACTER CHASES THE CURSOR. ON",
  "TOUCH, HOLD AND DRAG - A JOYSTICK",
  "APPEARS UNDER YOUR FINGER AND YOU",
  "WALK THE WAY YOU DRAG.",
  "",
  "TAP TO JUMP (WITH THE OTHER HAND",
  "WHILE STEERING) OR PRESS SPACE -",
  "MOON GRAVITY CARRIES YOU OVER THE",
  "GHOSTS.",
  "",
  "YOUR CHARACTER FIGHTS ON ITS OWN WITH",
  "WHATEVER IS EQUIPPED. LOOT THE",
  "HAUNTING, SPEND LEVEL-UPS, AND TAKE",
  "THE FIGHT TO THE OLD FLAG.",
  "",
  "CLICK (OR THE USE BUTTON, OR E) TO",
  "USE A CARRIED POWER. PRESS I FOR THE",
  "BAG, M FOR THE MAP. TUNE IT ALL",
  "UNDER SETTINGS.",
  "",
  "WORKS OFFLINE - INSTALL IT AS AN APP",
  "FROM YOUR BROWSER MENU.",
];
