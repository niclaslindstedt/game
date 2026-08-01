// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH TRAVEL-DOOR LANDMARKS THIS RUN MUST NOT SHOW — the rift seam before
// THE FOUNDER's RIFT CREATOR has come home. The engine carves the landmark on
// every run (the door is level data), but whether THIS character has earned
// the sight of it is app knowledge (`hasKeepsake`), so GameScreen computes
// the hidden set at run mount and the landmark pass + the field tap both
// read it here. A module-level cell in the local-seat mold: one value per
// mounted run, written before the first frame, read sixty times a second.

let hidden: ReadonlySet<string> = new Set();

/** GameScreen, at run mount: the travel-door landmark kinds whose `requires`
 * keepsake the character has not banked yet. */
export function setHiddenLandmarks(kinds: Iterable<string>): void {
  hidden = new Set(kinds);
}

/** Is this landmark kind hidden from sight (and from field taps) this run? */
export function isLandmarkHidden(kind: string): boolean {
  return hidden.has(kind);
}
