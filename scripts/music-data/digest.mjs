// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A SCORE'S FINGERPRINT — what the round-trip guard pins instead of a copy of
// the score.
//
// The other catalogs snapshot themselves whole, and earn it: a level's ramp
// becomes four difficulties, an item gets cooked, so the snapshot shows
// something the YAML does not say. A score's compile is ONE operation — split
// each authored bar line on whitespace — so a full snapshot is the same data
// again, exploded to one token per line, nine times the size of the source and
// strictly harder to read than it.
//
// A digest over the FLATTENED stream is exactly as sensitive: every note, every
// tie, every rest and every instrument setting feeds it, so one changed
// sixteenth flips it. What it gives up is naming the bar — and the bar is
// already named, readably, by the diff of `content/music/<id>.yaml`, which is
// laid out one bar per line for precisely that reason.
//
// The shape numbers ride along because they are what a person reads when the
// digest does flip: a track that gained a section, lost a voice or changed
// tempo says so here rather than only as a different hash.

import { createHash } from "node:crypto";

/**
 * Fingerprint one `ChiptuneTrack`.
 *
 * @param track    the cooked track
 * @param flatten  `flattenTrack` from the chiptune sequencer, passed in so this
 *                 module stays free of the app's import graph (the update
 *                 script runs under plain node, the test under vitest)
 */
export function trackDigest(track, flatten) {
  const flat = flatten(track);
  // Ordered by instrument NAME rather than by authored order: the two are the
  // same set of voices played at the same instants either way, and pinning the
  // authoring order would make reordering the instruments block — which no
  // listener can hear — read as a changed score.
  const names = Object.keys(track.instruments).sort();
  const byName = new Map(
    Object.keys(track.instruments).map((name, i) => [name, flat.voices[i]]),
  );
  const material = JSON.stringify(
    names.map((name) => {
      const voice = byName.get(name);
      return [name, voice.instrument, voice.tokens.join(" ")];
    }),
  );

  return {
    bpm: track.bpm,
    stepsPerBeat: track.stepsPerBeat,
    instruments: names,
    order: track.order,
    totalSteps: flat.totalSteps,
    loopSeconds:
      Math.round(
        (flat.totalSteps / (track.stepsPerBeat * track.bpm)) * 60 * 10,
      ) / 10,
    digest: createHash("sha256").update(material).digest("hex"),
  };
}
