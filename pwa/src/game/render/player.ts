// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hero: the paper-doll draw with facing, jump shadow, hurt blink, and
// knockout pose; the held weapon's swing/recoil/cast animation and the slash
// streak riding the blade; and the level-up burn wreathing him on a ding.

import { LEVELING, type GameState, type WeaponClass } from "@game/core";

import { spriteByName, type GameAssets, type Sprites } from "../assets.ts";
import { playerDollLayers, WEAPON_SHOULDER } from "../paper-doll.ts";
import { drawSlash, slashStyleFor, type SlashGeom } from "../weapon-fx.ts";
import {
  clamp01,
  drawSpriteCentered,
  drawSpriteFacing,
  fract,
  TILE,
} from "./shared.ts";
import { type Camera } from "./view.ts";

/**
 * The rift has no floor — the hero stands on nothing between universes, so the
 * renderer floats him with a slow vertical bob whenever he's grounded. Purely
 * cosmetic (world position is unchanged); the jump arc (`player.z`) takes over
 * the moment he leaves the "ground". Amplitude is in world units (doubled on
 * screen by VIEW_SCALE); the long period matches the level's dreamy, floaty
 * gravity.
 */
const RIFT_HOVER_BIOME = "rift";
const RIFT_HOVER_AMPLITUDE = 2;
const RIFT_HOVER_PERIOD_MS = 2400;

/**
 * The hero's in-flight attack, handed to `drawPlayer` so the held weapon
 * animates in step with the swing/muzzle effect it accompanies.
 * `startMs`/`durationMs` are on the simulation clock
 * (`state.stats.timeMs`) — the same clock `drawEffects` runs on — so the weapon
 * and its slash cone stay locked together. GameScreen captures it from the
 * hero's own `swing`/`shot` events.
 */
export type PlayerAction = {
  kind: "swing" | "shot";
  weaponClass: WeaponClass;
  startMs: number;
  durationMs: number;
  /** Melee only: the weapon's full slash cone in radians (the swing event's
   * `arc`). The blade's sweep scales to it, so a broad slasher whips through a
   * wide arc and a narrow thrust barely rotates — the motion reads as THIS
   * weapon. Undefined falls back to a wide slash. */
  arc?: number;
};

/** A held-weapon animation pose: a rotation about the shoulder (WEAPON_SHOULDER)
 * plus a small translation, in doll-local coords (mirrored with the doll for
 * facing). Pivoting at the shoulder rather than the grip sweeps the whole
 * implied arm — the weapon rides the end of a stretched-out arm, not just a
 * flick of the wrist. Positive `rot` swings the blade/barrel down and forward
 * in the facing dir. */
type WeaponPose = { rot: number; offX: number; offY: number };

const REST_POSE: WeaponPose = { rot: 0, offX: 0, offY: 0 };

// The melee swing timeline, in fractions of the swing, SHARED by the blade
// sprite (`weaponPose`) and its slash cone (`drawEffects`) so the two are one
// motion: the blade cocks back through the windup, whips through the arc across
// the STRIKE window, then folds home over the recover. The cone stays dark
// until the strike, then wipes across in lockstep with the blade and clears as
// it recovers — the slash lands exactly as the blade passes through it.
export const SWING_WINDUP_END = 0.18; // blade fully cocked back; strike begins
export const SWING_STRIKE_END = 0.5; // blade through the arc; cone fully swept
/** How long a melee swing's blade + cone animation runs (ms). GameScreen times
 * the swing `PlayerAction` and its slash-cone effect to this one value so their
 * `t` stays locked. */
export const MELEE_SWING_MS = 220;

// The cone the blade sweeps through when a swing carries no explicit `arc`
// (full cone in rad) — a broad slash. Half of it is one edge to the aim.
const DEFAULT_SWING_ARC = (100 * Math.PI) / 180;
// The blade's rest ORIENTATION about the shoulder pivot (rad, screen y-down):
// the held icon points up-and-forward, so its shaft sits at this angle when
// idle. The swing rotates the blade so its shaft rides the cone's leading edge,
// which is measured FROM this rest angle — calibrated on the CALIBRATION PROBE
// (the debug weapon whose red tip/base markers show exactly where the blade
// lies; see pwa/scripts/weapon-swing.mjs). Tune it there, eyes on the strip.
const BLADE_REST_ANGLE = -(50 * Math.PI) / 180;
// The half circle the cone (and so the blade sweep) saturates at — mirrors the
// engine's `STATS.aoeMaxHalfAngle`, so a max-INT slash swings a full 180° arc.
const MAX_SWING_HALF = Math.PI / 2;

// The blade's tip and inner (near-hand) points in DOLL coords — the two ends of
// the streak the slash ribbon fills as the blade sweeps. They ride the weapon's
// own pivot (WEAPON_SHOULDER), so the slash is drawn IN the weapon's space and
// lands exactly on the blade, not fanning out of the hero's centre. Measured on
// the CALIBRATION PROBE (its red tip/base markers show precisely where the blade
// lies); tune there with the weapon-swing preview.
// The outer point flares a little PAST the blade tip along the blade's line so
// the slash reads as a streak thrown off the edge, not just the sprite; the
// inner point sits at the hand. Both still ride the weapon's pivot.
const SLASH_REST_TIP = { x: 20, y: -1 };
const SLASH_REST_BASE = { x: 11, y: 10.5 };

/**
 * The blade's swept streak for the active melee swing: the rotation range (about
 * WEAPON_SHOULDER) from the strike's start to `nowMs`, plus a fade. Shares the
 * swing timeline + cone with `weaponPose`, so the streak hugs the blade the
 * whole way. Null outside a live melee strike.
 */
function meleeSlashArc(
  action: PlayerAction | undefined,
  nowMs: number,
): SlashGeom | null {
  if (!action || action.weaponClass !== "melee") return null;
  const t = (nowMs - action.startMs) / action.durationMs;
  if (t < SWING_WINDUP_END || t > 1) return null; // dark until the strike
  const half = Math.min(MAX_SWING_HALF, (action.arc ?? DEFAULT_SWING_ARC) / 2);
  const p = clamp01(
    (t - SWING_WINDUP_END) / (SWING_STRIKE_END - SWING_WINDUP_END),
  );
  const swept = 1 - (1 - p) * (1 - p); // ease-out, in step with weaponPose
  const rotFor = (a: number) => a - BLADE_REST_ANGLE;
  const presence = 1 - clamp01((t - SWING_STRIKE_END) / (1 - SWING_STRIKE_END));
  return {
    pivot: WEAPON_SHOULDER,
    tip: SLASH_REST_TIP,
    base: SLASH_REST_BASE,
    rotFrom: rotFor(-half),
    rotTo: rotFor(-half + 2 * half * swept),
    alpha: presence,
    phase: clamp01(t),
  };
}

/**
 * The held weapon's pose for the active attack at `nowMs`. Each weapon class
 * gets its own motion, shaped to start AND end at rest so it folds cleanly back
 * to the static pose when the animation lapses (no snap): a blade winds back and
 * whips through its slash arc, a gun recoils with the muzzle rising, a wand
 * thrusts up on the cast. Returns `REST_POSE` when no attack is live.
 */
function weaponPose(
  action: PlayerAction | undefined,
  nowMs: number,
): WeaponPose {
  if (!action) return REST_POSE;
  const t = (nowMs - action.startMs) / action.durationMs;
  if (t < 0 || t > 1) return REST_POSE;
  if (action.weaponClass === "melee") {
    // The blade RIDES ITS CONE. The cone spans [aim − half, aim + half]; the
    // blade cocks to the start (up) edge through the windup, then sweeps to the
    // end (down) edge across the strike, then folds home — all measured from the
    // blade's rest orientation, with the SAME edges and ease the drawn cone uses
    // (drawEffects). So the blade's tip starts and ends exactly where the cone
    // does, and a wider cone — a narrow thrust up to a max-INT half circle —
    // swings the blade through a correspondingly wider arc. `action.arc` is the
    // weapon's INT-widened cone; the shape reads as THIS weapon and THIS build.
    const half = Math.min(
      MAX_SWING_HALF,
      (action.arc ?? DEFAULT_SWING_ARC) / 2,
    );
    // Blade shaft angle (aim-local) → rotation about the shoulder pivot.
    const rotFor = (angle: number) => angle - BLADE_REST_ANGLE;
    const rotStart = rotFor(-half); // cocked to the cone's start edge
    let rot: number;
    if (t < SWING_WINDUP_END) {
      rot = rotStart * (t / SWING_WINDUP_END); // cock back to the start edge
    } else if (t < SWING_STRIKE_END) {
      const p = (t - SWING_WINDUP_END) / (SWING_STRIKE_END - SWING_WINDUP_END);
      const swept = 1 - (1 - p) * (1 - p); // ease-out, in step with the cone
      rot = rotFor(-half + 2 * half * swept); // ride the leading edge across
    } else {
      const p = (t - SWING_STRIKE_END) / (1 - SWING_STRIKE_END);
      rot = rotFor(half) * (1 - p * p * (3 - 2 * p)); // fold home from the end
    }
    return { rot, offX: 0, offY: 0 };
  }
  if (action.weaponClass === "ranged") {
    // A quick recoil impulse: kick back toward the shoulder, muzzle rising,
    // then settle forward. Triangle peaking early so the punch is felt.
    const kick = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    return { rot: -0.4 * kick, offX: -3 * kick, offY: -1 * kick };
  }
  // Magic: a smooth bloom (sin) that thrusts the wand up and forward on the
  // cast and eases it back — the staff "presents" the spell.
  const bloom = Math.sin(Math.PI * t);
  return { rot: 0.35 * bloom, offX: bloom, offY: -3 * bloom };
}

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
  action: PlayerAction | undefined,
): void {
  const player = state.player;
  const airborne = player.z > 0;
  // The paper-doll owns the costume: body sprite (from `playerAppearance`),
  // worn-armor overlays, and the held weapon, as one ordered layer stack
  // shared with the DOM avatars (paper-doll.ts).
  const { sprites } = assets;
  const frame = airborne
    ? "jump"
    : player.moving && Math.floor(timeMs / 160) % 2 === 1
      ? "1"
      : "0";
  const layers = playerDollLayers(state, frame, { weapon: true });
  // In the rift the ground isn't there — bob the grounded hero so he reads as
  // floating. The jump height (`player.z`) already lifts him in the air, so the
  // hover only applies while grounded to avoid fighting the arc.
  const hover =
    !airborne && state.level.biome === RIFT_HOVER_BIOME
      ? Math.sin((timeMs / RIFT_HOVER_PERIOD_MS) * Math.PI * 2) *
        RIFT_HOVER_AMPLITUDE
      : 0;
  const x = Math.round(player.pos.x - TILE / 2 - camera.x);
  const y = Math.round(player.pos.y - TILE / 2 - camera.y - player.z - hover);

  // Grounding shadow while airborne — the only cue for jump height.
  if (airborne) {
    const shadow = assets.sprites.shadow;
    drawSpriteCentered(
      ctx,
      shadow,
      { x: player.pos.x, y: player.pos.y + 5 },
      camera,
    );
  }

  // Blink during the post-hit flash so damage is legible on the character.
  if (player.hurtFlashMs > 0 && Math.floor(timeMs / 60) % 2 === 0) return;

  // KNOCKED OUT: a sand storm flattened him. Lay the whole doll on its back
  // (the costume stays glued, no facing flip, no weapon swing) and spin a ring
  // of daze stars over his head. He can't act until he comes to (engine).
  if (player.knockoutMs > 0) {
    drawKnockedOut(ctx, sprites, layers, x, y);
    drawDazeStars(ctx, player.pos, camera, timeMs);
    return;
  }

  // Facing is a whole-doll horizontal mirror, so every layer — body, worn
  // overlays, held weapon — draws inside one flipped transform and the
  // outfit stays glued to the body. A layer's own `flip` mirrors the sprite
  // in place (left-pointing weapon icons) on top of whichever facing holds.
  // The held weapon swings on attack (a pure render concern): the weapon layer
  // pivots about the shoulder in step with the swing/muzzle effect, folding to
  // rest between blows.
  const pose = weaponPose(action, state.stats.timeMs);
  ctx.save();
  if (player.faceLeft) {
    ctx.translate(x + TILE, y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y);
  }
  for (const layer of layers) {
    const image = spriteByName(sprites, layer.sprite);
    if (!image) continue; // unknown def or stale save: skip, never crash
    const swung =
      layer.weapon && (pose.rot !== 0 || pose.offX !== 0 || pose.offY !== 0);
    if (swung) {
      // Pivot the weapon about the SHOULDER (translate to it, rotate, translate
      // back), on top of whatever facing transform already holds. Pivoting at
      // the shoulder — not the grip — arcs the grip end too, so the weapon
      // reads as riding a swinging arm rather than twisting in place.
      ctx.save();
      ctx.translate(
        WEAPON_SHOULDER.x + pose.offX,
        WEAPON_SHOULDER.y + pose.offY,
      );
      ctx.rotate(pose.rot);
      ctx.translate(-WEAPON_SHOULDER.x, -WEAPON_SHOULDER.y);
    }
    drawSpriteFacing(ctx, image, layer.dx, layer.dy, layer.flip ?? false);
    if (swung) ctx.restore();
  }
  // The slash streak rides the blade — drawn last so it sits ON the weapon, in
  // the same doll-local/facing space, hugging the arc the blade just carved. Its
  // look is the equipped weapon's signature (slash-fx.ts): a plain blade slashes
  // white, a named unique flares its element.
  const slash = meleeSlashArc(action, state.stats.timeMs);
  if (slash) {
    drawSlash(ctx, slash, slashStyleFor(player.equipment.weapon.uniqueId));
  }
  ctx.restore();
}

/**
 * The prone knockout pose: lay the whole paper-doll on its back by rotating it
 * a near-quarter-turn about its own centre and dropping it to the ground line,
 * so the costume (body, armor, weapon) stays glued as one flattened figure. No
 * facing flip, no weapon swing — a hero flat on the floor isn't fighting.
 */
function drawKnockedOut(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  layers: ReturnType<typeof playerDollLayers>,
  x: number,
  y: number,
): void {
  ctx.save();
  // Pivot about the sprite centre, tip it flat, and settle it a few px down so
  // the toppled body lies along the ground rather than floating at head height.
  ctx.translate(x + TILE / 2, y + TILE / 2 + 3);
  ctx.rotate(Math.PI / 2 - 0.12);
  ctx.translate(-(TILE / 2), -(TILE / 2));
  for (const layer of layers) {
    const image = spriteByName(sprites, layer.sprite);
    if (!image) continue;
    drawSpriteFacing(ctx, image, layer.dx, layer.dy, layer.flip ?? false);
  }
  ctx.restore();
}

/** A ring of little four-point daze stars orbiting over a knocked-out hero. */
function drawDazeStars(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  camera: Camera,
  timeMs: number,
): void {
  const cx = pos.x - camera.x;
  const cy = pos.y - camera.y - 12; // over where his head has fallen
  const spin = timeMs / 320;
  ctx.save();
  ctx.fillStyle = "#ffe3b6";
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * Math.PI * 2) / 3;
    const sx = Math.round(cx + Math.cos(a) * 7);
    const sy = Math.round(cy + Math.sin(a) * 3);
    // A tiny plus-shaped twinkle (a 3px cross) — cheap and reads as a star.
    ctx.fillRect(sx - 1, sy, 3, 1);
    ctx.fillRect(sx, sy - 1, 1, 3);
  }
  ctx.restore();
}

/**
 * The level-up "burn": while the engine's ding-celebration window
 * (`state.levelUpFxMs`) is live, the hero is wreathed in golden light —
 * a shockwave ring on the ground, a pillar of light rising off him, and
 * embers floating up — the WoW ding, in pixels. The `under` layer (ring +
 * pillar) draws behind the player sprite, the `over` layer (embers) in
 * front, so the glow engulfs the character.
 */
export function drawLevelUpBurn(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  timeMs: number,
  layer: "under" | "over",
): void {
  const left = state.levelUpFxMs;
  if (left <= 0) return;
  const duration = LEVELING.dingCelebrationMs;
  const t = 1 - left / duration; // 0 → 1 across the celebration
  const x = Math.round(state.player.pos.x - camera.x);
  const y = Math.round(state.player.pos.y - camera.y - state.player.z);
  // Snap in fast, hold, fade over the last quarter — the modal takes the
  // stage the moment this dies down.
  const fade = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.25);
  ctx.save();

  if (layer === "under") {
    // The ground shockwave: a squashed golden ring bursting outward in the
    // opening beats, the "something big just happened" footprint.
    if (t < 0.45) {
      const ring = t / 0.45; // 0 → 1
      ctx.globalAlpha = 0.85 * (1 - ring);
      ctx.strokeStyle = "#ffd75e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y + 6,
        8 + ring * 30,
        (8 + ring * 30) * 0.4,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    // The pillar of light: a gold column rising off the hero, breathing
    // slightly so it reads as living flame rather than a static decal.
    const flicker = 1 + 0.12 * Math.sin(timeMs / 55);
    const w = 15 * flicker;
    const top = y - 58;
    const glow = ctx.createLinearGradient(0, top, 0, y + 8);
    glow.addColorStop(0, "rgba(255, 215, 94, 0)");
    glow.addColorStop(0.55, "rgba(255, 215, 94, 0.5)");
    glow.addColorStop(1, "rgba(255, 242, 192, 0.85)");
    ctx.globalAlpha = 0.6 * fade;
    ctx.fillStyle = glow;
    ctx.fillRect(Math.round(x - w), top, Math.round(w * 2), y + 8 - top);
    // A hot white-gold core, half as wide, twice as bright.
    ctx.globalAlpha = 0.7 * fade;
    const core = ctx.createLinearGradient(0, top + 18, 0, y + 6);
    core.addColorStop(0, "rgba(255, 246, 214, 0)");
    core.addColorStop(1, "rgba(255, 246, 214, 0.9)");
    ctx.fillStyle = core;
    ctx.fillRect(
      Math.round(x - w / 2),
      top + 18,
      Math.round(w),
      y + 6 - (top + 18),
    );
  } else {
    // Rising embers: a dozen golden motes climbing lanes around the hero,
    // each on its own deterministic phase/speed so the column shimmers.
    const EMBERS = 12;
    const palette = ["#ffd75e", "#fff2c0", "#ff9d3b"];
    for (let i = 0; i < EMBERS; i++) {
      const lane = (fract(i * 17.31) - 0.5) * 26; // x offset in the column
      const phase = fract(i * 7.77);
      const speed = 0.9 + fract(i * 3.33) * 0.9; // climbs per celebration
      const climb = (t * speed + phase) % 1; // 0 (feet) → 1 (top)
      const ex = x + Math.round(lane + Math.sin(timeMs / 90 + i) * 2);
      const ey = Math.round(y + 8 - climb * 58);
      const size = climb < 0.3 ? 2 : 1; // embers shrink as they rise
      ctx.globalAlpha = (1 - climb) * fade;
      ctx.fillStyle = palette[i % palette.length]!;
      ctx.fillRect(ex, ey, size, size);
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
