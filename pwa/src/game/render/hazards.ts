// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level hazards that sweep the field: falling meteors with their ground
// telegraphs, rolling hay bales, sand storms, and the employee stampedes
// with their approach-dust warning.

import {
  ASTEROIDS,
  HAY_BALLS,
  SANDSTORMS,
  STAMPEDES,
  type GameState,
} from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { clamp01, type ViewSize } from "./shared.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/** Meteor strikes: each rock falls out of the sky on a slant toward its impact
 * mark. We draw two things per rock — a GROUND TELEGRAPH (a shadow at the
 * impact point that firms and tightens as the rock nears, the "something's
 * coming here" read, kept subtle so it never screams) and the tumbling rock
 * itself, lifted up-screen by its fading altitude and slid in from its entry
 * so it visibly streaks down onto the mark. */
export function drawAsteroids(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const rock of state.asteroids) {
    const t = clamp01(rock.ageMs / rock.fallMs);
    // Ground-projected position eases from entry to impact; the rock rides an
    // altitude that falls to 0 at impact.
    const gx = rock.entry.x + (rock.target.x - rock.entry.x) * t;
    const gy = rock.entry.y + (rock.target.y - rock.entry.y) * t;
    const height = ASTEROIDS.entryHeight * (1 - t);
    const tx = Math.round(rock.target.x - camera.x);
    const ty = Math.round(rock.target.y - camera.y);

    // The impact shadow: a soft dark ellipse at the mark, drawn only once the
    // rock is on approach and firming (darker + tighter) as impact nears — the
    // telegraph the hero (and bot) reads. Deliberately understated.
    if (inView(rock.target.x, rock.target.y, rock.blastRadius + 24)) {
      const warn = t * t; // ramps late, so the early fall barely marks the ground
      const r = rock.blastRadius * (1.15 - 0.4 * warn);
      ctx.save();
      ctx.globalAlpha = 0.06 + 0.26 * warn;
      ctx.fillStyle = "#050608";
      ctx.beginPath();
      ctx.ellipse(tx, ty, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // A thin rim that tightens onto the mark in the final beats — a hair of a
      // reticle, not a bullseye.
      if (warn > 0.35) {
        ctx.globalAlpha = 0.12 + 0.3 * warn;
        ctx.strokeStyle = "#c8b8a0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(tx, ty, r * 0.62, r * 0.31, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    const sx = Math.round(gx - camera.x);
    const sy = Math.round(gy - camera.y - height);
    if (!inView(gx, gy - height, 40)) continue;
    const frame = Math.floor(timeMs / 120 + rock.id) % 2;
    const sprite = spriteByName(sprites, `asteroid_${frame}`);
    if (!sprite) continue;
    // The rock looms a touch larger up high and settles to its true size as it
    // lands, selling the plunge toward the camera.
    const size = Math.max(
      12,
      Math.round((rock.rockRadius * 2 + 6) * (1 + 0.35 * (1 - t))),
    );
    // A faint fiery entry streak trailing up the fall line.
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - t) + 0.15;
    ctx.strokeStyle = "#ff9a4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (rock.entry.x - rock.target.x) * 0.04, sy + height * 0.18);
    ctx.stroke();
    ctx.restore();
    ctx.drawImage(
      sprite,
      Math.round(sx - size / 2),
      Math.round(sy - size / 2),
      size,
      size,
    );
  }
}

/** Hay bales roll along the ground plane, spinning (the frame flip) and
 * bouncing (a sine hop off `bouncePeriodMs`/`bounceHeight`, renderer only) —
 * a ground shadow that tightens as the bale rises sells the hop. */
export function drawHayBalls(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const ball of state.hayBalls) {
    if (!inView(ball.pos.x, ball.pos.y, 40)) continue;
    const size = Math.max(12, Math.round(ball.radius * 2 + 2));
    const phase = (((timeMs / HAY_BALLS.bouncePeriodMs + ball.id) % 1) + 1) % 1;
    const hop = HAY_BALLS.bounceHeight * Math.abs(Math.sin(Math.PI * phase));
    const sx = Math.round(ball.pos.x - camera.x);
    const sy = Math.round(ball.pos.y - camera.y);
    // Ground shadow (drawn first, at the resting pos), shrinking as it rises.
    const shrink = 1 - (0.45 * hop) / HAY_BALLS.bounceHeight;
    ctx.save();
    ctx.globalAlpha = 0.28 * shrink;
    ctx.fillStyle = "#1a1c2c";
    ctx.beginPath();
    ctx.ellipse(
      sx,
      sy + size / 2 - 2,
      (size / 2) * shrink,
      size / 5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    const frame = Math.floor(timeMs / 90 + ball.id) % 2;
    const sprite = spriteByName(sprites, `hay_ball_${frame}`);
    if (!sprite) continue;
    ctx.drawImage(
      sprite,
      Math.round(sx - size / 2),
      Math.round(sy - size / 2 - hop),
      size,
      size,
    );
  }
}

/** Sand storms sweep over the ground plane like the rocks — drawn AFTER the
 * hero so a gust visibly passes OVER him (he lies knocked out beneath it).
 * Each storm churns through its four frames and, once it has struck, thins
 * out over its fade window as it drifts away and vanishes. */
export function drawSandstorms(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const storm of state.sandstorms) {
    if (!inView(storm.pos.x, storm.pos.y, storm.radius + 40)) continue;
    const frame = Math.floor(timeMs / 120 + storm.id) % 4;
    const sprite = spriteByName(sprites, `sandstorm_${frame}`);
    if (!sprite) continue;
    // The visual is a touch wider than the collision body so the swirl reaches
    // the hero as it catches him. A struck storm fades with its timer.
    const size = Math.round(storm.radius * 2 + 24);
    const fade =
      storm.fadeMs === null ? 1 : clamp01(storm.fadeMs / SANDSTORMS.fadeMs);
    ctx.globalAlpha = 0.88 * fade;
    ctx.drawImage(
      sprite,
      Math.round(storm.pos.x - size / 2 - camera.x),
      Math.round(storm.pos.y - size / 2 - camera.y),
      size,
      size,
    );
    ctx.globalAlpha = 1;
  }
}

/** The three employee-runner looks a stampede's `runner.variant` (0..2) indexes
 * into — the sprite family letters (suit / lab coat / hi-vis). */
const STAMPEDE_VARIANTS = ["a", "b", "c"] as const;

/** The dusty cloud that boils off a charging herd's BACK (to its right, since it
 * charges left) — a churn of translucent tan/grey puffs that signals the wall is
 * moving at great speed and flattening everything. Purely presentational; the
 * puff positions are seeded off the herd id + a slow time churn so the cloud
 * roils without allocating. */
function drawHerdDust(
  ctx: CanvasRenderingContext2D,
  herd: GameState["stampedes"][number],
  camera: { x: number; y: number },
  timeMs: number,
): void {
  const cx = herd.pos.x - camera.x;
  const cy = herd.pos.y - camera.y;
  const back = STAMPEDES.bandHalfDepth - 2; // the wall's trailing edge
  const trail = STAMPEDES.bandHalfDepth * 2 + 70; // how far the cloud streams
  const puffs = 22;
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    // A slow per-puff churn phase; the trail streams back and thins with depth.
    const churn = timeMs / 240 + i * 1.7 + herd.id;
    const depth = (i / puffs + (churn % 1) * 0.35) % 1; // 0 = at the wall
    const px = cx + back + depth * trail;
    const py =
      cy +
      Math.sin(churn) * STAMPEDES.bandHalfHeight +
      Math.cos(churn * 1.3 + i) * 8;
    const r = (1 - depth) * 15 + 6;
    // A warm, dusty churn — darker body puffs with lighter kicked-up motes on
    // top — pitched to read against the pale SpaceZ floor.
    ctx.globalAlpha = (1 - depth) * 0.5;
    ctx.fillStyle =
      i % 3 === 0 ? "#efe7d4" : i % 3 === 1 ? "#b0a892" : "#8f8874";
    ctx.beginPath();
    ctx.arc(Math.round(px), Math.round(py), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** The APPROACH-DUST TELEGRAPH: a line of dust kicking up across the lane a herd
 * is about to charge down (`state.stampedeWarn`), spanning the view width at the
 * warned world-y. It fades IN as the spawn nears (the warn's `ageMs / leadMs`
 * progress), so the player reads WHICH band to clear before the runners appear.
 * Purely presentational; each puff's churn is seeded off time + index so the line
 * roils without allocating. */
export function drawStampedeWarn(
  ctx: CanvasRenderingContext2D,
  warn: NonNullable<GameState["stampedeWarn"]>,
  camera: { x: number; y: number },
  view: ViewSize,
  timeMs: number,
): void {
  const progress = clamp01(warn.ageMs / warn.leadMs);
  if (progress <= 0) return;
  const laneY = warn.y - camera.y;
  // A lane scrolled well off the top/bottom needs no dust drawn.
  if (laneY < -40 || laneY > view.height + 40) return;
  const puffs = 16;
  const spread = STAMPEDES.bandHalfHeight * 0.6;
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    // Spread evenly across the whole view width — the wall sweeps the full lane —
    // each puff bobbing within the band on its own churn phase.
    const churn = timeMs / 260 + i * 1.9;
    const px = ((i + 0.5) / puffs) * view.width + Math.sin(churn) * 6;
    const py = laneY + Math.cos(churn * 1.3 + i) * spread;
    // Puffs grow and brighten as the herd nears, with a soft per-puff flicker.
    const flicker = 0.7 + 0.3 * Math.sin(churn * 2 + i);
    const r = (3 + progress * 6) * flicker;
    ctx.globalAlpha = progress * 0.4 * flicker;
    ctx.fillStyle = i % 2 === 0 ? "#d8cfb8" : "#a89f88";
    ctx.beginPath();
    ctx.arc(Math.round(px), Math.round(py), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Employee stampedes charge over the ground plane like the storms — drawn
 * AFTER the hero so a herd visibly tramples OVER him (he lies knocked down
 * beneath it). A churning dust cloud boils off the wall's BACK (to its right,
 * since it charges left), then the five runners ride their offsets, each with
 * a little leg-pumping bob out of step with the pack. */
export function drawStampedes(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  for (const herd of state.stampedes) {
    if (!inView(herd.pos.x, herd.pos.y, STAMPEDES.bandHalfHeight + 80))
      continue;
    drawHerdDust(ctx, herd, camera, timeMs);
    // Draw back-to-front (smaller dy first) so the front rank overlaps cleanly.
    const order = [...herd.runners].sort((a, b) => a.dy - b.dy);
    for (const runner of order) {
      const rx = herd.pos.x + runner.dx;
      const ry = herd.pos.y + runner.dy;
      const family =
        STAMPEDE_VARIANTS[runner.variant % STAMPEDE_VARIANTS.length];
      const frame = Math.floor(timeMs / 110 + runner.phase * 2) % 2;
      const sprite = spriteByName(sprites, `stampede_${family}_${frame}`);
      if (!sprite) continue;
      // Drawn at 3× the runner radius — a touch over the body so the art isn't
      // clipped to the collision circle. Halved with the runner radius so the
      // herd reads as a smaller, easier-to-clear wall.
      const size = STAMPEDES.runnerRadius * 3;
      // A quick pumping bob so the wall reads as a hard sprint, not a slide.
      const bob =
        2 * Math.abs(Math.sin(Math.PI * (timeMs / 130 + runner.phase)));
      const sx = Math.round(rx - size / 2 - camera.x);
      const sy = Math.round(ry - size / 2 - camera.y - bob);
      // A tight ground shadow anchors each runner to the floor.
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#1a1c2c";
      ctx.beginPath();
      ctx.ellipse(
        Math.round(rx - camera.x),
        Math.round(ry - camera.y + size / 2 - 3),
        size / 2.6,
        size / 6,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
      ctx.drawImage(sprite, sx, sy, size, size);
    }
  }
}
