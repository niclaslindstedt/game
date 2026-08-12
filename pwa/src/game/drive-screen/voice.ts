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

import { thoughtDef, type DriveParams } from "@game/core";

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
   * last thing the leg says before the picture goes — spoken with the trip's
   * VERDICT folded in front of it (`arrivalLine`). */
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

/**
 * A thought's pages as the road's box wants them — plain string rows. None of
 * the drive's lines carries a `{ them: [...] }` block (he is alone in the car,
 * which is the whole joke), so the tagged shape is unfolded rather than
 * special-cased. An id the catalog does not have THROWS, in here as everywhere
 * else: a silent line over a road that keeps moving is a beat nobody notices
 * has gone.
 */
export function thoughtPages(id: string): string[][] {
  return thoughtDef(id).pages.map((page) => [
    ...(Array.isArray(page) ? page : page.them),
  ]);
}

/**
 * THE RUN-IN'S ONE LINE — WHAT HE MADE OF THE TRIP, AND THEN THE PLACE, SAID AS
 * ONE BREATH: "ROUGH RIDE. THERE'S GOODCO."
 *
 * TWO THOUGHT IDS, ONE PRINTED LINE, and that is the whole reason this exists.
 * The verdict is picked off the finished journey (`driveVerdict`) and the sight
 * is picked off the destination (`driveVoice`), so the pair is a different
 * combination every leg — which is exactly the thing content cannot author as
 * one entry without writing eight lines per destination. Joining them HERE
 * keeps both halves in `content/thoughts.yaml`, where a mod can replace either.
 *
 * IT IS A JOIN, NOT A SECOND PAGE. A page break here would turn one remark into
 * two beats — the box coming and going twice inside three seconds of run-in —
 * and the joke is that the review and the arrival are the same throwaway
 * sentence. It is also why the verdicts are a few words each: the join has to
 * finish printing before the picture goes (`DRIVE.arrival`), and
 * `tests/drive_bark_test.ts` is what says so.
 *
 * The verdict goes FIRST because that is the order a man speaks in — the hour
 * behind him, and then the thing that has just come into the windscreen.
 */
export function arrivalLine(verdict: string, sight: string): string[][] {
  const pages = thoughtPages(sight);
  const lead = thoughtPages(verdict)[0]?.join(" ") ?? "";
  const first = pages[0];
  if (!lead || !first?.length) return pages;
  first[0] = `${lead} ${first[0]}`;
  return pages;
}
