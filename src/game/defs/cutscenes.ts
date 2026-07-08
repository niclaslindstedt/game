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
 * The couch sits center-stage with BOTH of them on it, watching the TV off
 * to the left; the coffee table sits between the sofa and the set; the front
 * door is on the far right; the moon hangs in the window, waiting for level 2.
 */
const PRELUDE: CutsceneDef = {
  id: "prelude",
  stage: {
    width: 224,
    height: 126,
    backdrop: "livingRoom",
    palette: { wall: "#262838", floor: "#4a3a2c", trim: "#1a1c28", floorY: 78 },
    props: [
      { kind: "window", pos: { x: 150, y: 52 } },
      // The crude sword, mounted on the back wall the whole scene — the one
      // thing the hero owns worth taking, and what he lands on the moon with
      // (his starting weapon; see defs/equipment.ts `crude_sword`).
      { kind: "wall_sword", pos: { x: 178, y: 54 } },
      { kind: "door", pos: { x: 202, y: 80 } },
      // The set they are watching, hard left; the couch faces it, the coffee
      // table sits in the gap between them.
      { kind: "tv", pos: { x: 30, y: 94 } },
      { kind: "table", pos: { x: 74, y: 108 } },
      { kind: "couch", pos: { x: 116, y: 96 } },
      { kind: "lamp", pos: { x: 168, y: 90 } },
    ],
  },
  actors: [
    // Both of them on the sofa for movie night, side by side, watching the TV
    // off to the left — the hero never gets up, which is the whole joke. Their
    // pos.y sits a hair below the couch's floor anchor so they paint just in
    // front of the backrest (seated on it, not hidden behind the cushions).
    {
      id: "hero",
      name: "ME",
      sprite: "hero_couch",
      at: { x: 108, y: 97 },
      faceLeft: true,
    },
    {
      id: "ada",
      name: "ADA",
      // Seated beside him in her red jacket; a `pose` beat stands her up
      // (swapping to the walking `ada` sprite) when she heads for the store.
      sprite: "ada_couch",
      at: { x: 124, y: 97 },
      faceLeft: true,
    },
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
    // Up off the couch (swap to the standing/walking sprite) and out the door.
    { kind: "pose", actor: "ada", sprite: "ada" },
    { kind: "move", actor: "ada", to: { x: 150, y: 112 }, speed: 42 },
    { kind: "move", actor: "ada", to: { x: 201, y: 88 }, speed: 42 },
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
    { kind: "wait", ms: 500 },
    // He takes the one thing off the wall worth taking. The blade is what he
    // brings to save her — his default weapon when the moon level opens.
    {
      kind: "caption",
      text: [
        "THE OLD SWORD OFF THE WALL.",
        "IT'S ALL I NEED TO BRING HER HOME.",
      ],
    },
    { kind: "fade", to: 1, ms: 1300 },
  ],
};

export const CUTSCENE_DEFS: Record<string, CutsceneDef> = {
  prelude: PRELUDE,
};

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeCutsceneDefs: Record<string, CutsceneDef> = CUTSCENE_DEFS;

/** Test/authoring hook: replace the active cutscene catalog. */
export function setCutsceneDefs(defs: Record<string, CutsceneDef>): void {
  activeCutsceneDefs = defs;
}

/** Look up a cutscene def; throws on a broken id so bugs surface loudly. */
export function cutsceneDef(id: string): CutsceneDef {
  const def = activeCutsceneDefs[id];
  if (!def) throw new Error(`unknown cutscene "${id}"`);
  return def;
}
