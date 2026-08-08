// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CACHE — the antique chest that stands against the garage's north wall
// once Ruth hands it over, and the one place in the game a piece of gear can be
// KEPT without being carried (see engine/game/cache.ts).

export const CACHE = {
  /**
   * THE CEILING — the biggest the chest ever gets, and the size of the grid
   * every hero's cells are laid out at whatever they have earned.
   *
   * FORTY-EIGHT, WHICH IS DIABLO II'S OWN STASH: eight columns by six rows.
   * The number is borrowed on purpose — that chest is the thing this one is,
   * and its shape is what two decades of players already know how to read.
   *
   * THE ARRAY IS ALWAYS THIS LONG, on every hero on every rung. How many of
   * the cells are USABLE is `GameState.cacheSlots`, off the rung Ruth was
   * paid on; the rest draw LOCKED, the same way the bag draws the room
   * STRENGTH has not bought yet. Sizing the array to the rung instead would
   * mean a hero who beat JESUS and started a fresh EASY run had 48 pieces in a
   * 16-cell list — and something would have to decide which 32 to delete.
   */
  maxSlots: 48,
  /**
   * The chest's WIDTH in cells, which is D2's too. Every rung's slot count on
   * the ladder (see `DifficultyDef.cache`) is a multiple of it, so a chest is
   * always a whole number of whole rows and a rung is visibly one row more
   * than the one below it. The panel's grid is pinned to this at every
   * breakpoint rather than following the bag's responsive column count.
   */
  cols: 8,
  /**
   * The reach a tap on the chest opens it from (world px). Wider than the
   * hero's own body, like the merchant's counter — a fixture against a wall is
   * approached from one side, and hunting for the exact pixel to press is not
   * the game.
   */
  tapRadius: 44,
  /**
   * How long the chest takes to COME INTO BEING when the errand that pays it is
   * handed in, or is REPLACED by the deeper rung's (`GameState.cacheArriveMs`,
   * drawn by render/conjure.ts).
   *
   * A beat the player watches. Long enough to read as an arrival rather than a
   * pop-in, short enough that nobody is standing in their own garage waiting on
   * a cutscene — and sized just over the mercy angel's descent, which is the
   * game's other "something is being handed to you" moment.
   */
  arriveMs: 1400,
} as const;
