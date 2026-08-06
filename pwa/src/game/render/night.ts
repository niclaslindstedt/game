// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NIGHTFALL — the wash that puts a venue standing under a sky into the dark,
// and the lamps burning holes in it.
//
// THE ENGINE DECIDES *WHETHER*, THIS FILE DECIDES *WHAT IT LOOKS LIKE*. A run
// carries a `daylight` level as a session parameter and a mission carries a
// `sky`; `nightAmount(state)` folds the two into one number and everything
// below is presentation, exactly like the vignette and the grade. Nothing here
// is allowed to change a rule: the horde sees what it always saw, weapons reach
// what they always reached, and the fog is a separate darkness with a separate
// meaning (what the hero has not walked). A hero is not blinded by a sunset.
//
// IT IS A HOLE-PUNCH, NOT A PILE OF GLOWS, and that is the whole trick. The
// wash goes down as one flat sheet over the finished world picture, and each
// lamp is then ERASED out of that sheet (`destination-out`) rather than painted
// on top of it. Painting light additively over a dark sheet is what makes a
// cheap night: the sheet is still there under the glow, so a lit floor comes out
// as the dark floor plus a coloured haze — the art's own colours stay buried and
// every lamp reads as fog. Cutting the sheet away lets the ARTWORK come back
// through at full strength inside the pool, which is what a light actually does
// to a picture. The coloured half is then added back at a fraction, so the pool
// is warm or cold rather than merely bright.
//
// WHY IT IS ON THE CANVAS rather than in CSS with the grade and the vignette
// (see postfx.ts): those three are broad screen-space washes with nothing in
// them to line up with the world, while every lamp here is pinned to a spot on
// the FLOOR — it pans with the camera, foreshortens with the pitch, and passes
// under the same nearest-neighbour upscale as the pixels it is lighting. A CSS
// layer would have to be re-laid every frame against a projection it cannot see.

import { heroInPlay, heroes, nightAmount, runLevelDef } from "@game/core";
import type { GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { glowSprite } from "./caches.ts";
import { drawWorldSprite } from "./plane.ts";
import { type ViewSize } from "./shared.ts";
import { type Camera } from "./view.ts";
import { worldPitch, worldToCanvas } from "./tilt.ts";

/**
 * HOW DARK A FULL NIGHT GETS — the sheet's alpha at `nightAmount` 1.
 *
 * Deliberately short of black, and the number is a readability decision rather
 * than a taste one: the reference device is a phone in daylight (docs/
 * rendering.md), where the bottom two stops of a picture are gone before they
 * reach the eye. At 0.72 an unlit corner of the lawn is still legibly a lawn —
 * the grass keeps its colour, a body standing on it keeps its silhouette —
 * while every pool of light reads as a genuinely different place. Much past
 * this the unlit half of the map stops being dim and starts being missing, and
 * a hub the player has to cross to reach a rocket is the wrong place to hide
 * the floor.
 */
const NIGHT_ALPHA = 0.72;

/** The colour the dark washes toward: a cold blue-black, never neutral grey.
 * Night on a lawn is blue because the sky is still the only light source left,
 * and a grey wash reads as a screenshot with the brightness turned down. */
const NIGHT_RGB = "14, 18, 34";

/** The default a lamp burns when its content authored no colour — the warm
 * tungsten of a porch light. */
const LAMP_RGB = "255, 206, 138";

/**
 * THE HERO'S OWN LIGHT — the small pool every hero in play carries.
 *
 * Not a torch he is holding and never drawn as one: it is the concession that
 * makes a dark venue playable at all. The player's character is always at the
 * middle of the screen, so a hero standing between two lamps with nothing of his
 * own would be a silhouette on black — and the fix a game usually reaches for is
 * either brightening the whole night (which spends the atmosphere) or handing
 * out a flashlight item (which is a mechanic nobody asked for). A soft foot-wide
 * pool costs neither, and it reads as eyes adjusting rather than as equipment.
 *
 * Every SEATED hero carries one, so a co-op party lights its own way as a group.
 */
const HERO_LIGHT = { radius: 40, intensity: 0.42, rgb: "222, 226, 240" };

/**
 * How much of a lamp's own colour is ADDED back over the hole it cut, as a
 * fraction of how dark the night is.
 *
 * A fraction on purpose. The hole is what makes the pool bright; this is only
 * what makes it the lamp's OWN light — the sodium flood over the door reading
 * warm against the fluorescent tube inside the bay is the whole reason a map
 * authors a colour. Pushed much past this it stops being a tint and becomes the
 * coloured haze the hole-punch exists to avoid.
 */
const LAMP_TINT = 0.42;

/**
 * A DRIVEN CAR'S HEADLIGHTS — a BEAM, not a bulb.
 *
 * Two round pools ahead of the bumper was the first attempt and it was wrong in
 * the way that matters: a pool has no direction, so a car creeping up the drive
 * looked like it was carrying a lantern rather than pointing headlights
 * somewhere. Light from a car is a WEDGE — narrow at the lamps, spreading down
 * the road, running out at the far end — and once it is that shape the picture
 * says which way the car is facing before the sprite does.
 *
 * The wedge is cut in WORLD space through the same projection the floor takes
 * (see the cone painter below), so it lies ON the pavement and turns with the
 * camera instead of being a triangle pasted on the screen.
 */
const HEADLIGHT = {
  /** World px from the body's centre to the lamps themselves — the apex. */
  nose: 15,
  /** How far down the road the beam reaches (world px). */
  reach: 132,
  /** Half the beam's spread, in radians (~26° each side of the bearing). */
  halfAngle: 0.46,
  /** How wide the apex itself is (world px) — a beam that starts at a
   * mathematical point reads as a laser; a car's lamps are a hand's width
   * apart and the light leaves them already spread. */
  mouth: 22,
  /** How many pools the beam is walked out of. Nine overlap into a smooth
   * cone; fewer read as a string of discs. */
  steps: 9,
  intensity: 0.92,
  /** The cold white of a sealed beam, against the drive's sodium lamps. */
  rgb: "236, 242, 255",
} as const;

/**
 * The two lobes every lamp is cut with: `[radius scale, share of its alpha]`.
 * See the loop below — a wide faint lobe under a narrow strong one, which is
 * what turns a linear gradient's hard rim into a pool with a tail.
 */
const LOBES: readonly (readonly [number, number])[] = [
  [1, 0.55],
  [0.5, 0.8],
];

// The sheet the night is composited in, kept between frames. Sized to the
// canvas and rebuilt only when that changes — one full-view fill and a handful
// of glow blits per frame, which is what a wash may cost.
let sheet: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
} | null = null;

function ensureSheet(w: number, h: number) {
  if (sheet && sheet.w === w && sheet.h === h) return sheet;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  sheet = { canvas, ctx, w, h };
  return sheet;
}

/**
 * A lamp's live brightness, 0–1: its authored intensity with its waver on top.
 *
 * The waver is two detuned sines off the RENDER clock, seeded by the lamp's own
 * position — never off `state.rng()`, which is load-bearing for the loot ladder
 * and would be shifted by a cosmetic draw (see AGENTS.md). Two frequencies
 * rather than one because a single sine is a pulse, and a strip light does not
 * pulse: it wanders and occasionally dips.
 */
function lampGlow(
  intensity: number,
  flicker: number,
  x: number,
  y: number,
  timeMs: number,
): number {
  if (flicker <= 0) return intensity;
  const phase = (x * 0.37 + y * 0.11) % 6.283;
  const wave =
    Math.sin(timeMs * 0.0091 + phase) * 0.6 +
    Math.sin(timeMs * 0.0313 + phase * 2.3) * 0.4;
  // `wave` is in [-1, 1]; take only the dips, so a lamp flickers DOWN from its
  // rated output rather than surging above it.
  return intensity * (1 - flicker * (0.5 - 0.5 * wave));
}

/** The frame's cull test, as every other pass here declares it. */
type InView = (x: number, y: number, margin: number) => boolean;

/**
 * THE FIXTURES — the lamps themselves, drawn as world props.
 *
 * A pass of its own, and it has to be: a fitting bolted to a wall must be
 * painted AFTER that wall. Drawn as landmarks (the obvious first move) they
 * came out with their tops cut off by the stone in front of them, and standing
 * them clear of the wall to dodge that left the lot with barn lights hanging in
 * mid-driveway. So the lamps ride the LIGHTS and are drawn here, one pass later
 * than the obstacles.
 *
 * ALWAYS DRAWN, day or night: a lamp is a thing bolted to a wall, and a wall
 * with a lamp on it at midnight and nothing at noon is a wall that grows
 * hardware at dusk. Only its LIGHT is a night thing.
 *
 * Call inside the tilted world, with the other upright props.
 */
export function drawLamps(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
): void {
  for (const light of runLevelDef(state).lights ?? []) {
    if (!light.sprite) continue;
    if (!inView(light.pos.x, light.pos.y, 32)) continue;
    const sprite = spriteByName(sprites, light.sprite);
    if (!sprite) continue;
    drawWorldSprite(ctx, light.sprite, sprite, light.pos, camera, "base");
  }
}

/** One headlight beam, in WORLD units — where it starts, which way it points,
 * and how bright it burns. Painted by {@link paintBeam}. */
type Beam = { x: number; y: number; heading: number; a: number };

/**
 * Paint one BEAM onto a context: a chain of pools walked down the bearing,
 * each one wider and fainter than the last.
 *
 * A CHAIN RATHER THAN A CLIPPED WEDGE, and the first attempt was the wedge —
 * a triangle path filled with a gradient. It is exactly the right SHAPE and it
 * looked like a paper cutout, because a clip has no edge treatment at all: the
 * sides came out as two razor lines across the pavement, which is what a
 * searchlight in fog looks like rather than what a headlight on tarmac does.
 * Nine overlapping soft pools have the same silhouette, feather on every side
 * for free, and reuse the same baked gradients the lamps do — so the cone costs
 * nine cached blits instead of a per-frame path, clip and gradient.
 *
 * The caller owns the composite mode: the sheet punches the beam out with
 * `destination-out`, the colour pass adds it back with `lighter`.
 */
function paintBeam(
  ctx: CanvasRenderingContext2D,
  beam: Beam,
  camera: Camera,
  rgb: string,
  alpha: number,
  pitch: number,
): void {
  if (alpha <= 0) return;
  const { reach, halfAngle, mouth, steps } = HEADLIGHT;
  const cos = Math.cos(beam.heading);
  const sin = Math.sin(beam.heading);
  // The half-width the beam has opened to at its far end — the wedge's own
  // geometry, so `halfAngle` really is the spread.
  const flare = Math.tan(halfAngle) * reach;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // Radii are QUANTIZED to the glow cache's own step (see `glowSize`): a
    // continuous radius per sample would bake a fresh gradient canvas for every
    // frame the car moves, which is the leak that once took the tab past 280 MB.
    const r = Math.round((mouth / 2 + t * flare) / 4) * 4;
    const glow = glowSprite(rgb, r);
    if (!glow) continue;
    const at = worldToCanvas(
      beam.x + cos * t * reach,
      beam.y + sin * t * reach,
      camera,
    );
    // Fading down the road, and each pool weak enough that it is the OVERLAP
    // of several that makes the near field bright — which is what gives the
    // beam its soft, gradual falloff instead of nine visible discs.
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha * (1 - t) * (1 - t) * 0.7));
    ctx.drawImage(glow, at.x - r, at.y - r * pitch, r * 2, r * 2 * pitch);
  }
}

/**
 * Wash the finished world picture down to night and cut the lamps out of it.
 *
 * Call in SCREEN space, after the tilted world is restored and before the fog:
 * a lamp lights ground the hero has walked, and ground he has not is a darkness
 * of a different kind that goes on top. Costs nothing at all in daylight, or on
 * the eleven-twelfths of the game that stand under no sky.
 */
export function drawNight(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  view: ViewSize,
  timeMs: number,
): void {
  const dark = nightAmount(state);
  if (dark <= 0) return;
  const buf = ensureSheet(view.width, view.height);
  if (!buf) return;

  // Every lamp on the map, plus one per hero in play. Resolved to SCREEN points
  // here so the two passes below share the projection work.
  const pitch = worldPitch();
  const lamps: { x: number; y: number; r: number; rgb: string; a: number }[] =
    [];
  for (const light of runLevelDef(state).lights ?? []) {
    const at = worldToCanvas(light.pos.x, light.pos.y, camera);
    const r = light.radius;
    // Off-screen by more than its own reach lights nothing on this frame.
    if (
      at.x + r < 0 ||
      at.x - r > view.width ||
      at.y + r < 0 ||
      at.y - r > view.height
    )
      continue;
    lamps.push({
      x: at.x,
      y: at.y,
      r,
      rgb: light.color ?? LAMP_RGB,
      a: lampGlow(
        light.intensity ?? 1,
        light.flicker ?? 0,
        light.pos.x,
        light.pos.y,
        timeMs,
      ),
    });
  }
  for (const hero of heroes(state)) {
    if (!heroInPlay(hero)) continue;
    const at = worldToCanvas(hero.pos.x, hero.pos.y, camera);
    lamps.push({
      x: at.x,
      y: at.y,
      r: HERO_LIGHT.radius,
      rgb: HERO_LIGHT.rgb,
      a: HERO_LIGHT.intensity,
    });
  }
  // HEADLIGHTS. A car with somebody at the wheel has its lights on, and out
  // here they are most of the light there is: a beam thrown down the NOSE'S
  // bearing (`CarVehicle.heading` — the direction the car actually moves, not
  // the sprite's mirrored facing), so a night drive lays its own light along
  // the pavement and out onto the tarmac ahead of it.
  const beams: Beam[] = [];
  for (const vehicle of state.vehicles) {
    if (vehicle.kind !== "car" || vehicle.driver === null) continue;
    beams.push({
      x: vehicle.pos.x + Math.cos(vehicle.heading) * HEADLIGHT.nose,
      y: vehicle.pos.y + Math.sin(vehicle.heading) * HEADLIGHT.nose,
      heading: vehicle.heading,
      a: HEADLIGHT.intensity,
    });
  }

  // 1. THE SHEET, and the holes in it.
  const bctx = buf.ctx;
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.globalCompositeOperation = "source-over";
  bctx.globalAlpha = 1;
  bctx.clearRect(0, 0, buf.w, buf.h);
  bctx.fillStyle = `rgba(${NIGHT_RGB}, ${(NIGHT_ALPHA * dark).toFixed(3)})`;
  bctx.fillRect(0, 0, buf.w, buf.h);
  bctx.globalCompositeOperation = "destination-out";
  // THE ROOMS WHOSE LIGHTS ARE ON, cut first and cut as SHAPES: a lit district
  // is a roofed room, so its light stops at its walls rather than fading out
  // over them (`LevelDef.litZones`). It is the one thing a pool cannot do —
  // a pool big enough to fill the garage bay spills half of itself onto the
  // lawn behind it, through the wall.
  //
  // Drawn as the rect's four PROJECTED corners rather than as an axis-aligned
  // box: under a yaw the floor turns, and a room that stayed square while its
  // own walls leaned would peel away from the building it belongs to.
  // Opaque, because `destination-out` erases by the SOURCE's own alpha as well
  // as the context's: filling with the night colour still on the brush would
  // quietly scale every room's light by the sheet's own alpha.
  bctx.fillStyle = "#ffffff";
  for (const zone of runLevelDef(state).litZones ?? []) {
    const { x, y, width, height } = zone.rect;
    const corners = [
      worldToCanvas(x, y, camera),
      worldToCanvas(x + width, y, camera),
      worldToCanvas(x + width, y + height, camera),
      worldToCanvas(x, y + height, camera),
    ];
    bctx.globalAlpha = Math.max(0, Math.min(1, zone.amount));
    bctx.beginPath();
    corners.forEach((c, i) =>
      i === 0 ? bctx.moveTo(c.x, c.y) : bctx.lineTo(c.x, c.y),
    );
    bctx.closePath();
    bctx.fill();
  }
  for (const lamp of lamps) {
    // TWO LOBES PER LAMP, and the second one is what makes it look like light.
    // `glowSprite` bakes a LINEAR ramp from opaque to clear, and a linear ramp
    // cut out of a flat sheet has a visible rim — the pool reads as a disc laid
    // on the ground rather than as somewhere brighter. A narrow inner cut over a
    // wide faint one composes into a falloff that is steep in the middle and
    // long in the tail, which is the shape a real pool of light has and costs
    // one extra blit of a sprite that is already baked.
    const a = Math.max(0, Math.min(1, lamp.a));
    for (const [scale, weight] of LOBES) {
      const r = lamp.r * scale;
      // The mask reads ALPHA only, so the baked glow's colour is irrelevant
      // here — one white gradient per radius serves every lamp on the map,
      // which is also what keeps the glow cache small (see `glowSize`).
      const cut = glowSprite("255, 255, 255", r);
      if (!cut) continue;
      bctx.globalAlpha = a * weight;
      // SQUASHED BY THE PITCH: the pool lies on the ground plane, so it is an
      // ellipse on a raked camera and a circle only looking straight down. A
      // round pool on a raked floor reads as a glow hanging in the air.
      bctx.drawImage(cut, lamp.x - r, lamp.y - r * pitch, r * 2, r * 2 * pitch);
    }
  }
  // …and the beams last, cut through the same sheet as everything else, so a
  // car driving into a lit pool does not double-erase a hole that is already
  // open.
  bctx.globalAlpha = 1;
  for (const beam of beams) {
    paintBeam(bctx, beam, camera, "255, 255, 255", beam.a, pitch);
  }
  bctx.globalCompositeOperation = "source-over";
  bctx.globalAlpha = 1;

  ctx.save();
  // Screen space: the sheet is already in canvas pixels, and the caller may be
  // mid-push-in (the death scene's zoom), which the wash must not ride.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // STATED RATHER THAN ASSUMED, and it cost an afternoon to learn: `save()`
  // preserves the composite mode and the alpha, it does not reset them, so a
  // pass that left the context on `lighter` (any of the light-adding ones
  // above) turns this blit into an ADD of a near-black sheet — which is
  // invisible, and reads exactly like a wash that never drew at all.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(buf.canvas, 0, 0);

  // 2. …and the colour of the light itself, added back over the holes. The
  // hero's own pool is deliberately in the list: a hair of warmth around him is
  // what stops the cut looking like a hole in a filter.
  ctx.globalCompositeOperation = "lighter";
  for (const lamp of lamps) {
    const tint = glowSprite(lamp.rgb, lamp.r);
    if (!tint) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, lamp.a * LAMP_TINT * dark));
    ctx.drawImage(
      tint,
      lamp.x - lamp.r,
      lamp.y - lamp.r * pitch,
      lamp.r * 2,
      lamp.r * 2 * pitch,
    );
  }
  // The beams' own colour, added the same way. `globalAlpha` is left at 1 and
  // the strength put in the gradient instead: the painter clips and fills, and
  // a context alpha would scale the clip's edge as well as its middle.
  ctx.globalAlpha = 1;
  for (const beam of beams) {
    paintBeam(
      ctx,
      beam,
      camera,
      HEADLIGHT.rgb,
      beam.a * LAMP_TINT * dark,
      pitch,
    );
  }
  ctx.restore();
}
