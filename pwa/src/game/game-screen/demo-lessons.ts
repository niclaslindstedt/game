// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HOW TO PLAY demo's AMBIENT lessons: the teaching tooltips that aren't
// raised by an engine event or a modal, but by the run simply BECOMING a
// situation the HUD has an answer for — the sprint pool run low while the hero
// stands and breathes, a weapon worn near breaking, a pack with finds in it, a
// recruited ally, the RAMPAGE gauge lighting up. Each names the HUD control it
// teaches by selector, so the caret points at the thing to press.
//
// Why a catalog rather than a pile of ifs in the loop: an ambient lesson has to
// be RE-CHECKED every tick (its control may not be laid out yet, or the demo
// may be mid-tip), so they all want the same "ready? anchored? spaced out?"
// treatment. The director owns that loop (see `demo-director.ts`); this module
// is the pure data — which lesson, on what control, under what condition — plus
// the standstill tracker the stamina lesson reads. Nothing here touches the
// DOM or the engine, so it all tests headlessly.

import {
  equipmentMaxDurability,
  menaceStage,
  type GameState,
} from "@game/core";

/** Sprint pool at/below this fraction of the max counts as "run low" — deep
 * enough into the bar that the hero is visibly slowing, not a nick off the
 * top. */
const STAMINA_LOW_FRAC = 0.3;

/** How long (ms) the hero must have held still before the stamina lesson
 * fires. He has to be SEEN standing and refilling for "stand still to get your
 * breath" to describe what's on screen — a step's pause between kites doesn't
 * count. */
const STAMINA_STILL_MS = 700;

/** World units the hero may drift per tick and still count as standing still.
 * A hair above zero so a nudge out of a wall (or the sub-unit jitter of an
 * arrive-radius settle) doesn't re-arm the standstill clock. */
const STILL_EPSILON = 0.35;

/** Held-weapon durability at/below this fraction of its max raises the repair
 * lesson — the same "one fight from being dumped onto the sidearm" zone the
 * durability ring is already reddening through. */
const WEAPON_WORN_FRAC = 0.35;

/** Finds banked before the bag lesson fires. Two, not one: a lone pickup can be
 * a consumable the dock already shows, and a pack worth opening reads better
 * once it has something to choose between. */
const BAG_TAUGHT_AT = 2;

/** Combat time (ms) before the CHROME lessons — the controls that answer no
 * particular situation, only a player's own curiosity — are offered, spaced so
 * they land across a watched run rather than in one clump at the start. */
const PAUSE_AT_MS = 30_000;
const MAP_AT_MS = 75_000;
const AUTOPILOT_AT_MS = 120_000;

/** How far into the ding's celebration window (`state.levelUpFxMs`, counting
 * DOWN from LEVELING.dingCelebrationMs) the level-up payoff is taught. Late
 * enough that the full-screen white flash has faded — a callout under it is
 * unreadable — and past the shockwave's own `knockbackMs`, so the frozen frame
 * shows the horde already thrown clear and the bars already full, which is the
 * whole lesson. */
const DING_TEACH_AT_MS = 600;

/** How long the hero has held still, for the lessons that read a POSE rather
 * than a value. Component-lifetime, stepped by the director each tick. */
export type StandstillMemory = { stillMs: number; x: number; y: number };

export function createStandstillMemory(): StandstillMemory {
  return { stillMs: 0, x: NaN, y: NaN };
}

/**
 * Advance the standstill clock from where the hero is THIS tick: moving more
 * than {@link STILL_EPSILON} resets it, holding position banks the time. Read
 * off the position rather than the input, so it measures where the hero
 * actually IS (a steer into a wall is standing still) — and mirrors what the
 * viewer sees.
 */
export function trackStandstill(
  memory: StandstillMemory,
  pos: { x: number; y: number },
  dtMs: number,
): void {
  const moved =
    Number.isNaN(memory.x) ||
    Math.abs(pos.x - memory.x) > STILL_EPSILON ||
    Math.abs(pos.y - memory.y) > STILL_EPSILON;
  memory.x = pos.x;
  memory.y = pos.y;
  memory.stillMs = moved ? 0 : memory.stillMs + dtMs;
}

/** What an ambient lesson gets to read beyond the state itself. */
export type LessonContext = {
  /** How long the hero has held still (see {@link trackStandstill}). */
  stillMs: number;
  /** Has this tip already been shown? Lets a lesson wait for another to land
   * first, so two callouts about the same moment don't stack up. */
  taught: (key: string) => boolean;
};

/** One ambient lesson: the tip it raises, the HUD control it points at, and
 * the situation that makes it worth teaching. */
export type DemoLesson = {
  /** The `DEMO_TIPS` key — also the once-per-session latch. */
  key: string;
  /** CSS selector for the control the caret points at, resolved inside the
   * game shell. A lesson whose control isn't on screen (or isn't laid out)
   * simply waits — it stays ready until the HUD can host it. `null` anchors on
   * the HERO himself instead: for a lesson about something happening out on
   * the field, no button is the answer. */
  anchor: string | null;
  /** Is this lesson worth teaching right now? Pure. */
  ready: (state: GameState, ctx: LessonContext) => boolean;
};

/**
 * The ambient lessons, in the order the director offers them: a SITUATION the
 * run created first (those teach something the viewer is watching happen),
 * then the CHROME the player would only go looking for. Ordering matters only
 * for a tick where several are ready at once — the director raises one tip at
 * a time.
 */
export const DEMO_LESSONS: readonly DemoLesson[] = [
  {
    // The sprint pool run low while the hero stands and gets it back — the one
    // lesson whose whole point is that DOING NOTHING is the move.
    key: "stamina",
    anchor: ".vital-st",
    ready: (state, ctx) => {
      const { stamina, maxStamina } = state.player;
      return (
        maxStamina > 0 &&
        stamina <= maxStamina * STAMINA_LOW_FRAC &&
        ctx.stillMs >= STAMINA_STILL_MS
      );
    },
  },
  {
    // The durability ring running down on the held weapon.
    key: "repair",
    anchor: '[aria-label="switch-weapon"]',
    ready: (state) => {
      const weapon = state.player.equipment.weapon;
      if (weapon.durability === undefined) return false; // unbreakable
      const max = equipmentMaxDurability(weapon);
      return max > 0 && weapon.durability <= max * WEAPON_WORN_FRAC;
    },
  },
  {
    // The pouch, once the pack is carrying enough to be worth opening.
    key: "bag",
    anchor: ".hud-bag-slot",
    ready: (state) =>
      state.player.inventory.filter(Boolean).length >= BAG_TAUGHT_AT,
  },
  {
    // A recruited ally's portrait on the party rail. Deep into a campaign, so
    // most watched runs never reach it — the lesson simply never fires.
    key: "companion",
    anchor: ".companion-portrait",
    ready: (state) => state.companions.length > 0,
  },
  {
    // The RAMPAGE gauge, the first time the horde escalates. The gauge's text
    // only renders from stage 1, which is also when the lesson becomes true —
    // so the caret always has something under it.
    key: "menace",
    anchor: ".hud-minimap-rampage",
    ready: (state) => menaceStage(state) >= 1,
  },
  {
    // The ding's PAYOFF, not its chooser: the bars snap full and the light
    // hurls the horde clear (loot.ts `levelUpShockwave`) — worth knowing,
    // because a level-up you can see coming is an escape you can spend. Held
    // back until the chooser lesson has landed, so the first ding explains the
    // modal and a later one explains the tactic instead of stacking two
    // read-freezes onto one celebration. Anchored on the hero: the shove
    // radiates from him and the cleared ring is the proof.
    key: "ding",
    anchor: null,
    ready: (state, ctx) =>
      ctx.taught("levelstat") &&
      state.levelUpFxMs > 0 &&
      state.levelUpFxMs <= DING_TEACH_AT_MS,
  },
  {
    key: "pause",
    anchor: '[aria-label="pause"]',
    ready: (state) => state.stats.combatMs >= PAUSE_AT_MS,
  },
  {
    key: "map",
    anchor: '[aria-label="open-map"]',
    ready: (state) => state.stats.combatMs >= MAP_AT_MS,
  },
  {
    // AUTO PILOT is hired from the pause menu, so it points at the same
    // control as the pause lesson — and comes well after it, so the viewer has
    // already been shown where that menu lives.
    key: "autopilot",
    anchor: '[aria-label="pause"]',
    ready: (state) => state.stats.combatMs >= AUTOPILOT_AT_MS,
  },
];
