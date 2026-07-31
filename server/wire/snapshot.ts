// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SNAPSHOT — one recipient's view of the run, at one tick.
//
// `captureSnapshot` turns the live `GameState` into the plain record the differ
// compares, and it is where the PRIVATE tier of the replication split is
// enforced. That enforcement is a WITHHOLDING, not an omission: a field the
// recipient may not see is deleted from the record before it is coded, so a
// spectator's client never holds another hero's bag at all. Skipping it "when
// it happens not to have changed" would be a bandwidth trick with no security
// property behind it, and PR 5's trade window rests on the difference.
//
// This module does not import the engine, on purpose. It reads a `GameState`
// structurally — as `Record<string, unknown>` — for two independent reasons:
// the page imports it from screens that may sit on the app's STARTUP path
// (where the 170 KB critical-path budget forbids reaching `@game/core`), and a
// wire that knows nothing about the simulation cannot fall out of step with it
// when the simulation grows a field.
//
// EVENTS RIDE THE SNAPSHOT, and that is the cheapest thing in this whole plan:
// `state.events` is already a per-tick array of plain records, and it is how
// the app plays every sound, flash, gore burst, blood soak and haptic. Carrying
// it means the entire FX layer works on a client with no change at all. The one
// thing it needs is a caller who does not LOSE any: the simulation runs at 60 Hz
// and a snapshot is published every third tick, so the session accumulates the
// three ticks' events and hands them in together — see `session.ts`.

import {
  PRIVATE_PLAYER_FIELDS,
  PRIVATE_RUN_FIELDS,
  UNSENT_FIELDS,
} from "./split.ts";
import type { WireState } from "./delta.ts";

/** Who a snapshot is being cut for. In PR 1 there is one client and it owns
 * the hero; the shape exists now so the private split is real and tested
 * before PR 3 gives it a second player to keep things from. */
export type Recipient = {
  /** True when this client steers the hero the snapshot describes. */
  ownsPlayer: boolean;
};

/**
 * One recipient's view of `state`, as a plain record.
 *
 * The result SHARES structure with the live state — nothing is deep-copied,
 * because the differ only reads and the encoder only serializes, and a deep
 * copy of 146 mobs twenty times a second is exactly the cost this design
 * exists to avoid. The two places a copy IS made are the ones where a member
 * is edited: the player and the run's private fields.
 */
export function captureSnapshot(
  state: Record<string, unknown>,
  recipient: Recipient,
  events: unknown[],
): WireState {
  const out: WireState = { ...state };
  for (const field of UNSENT_FIELDS) delete out[field];
  // The accumulated events of every tick since the last publish, in order.
  out.events = events;
  const player = out.player;
  if (player && typeof player === "object") {
    const copy = { ...(player as Record<string, unknown>) };
    if (!recipient.ownsPlayer) {
      for (const field of PRIVATE_PLAYER_FIELDS) delete copy[field];
    }
    out.player = copy;
  }
  if (!recipient.ownsPlayer) {
    for (const field of PRIVATE_RUN_FIELDS) delete out[field];
  }
  return out;
}

/**
 * A recipient's own copy of the state, for use as the first delta baseline.
 *
 * The client builds this from its OWN `createGame` — the same arguments, so
 * the same world — which is what makes the static tier cost zero bytes: the
 * server's first delta is coded against a state the client already has, and
 * everything the two agree on is simply absent from it.
 *
 * The withholding is applied here too. A non-owner's baseline must not carry
 * the private fields its own `createGame` invented, or the first delta would
 * be coded against something the server never sent and the two would disagree
 * about a bag nobody is allowed to look at.
 */
export function baselineFor(
  state: Record<string, unknown>,
  recipient: Recipient,
): WireState {
  return captureSnapshot(state, recipient, []);
}

/**
 * Delete, IN PLACE, the fields this recipient is not entitled to.
 *
 * The client half of the withholding, and it exists for a reason that is easy
 * to miss: a client's own `createGame` builds a WHOLE private hero — an empty
 * inventory, a starting purse, a fresh stat block, an untrained talent map —
 * and for a spectator none of that is real. The server will never send those
 * fields and so will never correct them, which means they would sit there
 * being drawn: a HUD reporting a bag that belongs to nobody, a purse nobody
 * owns. Removing them is what makes "this client does not have that data" true
 * of the client as well as of the wire.
 *
 * A no-op for the hero's owner, who is entitled to all of it.
 */
export function stripPrivate(
  state: Record<string, unknown>,
  recipient: Recipient,
): void {
  if (recipient.ownsPlayer) return;
  const player = state.player;
  if (player && typeof player === "object") {
    for (const field of PRIVATE_PLAYER_FIELDS) {
      delete (player as Record<string, unknown>)[field];
    }
  }
  for (const field of PRIVATE_RUN_FIELDS) delete state[field];
}
