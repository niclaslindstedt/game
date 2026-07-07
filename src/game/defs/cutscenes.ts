// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cutscene catalog. A cutscene is pure data played by the generic
// @game/lib/cutscene player: a stage, a cast, and a timeline of beats.
// Levels reference a scene by id via `LevelDef.prelude`; the app can also
// jump straight to one with the `?cutscene=<id>` URL param, and
// `website/scripts/cutscene-preview.mjs` screenshots every beat for review.
// Adding a scene = adding an entry here plus its sprites — no engine changes.

import type { CutsceneDef } from "@game/lib/cutscene.ts";

/**
 * THE PRELUDE — the night everything started. Movie night: Ada heads out
 * for chips and soda, the hero holds the couch, and the snacks never come
 * back. Sets up level 1 (the SpaceZ HQ raid for the drive ingredient) and
 * the beacon-in-her-jacket thread the moon level picks up.
 *
 * Stage is 224×126 world px, drawn ×3 — a tight interior so the 16px cast
 * has real presence. Side view: positions are bottom-anchored (pos.y is
 * where a thing meets the floor; the renderer paints back to front by y).
 * The couch faces the TV on the left; the front door is on the far right;
 * the moon hangs in the window, waiting for level 2.
 */
const PRELUDE: CutsceneDef = {
  id: "prelude",
  stage: {
    width: 224,
    height: 126,
    backdrop: "livingRoom",
    props: [
      { kind: "window", pos: { x: 112, y: 52 } },
      { kind: "door", pos: { x: 196, y: 80 } },
      { kind: "tv", pos: { x: 36, y: 92 } },
      { kind: "couch", pos: { x: 104, y: 96 } },
      { kind: "lamp", pos: { x: 160, y: 88 } },
      { kind: "table", pos: { x: 66, y: 112 } },
    ],
  },
  actors: [
    // The hero never leaves the couch — that is the whole joke.
    {
      id: "hero",
      sprite: "hero_couch",
      // One px below the couch anchor: painted after it, reading as seated
      // in front of the backrest instead of hidden behind the cushions.
      at: { x: 98, y: 97 },
      faceLeft: true,
    },
    { id: "ada", sprite: "ada", at: { x: 130, y: 102 }, faceLeft: true },
  ],
  beats: [
    { kind: "fade", to: 1, ms: 0 }, // open on black…
    { kind: "fade", to: 0, ms: 900 }, // …and reveal the living room
    { kind: "caption", text: ["FRIDAY NIGHT. MOVIE NIGHT."] },
    {
      kind: "say",
      actor: "ada",
      text: ["WE'RE OUT OF CHIPS.", "AND SODA."],
    },
    { kind: "say", actor: "hero", text: ["MOVIE'S STARTING."] },
    {
      kind: "say",
      actor: "ada",
      text: ["FIVE MINUTES.", "KEEP MY SPOT WARM."],
    },
    { kind: "move", actor: "ada", to: { x: 156, y: 110 }, speed: 40 },
    { kind: "move", actor: "ada", to: { x: 195, y: 88 }, speed: 40 },
    { kind: "wait", ms: 350 },
    { kind: "exit", actor: "ada" },
    { kind: "wait", ms: 900 },
    {
      kind: "caption",
      text: ["SHE TOOK HER JACKET.", "THE ONE I FIXED THE ZIPPER ON."],
    },
    { kind: "fade", to: 0.85, ms: 700 },
    { kind: "caption", text: ["TWO HOURS LATER."] },
    { kind: "fade", to: 0, ms: 700 },
    { kind: "say", actor: "hero", text: ["..."] },
    { kind: "say", actor: "hero", text: ["ADA?"] },
    { kind: "wait", ms: 600 },
    { kind: "caption", text: ["SHE NEVER CAME BACK."] },
    { kind: "fade", to: 1, ms: 1300 },
  ],
};

export const CUTSCENE_DEFS: Record<string, CutsceneDef> = {
  prelude: PRELUDE,
};

/** Look up a cutscene def; throws on a broken id so bugs surface loudly. */
export function cutsceneDef(id: string): CutsceneDef {
  const def = CUTSCENE_DEFS[id];
  if (!def) throw new Error(`unknown cutscene "${id}"`);
  return def;
}
