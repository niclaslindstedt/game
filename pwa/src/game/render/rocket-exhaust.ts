// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENGINE LIGHTING — the plume a posed rocket throws, and the fire and smoke
// it beats off the pad it is standing on.
//
// IT IS A POSE-DRIVEN EFFECT, which is the whole reason it is a renderer and
// not four more props on the scene. The launch's ship is an ACTOR and its
// engine is a `pose` beat (`ship` → `ship_fire`); everything below hangs off
// that one fact — `rocketExhaustLook` claims the sprite, the actor's own
// `poseMs` is the clock, and a scene that never poses a rocket pays nothing.
// The alternative was a stack of authored flame sprites shown by `prop` beats,
// which cannot bloom, cannot boil, and cannot know how far off the ground the
// thing they are attached to has got.
//
// THREE PIECES, AND THEY ARE THREE BECAUSE THEY ANSWER TO DIFFERENT THINGS:
//
//  1. THE PLUME — the column out of the bells. Its LENGTH is the gap between
//     the nozzles and the ground, so it is a stub while the ship is sitting on
//     the pad and opens to its full reach once there is air under it. That is
//     not a nicety: a full-length plume drawn on the pad runs down through the
//     tarmac and the shot reads as a rocket parked in a fire.
//  2. THE PAD BLAST — what that column does when it hits concrete: fire
//     spilling sideways in two lobes and smoke boiling up out of them. It is
//     anchored to the PAD, not the ship, so it stays where the ship left it.
//  3. THE GLOW — the light all of that is throwing, additively, so the hull's
//     own base and whatever is standing near it are lit rather than pasted on.
//
// EVERY PART RUNS ON THE SCENE CLOCK AND A HASH, never `Math.random`: the
// cutscene preview harness replays a scene and screenshots it, and an effect
// that reshuffled per frame would make every capture a different picture.
//
// …AND THE SMOKE IS A LOOPING STREAM, not a one-shot burst (the same shape the
// flamethrower's gout uses, `flame.ts`): each puff runs on its own delayed loop,
// so the cloud FILLS IN over the first second instead of appearing whole, and
// then keeps renewing itself for as long as the engine is lit. A burst would
// have to be re-fired on a timer nothing here owns.

import { glowSprite } from "./caches.ts";
import { clamp01, fract } from "./shared.ts";

/**
 * What a rocket sprite's exhaust looks like, in the SPRITE'S OWN px measured
 * from its top-left — so the numbers are read straight off the pixel grid and
 * survive the sprite being re-drawn at another size.
 */
export type RocketExhaust = {
  /** Across the sprite, where the bells sit — the plume's own centre line. */
  readonly bellX: number;
  /** …and down it, the plane they fire from. */
  readonly bellY: number;
  /** How far the column runs at full burn, with room under it (sprite px). */
  readonly reach: number;
  /** Its widest half-width, about a third of the way down (sprite px). */
  readonly flare: number;
};

/**
 * The rockets that burn, by sprite STEM — the frame suffix is stripped, so one
 * entry covers `ship_fire_0` and `ship_fire_1` both.
 *
 * `reach` is TWICE THE HULL (the ship is a 24×32 sprite), which is the size the
 * shot was asked for and is also about right for the thing: a garage rocket
 * lifting a man off a lawn is not throttling.
 */
const SHIP: RocketExhaust = { bellX: 12, bellY: 27, reach: 64, flare: 9 };

/**
 * …AND BOTH OF ITS STATES ARE IN HERE, cold and lit, because two different
 * questions are asked of this table. What is BURNING decides the plume, the
 * pad blast, the soot and the roof (all of which want the lit one only); where
 * a rocket is STANDING decides the burnt patch of lawn under it, which was
 * scorched by the last launch and is there before this one lights.
 */
const LOOKS: Readonly<Record<string, { look: RocketExhaust; lit: boolean }>> = {
  ship: { look: SHIP, lit: false },
  ship_fire: { look: SHIP, lit: true },
};

/** The exhaust a sprite carries, if it is a rocket with its engine LIT. */
export function rocketExhaustLook(sprite: string): RocketExhaust | undefined {
  const entry = LOOKS[sprite.replace(/_\d+$/, "")];
  return entry?.lit ? entry.look : undefined;
}

/** …and the same, for a rocket whether it is burning or merely parked. */
export function rocketPadLook(sprite: string): RocketExhaust | undefined {
  return LOOKS[sprite.replace(/_\d+$/, "")]?.look;
}

/**
 * HOW BURNT THE GROUND A ROCKET IS PARKED ON ALREADY IS, and how far that
 * reaches — the mark left by every launch before this one.
 *
 * It is much TIGHTER than the blast that made it (`reach * SCAR_SPAN` against
 * the blast's own `reach * 2`), and deliberately: a lawn is not all lawn. The
 * ground the ship has been standing on is dead, and the far end of the lot past
 * the house is grass that has never had anything lit on it. Washing the whole
 * floor was the first cut and it read as a different place.
 */
export const SCAR_LEVEL = 0.62;
export const SCAR_SPAN = 0.7;

/** White-hot at the throat, out through the body to the ragged cooling fringe.
 * Four stops rather than a ramp: the bands are what make it read as pixel fire
 * instead of an airbrushed cone. */
const CORE = "#fff4dc";
const HOT = "#ffd24a";
const BODY = "#ff9a1f";
const FRINGE = "#e0491c";

/** How long the engine takes to come up to pressure (ms) — the plume's length,
 * the blast's spread and every alpha here ramp over it, so ignition BLOOMS
 * rather than snapping on at full size in one frame. */
const SPOOL_MS = 520;

/** One puff of pad fire, and one of pad smoke: how long each lives before its
 * slot loops round and throws another (ms). Fire is short and violent; smoke
 * outlives it by four times, which is what leaves a cloud standing. */
const FIRE_MS = 420;
const SMOKE_MS = 2600;

/** How many slots each stream keeps. This is ONE rocket in ONE scene, so the
 * budget is generous — but the count is what fills the sprawl below, and a
 * cloud four times as wide needs the billows to reach across it. */
const FIRE_PUFFS = 14;
const SMOKE_PUFFS = 44;

/**
 * HOW FAR THE CLOUD RUNS ALONG THE GROUND, as a multiple of the plume's own
 * reach — so the widest billows end up a little over the plume's length out to
 * EACH side, and the cloud finishes some three times wider than it is tall.
 * That ratio is the difference between a launch and an explosion.
 */
const SPRAWL = 1.15;

/** A hash, not a draw — the same one the night sky derives its weather from. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ease-out — everything thrown off a pad leaves fast and settles slowly. */
function easeOut(t: number): number {
  return t * (2 - t);
}

/** How long the blast takes to blacken what is standing beside it (ms) — slow
 * enough that a viewer watches it happen rather than finding it already done. */
const SOOT_MS = 1500;

/** How far the soot carries, as a multiple of the plume's reach. Past it a
 * building is simply out of the blast; at the pad it is ruined. */
const SOOT_RANGE = 2.4;

/** …and the worst it ever gets on the side that faced the engine. Not 1: a
 * silhouette is not a joke, and the roofline has to stay readable. */
const SOOT_MAX = 0.85;

/**
 * HOW BLACK THE BLAST HAS TURNED SOMETHING STANDING `gap` PX CLEAR OF IT.
 *
 * The gag is that the hero lights a homemade rocket a dozen px from his own
 * garage and the garage pays for it, so the ONLY input besides time is
 * distance — no list of which props are flammable, no per-scene tuning. A thing
 * far enough away comes out 0 and the caller skips it. What that number does
 * to the art is `sootedSprite` (`caches.ts`), where every other baked sprite
 * variant lives and where a fresh atlas already drops them all.
 *
 * `gap` IS TO THE NEAR WALL, not to the middle of the building, and that is not
 * a rounding detail: measured centre-to-centre a wide frontage reads as further
 * off the harder it faces the pad, so the garage standing right against the
 * ship came out barely smudged while the joke needed it filthy.
 */
export function sootLevel(
  look: RocketExhaust,
  ageMs: number,
  gap: number,
): number {
  const near = clamp01(1 - Math.max(0, gap) / (look.reach * SOOT_RANGE));
  return SOOT_MAX * clamp01(ageMs / SOOT_MS) * near;
}

/** How long a roof takes to CATCH (ms) — it is a hint, not the second act, so
 * it starts late enough that the blackening reads first and the flames are just
 * getting going as the ship leaves. */
const CATCH_MS = 900;
/** …and how long from the first lick to a roof properly alight. */
const SPREAD_MS = 1200;
/** How close a thing has to be standing to catch at all, as a multiple of the
 * reach. Much shorter than the soot's: everything on the lot goes black, one
 * building goes UP. */
const CATCH_RANGE = 1.2;
/** …and how far along a frontage the flames ever walk, from the end that took
 * the blast. */
const REACH_ALONG = 0.6;

/**
 * A BURN THAT IS OVER — the age to hand {@link sootLevel} and
 * {@link propFireLevel} for an engine that has SHUT DOWN having been lit.
 *
 * Every curve in this file is a ramp that saturates and then holds, so once
 * the engine stops there is nothing left for it to decide: the blackening it
 * did is done, and it neither un-happens nor gets any worse. The alternative —
 * reading a dead engine's own clock — snaps the soot and the burning roof off
 * the house in the single frame the ship cuts its motor, which is what the
 * homecoming's touchdown does (`content/cutscenes/earth_return.yaml`).
 *
 * Derived from the ramps rather than typed, so re-timing one cannot leave this
 * short of it.
 */
export const BLAST_SPENT_MS = Math.max(SOOT_MS, CATCH_MS + SPREAD_MS);

/**
 * WHETHER SOMETHING `gap` PX CLEAR OF THE PAD HAS CAUGHT FIRE, 0..1.
 *
 * The soot above is what the blast does to every surface it can reach; this is
 * the one that only happens to whatever the hero parked his rocket against. It
 * is a separate curve and not a threshold on the same one, because it starts
 * LATER (the wall blackens, and then it lights) and it is the beat the shot is
 * built around: the fire is up on the garage roof before the ship leaves, so
 * the last thing the camera climbs away from is a house with a problem.
 */
export function propFireLevel(
  look: RocketExhaust,
  ageMs: number,
  gap: number,
): number {
  const near = clamp01(1 - Math.max(0, gap) / (look.reach * CATCH_RANGE));
  return clamp01((ageMs - CATCH_MS) / SPREAD_MS) * near;
}

/**
 * FLAMES ON THE TOP EDGE OF A SPRITE, in the space of its own drawing.
 *
 * THEY SIT ON THE CROWN, never on the bounding box (`spriteCrown`, caches.ts):
 * this house is a peaked roof joined to a flat garage, so a row of flames laid
 * across the top of the art would burn in mid-air over one half and a wall
 * short of the other. Walking the art's own top edge puts every lick on the
 * tile it is actually eating.
 *
 * They start on the side that took the blast and spread along the roof with
 * `level`, which is what makes it read as CATCHING rather than as a building
 * that was always on fire.
 */
export function drawPropFire(
  ctx: CanvasRenderingContext2D,
  crown: Int16Array,
  level: number,
  /** Which way the rocket is: +1 to the right of this thing, -1 to the left. */
  side: number,
  timeMs: number,
): void {
  if (level <= 0) return;
  const width = crown.length;
  // How far along the roof the fire has got, measured FROM the near end — and
  // capped well short of the far one. It is the GARAGE that catches, because
  // that is the end the rocket was parked against; a fire that walked the whole
  // frontage would be the house burning down, which is a different scene.
  const front = width * clamp01(level) * REACH_ALONG;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let col = 0; col < width; col += 2) {
    const top = crown[col];
    if (top === undefined || top < 0) continue;
    // Distance back from the end the blast was on — the fire's own front.
    const from = side < 0 ? col : width - 1 - col;
    if (from > front) continue;
    const seed = col * 6151;
    if (hash(seed) > 0.62) continue;
    // Hottest at the seat of it, guttering out at the leading edge.
    const bite = clamp01((front - from) / (width * 0.5));
    const flick =
      0.62 + 0.38 * Math.sin(timeMs / 90 + hash(seed ^ 0x2545f491) * 30);
    const tall = (2.5 + 9 * bite * hash(seed ^ 0x5bf03635)) * flick * level;
    if (tall < 1) continue;
    const w = hash(seed ^ 0x9e3779b1) > 0.7 ? 2 : 1;
    // Three stacked runs: a red-orange base, an amber body, a white tip on the
    // taller licks. Same banding as the plume, at a twentieth of the size.
    const foot = top + 1;
    ctx.fillStyle = FRINGE;
    ctx.fillRect(col, Math.round(foot - tall), w, Math.round(tall));
    ctx.fillStyle = BODY;
    ctx.fillRect(col, Math.round(foot - tall * 0.7), w, Math.round(tall * 0.7));
    if (tall > 3) {
      ctx.fillStyle = HOT;
      ctx.fillRect(col, Math.round(foot - tall * 0.42), w, 2);
    }
    if (tall > 5) {
      ctx.fillStyle = CORE;
      ctx.fillRect(col, Math.round(foot - tall * 0.2), w, 1);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

/**
 * ONE BILLOW OF SMOKE, baked once per (colour, size) and reused.
 *
 * IT IS NOT `glowSprite`, and the difference is the whole reason the first cut
 * of this cloud was invisible. That one ramps from full alpha at the centre to
 * nothing at the rim, which is exactly right for LIGHT — a glow has no edge —
 * and exactly wrong for MATTER: averaged over its own disc it is faint, so
 * twenty-six of them over a night sky came out as a smear of haze rather than
 * as a cloud. Smoke is opaque nearly all the way out and then stops, so this is
 * a PLATEAU with a soft rim, and the puffs read as bodies that overlap.
 */
const puffCache = new Map<string, HTMLCanvasElement>();

function smokePuff(rgb: string, radius: number): HTMLCanvasElement | null {
  const size = Math.max(2, Math.ceil(radius * 2));
  const key = `${rgb}/${size}`;
  const had = puffCache.get(key);
  if (had) return had;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${rgb}, 1)`);
  grad.addColorStop(0.62, `rgba(${rgb}, 0.94)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  puffCache.set(key, canvas);
  return canvas;
}

/**
 * Draw the exhaust of a rocket whose sprite's TOP-LEFT is the current origin —
 * the space `CutsceneOverlay`'s `paintOne` hands its drawings, so this composes
 * with the actor's shake and never has to know where on the stage it is.
 *
 * Painted BEFORE the hull, so the hull sits in front of its own fire.
 */
export function drawRocketExhaust(
  ctx: CanvasRenderingContext2D,
  look: RocketExhaust,
  /** How long the engine has been lit — the actor's `poseMs`. */
  ageMs: number,
  /** Where the ground under it is, in this drawing's own px. It is the hull's
   * own feet while the ship is parked, and walks away down the frame as the
   * ship climbs and again as the camera follows — which is what opens the plume
   * out and leaves the blast behind on the pad. */
  padY: number,
): void {
  const burn = clamp01(ageMs / SPOOL_MS);
  if (burn <= 0) return;
  // The room under the bells: nought on the pad, the whole reach in the air.
  const height = Math.max(0, padY - look.bellY);

  ctx.save();
  // THE BLAST FIRST, and its smoke inside it: it is behind the column that
  // makes it, and the column is behind the hull.
  drawPadBlast(ctx, look, ageMs, burn, padY, height);
  drawPlume(ctx, look, ageMs, burn, height);
  ctx.restore();
}

/**
 * THE COLUMN. Walked one scanline at a time and filled in four bands, which is
 * what keeps it crisp: a radial gradient at this size comes out as a smudge,
 * and a stack of hard 1-px runs comes out as pixel fire.
 *
 * EXPORTED for the flight minigame's own ship (`rocket-screen/render.ts`),
 * which draws THIS plume — halo, lash, shock diamonds — under its hull rather
 * than a private imitation: the takeoff the cutscene sold is the takeoff the
 * minigame flies. `burn` is the caller's throttle-shaped 0..1 (the cutscene
 * passes its spool ramp), `height` the room under the bells (`Infinity` in
 * open sky).
 *
 * `vacuum` (0 sea level → 1 no air) is how the flame answers ALTITUDE, and
 * the physics is ambient PRESSURE, not oxygen — the ship carries its own
 * oxidizer, which is the whole reason it burns up there at all. With nothing
 * pressing back the exhaust stops being a bonfire and becomes a nozzle
 * pattern: the bright core SHORTENS and tightens, the shock diamonds fade
 * out (they are standing pressure waves against outside air, so a vacuum has
 * none), and what the gas does instead is BALLOON — a wide, faint,
 * translucent sheath flaring off the bells. The cutscene's pad never passes
 * it, so the launch keeps its ground-level fire untouched.
 */
export function drawPlume(
  ctx: CanvasRenderingContext2D,
  look: RocketExhaust,
  ageMs: number,
  burn: number,
  height: number,
  vacuum = 0,
): void {
  // THE GROUND CUTS IT OFF. A rocket on the pad has nowhere to put its plume,
  // which is exactly why there is a blast: the column's length is the room
  // under it, and everything it cannot spend goes sideways instead.
  // The visible core shortens as the air runs out — the fire is not smaller,
  // the part of it bright enough to see is.
  const air = 1 - Math.max(0, Math.min(1, vacuum));
  const coreReach = look.reach * (0.55 + 0.45 * air);
  const len = Math.round(Math.min(coreReach * burn, Math.max(0, height)));
  if (len <= 0) return;
  const x = look.bellX;
  const top = look.bellY;

  // The light the column throws, under it and additive — the one part that is
  // a gradient, because it is not an object, it is what the object is doing to
  // the air. Sized off the plume so a stub on the pad glows like a stub.
  ctx.globalCompositeOperation = "lighter";
  const halo = glowSprite("255, 150, 40", Math.round(look.flare * 2.2));
  if (halo) {
    ctx.globalAlpha = 0.5 * burn * (0.5 + 0.5 * air);
    ctx.drawImage(
      halo,
      Math.round(x - halo.width / 2),
      Math.round(top + len * 0.25 - halo.height / 2),
    );
  }

  // THE VACUUM SHEATH — where the bonfire went: with no air pressing back the
  // exhaust expands the moment it leaves the bells, so a faint wide cone
  // flares around the shrunken core. Scanlines like the column (a gradient
  // this size is a smudge), too dim to read as flame — it reads as gas.
  if (vacuum > 0.05) {
    const sheathLen = Math.round(
      Math.min(look.reach * (0.5 + 0.7 * vacuum) * burn, Math.max(0, height)),
    );
    ctx.fillStyle = FRINGE;
    for (let i = 0; i < sheathLen; i += 2) {
      const u = i / sheathLen;
      const spread =
        look.flare * (0.5 + (1.3 + 1.9 * vacuum) * Math.pow(u, 0.7)) * burn;
      const w = Math.round(spread * 2);
      if (w < 1) continue;
      ctx.globalAlpha = 0.16 * vacuum * burn * (1 - u * u);
      ctx.fillRect(Math.round(x - w / 2), Math.round(top + i), w, 2);
    }
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < len; i++) {
    const u = i / len;
    // THE SPEARHEAD: the throat's own width, opening to the flare a third of
    // the way down, then closing to a point. `sin(pi·u^0.6)` puts the widest
    // part high, where a bell's gases actually spread, rather than at the
    // middle of the line.
    const shape = 0.42 + 0.58 * Math.sin(Math.PI * Math.pow(u, 0.6));
    const taper = Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.4)));
    // The gutter: the tip lashes about, the throat does not. Two frequencies so
    // it never settles into a wave.
    const lash =
      1 +
      u *
        0.35 *
        (Math.sin(ageMs / 47 + u * 11) * 0.6 +
          Math.sin(ageMs / 31 + u * 23) * 0.4);
    const wide = look.flare * shape * taper * lash * burn;
    const y = Math.round(top + i);
    // The column also SWINGS, more the further from the bells — a plume that
    // hangs perfectly straight reads as a painted triangle.
    const sway =
      u * u * 1.6 * Math.sin(ageMs / 90 + u * 4.5) * (0.6 + 0.4 * burn);
    const cx = x + sway;

    const run = (halfW: number, fill: string) => {
      const w = Math.round(halfW * 2);
      if (w < 1) return;
      ctx.fillStyle = fill;
      ctx.fillRect(Math.round(cx - w / 2), y, w, 1);
    };
    run(wide, FRINGE);
    run(wide * 0.72, BODY);
    // SHOCK DIAMONDS — the bright knots standing in a real supersonic exhaust,
    // and the one detail that makes a cone read as thrust. They stand still in
    // the column while the flame moves through them, so they are a function of
    // depth with only a slow breath on the clock — and they FADE with the air:
    // a diamond is the exhaust arguing with ambient pressure, and a vacuum
    // does not argue back.
    const knot =
      0.55 +
      0.45 * air * Math.sin(u * 17 - ageMs / 260) * Math.max(0, 1 - u * 1.6);
    run(wide * 0.44 * knot, HOT);
    if (u < 0.62) run(wide * 0.26 * knot * (1 - u / 0.62), CORE);
  }
  ctx.globalCompositeOperation = "source-over";
}

/**
 * WHAT THE COLUMN DOES TO THE GROUND — fire spilling out in two lobes and smoke
 * rolling up off them.
 *
 * Both are looping streams of soft discs rather than one shape: a cloud is the
 * one thing in this file with no silhouette to draw, and twenty overlapping
 * discs on twenty different clocks is a cloud. The FIRE is additive (it is
 * light) and the SMOKE is not (it is matter) — drawn additively, smoke comes
 * out as a grey glow, which is the opposite of smoke.
 */
function drawPadBlast(
  ctx: CanvasRenderingContext2D,
  look: RocketExhaust,
  ageMs: number,
  burn: number,
  padY: number,
  height: number,
): void {
  const x = look.bellX;
  // WHAT IS STILL BEING FED. Once the ship is a plume-length up, the column no
  // longer reaches the concrete and the FIRE on the pad goes out — without that
  // the ship trails a bonfire it left on the lawn.
  //
  // THE SMOKE DOES NOT GO WITH IT. A launch cloud outlives the launch by
  // minutes; it sits on the pad and spreads while the rocket is a dot. So its
  // own tail is long enough to be no tail at all inside a scene this length,
  // and what takes it off the screen is the camera climbing away from it —
  // which is the honest reason it stops being visible.
  const fire = burn * clamp01(1 - height / (look.reach * 0.75));
  const feed = burn * clamp01(1 - height / (look.reach * 6));
  if (feed <= 0) return;

  // SMOKE BEHIND THE FIRE. It is the bigger, slower, further-travelled half, so
  // the fire reads as the hot heart of it rather than as a layer laid on top.
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < SMOKE_PUFFS; i++) {
    const seed = i * 2654435761 + 17;
    const start = hash(seed) * SMOKE_MS;
    if (ageMs < start) continue;
    const u = fract((ageMs - start) / SMOKE_MS);
    const side = i % 2 === 0 ? 1 : -1;
    // IT GOES SIDEWAYS, AND THAT IS THE WHOLE SHAPE OF IT. A rocket standing on
    // flat ground has nowhere to send what it is making but OUT: the column
    // hits the concrete and the cloud runs away along it in both directions,
    // ending up several times wider than it is tall with the hull rising out of
    // the middle of it. Every earlier cut of this drew a mushroom, and a
    // mushroom is what you get from a bomb, not a launch — so `SPRAWL` is more
    // than the plume's whole reach each way, and the rise is a fraction of it.
    //
    // EACH PUFF PICKS ITS OWN MIX (`loft`), because a cloud whose every billow
    // travelled the same arc is a pair of wings. The ones that hug the ground
    // go furthest out; the few that climb stack up the middle and close the two
    // lobes into one mass.
    const loft = hash(seed ^ 0x27d4eb2f);
    const spread =
      (0.12 + 0.88 * hash(seed ^ 0x5bf03635)) *
      look.reach *
      SPRAWL *
      (1 - 0.62 * loft);
    const dx = side * spread * easeOut(u);
    const rise = look.reach * (0.07 + 0.4 * loft) * Math.pow(u, 1.35);
    const drift = (hash(seed ^ 0x9e3779b1) - 0.5) * 6;
    const r = Math.round(
      (3.6 + 11 * easeOut(u) + 3.4 * hash(seed ^ 0x7feb352d)) *
        (0.45 + 0.55 * burn),
    );
    if (r < 1) continue;
    // THREE COLOURS, NOT ONE: a billow still inside the fire is lit warm from
    // underneath, one clear of it is the pale grey a launch cloud actually is,
    // and the old stuff at the edges is the blue of the night it is spreading
    // into. It is much LIGHTER than the smoke off a fire — this is mostly steam
    // and dust off the ground, and it is being lit from inside.
    const rgb =
      u < 0.16 ? "208, 142, 84" : u < 0.5 ? "142, 136, 138" : "82, 88, 104";
    const puff = smokePuff(rgb, r);
    if (!puff) continue;
    // Fades IN over the first tenth and out over the last third — a puff that
    // appeared at full strength pops, and one that vanished would blink.
    const alpha =
      0.62 * feed * clamp01(u / 0.1) * clamp01((1 - u) / 0.35) ** 0.8;
    const cx = Math.round(x + dx + drift);
    const cy = Math.round(padY - rise);
    ctx.globalAlpha = alpha;
    ctx.drawImage(puff, cx - puff.width / 2, cy - puff.height / 2);
    // THE SHOULDER OF THE BILLOW — a smaller, lighter disc set up and inboard
    // of the body. It is the one thing that turns a field of soft discs into
    // SMOKE: a cloud is read off where its light catches, and a flat grey blob
    // has nowhere for that to be. Warm while the fire is still under it, cold
    // once it has risen out of the light.
    if (r < 4) continue;
    const lit = smokePuff(
      u < 0.3 ? "240, 176, 112" : "176, 176, 182",
      Math.round(r * 0.55),
    );
    if (!lit) continue;
    ctx.globalAlpha = alpha * 0.75;
    ctx.drawImage(
      lit,
      Math.round(cx - side * r * 0.2 - lit.width / 2),
      Math.round(cy - r * 0.34 - lit.height / 2),
    );
  }

  if (fire <= 0) {
    ctx.globalAlpha = 1;
    return;
  }

  // …AND THE FIRE IN FRONT OF IT, short-lived and thrown much less far.
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < FIRE_PUFFS; i++) {
    const seed = i * 40503 + 7919;
    const start = hash(seed) * FIRE_MS;
    if (ageMs < start) continue;
    const u = fract((ageMs - start) / FIRE_MS);
    const side = i % 2 === 0 ? 1 : -1;
    const spread = (0.3 + 0.7 * hash(seed ^ 0x2545f491)) * look.reach * 0.24;
    const dx = side * spread * easeOut(u);
    const rise = look.reach * 0.14 * easeOut(u);
    const r = Math.round((3.6 + 4.2 * u) * (0.4 + 0.6 * burn));
    if (r < 1) continue;
    // Yellow-white at the root, orange going out, deep red as it dies.
    const rgb =
      u < 0.3 ? "255, 226, 150" : u < 0.66 ? "255, 150, 40" : "200, 60, 20";
    const puff = glowSprite(rgb, r);
    if (!puff) continue;
    ctx.globalAlpha = 0.85 * fire * (1 - u) * (1 - u);
    ctx.drawImage(
      puff,
      Math.round(x + dx - puff.width / 2),
      Math.round(padY - rise - puff.height / 2),
    );
  }

  // THE IMPINGEMENT — where the column actually hits, white-hot and pulsing on
  // its own fast clock. It is one disc rather than a puff stream because it is
  // not a thing being thrown: it is the spot the thrown things come from, and
  // the eye needs somewhere for all of that fire to be coming OUT of.
  const wash = glowSprite("255, 138, 44", Math.round(look.flare * 3.2));
  if (wash) {
    ctx.globalAlpha = fire * 0.45;
    ctx.drawImage(
      wash,
      Math.round(x - wash.width / 2),
      Math.round(padY - wash.height / 2),
    );
  }
  const core = glowSprite("255, 244, 214", Math.round(look.flare * 1.5));
  if (core) {
    ctx.globalAlpha = fire * (0.6 + 0.22 * Math.sin(ageMs / 38));
    ctx.drawImage(
      core,
      Math.round(x - core.width / 2),
      Math.round(padY - core.height / 2),
    );
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
