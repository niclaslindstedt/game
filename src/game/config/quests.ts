// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// QUEST tuning — the distances a conversation happens at, the ward that keeps
// the horde off a civilian, and the escort's own numbers.
//
// Every radius here is sized against the PHONE viewport (~422×260 world units
// at the shipped projection), not against a desktop: a talk radius a player
// has to hunt for on a 5" screen is a quest nobody takes.

export const QUESTS = {
  /**
   * How close the hero must come for a giver to speak up (world px). Matches
   * the merchant's `discoverRadius` — the two are the same gesture (walk up to
   * the only person on the map who isn't trying to kill you).
   */
  talkRadius: 70,
  /**
   * The re-open reach: past the auto-offer, a TAP on the giver within this
   * distance re-opens their conversation. Wider than `talkRadius` so a player
   * who declined once and walked off can come back without hunting for the
   * exact spot.
   */
  tapRadius: 96,
  /**
   * THE WARD (`MERCHANT.repelRadius` plus a hair): a monster that strays inside
   * is pushed back out to the rim, so a giver never drowns in the horde and the
   * hero can always reach the conversation. The point of the errand is the
   * errand — a quest you have to clear a pack off to accept is a pack.
   *
   * It is DELIBERATELY barely wider than the trader's, and that restraint is
   * load-bearing: there are two givers on every map and they stand near the
   * intended route, so a generous ward is a pair of invisible walls across the
   * level. At this size it clears the conversation and nothing else — a wide
   * one measurably changed how the horde closed on the hero.
   */
  repelRadius: 44,
  /** Drawn body radius, for the ward's own collision and the app's hit test. */
  radius: 8,
  /** A quest item's default drop chance off a breed that carries it. */
  dropChance: 0.34,
  /**
   * THE PITY FLOOR for a `collect` objective: after this many kills of a
   * carrying breed with nothing to show for it, the next one drops for
   * certain. A fetch quest gated on a coin flip is a fetch quest some players
   * simply cannot finish, and the horde is finite.
   */
  dropPity: 6,
  /** An escort's hit points when its def names none. */
  escortHp: 220,
  /** How fast an escort walks (world px/s) — a touch under the hero's, so
   * keeping them up means not sprinting away from them. */
  escortSpeed: 46,
  /** Body radius for collision and for the horde's contact reach. */
  escortRadius: 7,
  /** How far behind the hero an escort settles before it stops closing. */
  escortFollowDistance: 34,
  /**
   * Past this the escort has been LEFT — it stops and waits rather than
   * trailing across the whole map, and the tracker says so. A follower that
   * teleports to the hero is not an escort; one that walks forever is a
   * kite for the horde.
   */
  escortLeashDistance: 260,
  /** How close the escort must get to its destination to have arrived. */
  escortArriveRadius: 44,
  /** A monster within this of the escort lands contact blows on it. */
  escortContactRadius: 15,
  /** Ms between contact blows on the escort (its own cadence, not the hero's). */
  escortHitEveryMs: 700,
  /**
   * The share of a monster's contact damage an escort takes. Below 1 because
   * an escort is a timer with a body, not a second health bar to solve: the
   * failure it exists to threaten has to be reachable in a bad fight and
   * survivable in an ordinary one.
   */
  escortDamageMult: 0.55,
  /**
   * How close a quest's target breed must come to be PINNED on the level map
   * (world px). Wider than the talk radius: the errand said what to look for,
   * so the map remembers the first one the hero laid eyes on.
   */
  markSightRadius: 200,
} as const;
