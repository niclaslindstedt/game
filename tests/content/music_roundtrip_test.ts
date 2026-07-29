// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COMPILED SCORES AGAINST THE ONES THEY WERE LIFTED FROM.
//
// `content/music/` was derived from the five hand-written TypeScript score
// files by IMPORTING them and re-emitting their data, not by anyone retyping
// four thousand note tokens. The fixture is those five tracks exactly as they
// stood the moment before the lift; this replays the compiled catalog against
// it, both as data and as the flattened token stream the sequencer actually
// plays.
//
// That is what makes the lift provable rather than hopeful. A wrong note is
// invisible to every other test in this repo — it builds, it typechecks, it
// ships, and it is discovered by a player who thinks the moon theme sounds a
// bit off in the second chorus. Here it is a diff, and it names the bar.
//
// Afterwards it keeps earning its place as the peer of the level, enemy, item
// and powerup round-trip guards: the YAML is the source of truth, so an
// intentional change to a score is accepted with
// `node scripts/update-music-snapshot.mjs`.

import { describe, expect, it } from "vitest";

import {
  flattenTrack,
  type ChiptuneTrack,
} from "../../pwa/src/lib/chiptune.ts";
import { TRACK as HQ_LOCKDOWN } from "../../pwa/src/generated/music/hq_lockdown.ts";
import { TRACK as RED_DUST } from "../../pwa/src/generated/music/red_dust.ts";
import { TRACK as REGOLITH_RIDE } from "../../pwa/src/generated/music/regolith_ride.ts";
import { TRACK as RIFT_DRIFT } from "../../pwa/src/generated/music/rift_drift.ts";
import { TRACK as TITLE } from "../../pwa/src/generated/music/title.ts";

import snapshot from "./fixtures/music-snapshot.json" with { type: "json" };

const COMPILED: Record<string, ChiptuneTrack> = {
  title: TITLE,
  regolith_ride: REGOLITH_RIDE,
  hq_lockdown: HQ_LOCKDOWN,
  red_dust: RED_DUST,
  rift_drift: RIFT_DRIFT,
};

const frozen = snapshot as unknown as Record<string, ChiptuneTrack>;

describe("the compiled music catalog", () => {
  it("ships exactly the tracks the snapshot has", () => {
    expect(Object.keys(COMPILED).sort()).toEqual(Object.keys(frozen).sort());
  });

  it.each(Object.keys(frozen))("compiles %s to the same track", (id) => {
    expect(COMPILED[id]).toEqual(frozen[id]);
  });

  it.each(Object.keys(frozen))("plays %s to the same steps", (id) => {
    // The data being equal implies this, but only via the flattener — which is
    // the half that turns an authored bar block into what is scheduled, and
    // the half a change to the loader could quietly move.
    //
    // Both sides are flattened with their instruments in the SAME order first:
    // `flattenTrack` emits one voice per instrument key in insertion order, the
    // fixture is written as canonical JSON (keys sorted), and a track keeps the
    // order it was authored in. Nothing hears the difference — a step's voices
    // are booked at one instant either way — so ordering them here is what
    // leaves the assertion about the token streams, which is the part that
    // matters.
    const ordered = (t: ChiptuneTrack): ChiptuneTrack => ({
      ...t,
      instruments: Object.fromEntries(
        Object.entries(t.instruments).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
    });
    expect(flattenTrack(ordered(COMPILED[id] as ChiptuneTrack))).toEqual(
      flattenTrack(ordered(frozen[id] as ChiptuneTrack)),
    );
  });
});
