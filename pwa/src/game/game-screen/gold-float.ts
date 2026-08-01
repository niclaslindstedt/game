// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GOLD PICKED UP IN ONE BREATH IS ONE NUMBER. Money arrives in piles rather
// than in coins — a boss sheds SIX at once (`dropGold`), and a fight's floor
// leaves a trail the hero walks straight through — so the naive one-float-per-
// pile reading stacks half a dozen identical "+N" texts on the same spot at the
// same instant. They rise in lockstep, overdraw each other, and what the player
// reads is one bold number that is a SIXTH of what he actually banked.
//
// So a pile does not float on its own: it joins a GROUP, exactly as a pack kill
// fuses its drips into one oversized XP pop (`mergePackKillXp`). The group stays
// open while piles keep landing and closes on the first quiet moment, then
// floats the TOTAL and writes the ONE feed line. Grouping by time alone is the
// whole rule — every pile is banked on the hero, so unlike a pack of corpses
// there is no geometry to tell two of them apart.
//
// The float therefore lags its pickup by up to `GOLD_GROUP_GAP_MS`. That is
// deliberate and it is cheap: the coin sound plays on the tick the pile is
// taken, so the pickup is confirmed instantly and only the NUMBER waits for its
// final value — the same trade the kill-XP popup already makes with its 500 ms
// delay.

import { PLAYER, type GameState } from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";

import { localHero } from "../local-seat.ts";
import type { LoopShared } from "./loop-shared.ts";

/** Quiet time that closes an open group (ms). A pile landing within this of the
 * last one is "the same handful of money" and adds to it. Short enough that the
 * number is on screen before the player has walked past the spot it came from,
 * long enough to swallow a boss's six-pile fountain and the trail of piles a
 * hero sweeps up as he crosses a cleared fight. */
export const GOLD_GROUP_GAP_MS = 220;

/** The longest a group may keep collecting before it floats anyway (ms).
 * Without it a hero farming a dense floor could keep a group open indefinitely
 * and never be told what he is earning; with it a long sweep simply reads as a
 * run of big numbers instead of one that never arrives. */
export const GOLD_GROUP_MAX_MS = 700;

/** How long the float lives and how far it climbs — unchanged from the
 * per-pile float this replaces. */
const GOLD_FLOAT_MS = 900;
const GOLD_FLOAT_RISE = 24;

/** Past this many coins the float doubles in size: a big pile shouts and a
 * couple of coins murmurs, the same escalation the pile ladder and the glitter
 * count both ride, so all three agree. Read off the GROUP's total, so six piles
 * worth a thousand between them shout like the thousand they are. */
const GOLD_BIG_COINS = 1000;

/** The purse's own warm yellow — the float and its feed line share it. */
const GOLD_COLOR = "#ffd75e";

/** Money banked but not yet floated: one open group, since piles are grouped by
 * WHEN they landed and nothing else. */
export type GoldGroup = {
  /** Coins the group has swallowed so far. */
  coins: number;
  /** How many piles fed it — a boss's fountain is six. */
  piles: number;
  /** Sim-clock ms the group opened (caps how long it may stay open). */
  openedMs: number;
  /** Sim-clock ms the last pile landed (the quiet that closes it is measured
   * from here, so a steady stream keeps one group alive). */
  lastMs: number;
};

/** Whether this group has been quiet long enough — or open long enough — to
 * float now. A clock that has gone BACKWARD closes it too: the next level of a
 * run starts a fresh state whose sim clock restarts at zero, and a group left
 * measuring its quiet against the old one would never close again. */
export function goldGroupClosed(group: GoldGroup, nowMs: number): boolean {
  return (
    nowMs < group.openedMs ||
    nowMs - group.lastMs >= GOLD_GROUP_GAP_MS ||
    nowMs - group.openedMs >= GOLD_GROUP_MAX_MS
  );
}

/**
 * Bank a pile into the open group (opening one if there is none). Any group
 * that has already gone quiet is floated first, so a fresh handful of money
 * never merges into the last one's total.
 */
export function collectGoldPickup(
  shared: LoopShared,
  state: GameState,
  coins: number,
  pushPickup: (text: string, color?: string, prefix?: string) => void,
): void {
  if (coins <= 0) return;
  flushGoldPickups(shared, state, pushPickup);
  const now = state.stats.timeMs;
  const group = shared.goldGroup;
  if (group) {
    group.coins += coins;
    group.piles += 1;
    group.lastMs = now;
    return;
  }
  shared.goldGroup = { coins, piles: 1, openedMs: now, lastMs: now };
}

/**
 * Float the open group's total if it has closed — the tick-side counterpart of
 * `collectGoldPickup`, called once per step so a group that stops collecting
 * still lands without waiting for the next pile.
 *
 * The amount flows up off the hero in the purse's own warm yellow, exactly as
 * an arrow's XP floats in blue, and one line goes to the lower-corner feed.
 * Gold has no pickup card and never will — a card is for a find worth STOPPING
 * to read, and a farm run walks over dozens of piles a minute — so this float
 * and that line are the whole of what money says on the way past.
 */
export function flushGoldPickups(
  shared: LoopShared,
  state: GameState,
  pushPickup: (text: string, color?: string, prefix?: string) => void,
): void {
  const group = shared.goldGroup;
  if (!group || !goldGroupClosed(group, state.stats.timeMs)) return;
  shared.goldGroup = undefined;
  const hero = localHero(state);
  shared.effects.push({
    kind: "text",
    pos: { x: hero.pos.x, y: hero.pos.y - PLAYER.radius - 12 },
    untilMs: state.stats.timeMs + GOLD_FLOAT_MS,
    durationMs: GOLD_FLOAT_MS,
    text: `+${formatCompact(group.coins)}`,
    color: GOLD_COLOR,
    rise: GOLD_FLOAT_RISE,
    scale: group.coins >= GOLD_BIG_COINS ? 2 : 1,
  });
  // The line is abbreviated rather than printed raw: a late-campaign hoard is a
  // six-digit number, and "127463 GOLD" in a feed that scrolls past in a second
  // is a wall of digits nobody reads.
  pushPickup(`${formatCompact(group.coins)} GOLD`, GOLD_COLOR);
}
