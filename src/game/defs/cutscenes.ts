// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cutscene catalog. A cutscene is pure data played by the generic
// @game/lib/cutscene player: a stage, a cast, and a timeline of beats.
// Levels reference a scene by id via `LevelDef.prelude`; the app can also
// jump straight to one with the `?cutscene=<id>` URL param, and
// `website/scripts/cutscene-preview.mjs` screenshots every beat for review.
// Adding a scene = adding an entry here plus its sprites — no engine changes.

import type { CutsceneDef } from "@game/lib/cutscene.ts";

/**
 * What hangs on the living-room wall in the prelude, per DIFFICULTY — kept in
 * lockstep with each rung's `startingWeapon` (defs/difficulties.ts) so the
 * scene always shows the exact piece the run starts with: `prop` is the
 * mounted wall sprite, `take` the caption when the hero pulls it down.
 * MEDIUM is the base `prelude` scene; the other rungs register
 * `prelude_<difficulty>` variants that `cutsceneVariant` resolves at run
 * creation.
 */
const WALL_ARMS = {
  easy: {
    prop: "wall_fire_extinguisher",
    take: [
      "THE OLD EXTINGUISHER OFF THE WALL.",
      "IT'S ALL I NEED TO BRING HER HOME.",
    ],
  },
  medium: {
    prop: "wall_medieval_sword",
    take: ["THE OLD SWORD OFF THE WALL.", "IT'S ALL I NEED TO BRING HER HOME."],
  },
  hard: {
    prop: "wall_combat_knife",
    take: ["THE COMBAT KNIFE OFF THE WALL.", "IT'LL HAVE TO BE ENOUGH."],
  },
  nightmare: {
    prop: "wall_brass_knuckles",
    take: ["THE KNUCKLES OFF THE WALL.", "THEY'LL HAVE TO BE ENOUGH."],
  },
  jesus: {
    prop: "wall_stick",
    take: ["THE STICK OFF THE WALL.", "GOD HELP US BOTH."],
  },
} satisfies Record<string, { prop: string; take: string[] }>;

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
 *
 * Built once per difficulty: the scene is identical except for the weapon
 * mounted on the back wall and the caption when the hero takes it down —
 * always the run's actual starting weapon.
 */
function buildPrelude(
  id: string,
  arms: { prop: string; take: string[] },
): CutsceneDef {
  return {
    id,
    stage: {
      width: 224,
      height: 126,
      backdrop: "livingRoom",
      palette: {
        wall: "#262838",
        floor: "#4a3a2c",
        trim: "#1a1c28",
        floorY: 78,
      },
      props: [
        { kind: "window", pos: { x: 150, y: 52 } },
        // The starting weapon, mounted on the back wall the whole scene — the
        // one thing the hero owns worth taking, and what he fights with until
        // the run yields better (DifficultyDef.startingWeapon).
        { kind: arms.prop, pos: { x: 178, y: 54 } },
        { kind: "door", pos: { x: 202, y: 80 } },
        // The set they are watching, off to the left; the couch faces it, the
        // coffee table sits in the gap between them. TV and couch are pulled
        // toward each other so the pair reads as actually watching it, not
        // marooned across the room.
        { kind: "tv", pos: { x: 44, y: 94 } },
        { kind: "table", pos: { x: 76, y: 108 } },
        { kind: "couch", pos: { x: 104, y: 96 } },
        { kind: "lamp", pos: { x: 168, y: 90 } },
      ],
    },
    actors: [
      // Both of them on the sofa for movie night, side by side, watching the
      // TV off to the left — the hero never gets up, which is the whole joke.
      // Their pos.y sits a hair below the couch's floor anchor so they paint
      // just in front of the backrest (seated on it, not hidden behind the
      // cushions). pos.y drives paint order AND floor placement together, so
      // it can't be raised to lift them onto the cushions without dropping
      // them behind the couch — instead the seated sprites carry a tall
      // transparent footer (sprites/prelude/*.yaml) that lifts the figure up
      // onto the seat while the anchor stays at floor level.
      {
        id: "hero",
        name: "ME",
        sprite: "hero_couch",
        at: { x: 96, y: 97 },
        faceLeft: true,
      },
      {
        id: "ada",
        name: "ADA",
        // Seated beside him in her red jacket; a `pose` beat stands her up
        // (swapping to the walking `ada` sprite) when she heads for the store.
        sprite: "ada_couch",
        at: { x: 112, y: 97 },
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
      // Up off the couch (swap to the standing/walking sprite), out the door.
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
      // He takes the one thing off the wall worth taking. Whatever the
      // difficulty hung there is what he brings to save her.
      { kind: "caption", text: arms.take },
      { kind: "fade", to: 1, ms: 1300 },
    ],
  };
}

/**
 * A starless-void stage for the space-transit scenes: wall and floor share
 * one deep-space color (the floor line is pushed to the bottom edge and
 * painted the same, so no horizon shows) and the stars/planets are props.
 */
const SPACE_PALETTE = {
  wall: "#070911",
  floor: "#070911",
  trim: "#070911",
  floorY: 124,
};

/**
 * THE LAUNCH — between SpaceZ HQ and the moon, part one. The garage at
 * night: the ship he spent ten years building finally has its engine part,
 * and the hero leaves home the same way Ada did — out the door, no plan to
 * be long. The ship is an ACTOR (actors can move; props can't): parked cold
 * through the goodbye, posed to its firing frames for the liftoff.
 */
const LAUNCH: CutsceneDef = {
  id: "launch",
  stage: {
    width: 224,
    height: 126,
    backdrop: "garageNight",
    palette: { wall: "#0e1020", floor: "#20281c", trim: "#0a0c14", floorY: 88 },
    props: [
      // The sky barely rides the ascent pan (low parallax) while the house
      // and lawn fall away at full depth — the moon that hung in the
      // living-room window is now the plan.
      { kind: "sky_moon", pos: { x: 196, y: 34 }, parallax: 0.05 },
      { kind: "stars_a", pos: { x: 32, y: 26 }, parallax: 0.15 },
      { kind: "stars_b", pos: { x: 120, y: 20 }, parallax: 0.15 },
      { kind: "stars_b", pos: { x: 168, y: 44 }, parallax: 0.15 },
      { kind: "stars_a", pos: { x: 82, y: 46 }, parallax: 0.15 },
      // Home, garage door up — the ship rolled out onto the back lawn.
      { kind: "garage_house", pos: { x: 46, y: 98 } },
    ],
  },
  actors: [
    {
      id: "hero",
      name: "ME",
      sprite: "hero_tee",
      at: { x: 74, y: 102 },
    },
    // The garage ship — the mars level's parked `starship`, ten years
    // younger. Poses to `ship_fire` when the engine lights.
    { id: "ship", sprite: "ship", at: { x: 172, y: 100 } },
  ],
  beats: [
    { kind: "fade", to: 1, ms: 0 },
    { kind: "fade", to: 0, ms: 900 },
    {
      kind: "caption",
      text: [
        "TEN YEARS OF WEEKENDS",
        "IN THE GARAGE. SHE ONLY",
        "EVER NEEDED ONE MORE PART.",
      ],
    },
    { kind: "move", actor: "hero", to: { x: 150, y: 102 }, speed: 40 },
    {
      kind: "say",
      actor: "hero",
      text: [
        "ENGINE. FUEL. DUCT TAPE.",
        "AND THE PART THEY SAID",
        "I COULDN'T HAVE.",
      ],
    },
    { kind: "move", actor: "hero", to: { x: 166, y: 102 }, speed: 40 },
    { kind: "wait", ms: 350 },
    { kind: "exit", actor: "hero" },
    { kind: "wait", ms: 700 },
    // Ignition: flame on, the hull rattling on the pad…
    { kind: "pose", actor: "ship", sprite: "ship_fire" },
    { kind: "shake", actor: "ship", amp: 1 },
    { kind: "wait", ms: 1200 },
    // …liftoff: the ship climbs into the sky…
    { kind: "move", actor: "ship", to: { x: 172, y: 46 }, speed: 42 },
    // …and the camera follows it up: house, lawn, and floor line fall away
    // at full depth, the stars barely move, and the frame is left hanging
    // in open space with the rocket still burning and trembling.
    { kind: "pan", by: { x: 0, y: 180 }, ms: 3200 },
    {
      kind: "caption",
      text: ["FIRST FLIGHT. NO TEST RUNS.", "ADA WOULD CALL IT ROMANTIC."],
    },
    { kind: "fade", to: 1, ms: 1100 },
  ],
};

/**
 * THE VOYAGE, LEG ONE — between SpaceZ HQ and the moon, part two. Deep
 * space: Earth shrinking behind, the moon waiting ahead, and the hero (the
 * ship IS the actor — he's inside it, so his speech anchors to the hull)
 * talking himself through his first flight.
 */
const VOYAGE_MOON: CutsceneDef = {
  id: "voyage_moon",
  stage: {
    width: 224,
    height: 126,
    backdrop: "space",
    palette: SPACE_PALETTE,
    // The flight reads through parallax: the camera tracks the cruising
    // ship, so the whole field streams left — near stars fast (and wrapping
    // back in from the right), far stars slow, Earth falling behind at
    // planet depth while the destination barely creeps.
    drift: { x: -14, y: 0 },
    props: [
      { kind: "sky_earth", pos: { x: 38, y: 56 }, parallax: 0.08 },
      { kind: "sky_moon", pos: { x: 198, y: 30 }, parallax: 0.03 },
      { kind: "stars_a", pos: { x: 90, y: 24 }, parallax: 0.5, wrap: true },
      { kind: "stars_b", pos: { x: 140, y: 52 }, parallax: 0.25, wrap: true },
      { kind: "stars_a", pos: { x: 190, y: 84 }, parallax: 0.5, wrap: true },
      { kind: "stars_b", pos: { x: 60, y: 100 }, parallax: 0.25, wrap: true },
      { kind: "stars_a", pos: { x: 120, y: 112 }, parallax: 0.4, wrap: true },
    ],
  },
  actors: [
    // The hero, hull and all: the bubble anchors to the ship he's inside.
    { id: "hero", name: "ME", sprite: "ship_fly", at: { x: 58, y: 82 } },
  ],
  beats: [
    { kind: "fade", to: 1, ms: 0 },
    { kind: "fade", to: 0, ms: 900 },
    { kind: "move", actor: "hero", to: { x: 96, y: 74 }, speed: 16 },
    { kind: "caption", text: ["EARTH GOT SMALL FAST."] },
    {
      kind: "say",
      actor: "hero",
      text: [
        "THE THING I BUILT IN MY",
        "GARAGE IS IN SPACE.",
        "DON'T THROW UP.",
      ],
    },
    {
      kind: "say",
      actor: "hero",
      text: [
        "HER TRACKER PINGS FROM THE",
        "MOON. SHE WENT OUT FOR",
        "CHIPS AND SODA.",
      ],
    },
    { kind: "move", actor: "hero", to: { x: 148, y: 64 }, speed: 22 },
    {
      kind: "caption",
      text: ["NOBODY GOES TO THE MOON", "FOR CHIPS AND SODA."],
    },
    { kind: "fade", to: 1, ms: 1100 },
  ],
};

/**
 * THE MOON LETS GO — between the moon and Mars, part one. The landing site
 * after the fight: ARMSTRONG beaten and satisfied, the hero suited and
 * boarding, the flag still standing. The ghost's send-off is the bridge to
 * Mars the level intro used to carry.
 */
const MOON_DEPART: CutsceneDef = {
  id: "moon_depart",
  stage: {
    width: 224,
    height: 126,
    backdrop: "moonSurface",
    palette: { wall: "#0a0c16", floor: "#6c6e78", trim: "#3c3e48", floorY: 86 },
    props: [
      // Earth in the black, doing what the moon did for the living room.
      // Sky props barely ride the ascent pan; the flag and the regolith
      // fall away with the ground.
      { kind: "sky_earth", pos: { x: 202, y: 30 }, parallax: 0.05 },
      { kind: "stars_a", pos: { x: 60, y: 22 }, parallax: 0.15 },
      { kind: "stars_b", pos: { x: 116, y: 34 }, parallax: 0.15 },
      { kind: "stars_a", pos: { x: 160, y: 18 }, parallax: 0.15 },
      { kind: "flag", pos: { x: 30, y: 88 } },
    ],
  },
  actors: [
    // The first man on the moon, seeing the second one off.
    {
      id: "armstrong",
      name: "ARMSTRONG",
      sprite: "armstrong",
      at: { x: 56, y: 96 },
    },
    { id: "hero", name: "ME", sprite: "hero_suit", at: { x: 96, y: 96 } },
    { id: "ship", sprite: "ship", at: { x: 178, y: 100 } },
  ],
  beats: [
    { kind: "fade", to: 1, ms: 0 },
    { kind: "fade", to: 0, ms: 900 },
    { kind: "caption", text: ["THE GHOST KEPT HIS WORD."] },
    {
      kind: "say",
      actor: "armstrong",
      text: [
        "TAKE THE OLD FREIGHT LINE,",
        "EARTHLING. RED ALL THE WAY.",
        "BRING HER HOME.",
      ],
    },
    {
      kind: "say",
      actor: "armstrong",
      text: [
        "AND WHEN YOU SEE THE COMPANY",
        "MEN... TELL THEM THE MOON",
        "REMEMBERS.",
      ],
    },
    { kind: "say", actor: "hero", text: ["REST EASY, SPACEMAN."] },
    { kind: "move", actor: "hero", to: { x: 172, y: 97 }, speed: 40 },
    { kind: "wait", ms: 350 },
    { kind: "exit", actor: "hero" },
    { kind: "wait", ms: 700 },
    // Ignition and the same ascent as the garage launch: rattle, climb,
    // camera up. The ghost is screen-pinned like every actor, so he steps
    // off frame with the ground he haunts as the world drops away.
    { kind: "pose", actor: "ship", sprite: "ship_fire" },
    { kind: "shake", actor: "ship", amp: 1 },
    { kind: "wait", ms: 1200 },
    { kind: "move", actor: "ship", to: { x: 178, y: 46 }, speed: 42 },
    { kind: "exit", actor: "armstrong" },
    { kind: "pan", by: { x: 0, y: 180 }, ms: 3200 },
    {
      kind: "caption",
      text: ["HE WATCHED ME OUT OF SIGHT.", "FIFTY YEARS OF PRACTICE."],
    },
    { kind: "fade", to: 1, ms: 1100 },
  ],
};

/**
 * THE VOYAGE, LEG TWO — between the moon and Mars, part two. The moon
 * falling behind, the red planet growing ahead, and the quietest joke in
 * the campaign riding in the cargo net.
 */
const VOYAGE_MARS: CutsceneDef = {
  id: "voyage_mars",
  stage: {
    width: 224,
    height: 126,
    backdrop: "space",
    palette: SPACE_PALETTE,
    // Same parallax stream as leg one: the moon falls behind at planet
    // depth, Mars holds its ground ahead, the star field flows past.
    drift: { x: -14, y: 0 },
    props: [
      { kind: "sky_moon", pos: { x: 26, y: 36 }, parallax: 0.08 },
      { kind: "sky_mars", pos: { x: 196, y: 56 }, parallax: 0.03 },
      { kind: "stars_b", pos: { x: 70, y: 20 }, parallax: 0.25, wrap: true },
      { kind: "stars_a", pos: { x: 128, y: 40 }, parallax: 0.5, wrap: true },
      { kind: "stars_b", pos: { x: 170, y: 90 }, parallax: 0.25, wrap: true },
      { kind: "stars_a", pos: { x: 48, y: 96 }, parallax: 0.5, wrap: true },
      { kind: "stars_b", pos: { x: 104, y: 112 }, parallax: 0.4, wrap: true },
    ],
  },
  actors: [
    { id: "hero", name: "ME", sprite: "ship_fly", at: { x: 54, y: 78 } },
  ],
  beats: [
    { kind: "fade", to: 1, ms: 0 },
    { kind: "fade", to: 0, ms: 900 },
    { kind: "move", actor: "hero", to: { x: 92, y: 72 }, speed: 16 },
    {
      kind: "caption",
      text: [
        "TWO DAYS OUT. THE RADIO",
        "PLAYS STATIC. I'M STARTING",
        "TO LIKE IT.",
      ],
    },
    {
      kind: "say",
      actor: "hero",
      text: ["ONE PING FROM THE RED", "PLANET. FAINT. BUT THERE."],
    },
    {
      kind: "say",
      actor: "hero",
      text: ["I PACKED CHIPS AND SODA", "FOR THE RIDE HOME."],
    },
    { kind: "move", actor: "hero", to: { x: 146, y: 66 }, speed: 22 },
    { kind: "fade", to: 1, ms: 1100 },
  ],
};

/**
 * INTO THE RIFT — between Mars and the rift. The colony's east end after
 * MOSQUE fled: the tear he left hanging in the air, the hero's parked ship
 * staying behind, and the shortest decision he makes in the whole story.
 */
const RIFT_ENTRY: CutsceneDef = {
  id: "rift_entry",
  stage: {
    width: 224,
    height: 126,
    backdrop: "marsDusk",
    palette: { wall: "#2c161c", floor: "#8f5033", trim: "#5e3320", floorY: 86 },
    props: [
      { kind: "stars_a", pos: { x: 44, y: 24 } },
      { kind: "stars_b", pos: { x: 150, y: 30 } },
      // The ship stays on Mars — where he's going, thrust won't help.
      { kind: "starship", pos: { x: 30, y: 100 } },
      // MOSQUE's exit, still open. Still humming.
      { kind: "rift", pos: { x: 168, y: 100 } },
    ],
  },
  actors: [
    { id: "hero", name: "ME", sprite: "hero_suit", at: { x: 52, y: 96 } },
  ],
  beats: [
    { kind: "fade", to: 1, ms: 0 },
    { kind: "fade", to: 0, ms: 900 },
    {
      kind: "caption",
      text: ["HE TORE A HOLE IN THE", "UNIVERSE RATHER THAN LOSE."],
    },
    { kind: "move", actor: "hero", to: { x: 138, y: 97 }, speed: 40 },
    {
      kind: "say",
      actor: "hero",
      text: [
        "NO CHARTS FOR WHAT'S IN",
        "THERE. NO GROUND. NO AIR?",
        "NO IDEA.",
      ],
    },
    {
      kind: "say",
      actor: "hero",
      text: ["SHE WENT THROUGH.", "SO I GO THROUGH."],
    },
    { kind: "move", actor: "hero", to: { x: 164, y: 98 }, speed: 30 },
    { kind: "exit", actor: "hero" },
    { kind: "wait", ms: 700 },
    { kind: "fade", to: 1, ms: 1100 },
  ],
};

/**
 * OUT OF THE RIFT — between the rift and Eastworld. The far door with
 * daylight leaking through: the same wound in space as the way in, but
 * warm inside (`rift_west`, the tear recolored to a desert sunset). The
 * hero sees the western before he believes it.
 */
const RIFT_EXIT: CutsceneDef = {
  id: "rift_exit",
  stage: {
    width: 224,
    height: 126,
    backdrop: "void",
    palette: { wall: "#100a1c", floor: "#2a2448", trim: "#1a1630", floorY: 96 },
    // The void never quite holds still: dust and debris crawl past on
    // their own depths while the far door stays planted.
    drift: { x: -5, y: 0 },
    props: [
      { kind: "stars_a", pos: { x: 30, y: 30 }, parallax: 0.3, wrap: true },
      { kind: "stars_b", pos: { x: 96, y: 18 }, parallax: 0.2, wrap: true },
      { kind: "stars_a", pos: { x: 150, y: 44 }, parallax: 0.3, wrap: true },
      { kind: "stars_b", pos: { x: 52, y: 66 }, parallax: 0.2, wrap: true },
      {
        kind: "floating_rock",
        pos: { x: 108, y: 58 },
        parallax: 0.6,
        wrap: true,
      },
      { kind: "stardust", pos: { x: 66, y: 90 }, parallax: 0.8, wrap: true },
      // The far door: Eastworld's daylight through the violet — planted.
      { kind: "rift_west", pos: { x: 178, y: 100 }, parallax: 0 },
    ],
  },
  actors: [
    { id: "hero", name: "ME", sprite: "hero_suit", at: { x: 36, y: 96 } },
  ],
  beats: [
    { kind: "fade", to: 1, ms: 0 },
    { kind: "fade", to: 0, ms: 900 },
    {
      kind: "caption",
      text: ["THE FAR DOOR. THE COWARD'S", "TRAIL GOES STRAIGHT THROUGH."],
    },
    { kind: "move", actor: "hero", to: { x: 148, y: 97 }, speed: 34 },
    {
      kind: "say",
      actor: "hero",
      text: [
        "THERE'S DAYLIGHT ON THE",
        "OTHER SIDE. AND...",
        "IS THAT A SALOON?",
      ],
    },
    {
      kind: "say",
      actor: "hero",
      text: ["WHEREVER YOU ARE, ADA -", "I'M ONE DOOR AWAY."],
    },
    { kind: "move", actor: "hero", to: { x: 174, y: 98 }, speed: 30 },
    { kind: "exit", actor: "hero" },
    { kind: "wait", ms: 700 },
    { kind: "fade", to: 1, ms: 1100 },
  ],
};

export const CUTSCENE_DEFS: Record<string, CutsceneDef> = {
  // MEDIUM's wall is the base scene; the other rungs are variants resolved by
  // `cutsceneVariant` (createGame passes the run's difficulty).
  prelude: buildPrelude("prelude", WALL_ARMS.medium),
  prelude_easy: buildPrelude("prelude_easy", WALL_ARMS.easy),
  prelude_hard: buildPrelude("prelude_hard", WALL_ARMS.hard),
  prelude_nightmare: buildPrelude("prelude_nightmare", WALL_ARMS.nightmare),
  prelude_jesus: buildPrelude("prelude_jesus", WALL_ARMS.jesus),
  // The between-level scenes, in campaign order: each is some level's
  // `prelude` (the moon and Mars chain two — the departure, then the
  // flight). Same on every difficulty, so no variants.
  launch: LAUNCH,
  voyage_moon: VOYAGE_MOON,
  moon_depart: MOON_DEPART,
  voyage_mars: VOYAGE_MARS,
  rift_entry: RIFT_ENTRY,
  rift_exit: RIFT_EXIT,
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

/**
 * Resolve a scene's per-difficulty variant: `<id>_<difficulty>` when such a
 * def is registered, the base `id` otherwise. This is how the prelude puts
 * the run's actual starting weapon on the living-room wall — createGame
 * resolves the variant once and the state carries the resolved id, so the
 * step loop and the renderer just look it up like any other scene.
 */
export function cutsceneVariant(id: string, difficulty: string): string {
  const variant = `${id}_${difficulty}`;
  return activeCutsceneDefs[variant] ? variant : id;
}
