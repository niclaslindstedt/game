// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IN-SESSION PARTY TRAVEL (multiplayer plan §6.4) — the verb half.
//
// A crossing used to be the APP's alone: bank the hero, drop the mount, build
// a fresh run. That still is the whole story for a local run — but a hosted
// SESSION cannot be re-mounted around, because tearing the session down is
// what disconnects every joiner it was hosting. So when a party is aboard,
// the crossing becomes a REQUEST on the run (`GameState.pendingTravel`) and
// the SESSION performs the swap between ticks: every seat's loadout is
// extracted, the next level is built from the same parameters with a derived
// seed, the party is re-seated in the same order, and every client is
// re-baselined with a full snapshot. See `server/session.ts` for that half.
//
// THE HOST CHOOSES THE ROAD. The request is refused for any seat but 0 — the
// same authority the chat's `/kick` reads off slot 0 — and a joiner's picker
// already says so in as many words (`TravelPanel`'s "THE HOST CHOOSES THE
// ROAD").

import { hasLevel } from "./defs/levels/summary.ts";
import { seatOf } from "./party.ts";
import type { GameState, Player } from "./types/index.ts";

/**
 * Ask the run to travel to `dest` — the host's half of an in-session crossing.
 *
 * `skip` is how much of the destination's opening to skip, in `OpeningSkip`'s
 * own words ("none" | "story" | "all") — the HOST's app computes it from its
 * own character exactly as a locally-built run would, and anything
 * unrecognized is read as "none" downstream (a wire value is a claim). The
 * request itself is a field on the state rather than an act: nothing in
 * `step()` reads it, so a local run that never consumes one is byte-identical
 * with or without this module.
 */
export function requestTravel(
  state: GameState,
  actor: Player,
  dest: string,
  skip: string,
): boolean {
  if (seatOf(state, actor) !== 0) return false;
  if (!hasLevel(dest) || dest === state.level.id) return false;
  state.pendingTravel = { to: dest, skip };
  return true;
}
