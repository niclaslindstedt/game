// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ELITE TIER's world-anchored FX (see src/game/defs/enemies/abilities.ts):
// the ring of motes, the shell, the tether, the pulse, the blink, the shout and
// the lane of fissures.
//
// WHY THIS IS ON THE CANVAS AND NOT IN CSS, since it is the first question
// anybody asks of an effect that is supposed to look magical. Every effect here
// is anchored to a WORLD position — a ring around a body that is walking, a
// tether between two things that are both moving, a fissure on a particular
// square of floor. CSS is screen-space and device-resolution, which is exactly
// right for the broad washes it already owns (the grade, the vignette, the
// haze) and exactly wrong for anything that has to travel with the camera and
// order correctly against the actors walking in front of it. The screen-space
// half of these moves — the flash when a shell breaks — lives in
// game-screen/elite-css-fx.ts, and the split is the NUKE's: the world-anchored
// geometry rides the canvas so both halves track the same spot as the camera
// pans.
//
// SO "MAGICAL" IS EARNED ON THE CANVAS, and it is earned the way the loot
// shafts and the blood cloud earn it — with BAKED LIGHT (`glowSprite`,
// `beamSprite`) rather than with `ctx.arc`. Three things follow from that and
// all three are the point:
//   • A baked glow is a raster, so it upscales with everything else and cannot
//     read as a debug overlay the way a stroked circle does.
//   • It is built ONCE per (colour, radius) and drawn with `globalAlpha`, so a
//     screen with six elites casting costs six blits rather than six gradients
//     rebuilt per frame — which is the single most expensive thing a draw pass
//     can do.
//   • The BLOOM post-fx picks bright canvas pixels up on its own, so light
//     drawn here blooms for free. That is most of what makes it read as magic.
//
// EVERYTHING IS RE-HUED, NEVER TINTED. The authored art (the mote, the bolt,
// the snare weave) is drawn in neutral greys and put onto the casting
// ability's own `look` ramp by `recolorSprite` — the same machinery that makes
// one set of blood frames serve four kinds of body. A tint multiplies, which
// can only darken; a re-hue keeps the shape and the shading and throws the
// colour away, which is what lets ONE mote sprite be a survey drone, a
// guttering candle and a shard of something that should not exist.

import { localHero } from "../local-seat.ts";
import {
  activeMechanics,
  enemyDef,
  orbitMotePositions,
  type AbilityLook,
  type BossAbility,
  type BossAbilityId,
  type Enemy,
  type GameState,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { beamSprite, glowSprite } from "./caches.ts";
import { recolorSprite, type GoreRamp } from "./recolor.ts";
import { clamp01 } from "./shared.ts";
import { beginBillboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/**
 * The kit an ability with no authored `look:` wears — a neutral arcane
 * blue-violet, deliberately the SAME default the powerups fall back to
 * (`DEFAULT_POWERUP_STYLE`). An elite's move and a hero's power that both
 * declined to say what colour they are should not disagree about it.
 */
export const DEFAULT_ELITE_LOOK: AbilityLook = {
  core: "150, 170, 255",
  hot: "232, 238, 255",
  deep: "18, 20, 40",
  spark: "196, 210, 255",
};

/** A look's three-stop ramp, darkest first — what `recolorSprite` wants. */
export function lookRamp(look: AbilityLook | undefined): GoreRamp {
  const kit = look ?? DEFAULT_ELITE_LOOK;
  return [kit.deep, kit.core, kit.hot];
}

/** Draw a baked glow centred on a screen point, at `size` px across. */
function glow(
  ctx: CanvasRenderingContext2D,
  rgb: string,
  size: number,
  sx: number,
  sy: number,
  alpha: number,
): void {
  if (alpha <= 0 || size <= 0) return;
  const baked = glowSprite(rgb, size / 2);
  if (!baked) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(baked, sx - size / 2, sy - size / 2, size, size);
  ctx.globalAlpha = 1;
}

/**
 * THE ONE-SHOT BURSTS — the moves that happen and are over: the pulse ring, the
 * blink's two ends, a fissure opening, a shout going out, a volley leaving.
 *
 * All five share one `Effect` kind and switch on `eliteKind`, mirroring the one
 * `eliteCast` event they came from. Returns true when it claimed the effect, so
 * it slots into `drawEffects`' chain exactly as `drawGore` and `drawLootShine`
 * do. Every one of them is `t`-driven off the effect's own duration rather than
 * off a frame counter, so they play at the same speed however the run is
 * stepping — the effects gallery's SLOW MOTION included.
 */
export function drawEliteBurst(
  ctx: CanvasRenderingContext2D,
  effect: {
    kind: string;
    eliteKind?: BossAbilityId;
    look?: AbilityLook;
    to?: { x: number; y: number };
    radius?: number;
    untilMs: number;
    durationMs?: number;
    pos: { x: number; y: number };
  },
  x: number,
  groundY: number,
  timeMs: number,
  camera: Camera,
): boolean {
  if (effect.kind !== "elite") return false;
  const look = effect.look ?? DEFAULT_ELITE_LOOK;
  const duration = effect.durationMs ?? 420;
  const t = clamp01(1 - (effect.untilMs - timeMs) / duration);
  // Everything below fades on the SAME curve — a burst that held full strength
  // and then vanished reads as a dropped frame rather than as an effect ending.
  const fade = 1 - t;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  switch (effect.eliteKind) {
    case "shock_pulse": {
      // A ring EXPANDING to its authored radius, drawn as a bright edge rather
      // than a filled disc: the edge is the thing that reaches you, and a
      // filled one would hide the mob that threw it.
      const reach = (effect.radius ?? 48) * 2;
      const size = reach * (0.2 + 0.8 * t);
      glow(ctx, look.hot, size, x, groundY, 0.5 * fade);
      glow(ctx, look.core, size * 1.35, x, groundY, 0.28 * fade);
      break;
    }
    case "blink_strike": {
      // BOTH ENDS, on one effect: the light collapsing where the mob left and
      // blooming where it arrived, with a thin streak between. Two separate
      // effects would drift apart under any hitch and stop reading as one move.
      const to = effect.to;
      glow(ctx, look.core, 34 * (1 - t) + 8, x, groundY, 0.6 * fade);
      if (to) {
        const tx = Math.round(to.x - camera.x);
        const ty = Math.round(to.y - camera.y);
        glow(ctx, look.hot, 10 + 30 * t, tx, ty, 0.65 * fade);
        // The streak: a handful of beads laid along the jump, brightest at the
        // arrival end, so the eye is pulled to where the mob actually IS.
        for (let i = 1; i < 7; i++) {
          const s = i / 7;
          glow(
            ctx,
            look.spark,
            9,
            x + (tx - x) * s,
            groundY + (ty - groundY) * s,
            0.3 * fade * s,
          );
        }
      }
      break;
    }
    case "quake_line": {
      // The flash of one fissure opening. The CRACK itself is authored art laid
      // on the floor plane by the ground pass — this is only the light that
      // comes up out of it, which is why it is short and why it does not move.
      const reach = (effect.radius ?? 20) * 2.2;
      glow(ctx, look.hot, reach * (0.5 + 0.5 * t), x, groundY, 0.55 * fade);
      break;
    }
    case "rally_cry": {
      // A shout: two rings leaving on a stagger, so it reads as a sound going
      // out rather than as one more damage ring the player should dodge. It is
      // the only elite effect that never hurts anybody, and it has to LOOK
      // harmless or the player will spend the fight avoiding it.
      const reach = (effect.radius ?? 120) * 2;
      for (const lag of [0, 0.3]) {
        const s = clamp01(t - lag) / (1 - lag);
        if (s <= 0) continue;
        glow(ctx, look.core, reach * s, x, groundY, 0.2 * (1 - s));
      }
      break;
    }
    case "seeker_volley":
    case "orbit_guard":
    case "ember_trail":
    case "snare_field":
    case "siphon_tether":
    case "ward_shield": {
      // The CAST bloom every other primitive gets: a soft swell at the caster,
      // marking the moment the windup paid off. What the move then DOES is
      // drawn by its own long-lived layer — the ring and the shell and the
      // tether by `drawEliteAuras`, the burning ground and the weave by the
      // ground pass, the bolts by the projectile pass.
      glow(ctx, look.hot, 26 + 26 * t, x, groundY, 0.5 * fade);
      glow(ctx, look.core, 40 + 40 * t, x, groundY, 0.25 * fade);
      break;
    }
    default:
      break;
  }
  ctx.restore();
  return true;
}

/**
 * THE LIVE AURAS — the three effects that are STATE rather than events, read
 * straight off the casting mob every frame: the ring that is turning, the shell
 * that is up, the tether that is holding.
 *
 * They are drawn from state and not from an `Effect` for one reason: all three
 * are attached to a body that MOVES, and an effect list holds a position rather
 * than a subject. A ring spawned as an effect at the mob's position would stay
 * where the mob was standing when it cast, which is the one thing a ring around
 * somebody must not do.
 *
 * BILLBOARDED, because all three stand in the air about a body rather than
 * lying on the floor: a shell is around a mob's chest, a tether runs at chest
 * height, and the motes ride at the height of whatever conjured them. The
 * floor-plane effects (the snare's weave, the trail's burning ground) are
 * drawn by boss-fx.ts with the rest of the ground hazards, which is where they
 * belong.
 */
export function drawEliteAuras(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const enemy of state.enemies) {
    const mech = enemy.mech;
    if (!mech || enemy.hp <= 0) continue;
    if (!mech.orbitMs && !mech.wardHp && !mech.siphonMs) continue;
    if (!inView(enemy.pos.x, enemy.pos.y, 96)) continue;

    // Inside a billboard the coordinates are still SCREEN ones (the composite
    // works out to the identity at a whole-pixel offset) — so everything below
    // is drawn about the mob's own projected spot, exactly as the bait piles
    // and the actors are.
    beginBillboard(ctx, enemy.pos.x, enemy.pos.y, camera.x, camera.y);
    const sx = Math.round(enemy.pos.x - camera.x);
    const sy = Math.round(enemy.pos.y - camera.y);
    if (mech.orbitMs && mech.orbitAngle !== undefined) {
      drawOrbitRing(ctx, sprites, enemy, mech.orbitAngle, sx, sy, timeMs);
    }
    if (mech.wardHp) drawWard(ctx, enemy, sx, sy, timeMs);
    if (mech.siphonMs) drawTether(ctx, state, enemy, sx, sy, timeMs);
    endBillboard(ctx);
  }
}

/**
 * THE RING. Motes on a baked glow, at the positions the ENGINE says they are —
 * `orbitMotePositions` is imported rather than reimplemented, so the light the
 * player is dodging and the thing that bites them can never disagree.
 */
function drawOrbitRing(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  enemy: Enemy,
  angle: number,
  sx: number,
  sy: number,
  timeMs: number,
): void {
  const def = enemyDef(enemy.defId);
  const list = activeMechanics(enemy, def)?.abilities as
    BossAbility[] | undefined;
  const ability = list?.find((a) => a.id === "orbit_guard");
  if (!ability || ability.id !== "orbit_guard") return;
  const look = ability.look ?? DEFAULT_ELITE_LOOK;
  const art = spriteByName(sprites, ability.sprite);

  const motes = orbitMotePositions(
    { x: sx, y: sy },
    angle,
    ability.count,
    ability.radius,
  );
  // A slow shared breath so the ring is never quite static — the motes are
  // already moving, but light that does not also pulse reads as a decal.
  const breath = 0.82 + 0.18 * Math.sin(timeMs / 260);
  ctx.save();
  for (const mote of motes) {
    glow(ctx, look.core, ability.orbRadius * 5, mote.x, mote.y, 0.5 * breath);
    if (!art) continue;
    const tinted = recolorSprite(
      art,
      `elite:${ability.sprite}`,
      lookRamp(look),
    );
    const size = ability.orbRadius * 2.5;
    ctx.globalAlpha = breath;
    ctx.drawImage(tinted, mote.x - size / 2, mote.y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * THE SHELL. A bright rim with a soft fill inside it, sized to the body.
 *
 * The rim is what carries the read — a filled disc would hide the mob, and the
 * one thing an effect on a monster may never do is stop the player seeing the
 * monster. It BREATHES faster as it is spent, so a shell about to break is
 * visibly about to break; that is the whole feedback loop the move depends on,
 * since the player has to learn that hitting it harder is working.
 */
function drawWard(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  sx: number,
  sy: number,
  timeMs: number,
): void {
  const def = enemyDef(enemy.defId);
  const list = activeMechanics(enemy, def)?.abilities as
    BossAbility[] | undefined;
  const ability = list?.find((a) => a.id === "ward_shield");
  if (!ability || ability.id !== "ward_shield") return;
  const look = ability.look ?? DEFAULT_ELITE_LOOK;

  const pool = Math.max(1, Math.round(enemy.maxHp * ability.poolFrac));
  const left = clamp01((enemy.mech?.wardHp ?? 0) / pool);
  // Faster the more spent it is: 380 ms at full, down to ~140 ms on its last
  // sliver. A shell that pulsed at one rate would give the player nothing to
  // read but its colour.
  const beat = 140 + 240 * left;
  const pulse = 0.75 + 0.25 * Math.sin(timeMs / beat);
  const size = def.radius * 3.4;

  ctx.save();
  // The soft inside — kept low so the mob still reads clearly through it.
  glow(ctx, look.core, size, sx, sy, 0.22 * pulse);
  // The rim: a second, tighter glow standing just off the body, brightest at
  // full. Two blits rather than a stroked circle, for the reason in the header.
  glow(ctx, look.hot, size * 1.12, sx, sy, 0.3 * pulse * (0.45 + 0.55 * left));
  ctx.restore();
}

/**
 * THE TETHER. A gradient column stretched between the mob and whatever it is
 * drinking from, drawn out of `beamSprite` so it reads as light in the air
 * rather than as a painted rectangle.
 *
 * It is drawn INSIDE the caster's billboard and rotated to the hero, so it
 * stays put as the camera turns; the length is measured in world px and the
 * bearing comes from the projected difference, because a tether that measured
 * its own length on screen would stretch and shrink as the camera pitched.
 */
function drawTether(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  enemy: Enemy,
  sx: number,
  sy: number,
  timeMs: number,
): void {
  const def = enemyDef(enemy.defId);
  const list = activeMechanics(enemy, def)?.abilities as
    BossAbility[] | undefined;
  const ability = list?.find((a) => a.id === "siphon_tether");
  if (!ability || ability.id !== "siphon_tether") return;
  const look = ability.look ?? DEFAULT_ELITE_LOOK;

  const dx = localHero(state).pos.x - enemy.pos.x;
  const dy = localHero(state).pos.y - enemy.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const beam = beamSprite(look.core, 6, Math.round(len));
  if (!beam) return;

  // The DRAW runs along the beam, toward the mob — the direction the stolen
  // health is travelling, which is the one fact the picture has to carry.
  const crawl = (timeMs / 90) % 12;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
  // The column is baked pointing UP, so it is laid from the mob's feet outward
  // along the negative axis and then turned onto the bearing.
  ctx.globalAlpha = 0.7;
  ctx.drawImage(beam, -3, -len, 6, len);
  ctx.globalAlpha = 1;
  // Beads riding the line, so the drain has a direction rather than just a hue.
  for (let i = 0; i < 4; i++) {
    const t = ((i * 3 + crawl) % 12) / 12;
    glow(ctx, look.hot, 7, 0, -len * t, 0.55);
  }
  ctx.restore();
}
