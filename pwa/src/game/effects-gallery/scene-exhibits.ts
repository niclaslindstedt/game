// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCENES SHELF — every cutscene the campaign plays, on the shelf beside the
// explosions.
//
// **IT EXISTS BECAUSE A SCENE COULD NOT BE LOOKED AT WITH ANYTHING ELSE.** The
// workbench (`?cutscene=<id>`) plays exactly one and you have to know its id to
// type it; a prelude otherwise only happens on the way into a level you have
// unlocked, and a `farewell` only when a boss falls. Everything else visual in
// this game has had a display case since the gallery was built — the cutscenes,
// which are the most authored pictures in it, had none. Now `make gallery`
// sheets them with the rest.
//
// **A SHELF ENTRY IS A SCENE PLUS THE RUN THAT IS WATCHING IT.** The garage
// launch is the case that forces it: the same timeline, played beside a house
// that is whole the first time, burnt twice over once the moon and the
// homecoming are behind him, and a gutted shell after Mars — three genuinely
// different pictures out of one file (`CutsceneProp.needs` / `until`, matched
// against `tags`). One exhibit per scene would show opening night and quietly
// claim that was the scene.
//
// **THE TABLE IS HAND-AUTHORED BECAUSE A SCENE HAS NO NAME.** A `CutsceneDef`
// carries a stage, a cast and a timeline — there is nothing in it to title a
// shelf row with, and nothing to say what a viewer should be looking AT, which
// is what a blurb is for. So the words are written here and
// `tests/content/effects_gallery_test.ts` holds the table to the authored
// scenes: add a `content/cutscenes/*.yaml` and the suite fails until it has a
// row.

import type { CutsceneExhibit, Exhibit } from "./exhibit-kit.ts";

/**
 * HOW LONG EACH SCENE IS WORTH PHOTOGRAPHING (ms) — every timed beat it runs,
 * plus the host's reading dwell for each held page, plus its walks, LESS the
 * fade to black it goes out on.
 *
 * IT IS NOT A LOOP LENGTH. The host replays when the SCENE ENDS, because a
 * cutscene knows when it is over and nothing else does; `showMs` is read by the
 * contact-sheet script alone, to spread a `--strip` across the show. Sized like
 * an explosion — the catalog's 1400 ms default — every sheet of this shelf would
 * be six frames of the same opening fade.
 *
 * THE CLOSING FADE COMES OFF because every scene in the game ends on one, and a
 * strip whose last cell is authored black spends a quarter of the sheet saying
 * nothing. Measured rather than guessed: scenes are the one exhibit that is
 * READ, and they run ten to thirty times longer than anything else in here.
 */
const RUNS_MS = {
  prelude: 40_350,
  launch: 16_700,
  voyage_moon: 16_100,
  moon_depart: 22_500,
  earth_return: 17_100,
  voyage_mars: 13_500,
  rift_entry: 12_400,
  rift_exit: 13_500,
} as const;

const SCENES: readonly CutsceneExhibit[] = [
  {
    kind: "scene",
    id: "scene-prelude",
    sceneId: "prelude",
    icon: "icon_ada_message",
    label: "THE NIGHT SHE LEFT",
    blurb: "THE LIVING ROOM - THE NOTE, THE WALL, AND THE PART HE STILL NEEDS",
    group: "SCENES",
    keywords: ["cutscene", "prelude", "opening", "ada", "livingroom", "story"],
    showMs: RUNS_MS.prelude,
  },
  {
    kind: "scene",
    id: "scene-launch",
    sceneId: "launch",
    icon: "rocket",
    label: "THE LAUNCH",
    blurb:
      "FIRST LIFT-OFF - THE BLAST BLACKS HIS OWN GARAGE AND LIGHTS ITS ROOF",
    group: "SCENES",
    keywords: ["cutscene", "garage", "rocket", "exhaust", "soot", "fire"],
    showMs: RUNS_MS.launch,
  },
  {
    kind: "scene",
    id: "scene-voyage-moon",
    sceneId: "voyage_moon",
    icon: "sky_moon",
    label: "THE VOYAGE - LEG ONE",
    blurb: "DEEP SPACE - EARTH SHRINKING BEHIND, THE STARFIELD ON PARALLAX",
    group: "SCENES",
    keywords: ["cutscene", "transit", "space", "parallax", "drift", "stars"],
    showMs: RUNS_MS.voyage_moon,
  },
  {
    kind: "scene",
    id: "scene-moon-depart",
    sceneId: "moon_depart",
    icon: "flag",
    label: "THE MOON LETS GO",
    blurb: "THE GHOST'S SEND-OFF, AND THE SAME ASCENT OVER REGOLITH",
    group: "SCENES",
    keywords: ["cutscene", "farewell", "moon", "flagbearer", "ghost", "ascent"],
    showMs: RUNS_MS.moon_depart,
  },
  {
    kind: "scene",
    id: "scene-earth-return",
    sceneId: "earth_return",
    icon: "sky_earth",
    label: "THE HOMECOMING",
    blurb:
      "THE LAUNCH BACKWARDS - HE LANDS ON THE PAD AND BURNS THE HOUSE AGAIN",
    group: "SCENES",
    keywords: ["cutscene", "landing", "garage", "descent", "soot", "return"],
    showMs: RUNS_MS.earth_return,
  },
  {
    // THE SAME FILE AS `scene-launch`, two fires later. It is a separate row
    // rather than a note on that one because the difference is a PICTURE, and a
    // picture you cannot put in the sheet is a picture nobody checks.
    kind: "scene",
    id: "scene-launch-burnt",
    sceneId: "launch",
    tags: ["cleared:moon"],
    icon: "garage_house_burnt2",
    label: "THE LAUNCH - TWO FIRES ON",
    blurb: "THE MARS LIFT-OFF, BESIDE WHAT THE FIRST TWO LEFT OF THE HOUSE",
    group: "SCENES",
    keywords: ["cutscene", "garage", "burnt", "mars", "soot", "ladder"],
    showMs: RUNS_MS.launch,
  },
  {
    kind: "scene",
    id: "scene-launch-gutted",
    sceneId: "launch",
    tags: ["cleared:mars"],
    icon: "garage_house_burnt3",
    label: "THE LAUNCH - GUTTED",
    blurb: "THE LAST RUNG - ROOF IN, DOOR GONE, AND THE LAMP STILL ON",
    group: "SCENES",
    keywords: ["cutscene", "garage", "gutted", "burnt", "soot", "ladder"],
    showMs: RUNS_MS.launch,
  },
  {
    kind: "scene",
    id: "scene-voyage-mars",
    sceneId: "voyage_mars",
    icon: "sky_mars",
    label: "THE VOYAGE - LEG TWO",
    blurb: "THE MOON FALLING BEHIND, THE RED PLANET GROWING AHEAD",
    group: "SCENES",
    keywords: ["cutscene", "transit", "space", "mars", "parallax", "stars"],
    showMs: RUNS_MS.voyage_mars,
  },
  {
    kind: "scene",
    id: "scene-rift-entry",
    sceneId: "rift_entry",
    icon: "rift",
    label: "INTO THE TEAR",
    blurb: "THE PORTAL FOLDING - THE SAME CHURN THE FIELD DRAWS OVER IT",
    group: "SCENES",
    keywords: ["cutscene", "rift", "portal", "tear", "founder", "chase"],
    showMs: RUNS_MS.rift_entry,
  },
  {
    kind: "scene",
    id: "scene-rift-exit",
    sceneId: "rift_exit",
    icon: "icon_tin_star",
    label: "OUT THE OTHER SIDE",
    blurb: "STEPPING OUT OF THE TEAR AND INTO SOMEBODY ELSE'S CENTURY",
    group: "SCENES",
    keywords: ["cutscene", "rift", "portal", "boothill", "western", "arrival"],
    showMs: RUNS_MS.rift_exit,
  },
];

export function sceneExhibits(): Exhibit[] {
  return [...SCENES];
}
