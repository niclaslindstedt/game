// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOSS ABILITY CATALOG's world-anchored FX (see
// src/game/defs/enemies/abilities.ts): the sweeping beam and the burning floor
// it leaves behind.
//
// Everything here is drawn out of SPRITES rather than out of the 2D context's
// primitives, and that is the whole brief. The set-piece FX this replaces were
// a strobing `ctx.arc` ring and a `ctx.lineTo` — shapes, not art, sitting on
// top of a game whose every other pixel is authored. A stroked circle reads as
// a debug overlay because that is what a stroked circle IS.
//
// Two layers, drawn at different depths by render.ts:
//   • THE SCORCH is on the GROUND, under everything that walks, because the
//     hero and the horde stand ON burning ground rather than behind it.
//   • THE BEAM is over the actors, because it is light in the air between the
//     boss's eyes and the far wall, and light passes in front of a body.

import { activeMechanics, enemyDef, type GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { clamp01 } from "./shared.ts";
import { type Camera } from "./view.ts";

type InView = (x: number, y: number, margin: number) => boolean;

/** How many flame licks stand on one scorch patch. Two, not three: a band is
 * several patches deep wherever the beam swept, so three apiece stacked into a
 * wall of cyan that read as the effect rather than as the floor under it. */
const LICKS_PER_PATCH = 2;
/** Ms per flame frame — fast, so the fire flickers rather than pulsing. */
const LICK_FRAME_MS = 110;
/** The scorch's last stretch, over which it cools and fades out. */
const COOL_FRAC = 0.35;

/**
 * BURNING FLOOR. Each patch is an authored char blot with flame licks standing
 * on it, and two things keep a field of them from reading as a row of stamps:
 * every patch draws its licks at its OWN seeded offsets and its OWN frame
 * phase, so no two flicker together; and the blot is drawn at a slight seeded
 * rotation, so the same 24×20 sprite laid forty times never lines up with
 * itself. Cools over its last third rather than snapping out — fire that
 * vanished on a timer would read as a bug.
 */
export function drawScorches(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  if (state.scorches.length === 0) return;
  const blot = spriteByName(sprites, "scorch_char");
  if (!blot) return;
  for (const patch of state.scorches) {
    if (!inView(patch.pos.x, patch.pos.y, patch.radius + 16)) continue;
    const left = clamp01(patch.remainingMs / patch.durationMs);
    // Full strength until the last stretch, then cool away.
    const heat = left > COOL_FRAC ? 1 : left / COOL_FRAC;
    const sx = Math.round(patch.pos.x - camera.x);
    const sy = Math.round(patch.pos.y - camera.y);
    const size = Math.round(patch.radius * 2);

    ctx.save();
    // Kept well under opaque even at full heat: burnt ground is the FLOOR with
    // a mark on it, and a patch you cannot see the regolith through reads as a
    // hole cut in the level. Overlapping patches darken it the rest of the way.
    ctx.globalAlpha = 0.28 + 0.3 * heat;
    ctx.translate(sx, sy);
    // A quarter turn per seed — four orientations is enough to break the
    // repeat and costs nothing, and it keeps the blot pixel-aligned.
    ctx.rotate((Math.PI / 2) * (patch.seed % 4));
    ctx.drawImage(
      blot,
      Math.round(-size / 2),
      Math.round(-size / 2),
      size,
      Math.round(size * 0.83),
    );
    ctx.restore();

    // The licks: additive, so overlapping patches pool into brighter fire
    // instead of stacking into flat opaque cyan.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < LICKS_PER_PATCH; i++) {
      const spin = patch.seed * 7 + i * 211;
      const angle = (spin % 360) * (Math.PI / 180);
      const reach = patch.radius * (0.2 + ((spin % 13) / 13) * 0.6);
      const frame = Math.floor(timeMs / LICK_FRAME_MS + spin) % 3;
      const lick = spriteByName(sprites, `ghostfire_${frame}`);
      if (!lick) continue;
      // Fire stands UP off the floor, so each lick is lifted by its own height
      // and only its foot sits at the sampled point.
      const lx = Math.round(sx + Math.cos(angle) * reach - 4);
      const ly = Math.round(sy + Math.sin(angle) * reach * 0.5 - 10);
      ctx.globalAlpha = (0.3 + 0.3 * heat) * (0.7 + 0.3 * ((spin % 5) / 5));
      ctx.drawImage(lick, lx, ly, 6, 9);
    }
    ctx.restore();
  }
}

/**
 * THE BEAM, and the PILOT LIGHT that precedes it.
 *
 * The windup's tell is the boss's own cast pose (drawEnemies swaps his frames
 * — his eyes light), and this adds the second half of the read: a stub of the
 * beam itself, dim and short, growing along the locked bearing as the windup
 * runs out. It is the SAME sprite as the beam, so the player is being shown
 * the actual thing rather than an abstract marker pointing at where it will
 * be — which is the difference between "a line is drawn on the floor" and
 * "he is charging up, and he is aiming THERE".
 */
export function drawBeams(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  const seg = spriteByName(sprites, "laser_seg");
  const bloom = spriteByName(sprites, "laser_bloom");
  if (!seg) return;
  for (const enemy of state.enemies) {
    const mech = enemy.mech;
    if (!mech) continue;
    const beam = mech.beam;
    const winding =
      mech.telegraph?.kind === "laser_eyes" ? mech.telegraph : undefined;
    if (!beam && !winding) continue;
    if (!inView(enemy.pos.x, enemy.pos.y, 260)) continue;

    // The eyes sit up the body, not at its feet — lift the source so the beam
    // leaves his face. The def's radius is the only measure of him the
    // renderer has, and two thirds up it lands on the visor.
    const def = enemyDef(enemy.defId);
    const ox = enemy.pos.x - camera.x;
    const oy = enemy.pos.y - camera.y - def.radius * 0.7;

    let angle: number;
    let reach: number;
    let alpha: number;
    let width: number;
    if (beam) {
      const t = 1 - clamp01(beam.remainingMs / beam.durationMs);
      angle = beam.angle - beam.sweep / 2 + beam.sweep * t;
      reach = beam.range;
      width = beam.width * 2;
      // A hair of flicker so the beam is alive, never a painted stripe.
      alpha = 0.9 + 0.1 * Math.sin(timeMs / 40);
    } else if (winding?.dir) {
      // The pilot light: dim, and only as long as the windup has run.
      const grown = 1 - clamp01(winding.remainingMs / Math.max(1, 1100));
      const active = activeMechanics(enemy, def);
      const spec = active?.abilities?.find((a) => a.id === "laser_eyes");
      angle = Math.atan2(winding.dir.y, winding.dir.x);
      reach =
        (spec && "range" in spec ? spec.range : 200) * (0.2 + 0.5 * grown);
      width = 4 + 6 * grown;
      alpha = 0.15 + 0.4 * grown;
    } else {
      continue;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy);
    ctx.rotate(angle);
    // Tiled along its own axis: one authored slice repeated to whatever length
    // the beam happens to be, which is why the slice tiles seamlessly.
    const step = 8;
    for (let d = 0; d < reach; d += step) {
      // The last cell is clipped rather than squashed — a partial run takes a
      // partial slice of the source, so the band's cross-section never changes
      // thickness at the beam's tip.
      const run = Math.min(step, reach - d);
      ctx.drawImage(seg, 0, 0, run, 8, d, -width / 2, run, width);
    }
    ctx.restore();

    // The bloom where it leaves him, and — while the beam is live — a second
    // one where it lands, so the far end terminates in light instead of being
    // chopped off mid-air.
    if (bloom) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      const size = beam ? 26 : 14 + width;
      ctx.drawImage(
        bloom,
        Math.round(ox - size / 2),
        Math.round(oy - size / 2),
        size,
        size,
      );
      if (beam) {
        const ex = ox + Math.cos(angle) * reach;
        const ey = oy + Math.sin(angle) * reach;
        ctx.globalAlpha = alpha * 0.7;
        ctx.drawImage(bloom, Math.round(ex - 9), Math.round(ey - 9), 18, 18);
      }
      ctx.restore();
    }
  }
}

/** Ms per glint step on a live bait pile — slow, so it TWINKLES like loot. */
const BAIT_GLINT_MS = 260;
/** The share of its life a pile spends visibly going cold at the end. */
const BAIT_FADE_FRAC = 0.25;

/**
 * BAIT (`state.baits` — PUMP AND DUMP). Drawn to look like LOOT, because that
 * is the whole move: the pile has to be genuinely tempting or the ability is
 * just a mine with extra steps.
 *
 * So it gets the treatment a real pickup gets — a warm glow under it and a
 * travelling glint on top — and the ONE thing that separates it from loot is
 * honest and readable rather than hidden: while a pile is still ARMING it sits
 * dull and unlit, and the moment it goes live the glint starts. A player who
 * has been caught once knows to read that, and a player who hasn't is about to
 * learn it for the price of a single detonation.
 *
 * Deliberately NOT marked with a warning colour or a danger ring. A bait pile
 * that announced itself would not be bait, and the move would be pointless.
 */
export function drawBaits(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  if (state.baits.length === 0) return;
  const pile = spriteByName(sprites, "bait_pile");
  if (!pile) return;
  for (const bait of state.baits) {
    if (!inView(bait.pos.x, bait.pos.y, 24)) continue;
    const left = clamp01(bait.remainingMs / bait.durationMs);
    const cooling = left > BAIT_FADE_FRAC ? 1 : left / BAIT_FADE_FRAC;
    const armed = bait.armMs <= 0;
    const sx = Math.round(bait.pos.x - camera.x);
    const sy = Math.round(bait.pos.y - camera.y);

    // The come-hither glow every pickup in the game wears.
    if (armed) {
      const twinkle = 0.5 + 0.5 * Math.sin(timeMs / BAIT_GLINT_MS + bait.seed);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (0.16 + 0.14 * twinkle) * cooling;
      const glow = ctx.createRadialGradient(sx, sy, 1, sx, sy, 16);
      glow.addColorStop(0, "#ffd75e");
      glow.addColorStop(1, "rgba(255,215,94,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    // An arming pile is dull — the only tell it ever gives, and a fair one.
    ctx.globalAlpha = (armed ? 1 : 0.7) * cooling;
    ctx.drawImage(pile, sx - 6, sy - 6, 12, 12);
    ctx.restore();
  }
}

/** Ms per step of the tether's travelling pulse. */
const TETHER_PULSE_MS = 420;

/**
 * THE REPAIR TETHER (`recompile`): the visible line of custody between a node
 * and the boss it is putting back together.
 *
 * This is the entire reason the ability is a mechanic rather than a cheap trick.
 * A boss whose bar simply climbs is telling the player "you are too slow"; a
 * boss visibly drinking from a thing standing in the room is telling them
 * "break that". So the tether is never subtle and never optional — it is drawn
 * for as long as the healing runs, and it PULSES from the node toward the boss
 * so the direction of the favour is unmistakable.
 *
 * Built from the beam's own authored slice rather than a stroked line, for the
 * same reason everything else here is: a `ctx.lineTo` between two sprites reads
 * as a debug overlay, and this is the one thing in the fight the player most
 * needs to believe in.
 */
export function drawTethers(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  inView: InView,
  timeMs: number,
): void {
  const seg = spriteByName(sprites, "laser_seg");
  if (!seg) return;
  for (const enemy of state.enemies) {
    const nodeId = enemy.mech?.nodeId;
    if (nodeId === undefined) continue;
    const node = state.enemies.find((e) => e.id === nodeId && e.hp > 0);
    if (!node) continue;
    if (!inView(enemy.pos.x, enemy.pos.y, 220)) continue;

    const def = enemyDef(enemy.defId);
    const ax = node.pos.x - camera.x;
    const ay = node.pos.y - camera.y - 10;
    const bx = enemy.pos.x - camera.x;
    const by = enemy.pos.y - camera.y - def.radius * 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(dy, dx));
    const step = 8;
    for (let d = 0; d < len; d += step) {
      const run = Math.min(step, len - d);
      // The pulse: a bright cell travelling node → boss, so which way the
      // health is flowing is legible without reading either health bar.
      const wave = (((d / len - timeMs / TETHER_PULSE_MS) % 1) + 1) % 1;
      ctx.globalAlpha = 0.32 + 0.5 * Math.max(0, 1 - wave * 6);
      ctx.drawImage(seg, 0, 0, run, 8, d, -3, run, 6);
    }
    ctx.restore();
  }
}
