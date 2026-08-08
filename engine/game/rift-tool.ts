// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RIFT TOOL — the campaign's town portal, and the one thing a hero carries
// that changes where he is rather than what he can hit.
//
// THE FOUNDER drops it on Mars while running: it comes out of his coat as he
// bolts through the tear he just tore, and he is in far too much of a hurry to
// feel it go (see `docs/story.md`). From that moment the hero can tear a seam
// HOME from wherever he is standing — mid-fight, mid-level, with the horde on
// him — and step back onto exactly the ground he left.
//
// WHAT THIS MODULE OWNS IS THE HOLE, NOT THE TRIP. Tearing one puts a real
// portal on the field: a `GateState` for the crossing logic, a landmark so the
// renderer draws it with no edits at all, and a `gateOpened` event for the
// app's rupture cue — the exact three things the cow-level's blast door already
// mints (`spendGateKey`), because a hole you walk into is a hole you walk into.
// WHO travels and HOW is the app's and the session's business, and the two
// answers differ:
//
//   SOLO   the field is parked and thawed on the way back, so the run resumes
//          on the same carve with the same dead (pwa `saved-run.ts`).
//   PARTY  nothing is parked, because the field is not this hero's to freeze —
//          the session holds BOTH levels and moves this seat alone
//          (`requestSoloTravel`, `server/worlds.ts`).
//
// The gate carries `solo: true` so the app can tell those apart without
// guessing from the destination, and the event carries it too.
//
// THREE REFUSALS, and each one is a bug that would otherwise be silent:
//
//   NO TOOL      — the rig is a keepsake on the CHARACTER, handed to the run as
//                  a session parameter (`state.keepsakes`). A run that never
//                  got one has a hero who never found it.
//   ALREADY OPEN — one seam per hero. A second tear would leave the first
//                  standing with nobody to close it, and the field would fill
//                  up with doors home.
//   ALREADY HOME — the hub is what a seam leads TO. Tearing one there is a
//                  door from the garage to the garage.

import { GATES } from "./config/index.ts";
import { hubLevelId, runLevelDef } from "./defs/levels/index.ts";
import { seatOf } from "./party.ts";
import { clamp } from "@game/lib/vec.ts";
import type { GameState, Player } from "./types/index.ts";

/** The keepsake that IS the tool — the id `content/story-items.yaml` gives it. */
export const RIFT_TOOL_ID = "rift_creator";

/** The gate id a torn seam takes, per seat: one seam per hero, and a name the
 * app can recognise without inspecting the destination. */
function seamId(seat: number): string {
  return `rift_seam_home_${seat}`;
}

/**
 * Does this hero carry the rift tool?
 *
 * Read off the KEEPSAKES the run was built with rather than off the bag: the
 * rig can never be sold, dropped or lost to a death, which is the whole reason
 * it is a keepsake rather than a trinket — a town portal you can accidentally
 * vendor is a town portal that strands you.
 */
export function hasRiftTool(state: GameState): boolean {
  return state.keepsakes.includes(RIFT_TOOL_ID);
}

/**
 * Is there a seam of this hero's already standing?
 *
 * One per hero rather than one per run: in a party every seat may have their
 * own way home, and two heroes' seams are two different doors even when they
 * lead to the same garage.
 */
export function seamOf(state: GameState, actor: Player) {
  const seat = seatOf(state, actor);
  if (seat < 0) return null;
  return state.gates.find((gate) => gate.id === seamId(seat)) ?? null;
}

/** May this hero tear a seam home right now? The three refusals in the header,
 * asked in one place so the HUD's button and the command agree about when it
 * is live. */
export function canTearSeam(state: GameState, actor: Player): boolean {
  if (!hasRiftTool(state)) return false;
  if (state.level.id === hubLevelId()) return false;
  if (actor.departed || actor.hp <= 0) return false;
  return seamOf(state, actor) === null;
}

/**
 * TEAR A SEAM HOME — the tool's whole verb.
 *
 * Opens a step ahead of the hero, exactly where the blast door's key opens its
 * own gate, so the hole is in front of him rather than under his feet. Returns
 * false and mints nothing when any of the three refusals applies.
 */
export function tearSeamHome(state: GameState, actor: Player): boolean {
  if (!canTearSeam(state, actor)) return false;
  const seat = seatOf(state, actor);
  const def = runLevelDef(state);
  const to = hubLevelId();
  const pos = {
    x: clamp(actor.pos.x + GATES.summonDistance, 24, def.width - 24),
    y: clamp(actor.pos.y, 24, def.height - 24),
  };
  state.gates.push({ id: seamId(seat), to, pos, entered: false, solo: true });
  state.landmarks.push({
    kind: seamId(seat),
    sprite: "rift_seam",
    anchor: "center",
    pos: { ...pos },
  });
  state.events.push({ type: "gateOpened", pos: { ...pos }, to });
  return true;
}
