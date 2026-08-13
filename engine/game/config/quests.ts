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
  /**
   * DEFAULT WALKING PACE for a giver with a `QuestGiverDef.arrive` block
   * (world px/s), when the def names none of its own.
   *
   * Well under `PLAYER.speed`: this is somebody's mother walking up a driveway
   * at midnight, not a jog, and the pace is what decides how long the arrival
   * is a THING THE PLAYER CAN SEE (and, on the hub, how long she is standing
   * in front of a car anybody could drive off in). At 55 the garage's walk is
   * about three seconds — long enough to be watched, short enough that the
   * player is not held at the door.
   */
  arriveSpeed: 55,
  /**
   * A quest item's default drop chance off a breed that carries it.
   *
   * ROUGHLY ONE IN TWELVE, AND THE SMALLNESS IS THE POINT. A fetch piece that
   * falls off every third body is not a hunt, it is a two-room detour with a
   * counter on it: this game's hero clears a hundred and seventy mobs in three
   * minutes, so at the old third-of-a-chance a four-piece errand was over
   * before the player had finished reading what it asked for. At this rate the
   * same four pieces cost about forty-five kills (see `dropPity` for the
   * arithmetic) — the same order as a `kill` objective, which is what makes
   * the two kinds feel like the same size of job.
   *
   * A piece that falls off a ONE-OFF named body is the deliberate exception and
   * authors its own `dropChance: 1` — there is only ever one of that mob, so
   * the roll is not a farm rate, it is whether the beat happens at all.
   */
  dropChance: 0.08,
  /**
   * THE PITY FLOOR for a `collect` objective: after this many kills of a
   * carrying breed with nothing to show for it, the next one drops for
   * certain. A fetch quest gated on a coin flip is a fetch quest some players
   * simply cannot finish, and the horde is finite.
   *
   * IT MOVES WITH `dropChance` AND IS MEANINGLESS ALONE. The pair is what sets
   * the real cost of a piece: `(1 − (1 − p)^pity) / p` kills on average, which
   * at 0.08 and 25 is ~11. Left at the old 6 while the chance fell it would
   * have become the DOMINANT term — every piece landing on the sixth body,
   * dead certain, which is a worse fetch quest than a generous one because it
   * is not even a gamble.
   */
  dropPity: 25,
  /**
   * RESTOCKING THE HORDE FOR AN ERRAND (see quests/restock.ts): how many times
   * over the field must still be able to supply what a fresh errand asks for
   * before it is left to the map's own horde.
   *
   * WELL above 1, because a queued mob is not a met mob. A spawn point only
   * pours while the hero stands in its trigger radius, so most of a map's
   * horde is never fought at all: a measured MEDIUM run of GOODCO HQ killed
   * 176 of the 1247 monsters its knots had queued. Counting the whole queue as
   * supply at face value would tell a forty-kill errand that a map holding
   * fifty of the breed — in twenty rooms the hero will visit three of — is
   * comfortably stocked.
   */
  restockHeadroom: 2.5,
  /**
   * The most bodies ONE errand may add to the field when it tops the horde up.
   * A ceiling rather than a target: the shortfall is normally far smaller, and
   * this only bites where an errand is taken onto a map that has been swept
   * clean, which is exactly the case where dumping the whole need at once
   * would turn a quiet walk back to the giver into an ambush.
   */
  restockMax: 60,
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
