// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE HERO SAYS ON THIS PARTICULAR LEG — the three thoughts a road has
// room for, chosen by where it is going.
//
// THE TWO LEGS ARE NOT THE SAME TRIP AND MUST NOT SOUND LIKE IT. Driving OUT he
// is going to work with an errand in his head and an opinion about the people
// he is about to drive through; driving BACK he has the part in the passenger
// footwell and one thing on his mind, and the crowd is not it — a man does not
// have the same thought about beggars twice in one evening, and hearing him
// deliver it again on the way home would turn the sourest line in the game into
// a catchphrase. So the road home says its own thing, once, and then shuts up.
//
// A TABLE RATHER THAN A BRANCH IN THE DRAIN, and keyed on the DESTINATION rather
// than on the direction, for the reason `sites.ts` is: what a leg is about is a
// property of where it is going. A third destination is one more row here beside
// one more layout there, and the drain (`loop.ts`) never learns there was a
// second one.
//
// THE ENGINE NAMES NONE OF THESE. It raises `monologue`, `sight` and
// `atTheDoor` — three beats on a road — and the words are content
// (`content/thoughts.yaml`), which is the same fence every other line in this
// game is drawn along.

import type { DriveParams } from "@game/core";

/** The three thoughts one leg has room for. */
export type DriveVoice = {
  /** On the outskirts, before there is anybody to say it about — the one time
   * the player is told why any of this is happening. */
  monologue: string;
  /** Through the windscreen on the run-in, with the place growing in it. */
  sight: string;
  /** …and standing on the tarmac beside a car with its engine ticking, which is
   * the last thing the minigame does. */
  door: string;
};

/** Keyed by the level the leg is bound for (`DriveParams.to`). */
const VOICES: Record<string, DriveVoice> = {
  goodco_hq: {
    monologue: "drive_out_welfare",
    sight: "drive_arrive_goodco",
    door: "drive_arrive_door",
  },
  garage: {
    monologue: "drive_home_errand",
    sight: "drive_arrive_home",
    door: "drive_arrive_ship",
  },
};

/**
 * The lines this leg is driven to.
 *
 * The fallback is the road out, and it is a belt on a fastened belt: a drive is
 * only ever built for a destination the road has (`legDirection`, begin.ts),
 * which is exactly the two rows above.
 */
export function driveVoice(params: Pick<DriveParams, "to">): DriveVoice {
  return VOICES[params.to] ?? VOICES.goodco_hq!;
}
