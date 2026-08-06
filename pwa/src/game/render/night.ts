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
 * A DRIVEN CAR'S HEADLIGHTS ARE NOT DRAWN HERE — see `drawLightCones` in
 * render/vehicles.ts, which is the ONE pair of lamps the car has.
 *
 * There used to be a second: a wedge walked out of the nose as nine overlapping
 * glow pools and punched through this sheet, so a night drive laid its own light
 * along the pavement. It was the wrong picture twice over. It disagreed with the
 * assembly's own cone about what colour the lamps burn — the car threw warm
 * tungsten and the night pass threw cold daylight out of the same two bulbs —
 * and it disagreed about their SIZE, reaching half a screen and opening 26° each
 * side, so a wagon idling in its own bay lit the lot like a searchlight. Beside
 * the driving minigame, which has no night pass and is exactly the same car, it
 * read as a different vehicle.
 *
 * So the cone is the whole of it, on the road and on the drive alike. It is part
 * of the ASSEMBLY, drawn with the panels and the arches in the body's own screen
 * space, which is also why it never swivels: the lamps are sealed beams bolted
 * into a shell that is one side-profile cut nose-right, and nothing anywhere
 * mirrors or rotates it, while `CarVehicle.heading` swings the better part of
 * 180° inside the yaw stop.
 */

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
  // …and NO headlights: a driven car's lamps are the assembly's own cone and
  // nothing else (see A DRIVEN CAR'S HEADLIGHTS above).

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
  ctx.restore();
}
