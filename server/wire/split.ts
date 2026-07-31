// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE REPLICATION SPLIT — which of the run's state travels, to whom, and how
// often. Getting this table right is most of the design; everything else in
// `wire/` is machinery serving it.
//
// The state splits three ways (docs/multiplayer-plan.md §1.4):
//
//   STATIC   never sent. The level is a deterministic function of the
//            SessionParams, so the client calls `createGame` with the same
//            arguments and builds the geometry itself. ~100 KB the wire does
//            not carry, per level, per client.
//   DYNAMIC  snapshotted every publish. Everything that moves.
//   PRIVATE  to its owner alone. The bag, the purse, the stats, the talents.
//
// The PRIVATE tier is simultaneously three things, and only the first is
// obvious: a bandwidth win, a privacy win, and **the anti-cheat boundary** —
// a client that never receives another player's bag cannot manipulate it. It
// is also what makes PR 5's trade window honest. So the rule is a WITHHOLDING
// rather than an optimization: a private field is deleted from the snapshot
// before it is coded, not merely skipped when it happens not to have changed.
//
// Two mechanical notes that are easy to get wrong:
//
//  * **STATIC is not "the fields that happen to be constant"** — it is the
//    fields the client can PROVE it already has, because its own `createGame`
//    produced them from the same arguments. A field that is constant in
//    practice but built from anything else must be dynamic.
//  * **`obstacles` is NOT static**, however much it looks it, and it is not
//    cheaply guarded either. A boss's LOCKDOWN drops real `state.obstacles`
//    mid-fight, so it plainly has to travel — and the first version of this
//    file tried to make that cheap by comparing `obstaclesVersion`, the counter
//    the engine already maintains for the autopilot's nav grid cache, instead
//    of three hundred rectangles per publish. **That is wrong, and it is worth
//    recording why**: the counter bumps when an obstacle is ADDED or REMOVED,
//    which is all the nav grid cares about, but a crate's `hp` falls as it is
//    shot and the counter never moves. The guard therefore froze every
//    breakable at full health on the client while the server watched it break.
//    A "cheap" guard that answers a different question than the one being
//    asked is worse than no guard: it is silent, and it is only ever wrong
//    about the thing that changed. So obstacles are diffed like any other
//    entity list, and the day that measures as expensive the answer is a real
//    dirty flag the engine sets on WRITE, not a counter borrowed from another
//    feature.

/**
 * Fields the client rebuilds for itself from the `SessionParams` and which
 * cannot change for the life of a level. Never compared, never sent.
 *
 * Anything added here is a promise that `createGame(sameArgs)` produces it
 * bit-for-bit and nothing in `step()` ever writes it — the determinism suite
 * checks the first half, and the second is on whoever adds the row.
 */
export const STATIC_FIELDS: readonly string[] = [
  "level",
  "carvedLevel",
  "difficulty",
  "playerSpawn",
  // The dressing. Decor, canopy and landmarks are placed at creation and
  // never written again; the renderer reads them straight off the state.
  "decor",
  "canopy",
  "landmarks",
];

/**
 * Fields whose contents are only re-examined when a companion counter moves.
 * The counter is compared every publish; the payload only when it differs.
 *
 * **Deliberately empty.** The mechanism is kept because it is the right shape
 * for a field the engine marks dirty on write, and because the header above
 * records what happened to its first tenant: a guard that answers a slightly
 * different question than the differ is asking fails silently, and only about
 * the thing that changed. Add a row here only when the counter is bumped by
 * EVERY write to the field it guards — not merely by the writes some other
 * feature cared about.
 */
export const VERSIONED_FIELDS: Readonly<Record<string, string>> = {};

/**
 * Byte-array fields, diffed as sparse index/value pairs rather than resent.
 *
 * `explored` is the fog-of-war grid — one byte per tile, up to ~28 KB on the
 * biggest map, and it changes on almost every tick as the hero walks. Resent
 * whole at 20 Hz that is most of the bandwidth budget on its own; as the
 * handful of cells that actually flipped it is nothing. It is also the reason
 * this strategy exists at all: `JSON.stringify` turns a `Uint8Array` into an
 * object keyed by every index, which is worse than useless.
 */
export const BYTE_ARRAY_FIELDS: readonly string[] = ["explored"];

/**
 * Fields that never cross in either direction: the rng CLOSURES (not data —
 * `saved-run.ts` snapshots their positions instead, and the client has its own
 * from the same seed) and the app-owned view rect the renderer writes onto the
 * state each frame.
 */
export const UNSENT_FIELDS: readonly string[] = ["rng", "fxRng", "view"];

/**
 * The owner's alone. Deleted from every other recipient's snapshot before it
 * is coded.
 *
 * These are the reads the plan measured as the private two thirds of
 * `state.players[0]`: the bag, the purse, the build. A spectator or a second hero
 * gets the hero's `pos`, `hp` and `equipment` (they can SEE those) and nothing
 * that would let them enumerate — or, past PR 5's trade window, assert
 * anything about — what is in his pockets.
 */
export const PRIVATE_PLAYER_FIELDS: readonly string[] = [
  "inventory",
  "vault",
  "stats",
  "spentStats",
  "talents",
  "coins",
  "medkits",
  "staminaPotions",
  "repairKits",
  "cleanSlates",
  "pendingStatPoints",
];

/**
 * Run-level fields that are the owner's private detail rather than the party's
 * shared record. The quest LOG is shared in co-op (it lives on the run, not on
 * the character — see the QUESTS section of AGENTS.md), so what is private
 * here is only the offer currently on one player's screen.
 */
export const PRIVATE_RUN_FIELDS: readonly string[] = [
  "questOffer",
  "talk",
  "companionFocus",
];

/**
 * **`trades` IS DELIBERATELY NOT ON THAT LIST, and the reasoning is worth
 * stating because the instinct is the other way.**
 *
 * A trade is a fact about TWO seats, so a per-owner rule cannot describe one:
 * withheld from anybody but its owner, each side would see its own offer and
 * not the other's, which is not a trade window. Withholding it per-TRADE
 * instead would mean this table learning to filter a list by which seat is
 * looking — machinery it has none of, and the first thing in it that is not a
 * field name.
 *
 * What sending it to everybody actually exposes is small and bounded: who is
 * trading with whom, and a COPY of the two pieces on the table
 * (`TradeSide.item`). No bag is enumerable from it, which is the boundary the
 * private tier exists to hold — and the copy is presentation, so a client that
 * altered one would change a picture rather than a swap.
 */

const STATIC = new Set(STATIC_FIELDS);
const UNSENT = new Set(UNSENT_FIELDS);
const BYTES = new Set(BYTE_ARRAY_FIELDS);

/** True when the differ should skip this top-level field outright. */
export function isSkipped(field: string): boolean {
  return STATIC.has(field) || UNSENT.has(field);
}

/** True when this top-level field is a byte array (sparse-diffed). */
export function isByteArray(field: string): boolean {
  return BYTES.has(field);
}

/** The counter guarding this field, or undefined if it is diffed directly. */
export function versionGuard(field: string): string | undefined {
  return VERSIONED_FIELDS[field];
}
