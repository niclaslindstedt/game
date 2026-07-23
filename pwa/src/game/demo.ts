// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HOW TO PLAY demo: the main-menu "HOW TO PLAY" hands a run to the engine
// autopilot (the same BOT VIEW machinery the developer menu uses) so a newcomer
// WATCHES the game play itself, with the teaching tooltips in copy.ts popping
// wherever the bot taps. Two things set it apart from the developer BOT VIEW:
//   1. it pins ONE gentle, coherent showcase (a MELEE hero on MEDIUM at 1×) —
//      the developer flow lets you pick the difficulty / level / spec / speed;
//   2. exiting is "click anywhere → confirm to the main menu" rather than the
//      pause menu (see GameScreen `demo`).
// A this-game app feature, so it lives app-side alongside bot-view-specs.ts.

import type { Difficulty } from "@game/core";

/** The difficulty the demo showcases — the middle starting lane. */
export const DEMO_DIFFICULTY: Difficulty = "medium";

/** The level the demo showcases (the HQ mission). */
export const DEMO_LEVEL_ID = "spacez_hq";

/** The BOT VIEW spec (bot-view-specs.ts) the demo forces: blades up close. */
export const DEMO_BOT_SPEC = "melee";

/** The demo always runs at real time — no fast-forward — so it reads as play. */
export const DEMO_GAME_SPEED = 1;
