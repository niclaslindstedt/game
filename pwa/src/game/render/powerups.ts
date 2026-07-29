// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The RUNNING powerups' world visuals — everything a live power puts on the
// field, drawn off the engine's own state so what is seen is exactly what is
// ticking: the orbit ring's comet-tailed orbs, the stasis dome, the magnet's
// field lines, the ION WAKE's burning patches, a well's throat (a black hole
// that swallows or a grit column that shreds), the SENTRY GRID's guns, and the
// shells the hero wears (barrier plates, ward runes, surge heat, the spectral
// shroud). One-shot bursts (a moon rock landing, an unmaking wave, a shield
// shattering, a ward holding) are transient effects instead — see ./effects.ts.
//
// House rules, same as every other FX module: additive light NEVER occludes
// (`lighter` for glow, plain for the darks), every animation is driven off the
// world clock rather than frame counters, and nothing here reads `Math.random`
// — a wobble is a hash of the thing's own index, so the picture is stable
// across frames and identical between runs.

import {
  abilityDef,
  magnetRadius,
  orbPositions,
  stasisRadius,
  type ActiveAbility,
  type GameState,
} from "@game/core";

import { spriteByName, type GameAssets } from "../assets.ts";
import { powerupStyle, type PowerupStyle } from "../powerup-fx.ts";
import { clamp01 } from "./shared.ts";
import { drawSpriteCentered } from "./shared.ts";
import { beginBillboard, billboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

/** Ground circles are drawn on the same squash every other footprint in the
 * game uses, so a power's reach reads as lying ON the floor. */
const GROUND_SQUASH = 0.62;

/** A deterministic 0..1 wobble for index `i` — the render side's stand-in for
 * randomness (see the module header). */
function jitter(i: number): number {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/** Stroke a squashed ground ellipse of `radius` at screen (`x`, `y`). */
function groundRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * GROUND_SQUASH, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** Fill a squashed ground ellipse of `radius` at screen (`x`, `y`). */
function groundDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * GROUND_SQUASH, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Every running powerup's world visual. Called from the render pass in the
 * actor band (under the hero, over the horde) so a shell reads as worn and a
 * field as stood in.
 */
export function drawRunningPowerups(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
): void {
  const player = state.player;
  if (player.abilities.length === 0) return;
  const px = Math.round(player.pos.x - camera.x);
  const py = Math.round(player.pos.y - camera.y);

  for (const ability of player.abilities) {
    const def = abilityDef(ability.defId);
    const style = powerupStyle(ability.defId);
    if (def.orbit) drawOrbitRing(ctx, state, assets, ability, camera, timeMs);
    if (def.stasis) {
      drawStasisDome(ctx, px, py, stasisRadius(state, def), style, timeMs);
    }
    if (def.magnet) {
      drawMagnetField(
        ctx,
        state,
        camera,
        magnetRadius(state, def),
        style,
        timeMs,
      );
    }
    if (def.trail)
      drawWakePatches(ctx, ability, def.trail, camera, style, timeMs);
    if (def.well) drawWellCore(ctx, ability, def.well, camera, style, timeMs);
    if (def.volley) {
      drawPowerShots(ctx, state, camera, style, def.volley.sprite, timeMs);
    }
    if (def.turret) {
      drawTurrets(ctx, assets, ability, def.turret.intervalMs, camera, style);
      drawPowerShots(ctx, state, camera, style, def.turret.sprite, timeMs);
    }
    // THE WORN LAYERS. Everything above is a FIELD lying on the ground and
    // foreshortens with it (this module has drawn its own `GROUND_SQUASH`
    // ellipses since long before the tilt existed — the tilt just deepens
    // them). These four are worn ON the hero, who stands up out of the floor,
    // so they have to stand with him or they sit low around his knees.
    beginBillboard(ctx, player.pos.x, player.pos.y, camera.x, camera.y);
    if (def.barrier) {
      drawBarrierShell(
        ctx,
        ability,
        def.barrier.poolFrac * player.maxHp,
        px,
        py,
        style,
        timeMs,
      );
    }
    if (def.ward) drawWardRunes(ctx, px, py, style, timeMs);
    if (def.surge) drawSurgeHeat(ctx, px, py, style, timeMs);
    if (def.phase) drawSpectralShroud(ctx, px, py, style, timeMs);
    endBillboard(ctx);
  }
}

/**
 * FIRE ORBS: each orb is a burning comet, not a decal. Under the sprite goes a
 * hot additive bloom; BEHIND it, five afterimages laid back along the ring so
 * the orb reads as sweeping; off it, embers shed outward and cool. A faint
 * scorch ring on the floor marks the circle the fire is carving.
 */
function drawOrbitRing(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  ability: ActiveAbility,
  camera: Camera,
  timeMs: number,
): void {
  const def = abilityDef(ability.defId);
  const orbit = def.orbit;
  if (!orbit) return;
  const style = powerupStyle(ability.defId);
  const sprite =
    spriteByName(assets.sprites, orbit.sprite) ?? assets.sprites.fireball;
  const player = state.player;

  ctx.save();
  // NO scorch ring: a drawn circle on the floor reads as a decal someone
  // painted there, and the orbs' own tails already describe the circle they
  // ride. All that is left is light.
  ctx.globalCompositeOperation = "lighter";
  const orbs = orbPositions(player, ability);
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i]!;
    const ox = orb.x - camera.x;
    const oy = orb.y - camera.y;
    // Comet tail: afterimages laid BACK along the ring (against the sweep),
    // each smaller and fainter than the last.
    for (let t = 1; t <= 5; t++) {
      const back = ability.angle - t * 0.13 + (i * Math.PI * 2) / orbs.length;
      const tx = player.pos.x + Math.cos(back) * orbit.radius - camera.x;
      const ty = player.pos.y + Math.sin(back) * orbit.radius - camera.y;
      const fade = (1 - t / 6) ** 2;
      ctx.fillStyle = `rgba(${style.core}, ${0.46 * fade})`;
      ctx.beginPath();
      ctx.arc(tx, ty, orbit.orbRadius * (1 - t * 0.11), 0, Math.PI * 2);
      ctx.fill();
    }
    // Heat bloom under the sprite — the light the orb throws on the field.
    const pulse = 0.8 + 0.2 * Math.sin(timeMs / 90 + i * 2.1);
    const reach = orbit.orbRadius * 2.6 * pulse;
    const bloom = ctx.createRadialGradient(ox, oy, 0, ox, oy, reach);
    bloom.addColorStop(0, `rgba(${style.hot}, 0.7)`);
    bloom.addColorStop(0.35, `rgba(${style.core}, 0.4)`);
    bloom.addColorStop(1, `rgba(${style.core}, 0)`);
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(ox, oy, reach, 0, Math.PI * 2);
    ctx.fill();
    // Embers shed off the orb, drifting outward and up as they cool.
    for (let e = 0; e < 3; e++) {
      const seed = i * 7 + e * 3;
      const life = (timeMs / 460 + jitter(seed)) % 1;
      const drift = 4 + life * 12;
      const ex = ox + Math.cos(jitter(seed + 1) * Math.PI * 2) * drift;
      const ey =
        oy + Math.sin(jitter(seed + 2) * Math.PI * 2) * drift - life * 8;
      ctx.fillStyle = `rgba(${style.spark}, ${(1 - life) * 0.8})`;
      ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
  }
  ctx.restore();
  // The sprites ride on top of their own light, drawn normally — and each
  // stands up out of the tilted floor at its own spot on the ring, so the
  // circle they ride foreshortens into an orbit around him rather than a hoop
  // painted on him (render/tilt.ts).
  for (const orb of orbs) {
    billboard(ctx, orb.x, orb.y, camera.x, camera.y, () =>
      drawSpriteCentered(ctx, sprite, orb, camera),
    );
  }
}

/**
 * STASIS FIELD: a dome of stopped time rather than a thin circle. A cold wash
 * fills the reach, a crystal LATTICE turns inside it at a crawl (the field's
 * own clock, visibly slower than everything else on screen), ice spurs stand
 * up around the rim, and frost motes hang almost still in the air — the read
 * is "in here, nothing is allowed to hurry".
 */
function drawStasisDome(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radius: number,
  style: PowerupStyle,
  timeMs: number,
): void {
  ctx.save();
  // The cold wash: a shallow radial fill, darkest at the rim, so the ground
  // inside reads as frozen over without hiding what stands on it.
  const wash = ctx.createRadialGradient(px, py, radius * 0.2, px, py, radius);
  wash.addColorStop(0, `rgba(${style.core}, 0.03)`);
  wash.addColorStop(0.75, `rgba(${style.core}, 0.06)`);
  wash.addColorStop(1, `rgba(${style.hot}, 0.11)`);
  ctx.fillStyle = wash;
  groundDisc(ctx, px, py, radius);

  // The lattice: two counter-turning hexagon rings, drawn at a crawl.
  const slow = timeMs / 5200;
  ctx.globalCompositeOperation = "lighter";
  for (let ring = 0; ring < 2; ring++) {
    const r = radius * (ring === 0 ? 0.55 : 0.86);
    const spin = ring === 0 ? slow : -slow * 0.7;
    ctx.strokeStyle = `rgba(${style.core}, ${ring === 0 ? 0.16 : 0.11})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = spin + (i / 6) * Math.PI * 2;
      const x = px + Math.cos(a) * r;
      const y = py + Math.sin(a) * r * GROUND_SQUASH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Ice spurs standing off the rim — the field crystallising the air at its
  // edge. Each is a short spike, breathing on the field's slow pulse.
  const breathe = 0.75 + 0.25 * Math.sin(timeMs / 900);
  ctx.strokeStyle = `rgba(${style.hot}, ${0.24 * breathe})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + slow;
    const spur = 4 + jitter(i) * 5;
    const x0 = px + Math.cos(a) * radius;
    const y0 = py + Math.sin(a) * radius * GROUND_SQUASH;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(
      x0 + Math.cos(a) * spur * breathe,
      y0 + Math.sin(a) * spur * GROUND_SQUASH * breathe - spur * 0.5,
    );
    ctx.stroke();
  }

  // The rim itself, and a second edge ticking outward on the field's beat.
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${style.hot}, ${0.22 + 0.08 * Math.sin(timeMs / 900)})`;
  groundRing(ctx, px, py, radius);
  const tick = ((timeMs % 1800) / 1800) ** 0.6;
  ctx.strokeStyle = `rgba(${style.core}, ${0.18 * (1 - tick)})`;
  groundRing(ctx, px, py, radius * (0.2 + 0.8 * tick));

  // Frost motes, hanging almost still — they drift at a hundredth of the pace
  // an ember does, which is the whole joke of the field.
  for (let i = 0; i < 14; i++) {
    const a = jitter(i) * Math.PI * 2 + timeMs / 9000;
    const r = radius * (0.15 + jitter(i + 40) * 0.8);
    const x = px + Math.cos(a) * r;
    const y =
      py +
      Math.sin(a) * r * GROUND_SQUASH -
      ((timeMs / 40 + i * 90) % 30) * 0.4;
    ctx.fillStyle = `rgba(${style.hot}, 0.36)`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.restore();
}

/**
 * MAGNET: the pull made visible. Curved field LINES sweep inward around the
 * reach, a ring collapses toward the hero on a beat (the direction everything
 * is travelling), and every loose item actually caught in the field is roped
 * to him by a live tether — so the power reads as doing something to specific
 * loot rather than glowing near it.
 */
function drawMagnetField(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  radius: number,
  style: PowerupStyle,
  timeMs: number,
): void {
  const player = state.player;
  const px = Math.round(player.pos.x - camera.x);
  const py = Math.round(player.pos.y - camera.y);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Field lines: four arcs curling in toward the hero, turning slowly.
  const spin = timeMs / 1400;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a0 = spin + (i / 4) * Math.PI * 2;
    // Warm and thin: additive cream at full weight reads as white scratches
    // across the floor rather than as a field.
    ctx.strokeStyle = `rgba(${style.core}, 0.4)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const r = radius * (1 - t * 0.85);
      const a = a0 + t * 1.1; // the curl
      const x = px + Math.cos(a) * r;
      const y = py + Math.sin(a) * r * GROUND_SQUASH;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // The reach, and a ring collapsing inward on the pull's beat.
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${style.core}, ${0.45 + 0.15 * Math.sin(timeMs / 200)})`;
  groundRing(ctx, px, py, radius);
  const beat = (timeMs % 700) / 700;
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${style.hot}, ${0.6 * (1 - beat)})`;
  groundRing(ctx, px, py, radius * (1 - beat * 0.9));

  // Tethers to what the field actually has hold of — drawn only for items
  // inside the reach, so the rope appears the instant loot is caught.
  const reachSq = radius * radius;
  for (const item of state.items) {
    if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
    const dx = item.pos.x - player.pos.x;
    const dy = item.pos.y - player.pos.y;
    if (dx * dx + dy * dy > reachSq) continue;
    const ix = item.pos.x - camera.x;
    const iy = item.pos.y - camera.y;
    // A crawling dash pattern reads as the item being reeled in along the rope.
    const flow = (timeMs / 90) % 6;
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -flow;
    ctx.strokeStyle = `rgba(${style.spark}, 0.75)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * ION WAKE: the patches the hero has shed, each a pool of engine wash burning
 * itself out. A dark scorch grounds it, an additive core lights it, the edge
 * flickers on its own phase (so a line of patches crackles instead of pulsing
 * in unison), and embers lift off the hottest ones.
 */
function drawWakePatches(
  ctx: CanvasRenderingContext2D,
  ability: ActiveAbility,
  trail: NonNullable<ReturnType<typeof abilityDef>["trail"]>,
  camera: Camera,
  style: PowerupStyle,
  timeMs: number,
): void {
  const patches = ability.patches;
  if (!patches || patches.length === 0) return;
  ctx.save();
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i]!;
    // Life runs 1 (just laid) → 0 (going out); the pool shrinks as it cools.
    const life = clamp01(patch.remainingMs / trail.patchMs);
    const flicker = 0.82 + 0.18 * Math.sin(timeMs / 70 + i * 1.7);
    const reach = trail.radius * (0.55 + 0.45 * life) * flicker;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${style.deep}, ${0.34 * life})`;
    groundDisc(ctx, patch.pos.x - camera.x, patch.pos.y - camera.y, reach);
    ctx.globalCompositeOperation = "lighter";
    const x = patch.pos.x - camera.x;
    const y = patch.pos.y - camera.y;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, reach);
    glow.addColorStop(0, `rgba(${style.hot}, ${0.62 * life})`);
    // A HARD stop partway out, so each patch keeps an edge instead of
    // dissolving into its neighbours: a wake has to read as a line of fires.
    glow.addColorStop(0.55, `rgba(${style.core}, ${0.42 * life})`);
    glow.addColorStop(0.78, `rgba(${style.core}, ${0.12 * life})`);
    glow.addColorStop(1, `rgba(${style.core}, 0)`);
    ctx.fillStyle = glow;
    groundDisc(ctx, x, y, reach);
    // The core the fire is burning from — small, bright, and squarely pixel.
    ctx.fillStyle = `rgba(${style.hot}, ${0.75 * life})`;
    groundDisc(ctx, x, y, reach * 0.28);
    // Embers off the hot half of the pool's life.
    if (life > 0.5) {
      for (let e = 0; e < 2; e++) {
        const seed = i * 5 + e;
        const rise = (timeMs / 520 + jitter(seed)) % 1;
        const ex = x + (jitter(seed + 11) - 0.5) * reach * 1.4;
        const ey = y - rise * 14;
        ctx.fillStyle = `rgba(${style.spark}, ${(1 - rise) * 0.7 * life})`;
        ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
      }
    }
  }
  ctx.restore();
}

/**
 * A WELL's core, in the two looks the catalog knows (`PowerupStyle.wellLook`):
 *
 * VOID (EVENT HORIZON) — a black throat with nothing inside it, a hot lensing
 * ring around the mouth, an accretion arc spinning on the rim, and streaks
 * falling IN from the edge of its reach. The read is: things go in.
 *
 * GRIT (DUST DEVIL) — a column of spinning grit: three dust bands turning at
 * different rates around a dark spine, motes flung around it, and a scoured
 * ring on the floor where it is standing. The read is: things get shredded.
 */
function drawWellCore(
  ctx: CanvasRenderingContext2D,
  ability: ActiveAbility,
  well: NonNullable<ReturnType<typeof abilityDef>["well"]>,
  camera: Camera,
  style: PowerupStyle,
  timeMs: number,
): void {
  const core = ability.pos;
  if (!core) return;
  const x = Math.round(core.x - camera.x);
  const y = Math.round(core.y - camera.y);
  const radius = well.radius;
  ctx.save();

  if (style.wellLook === "grit") {
    // The scoured floor under the column.
    ctx.fillStyle = `rgba(${style.deep}, 0.28)`;
    groundDisc(ctx, x, y, radius);
    ctx.globalCompositeOperation = "lighter";
    // Three dust bands, each turning at its own rate — the shear is what makes
    // a column read as spinning rather than as a stack of rings.
    for (let band = 0; band < 3; band++) {
      const spin = timeMs / (240 - band * 50);
      const r = radius * (0.4 + band * 0.28);
      const lift = band * 9;
      ctx.strokeStyle = `rgba(${band === 2 ? style.spark : style.core}, ${0.4 - band * 0.08})`;
      ctx.lineWidth = 2 + band;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y - lift,
        r,
        r * GROUND_SQUASH,
        0,
        spin % (Math.PI * 2),
        (spin % (Math.PI * 2)) + Math.PI * 1.35,
      );
      ctx.stroke();
    }
    // Grit flung around the column, spiralling outward as it rises.
    for (let i = 0; i < 16; i++) {
      const life = (timeMs / 620 + jitter(i)) % 1;
      const a = jitter(i + 30) * Math.PI * 2 + timeMs / 180;
      const r = radius * (0.3 + life * 0.85);
      const gx = x + Math.cos(a) * r;
      const gy = y + Math.sin(a) * r * GROUND_SQUASH - life * 22;
      ctx.fillStyle = `rgba(${style.spark}, ${(1 - life) * 0.85})`;
      ctx.fillRect(Math.round(gx), Math.round(gy), 1 + (i % 2), 1 + (i % 2));
    }
    ctx.restore();
    return;
  }

  // VOID: the throat. Drawn dark FIRST (it must occlude — a black hole is the
  // one effect in the game that takes light away), then lit at the rim.
  const throat = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.62);
  throat.addColorStop(0, `rgba(${style.deep}, 0.98)`);
  throat.addColorStop(0.7, `rgba(${style.deep}, 0.82)`);
  throat.addColorStop(1, `rgba(${style.deep}, 0)`);
  ctx.fillStyle = throat;
  groundDisc(ctx, x, y, radius * 0.62);

  ctx.globalCompositeOperation = "lighter";
  // Streaks falling in: matter drawn from the rim toward the mouth, each one
  // brightening and shortening as it is swallowed.
  for (let i = 0; i < 18; i++) {
    const fall = (timeMs / 740 + jitter(i)) % 1;
    const a = jitter(i + 60) * Math.PI * 2;
    const from = radius * (1 - fall * 0.75);
    const to = from - 7 * (1 - fall);
    ctx.strokeStyle = `rgba(${style.spark}, ${0.15 + 0.6 * fall})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from * GROUND_SQUASH);
    ctx.lineTo(x + Math.cos(a) * to, y + Math.sin(a) * to * GROUND_SQUASH);
    ctx.stroke();
  }
  // The accretion arc riding the mouth, and the lensing ring around it.
  const spin = timeMs / 320;
  ctx.strokeStyle = `rgba(${style.hot}, 0.75)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(
    x,
    y,
    radius * 0.66,
    radius * 0.66 * GROUND_SQUASH,
    0,
    spin % (Math.PI * 2),
    (spin % (Math.PI * 2)) + Math.PI * 0.9,
  );
  ctx.stroke();
  ctx.strokeStyle = `rgba(${style.core}, ${0.4 + 0.15 * Math.sin(timeMs / 260)})`;
  ctx.lineWidth = 1;
  groundRing(ctx, x, y, radius * 0.72);
  groundRing(ctx, x, y, radius);
  ctx.restore();
}

/**
 * The light a power's own SHOTS carry. The engine draws the sprite; this adds
 * what makes it that power's shot — a comet trail streaming behind it and a
 * bloom around it, in the power's own colours. Matched by SPRITE, which is the
 * one thing a powerup's projectile has that nothing else on the field does.
 */
function drawPowerShots(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  style: PowerupStyle,
  sprite: string,
  timeMs: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const shot of state.projectiles) {
    if (shot.sprite !== sprite) continue;
    const x = shot.pos.x - camera.x;
    const y = shot.pos.y - camera.y;
    // Sized off the ROUND, and capped: an additive bloom scaled straight off a
    // heavy projectile's radius turns a longhorn into a white blob that eats
    // the floor around it. The shot must stay the brightest thing IN its glow.
    const reach = Math.min(11, shot.radius * 1.5);
    // The trail: four stamps laid back along the shot's own heading.
    for (let t = 1; t <= 4; t++) {
      const back = t * shot.radius * 1.2;
      const fade = (1 - t / 5) ** 2;
      ctx.fillStyle = `rgba(${style.core}, ${0.26 * fade})`;
      ctx.beginPath();
      ctx.arc(
        x - shot.dir.x * back,
        y - shot.dir.y * back,
        Math.max(1, shot.radius * 0.7 * (1 - t * 0.16)),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    const pulse = 0.85 + 0.15 * Math.sin(timeMs / 70 + shot.id);
    const bloom = ctx.createRadialGradient(x, y, 0, x, y, reach * pulse);
    bloom.addColorStop(0, `rgba(${style.hot}, 0.34)`);
    bloom.addColorStop(0.4, `rgba(${style.core}, 0.22)`);
    bloom.addColorStop(1, `rgba(${style.core}, 0)`);
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(x, y, reach * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * SENTRY GRID: the deployed guns. Each is its sprite plus a red optic that
 * brightens as its shot comes around, and a muzzle flash on the frames right
 * after it fires — so a gun visibly winds up, cracks, and resets.
 */
function drawTurrets(
  ctx: CanvasRenderingContext2D,
  assets: GameAssets,
  ability: ActiveAbility,
  intervalMs: number,
  camera: Camera,
  style: PowerupStyle,
): void {
  const nodes = ability.nodes;
  if (!nodes) return;
  const sprite = spriteByName(assets.sprites, "sentry_gun");
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const x = Math.round(node.pos.x - camera.x);
    const y = Math.round(node.pos.y - camera.y);
    ctx.save();
    // Its footing: a shadow and a bolted-down plate ring, so a gun reads as
    // FIXED to the floor at a glance — that is the whole point of the power.
    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    groundDisc(ctx, x, y + 4, 8);
    ctx.strokeStyle = `rgba(${style.spark}, 0.5)`;
    ctx.lineWidth = 1;
    groundRing(ctx, x, y + 4, 9);
    ctx.restore();
    // The gun stands on the plate ring above, which stays on the floor.
    if (sprite) {
      billboard(ctx, node.pos.x, node.pos.y, camera.x, camera.y, () =>
        drawSpriteCentered(ctx, sprite, node.pos, camera),
      );
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // The optic: dim while the gun is reloading, hot as the shot comes around.
    const charge = 1 - clamp01(node.cooldownMs / intervalMs);
    ctx.fillStyle = `rgba(${style.core}, ${0.35 + 0.65 * charge})`;
    ctx.fillRect(x - 1, y - 4, 3, 3);
    // Muzzle flash on the frames just after it fired.
    const fresh = clamp01(1 - (intervalMs - node.cooldownMs) / 90);
    if (fresh > 0) {
      const flash = ctx.createRadialGradient(
        x + 5,
        y - 1,
        0,
        x + 5,
        y - 1,
        9 * fresh,
      );
      flash.addColorStop(0, `rgba(${style.hot}, ${0.85 * fresh})`);
      flash.addColorStop(1, `rgba(${style.spark}, 0)`);
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(x + 5, y - 1, 9 * fresh, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * BLAST SHIELD: a shell of hex plates standing off the hero. The plates ride a
 * slowly turning ring and the WHOLE shell dims as the pool is eaten, so the
 * player can read how much shield is left without looking at a bar — a fresh
 * shield is bright and solid, a nearly-spent one is a flicker.
 */
function drawBarrierShell(
  ctx: CanvasRenderingContext2D,
  ability: ActiveAbility,
  fullPool: number,
  px: number,
  py: number,
  style: PowerupStyle,
  timeMs: number,
): void {
  const left = clamp01((ability.pool ?? 0) / Math.max(1, fullPool));
  if (left <= 0) return;
  const radius = 20;
  const spin = timeMs / 1600;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // The shell's own haze — thin, so the hero stays readable inside it.
  const haze = ctx.createRadialGradient(
    px,
    py - 6,
    radius * 0.3,
    px,
    py - 6,
    radius * 1.3,
  );
  haze.addColorStop(0, `rgba(${style.core}, 0)`);
  haze.addColorStop(0.8, `rgba(${style.core}, ${0.07 * left})`);
  haze.addColorStop(1, `rgba(${style.hot}, ${0.15 * left})`);
  ctx.fillStyle = haze;
  ctx.beginPath();
  ctx.arc(px, py - 6, radius * 1.3, 0, Math.PI * 2);
  ctx.fill();
  // Eight plates on the ring; a plate flickers on its own phase so the shell
  // reads as held together rather than painted on.
  for (let i = 0; i < 8; i++) {
    const a = spin + (i / 8) * Math.PI * 2;
    const flick = 0.7 + 0.3 * Math.sin(timeMs / 130 + i * 2.4);
    const x = px + Math.cos(a) * radius;
    const y = py - 6 + Math.sin(a) * radius * 0.8;
    ctx.strokeStyle = `rgba(${style.hot}, ${0.55 * left * flick})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, a - 0.9, a + 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * CONTINUITY PROTOCOL: a gold ward turning around the hero — a bright ring at
 * his feet and a slow crown of runes overhead. It never flickers: the ward is
 * either holding or it is gone, and while it holds it should look like the
 * most expensive thing in the room.
 */
function drawWardRunes(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  style: PowerupStyle,
  timeMs: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.75 + 0.25 * Math.sin(timeMs / 520);
  ctx.strokeStyle = `rgba(${style.core}, ${0.5 * pulse})`;
  ctx.lineWidth = 2;
  groundRing(ctx, px, py, 18);
  ctx.strokeStyle = `rgba(${style.hot}, ${0.3 * pulse})`;
  ctx.lineWidth = 1;
  groundRing(ctx, px, py, 22);
  // The crown: six gold marks orbiting at head height, turning steadily.
  const spin = timeMs / 1100;
  for (let i = 0; i < 6; i++) {
    const a = spin + (i / 6) * Math.PI * 2;
    const x = px + Math.cos(a) * 16;
    const y = py - 20 + Math.sin(a) * 5;
    ctx.fillStyle = `rgba(${style.hot}, ${0.5 + 0.35 * Math.sin(timeMs / 240 + i)})`;
    ctx.fillRect(Math.round(x), Math.round(y) - 2, 2, 4);
  }
  ctx.restore();
}

/**
 * REACTOR SURGE: the hero running hot. A tight heat ring at his feet, a haze
 * around him, and sparks lifting off — the overcharge is on HIM, so nothing
 * here reaches out onto the field where it could be mistaken for damage.
 */
function drawSurgeHeat(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  style: PowerupStyle,
  timeMs: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.7 + 0.3 * Math.sin(timeMs / 150);
  const haze = ctx.createRadialGradient(px, py - 8, 2, px, py - 8, 34 * pulse);
  haze.addColorStop(0, `rgba(${style.hot}, 0.45)`);
  haze.addColorStop(0.45, `rgba(${style.core}, 0.3)`);
  haze.addColorStop(1, `rgba(${style.core}, 0)`);
  ctx.fillStyle = haze;
  ctx.beginPath();
  ctx.arc(px, py - 8, 34 * pulse, 0, Math.PI * 2);
  ctx.fill();
  // Two ground rings on the overcharge's beat — the outer one running out and
  // fading, so the hero looks like he is VENTING rather than merely lit.
  ctx.strokeStyle = `rgba(${style.core}, ${0.7 * pulse})`;
  ctx.lineWidth = 2;
  groundRing(ctx, px, py, 14);
  const vent = (timeMs % 620) / 620;
  ctx.strokeStyle = `rgba(${style.hot}, ${0.55 * (1 - vent)})`;
  ctx.lineWidth = 1;
  groundRing(ctx, px, py, 14 + vent * 20);
  // Sparks lifting off him, more of them and hotter.
  for (let i = 0; i < 14; i++) {
    const rise = (timeMs / 420 + jitter(i)) % 1;
    const x = px + (jitter(i + 20) - 0.5) * 26;
    const y = py - rise * 30;
    ctx.fillStyle = `rgba(${style.spark}, ${(1 - rise) * 0.95})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 2 + (i % 2));
  }
  ctx.restore();
}

/**
 * PALE SHROUD: the hero half-here. A cold mist pools at his feet, pale wisps
 * peel off him and rise, and a faint outline ring marks where his body ISN'T
 * any more — the world-side half of the effect (the screen-space ghost wash is
 * the DOM aura layer).
 */
function drawSpectralShroud(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  style: PowerupStyle,
  timeMs: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // The body's own glow — he is the brightest thing in his own frame while he
  // is out of the world, which is what sells "not really here".
  const halo = ctx.createRadialGradient(px, py - 8, 1, px, py - 8, 22);
  halo.addColorStop(0, `rgba(${style.hot}, 0.4)`);
  halo.addColorStop(0.55, `rgba(${style.core}, 0.2)`);
  halo.addColorStop(1, `rgba(${style.core}, 0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(px, py - 8, 22, 0, Math.PI * 2);
  ctx.fill();
  const mist = ctx.createRadialGradient(px, py, 2, px, py, 20);
  mist.addColorStop(0, `rgba(${style.hot}, 0.3)`);
  mist.addColorStop(1, `rgba(${style.core}, 0)`);
  ctx.fillStyle = mist;
  groundDisc(ctx, px, py, 20);
  ctx.strokeStyle = `rgba(${style.core}, ${0.45 + 0.15 * Math.sin(timeMs / 380)})`;
  ctx.lineWidth = 1;
  groundRing(ctx, px, py, 15);
  // Wisps peeling off and dissolving upward.
  for (let i = 0; i < 6; i++) {
    const rise = (timeMs / 900 + jitter(i)) % 1;
    const sway = Math.sin(timeMs / 300 + i * 1.6) * 4;
    const x = px + (jitter(i + 7) - 0.5) * 16 + sway;
    const y = py - 4 - rise * 24;
    ctx.fillStyle = `rgba(${style.hot}, ${(1 - rise) * 0.75})`;
    ctx.fillRect(Math.round(x), Math.round(y), 2, 3);
  }
  ctx.restore();
}
