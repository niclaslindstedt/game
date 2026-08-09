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
// THE ENGINE NAMES NEITHER OF THESE. It raises `monologue` and `sight` — the
// two beats a road has — and the words are content (`content/thoughts.yaml`),
// which is the same fence every other line in this game is drawn along.

import type { DriveParams } from "@game/core";

/**
 * The two thoughts one leg has room for.
 *
 * THERE IS NO THIRD, and there used to be: a line said standing on the tarmac
 * beside a car with its engine ticking. A leg ends on a FADE with the wagon
 * still rolling now — the level on the far side of the black opens on a parked
 * car with the man beside it, so playing the parking here showed the same
 * arrival twice.
 */
export type DriveVoice = {
  /** On the outskirts, before there is anybody to say it about — the one time
   * the player is told why any of this is happening. */
  monologue: string;
  /** Through the windscreen on the run-in, with the place growing in it, and the
   * last thing the leg says before the picture goes. */
  sight: string;
};

/** Keyed by the level the leg is bound for (`DriveParams.to`). */
const VOICES: Record<string, DriveVoice> = {
  goodco_hq: {
    monologue: "drive_out_welfare",
    sight: "drive_arrive_goodco",
  },
  garage: {
    monologue: "drive_home_errand",
    sight: "drive_arrive_home",
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
