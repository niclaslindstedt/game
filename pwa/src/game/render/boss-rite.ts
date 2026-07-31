// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOSS during its DEATH RITE — the one body on the field that is not in
// `state.enemies`.
//
// `killEnemy` splices a dead enemy out before anything downstream runs, and the
// rite deliberately does not put it back (see `BossDeathState`): a corpse left
// in the live list would sit in front of every aggro search, contact pass and
// AoE gather for the length of the beat. So the scene carries what is needed to
// POSE it — position, def, beat, clock — and this pass draws it. Nothing else in
// the renderer knows the rite exists.
//
// TWO RITES, TWO PICTURES, and they are opposites:
//
//   DEATH    the boss is STILL. It drops to its knees at the stagger and stays
//            there while the hero closes; at the blow it is gone from here
//            entirely, because from that moment what stands in its place is the
//            wreckage the gore machinery built (`event-fx.ts`, `render/gibs.ts`).
//   FLIGHT   the boss MOVES. It reels, bolts for the exit it tore open with its
//            back to the hero, and is drawn into it spinning — smaller and
//            faster round each turn until there is nothing left. The one time
//            this game rotates a sprite on purpose.
//
// THE SPIN IS THE ONE PLACE PIXEL ART IS ROTATED, AND IT IS A DELIBERATE
// EXCEPTION. Everything else here is built for crisp integer pixels — nearest
// neighbour, whole-pixel offsets, `billboard` composing to the identity — and
// rotating pixel art resamples it into mush. That is exactly why it works here:
// the twirl is a thing being UNMADE, so the art coming apart under the rotation
// is the effect rather than a cost, and it is over in half a second. Do not
// "fix" it by quantizing the angle to eight buckets the way `sprite-split.ts`
// does — a stepped twirl reads as a sprite flicking between poses.

import { BOSS_DEATH, deathRite, type GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";

import { spriteTopLeft } from "./shared.ts";
import { billboard } from "./tilt.ts";
import type { Camera } from "./view.ts";

/** How far the spinning fugitive shrinks by the time he is gone (a fraction of
 * his own size). Not to nothing: he vanishes at a fifth rather than at zero,
 * because the last frames of a shrink to zero are a sub-pixel smear nobody can
 * read as a body — the rift takes him while he is still visibly a man. */
const VANISH_SCALE = 0.2;

/** How far the kneeling boss sinks (world px) as the stagger runs — enough to
 * read as "down" against its own standing height without burying it in the
 * floor. */
const KNEEL_DROP = 5;

/**
 * Draw the boss mid-rite. A no-op in every phase but `bossDeath`, and after the
 * blow lands on a death rite (the wreckage takes over).
 *
 * Called from the actor pass so it sorts with the bodies rather than over them:
 * a boss on its knees that draws on top of the hero standing in front of it
 * reads as a cardboard cut-out.
 */
export function drawBossRite(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  timeMs: number,
): void {
  const scene = state.bossDeath;
  if (!scene) return;
  const rite = deathRite(scene.rite);
  // Past the act, a DEATH rite's body has been replaced by whatever the gore
  // machinery left. Drawing it here as well would put a whole boss on top of
  // its own remains.
  if (scene.kind === "death" && scene.beat === "aftermath") return;

  const sprite = riteSprite(sprites, scene, timeMs);
  if (!sprite) return;

  if (scene.kind === "flight") {
    drawFugitive(ctx, scene, rite.spin ?? 4, sprite, camera);
    return;
  }
  drawKneeling(ctx, scene, sprite, camera);
}

/**
 * WHICH FRAME, and the FALLBACK is the load-bearing half.
 *
 * A boss earns an authored pose by shipping one — `<sprite>_kneel` for the
 * stagger — resolved by naming convention exactly as the cast poses and the
 * wound stages are, so nothing has to be registered anywhere. A boss WITHOUT
 * that art keeps its ordinary walk frame rather than drawing nothing, and that
 * fallback is what lets the rite ship for every boss ahead of the art instead
 * of behind it. (Returning the kneel name unconditionally and letting the
 * lookup miss is the same code with the feature switched off: the body simply
 * vanishes for the whole beat, which is exactly what it looked like.)
 *
 * The name is built off `scene.sprite`, NEVER off `scene.defId` — a def id is
 * not a sprite name, and the two only coincide for some of the roster.
 */
function riteSprite(
  sprites: Sprites,
  scene: NonNullable<GameState["bossDeath"]>,
  timeMs: number,
): ImageBitmap | undefined {
  const base = scene.sprite;
  // RUNNING or STANDING, the ordinary two-frame walk is the floor. A fleeing
  // man frozen on one frame is the tell that nothing is really moving, so the
  // flight ticks it fast and takes no authored pose at all.
  const walk = spriteByName(sprites, `${base}_${Math.floor(timeMs / 90) % 2}`);
  if (scene.kind === "flight")
    return walk ?? spriteByName(sprites, `${base}_0`);
  return spriteByName(sprites, `${base}_kneel`) ?? walk;
}

/** The stagger: down on one knee, sinking a little as the beat runs, and
 * TREMBLING — the shake is what says it is still alive and about to not be. */
function drawKneeling(
  ctx: CanvasRenderingContext2D,
  scene: NonNullable<GameState["bossDeath"]>,
  sprite: ImageBitmap,
  camera: Camera,
): void {
  const t = Math.min(1, scene.ms / BOSS_DEATH.staggerMs);
  // Ease-out: it drops hard and settles, rather than sliding down at a constant
  // rate like something being lowered on a rope.
  const drop = (1 - (1 - t) * (1 - t)) * KNEEL_DROP;
  // A 1px judder off the scene's own clock — deterministic, so a paused frame
  // and a replayed one agree, and small enough to read as a body failing rather
  // than as the renderer glitching.
  const shiver = Math.round(Math.sin(scene.ms / 40) * 1);
  billboard(ctx, scene.bossPos.x, scene.bossPos.y, camera.x, camera.y, () => {
    const at = spriteTopLeft(scene.bossPos, sprite, camera);
    ctx.drawImage(sprite, at.x + shiver, at.y + Math.round(drop));
  });
}

/**
 * The bolt and the twirl. Through the ACT he simply runs (the engine is moving
 * `bossPos`); through the AFTERMATH he is at the mouth and being taken — spun,
 * shrunk, and faded together, because any one of the three alone reads as a bug
 * (a spin alone is a man pirouetting, a shrink alone is a man walking away, a
 * fade alone is a man turning into a ghost).
 */
function drawFugitive(
  ctx: CanvasRenderingContext2D,
  scene: NonNullable<GameState["bossDeath"]>,
  spins: number,
  sprite: ImageBitmap,
  camera: Camera,
): void {
  const vanishing = scene.beat === "aftermath";
  // How far through the vanish, 0 until it starts. The scene's own clock is the
  // only thing driving it, so it cannot drift from the engine's beat.
  const t = vanishing ? vanishProgress(scene) : 0;
  const scale = 1 - (1 - VANISH_SCALE) * t;
  const angle = t * spins * Math.PI * 2;
  billboard(ctx, scene.bossPos.x, scene.bossPos.y, camera.x, camera.y, () => {
    const at = spriteTopLeft(scene.bossPos, sprite, camera);
    ctx.save();
    // Rotate and scale about the sprite's own CENTRE, not its top-left, or he
    // swings around a point off his own shoulder like a hand on a clock.
    ctx.translate(at.x + sprite.width / 2, at.y + sprite.height / 2);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 1 - t * t;
    ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
    ctx.restore();
  });
}

/** How far through the AFTERMATH beat the vanish has got (0..1). */
function vanishProgress(scene: NonNullable<GameState["bossDeath"]>): number {
  const rite = deathRite(scene.rite);
  const stagger = BOSS_DEATH.staggerMs + Math.max(0, rite.staggerMs ?? 0);
  const act = stagger + BOSS_DEATH.actMs + Math.max(0, rite.actMs ?? 0);
  const span = BOSS_DEATH.aftermathMs + Math.max(0, rite.aftermathMs ?? 0);
  return Math.max(0, Math.min(1, (scene.ms - act) / Math.max(1, span)));
}
