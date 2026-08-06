// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// QUEST tuning — the distances a conversation happens at, and the escort's own
// numbers.
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
   * The TALK reach: a tap on the giver within this distance opens their
   * conversation, which is the only way one ever opens. Wider than
   * `talkRadius` (the reach that merely MEETS them) so a player who walked off
   * can come back and press without hunting for the exact spot.
   */
  tapRadius: 96,
  /**
   * THERE IS NO WARD. A giver used to push the horde out of a 44 px bubble the
   * way the merchant's stall does, and it was an exploit rather than a comfort:
   * a giver stands on every map near the intended route, so the hero could park
   * on top of one and farm a pack that was physically unable to reach him. The
   * horde now closes on a hero standing beside a giver exactly as it does
   * anywhere else — givers themselves are still untouchable, so an errand can
   * never be lost to the horde, it just has to be accepted in the open.
   *
   * How far a giver (or a quest spot) steps per ring when a carved map puts a
   * wall under its authored coordinates. Half the old ward, kept as its own
   * number so the displacement search no longer depends on a repel radius that
   * does not exist.
   */
  displaceStep: 22,
  /** Drawn body radius, for placement collision and the app's hit test. */
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
  /**
   * How close the hero must come to a `visit` objective's spot to have stood
   * there (world px), when the objective names no radius of its own.
   *
   * GENEROUS ON PURPOSE, and roughly a third of a phone screen. A search
   * objective is already hard — no arrow points at it, and the tracker gives a
   * description rather than a coordinate — so the last few paces must not be
   * the difficulty. What makes the errand is finding the RIGHT PART OF THE
   * MAP; pixel-hunting the exact tile once you are there is a different and
   * much worse game.
   */
  visitRadius: 120,
} as const;
