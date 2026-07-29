// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COMPILED SCORES AGAINST THE ONES THEY WERE LIFTED FROM.
//
// `content/music/` was derived from the five hand-written TypeScript score
// files by IMPORTING them and re-emitting their data, not by anyone retyping
// four thousand note tokens. The fixture fingerprints those five tracks exactly
// as they stood the moment before the lift; this fingerprints the compiled
// catalog the same way and compares.
//
// That is what makes the lift provable rather than hopeful. A wrong note is
// invisible to every other test in this repo — it builds, it typechecks, it
// ships, and it is discovered by a player who thinks the moon theme sounds a
// bit off in the second chorus.
//
// WHY A FINGERPRINT AND NOT A COPY. The level, item and enemy snapshots pin a
// compile that TRANSFORMS its input — a ramp becomes four difficulties, an item
// gets cooked — so the snapshot shows something the YAML does not say. A
// score's compile is one operation (split each authored bar line on
// whitespace), so a full snapshot would be the same data again, exploded to one
// token per line: nine times the size of the source, and harder to read than
// it. The digest is exactly as sensitive — every note, tie, rest and instrument
// setting feeds it — and the readable record of a change is the diff of
// `content/music/<id>.yaml`, laid out one bar per line for that purpose.
//
// Afterwards it keeps earning its place as the peer of the other round-trip
// guards: the YAML is the source of truth, so an intentional change to a score
// is accepted with `node scripts/update-music-snapshot.mjs`.

import { describe, expect, it } from "vitest";

import { TRACK as HQ_LOCKDOWN } from "../../pwa/src/generated/music/hq_lockdown.ts";
import { TRACK as RED_DUST } from "../../pwa/src/generated/music/red_dust.ts";
import { TRACK as REGOLITH_RIDE } from "../../pwa/src/generated/music/regolith_ride.ts";
import { TRACK as RIFT_DRIFT } from "../../pwa/src/generated/music/rift_drift.ts";
import { TRACK as TITLE } from "../../pwa/src/generated/music/title.ts";
import {
  flattenTrack,
  type ChiptuneTrack,
} from "../../pwa/src/lib/chiptune.ts";

import { trackDigest } from "../../scripts/music-data/digest.mjs";

import snapshot from "./fixtures/music-snapshot.json" with { type: "json" };

const COMPILED: Record<string, ChiptuneTrack> = {
  title: TITLE,
  regolith_ride: REGOLITH_RIDE,
  hq_lockdown: HQ_LOCKDOWN,
  red_dust: RED_DUST,
  rift_drift: RIFT_DRIFT,
};

const frozen = snapshot as Record<string, Record<string, unknown>>;

describe("the compiled music catalog", () => {
  it("ships exactly the tracks the snapshot has", () => {
    expect(Object.keys(COMPILED).sort()).toEqual(Object.keys(frozen).sort());
  });

  it.each(Object.keys(frozen))("compiles %s unchanged", (id) => {
    // Compared whole rather than digest-only, so a track that gained a section
    // or lost a voice reports THAT rather than only a different hash.
    expect(trackDigest(COMPILED[id] as ChiptuneTrack, flattenTrack)).toEqual(
      frozen[id],
    );
  });
});
