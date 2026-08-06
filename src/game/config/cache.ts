// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CACHE — the antique chest that stands against the garage's north wall
// once Ruth hands it over, and the one place in the game a piece of gear can be
// KEPT without being carried (see src/game/cache.ts).

export const CACHE = {
  /**
   * How many pieces the chest holds.
   *
   * TWENTY, and the number is the feature: the bag opens at a handful of cells
   * and tops out around twenty even on a STRENGTH build wearing the roomiest
   * find, so a chest of the same order does not "extend the bag" — it doubles
   * what the hero can own. That is the whole reason a stash exists: the pieces
   * a player keeps are the ones they are NOT wearing, and until now the only
   * way to keep one was to carry it instead of loot.
   */
  slots: 20,
  /**
   * The reach a tap on the chest opens it from (world px). Wider than the
   * hero's own body, like the merchant's counter — a fixture against a wall is
   * approached from one side, and hunting for the exact pixel to press is not
   * the game.
   */
  tapRadius: 44,
  /**
   * How long the chest takes to COME INTO BEING when the errand that pays it is
   * handed in (`GameState.cacheArriveMs`, drawn by render/conjure.ts).
   *
   * A beat the player watches. Long enough to read as an arrival rather than a
   * pop-in, short enough that nobody is standing in their own garage waiting on
   * a cutscene — and sized just over the mercy angel's descent, which is the
   * game's other "something is being handed to you" moment.
   */
  arriveMs: 1400,
} as const;
