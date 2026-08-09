// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CAN THIS PLAYER SEE THAT SPOT — the one question every automatic pick in the
// game has to ask before it aims at anything, and the module that answers it.
//
// It has TWO halves, and for years only one of them was enforced:
//
//   THE FOG — has this ground been walked at all (`fog.ts` `clearOfFog`).
//   THE SCREEN — is it inside the rect the player's camera is showing them
//   right now (`Player.view`).
//
// The fog alone is not the answer, because the fog NEVER ROLLS BACK. Ten
// seconds into a level a hero has uncovered more floor than a phone held
// sideways can show (`MAP.revealRadius` is 160 world px, half a landscape
// screen is ~211 across and ~130 down — the 422×195 canvas with its depth axis
// divided by the pitch, see render/tilt.ts `worldViewRect`), and from then on
// "explored" says yes to most of the map. So a power with a 300 px reach — the
// volley, the storm, the singularity, the sentry grid, the well's hunt —
// happily marked a monster two screens north that the player had no picture
// of: shots left the hero toward nothing, damage numbers rose off the top of
// the frame, and a fight the player could not see decided how the run went.
// That is the character acting on knowledge the player does not have, which is
// the same objection the fog rule was written for; it just needed the other
// half.
//
// EVERY PICK GOES THROUGH `visibleTo`. Not `clearOfFog` on its own — that is
// this function's fog half and answers a narrower question. The one exception
// is a pick that is already anchored to something the player is looking at (a
// chain leaping off a body a visible shot grounded in, an echo re-striking the
// foe the primary blow left standing): those follow a mark, they do not choose
// one.
//
// A HERO WITH NO CAMERA IS NOT BLIND. Absent a view the screen half abstains
// entirely rather than refusing everything — headless runs (the engine tests,
// `simulate --view none`) have no screen to be off, and gating them on a rect
// nobody reported would leave a hero unable to fight at all.

import type { Vec2 } from "@game/lib/vec.ts";
import { clearOfFog } from "./fog.ts";
import type { GameState, Player, ViewRect } from "./types/index.ts";

/** Is a world position inside a camera rect? */
export function insideView(pos: Vec2, view: ViewRect): boolean {
  return (
    pos.x >= view.x &&
    pos.x <= view.x + view.width &&
    pos.y >= view.y &&
    pos.y <= view.y + view.height
  );
}

/**
 * THE CAMERA THIS HERO IS WATCHING THROUGH, or undefined if nobody is watching
 * through one.
 *
 * The hero's own rect first, because eight clients have eight of them and a
 * joiner gated on the host's screen could not fight from the far side of a
 * room. `state.view` (seat 0's) is the fallback for the passes that ask about a
 * hero the app never stamped one onto — a party member on a host that only
 * reports its own camera, which is every current shell — and solo the two are
 * the same rect anyway.
 */
export function heroView(
  state: GameState,
  hero: Player | undefined,
): ViewRect | undefined {
  return hero?.view ?? state.view;
}

/**
 * IS `pos` SOMEWHERE `hero` CAN SEE — on their screen AND clear of the fog?
 *
 * The gate every automatic target pick runs, and the reason it takes the HERO
 * rather than a rect: whose screen it is, is the whole question in a party, and
 * a parameter cannot be forgotten the way a fifth optional argument can.
 *
 * The screen test goes first — comparing four numbers is cheaper than sweeping
 * the fog's neighbourhood grid — and both are cheap enough to run per candidate
 * at horde scale, which is what they do.
 */
export function visibleTo(
  state: GameState,
  hero: Player | undefined,
  pos: Vec2,
): boolean {
  const view = heroView(state, hero);
  if (view && !insideView(pos, view)) return false;
  return clearOfFog(state, pos);
}
