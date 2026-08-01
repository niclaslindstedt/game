// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Transient app-side effects: lightning strikes, nuke rings, gore splashes
// on hit mobs, corpses, crate breaks, spell blooms, and floating damage
// numbers. GameScreen accumulates them from engine events and passes what is
// still alive.

import { drawFaded } from "@ui/lib/canvas-fade.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

import { spriteByName, type GameAssets } from "../assets.ts";
import { type BloodBlow } from "../game-screen/blood-hit.ts";
import { type GoreFamilyId } from "../game-screen/gore.ts";
import {
  CLEAVE_MS,
  GORE_BURST_MS,
  type GoreBurst,
} from "../game-screen/gore-burst.ts";
import {
  drawBurst,
  drawMuzzle,
  shotStyleFor,
  type GoreStyle,
  type ShotStyle,
} from "../weapon-fx.ts";
import { drawBlood } from "./blood.ts";
import { enemySprites } from "./caches.ts";
import { drawDust } from "./dust.ts";
import { drawFlameGout } from "./flame.ts";
import { drawGore } from "./gibs.ts";
import { drawHellgateTear, hellgateReach } from "./hellgate.ts";
import { drawEliteBurst } from "./elite-fx.ts";
import { drawLootShine } from "./loot-aura.ts";
import {
  MELEE_SWING_MS,
  SWING_STRIKE_END,
  SWING_WINDUP_END,
} from "./player.ts";
import { drawPowerupBurst } from "./powerup-bursts.ts";
import type { AbilityLook, BossAbilityId } from "@game/core";
import type { PowerupStyle } from "../powerup-fx.ts";
import { clamp01, fract } from "./shared.ts";
import {
  applyWorldProjection,
  bodyAnchorX,
  bodyAnchorY,
  projectOffset,
} from "./tilt.ts";
import { type Camera } from "./view.ts";

export type Effect = {
  kind:
    | "lightning"
    | "nuke"
    | "levelup"
    | "nova"
    | "asteroidImpact"
    | "splash"
    | "burst"
    | "damage"
    | "swing"
    | "muzzle"
    | "text"
    | "corpse"
    | "incinerate"
    | "singularity"
    | "hellgate"
    | "crateBreak"
    // The arrival bloom of a magic-or-better find — drawn by ./loot-aura.ts.
    | "lootShine"
    // The blood a landed blow throws — drawn by ./blood.ts.
    | "blood"
    // A body coming APART — cut in two, or burst into pieces. Drawn by
    // ./gibs.ts, decided by game-screen/kill-presentation.ts.
    | "cleave"
    | "gib"
    // The dust a jump throws, at both ends of it — drawn by ./dust.ts.
    | "dustTakeoff"
    | "dustLand"
    // The roaring cone a FLAMETHROWER throws — drawn by ./flame.ts.
    | "flame"
    // The POWERUPS' one-shot bursts — drawn by ./powerup-bursts.ts.
    | "meteorFall"
    | "voidWave"
    | "barrierBreak"
    | "wardHold"
    // THE ELITE TIER's one-shot bursts — the pulse ring, the blink's two ends,
    // a fissure opening, a shout going out, a volley leaving (./elite-fx.ts).
    // ONE kind for all of them, discriminated by `eliteKind`, mirroring the
    // single `eliteCast` engine event they come from: ten primitives sharing a
    // draw pass is what keeps the effect list from growing a member per idea.
    | "elite"
    // A bare axle grinding the road (the car's `carGrind`): a shower of hot
    // metal sparks thrown back along the travel and pulled down by gravity.
    | "sparks"
    // THE GARAGE DOOR rolling up (`garageDoorOpened`): the slat chain the
    // engine's obstacles no longer hold, redrawn sliding up out of the
    // doorway a block at a time. `pos` is the FIRST slat's centre, `to` the
    // LAST one's, and `slats` how many blocks stood between them inclusive.
    | "garageDoor";
  pos: { x: number; y: number };
  untilMs: number;
  /** Total effect length, for progress-driven animation. */
  durationMs?: number;
  /** World-clock ms before the effect begins drawing — lets a float lag behind
   * the hit that spawned it (the XP popup trails the damage number). */
  startMs?: number;
  /** Splash: gore family ("blood", "ecto") — frames `<family>_0/_1`.
   * Corpse: the slain enemy's sprite family, drawn as it keels over.
   * Garage door: the slat the chain wore, since by now the obstacles that
   * carried it are gone (a mod's door hangs its own art, not this one's). */
  sprite?: string;
  /** Text float: the word to rise off the spot (e.g. "DODGE"). */
  text?: string;
  /** Text float: the glyph color. */
  color?: string;
  /** Text float: how far the word climbs over its life, in world px
   * (default 16). XP popups rise further so they read as "flowing up". */
  rise?: number;
  /** Text float / damage number: extra screen px between the word and its
   * anchor, so a float landing where a live one already sits takes the LANE
   * ABOVE it instead of being drawn into the same pixels
   * (game-screen/float-lane.ts). A kill at the hero's feet that also sheds a
   * purse is the everyday case: the hit's number, its blue "+N XP" and the gold
   * "+N" are one spot and three messages. Default 0 — the spot was free. */
  lift?: number;
  /** Text float: glyph scale (default 1). A golden-arrow XP popup doubles it,
   * and a merged pack-kill float grows it with the pack (≈count/10 — 20 mobs →
   * 2×, 30 → 3×), so a bigger gain reads as a bigger number. */
  scale?: number;
  /** Text float: crit-style jolt. The word shakes left–right–centre in place
   * for a run of opening beats, THEN lifts off — an arrow's (or a whole pack's)
   * XP is basically a crit's worth of levels, so it hits like one before it
   * floats. The beat count and throw grow with `scale`, so a bigger pop rattles
   * longer and wider. Plain floats (DODGE/MISS) leave this off and rise from
   * the first frame. */
  shake?: boolean;
  /** Damage number: the hit's rounded damage. */
  value?: number;
  /** Damage number: crits jolt left-right-center, grow, and glow gold. */
  crit?: boolean;
  /** Damage number: on a crit, how hard the blow rolled in [0, 1] — scales the
   * popup from a modest 1.5× (a glancing crit) up to a fat 3× (a top-of-band
   * slam). Absent = a neutral mid-size crit. */
  critPower?: number;
  /** Swing/muzzle: the aim direction in radians.
   * Corpse: the signed angle it keels over to (±π/2), rolled at spawn so
   * the horde doesn't topple in lockstep. */
  angle?: number;
  /** Corpse: an epic (elite/boss) body — it keels over and then simply lies
   * there for the rest of the level instead of blinking out. There are only
   * ever a handful, so leaving them on the field reads as a battlefield of
   * fallen giants rather than clutter. */
  persist?: boolean;
  /** Corpse: a KILL launch — the body is knocked flying away from the hero.
   * `dx`/`dy` is the unit heading (already pointing away from the player),
   * `dist` how far it sails in world px, `spins` how many whole end-over-end
   * tumbles it turns in flight. A harder blow for the health it went through =
   * further, and past a full extra bar it also tumbles (one spin per extra
   * bar). Sized in GameScreen from the kill's `damage / maxHp` (see
   * `corpseLaunch`); absent when the throw is too small to read. */
  launch?: { dx: number; dy: number; dist: number; spins: number };
  /** Swing: the arc's reach in world px (the weapon's effective range).
   * Elite: whatever the move drew — the pulse ring, the fissure, the shout. */
  radius?: number;
  /** Elite: WHICH primitive this burst is (`BossAbilityId`) — the draw switch,
   * exactly as it is the sound key on the event it came from. */
  eliteKind?: BossAbilityId;
  /** Elite: the caster's own colour kit, RESOLVED BY THE ENGINE and carried on
   * the event. It travels rather than being looked up here because by the time
   * a burst is drawn its caster is frequently dead — an effect that lost its
   * colours the moment the mob did is the bug this field prevents. */
  look?: AbilityLook;
  /** Elite: the far end — a blink's arrival, a tether's other end. */
  to?: { x: number; y: number };
  /** Nova: an icy-blue chilling burst (a companion's FROST NOVA) rather than
   * the plain violet arcane ring. */
  frost?: boolean;
  /** Swing: the full cone angle in radians (wide blade vs narrow spear). */
  arc?: number;
  /** Muzzle: ranged fires a hot flash, magic a cool cast burst. */
  weaponClass?: "melee" | "ranged" | "magic";
  /** Burst: the themed gore a signature melee blow throws (weapon-fx.ts). */
  gore?: GoreStyle;
  /** Blood: what the blow was worth, in blood — every count the spray draws
   * (drops, haze, reach, how far up the wound's frame chain it gets) comes off
   * this one shape (game-screen/blood-hit.ts, drawn by ./blood.ts). */
  blood?: BloodBlow;
  /** Blood/splash: WHAT KIND OF BODY threw it (`EnemyDef.gore`) — the ramp its
   * frames are re-hued onto and what hangs in the air afterwards
   * (game-screen/gore.ts). A cleave/gib carries its own on the burst. */
  family?: GoreFamilyId;
  /** Cleave/gib: what the body came apart INTO — the pieces, their bearings,
   * their arcs and their bounces (game-screen/gore-burst.ts, drawn by
   * ./gibs.ts). The very same shape the floor's blood was laid out from, so a
   * piece always lands on its own spatter. */
  gib?: GoreBurst;
  /** Burst: a per-hit seed so stacked bursts scatter differently. */
  seed?: number;
  /** POWERUP burst: the colours of the power that threw it, so a mod's rain
   * lands in its OWN colours rather than in MOONFALL's grey. */
  style?: PowerupStyle;
  /** Hellgate: the RAMPAGE STAGE the gate opened at — it scales the tear's
   * reach and its ember count, so a deeper meter tears a bigger hole
   * (render/hellgate.ts). */
  stage?: number;
  /** Levelup: how big the ding plays, in [0.2, 1] — the blast's brightness,
   * reach, and mote count all scale by it, so an early level-up is a modest
   * glow and the last ding before the cap is the full detonation
   * (levelup-intensity.ts). Default 1 (full).
   * Sparks: how hard the grind is (0..1, the event's own intensity) — scales
   * the spark count, the throw and the contact flare. */
  intensity?: number;
  /** Muzzle: the firing weapon's shot signature (weapon-fx.ts). Absent = the
   * plain class look. */
  fx?: ShotStyle;
  /** Dust: the ground speed (world px/s) the hero carried through the jump —
   * it smears the cloud along `angle`, so a sprinting takeoff trails dust and a
   * standing hop blooms evenly. */
  speed?: number;
  /** Garage door: how many slat blocks the chain hung — the engine's own
   * count, so the roll-up redraws the door that actually stood there rather
   * than a guess made from the span and the sprite's width. */
  slats?: number;
  /** Muzzle: the HERO's facing when he fired (only set for his own shots). The
   * flash is pinned to the weapon's side (where the sprite is drawn) rather than
   * the aim, so firing at a foe BEHIND him still flashes at the barrel, not off
   * his back. Absent on companion/enemy shots (they flash along the aim). */
  faceLeft?: boolean;
};

/**
 * HOW LONG A BODY TAKES TO COME TO REST — the keel-over of one that simply
 * dropped, and the flight of one the killing blow punted (see the `corpse`
 * branch below, which animates both from these).
 */
const CORPSE_KEEL_MS = 260;
const CORPSE_LAUNCH_MS_MAX = 1000;
function corpseFlightMs(launch: NonNullable<Effect["launch"]>): number {
  return Math.min(CORPSE_LAUNCH_MS_MAX, 240 + launch.dist * 2.0);
}

/**
 * HOW LONG THE WHOLE GARAGE DOOR TAKES TO ROLL UP, however many slats it hangs
 * — the blocks divide this between them rather than each taking a fixed beat,
 * so a wide doorway and a narrow one both finish with the `garage_door` sound's
 * closing clack (content/sounds/garage_door.yaml) instead of drifting off it.
 */
export const GARAGE_DOOR_MS = 750;

/**
 * HAS THIS ONE STOPPED MOVING — i.e. is it SCENERY now rather than an event?
 *
 * The effect layer is drawn over the finished frame because almost everything in
 * it happens in the AIR: an explosion, a rising damage number, a spray of blood,
 * a body coming apart. What is left when those are over is not in the air at
 * all. A corpse lies on the floor for seconds, a burst's gibs and a cleave's
 * halves for the ten of GORE LINGER, and an epic's remains for the rest of the
 * level — and drawn with the rest of the layer, every one of them is painted
 * OVER the hero the moment he walks across the spot. There is no depth sort to
 * appeal to (the field is a painter's stack: floor, furniture, actors, hero), so
 * the remains have to change layers when they land.
 *
 * The moment they do is the moment their own animation ends — the flight `t` in
 * ./gibs.ts is clamped over exactly these lengths, so nothing is still moving
 * when this turns true.
 */
/**
 * HOW BIG A HIT NUMBER DRAWS. A plain hit is 1×; a crit's size tracks how hard
 * it rolled — a glancing one grows a modest 1.5×, a top-of-band slam a fat 3×,
 * quantized to half-steps so the pixel glyphs stay crisp. Exported because the
 * LANE the number is given has to know how tall it will be
 * (game-screen/float-lane.ts), and a second copy of this rule would drift.
 */
export function damageTextScale(crit: boolean, critPower?: number): number {
  return crit ? Math.round((1.5 + 1.5 * (critPower ?? 0.5)) * 2) / 2 : 1;
}

export function restsOnFloor(effect: Effect, timeMs: number): boolean {
  if (effect.kind === "gib" || effect.kind === "cleave") {
    const age = (effect.durationMs ?? 0) - (effect.untilMs - timeMs);
    return age >= (effect.kind === "cleave" ? CLEAVE_MS : GORE_BURST_MS);
  }
  if (effect.kind !== "corpse") return false;
  const age = (effect.durationMs ?? 2000) - (effect.untilMs - timeMs);
  const launch = effect.launch;
  const launched = launch != null && launch.dist > 2;
  return age >= Math.max(CORPSE_KEEL_MS, launched ? corpseFlightMs(launch) : 0);
}

/**
 * Draw the live effects over the frame — everything in the layer EXCEPT what has
 * already come to rest on the floor, which `drawFloorRemains` put down under the
 * actors (`restsOnFloor`).
 *
 * `fade` (default 1) dims the WHOLE pass as one — the death scene eases it to 0
 * so the fight's floating damage / crit / XP numbers clear off the tableau
 * instead of hanging over the fallen hero (render/death.ts `combatNoiseFade`).
 * Each effect sets its own alpha as it draws, so the fade composites through a
 * scratch layer (`drawFaded`).
 */
export function drawEffects(
  ctx: CanvasRenderingContext2D,
  effects: readonly Effect[],
  camera: Camera,
  timeMs: number,
  assets: GameAssets,
  fade = 1,
): void {
  drawLayer(ctx, effects, camera, timeMs, assets, fade, false);
}

/**
 * …and the other half: the corpses, the gibs and the cleaved halves that have
 * LANDED, drawn from inside `drawFrame` with the floor furniture so the hero
 * walks OVER the mess he made instead of under it.
 *
 * Same pass, same billboarded anchors, same fade — only the membership differs,
 * so a piece of gore does not change size, place or colour on the frame it
 * changes layers.
 */
export function drawFloorRemains(
  ctx: CanvasRenderingContext2D,
  effects: readonly Effect[],
  camera: Camera,
  timeMs: number,
  assets: GameAssets,
  fade = 1,
): void {
  drawLayer(ctx, effects, camera, timeMs, assets, fade, true);
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  effects: readonly Effect[],
  camera: Camera,
  timeMs: number,
  assets: GameAssets,
  fade: number,
  onFloor: boolean,
): void {
  if (fade < 1) {
    drawFaded(ctx, fade, (target) =>
      drawEffectPass(target, effects, camera, timeMs, assets, onFloor),
    );
    return;
  }
  drawEffectPass(ctx, effects, camera, timeMs, assets, onFloor);
}

function drawEffectPass(
  ctx: CanvasRenderingContext2D,
  effects: readonly Effect[],
  camera: Camera,
  timeMs: number,
  assets: GameAssets,
  onFloor: boolean,
): void {
  const font = assets.font;
  const viewW = ctx.canvas.width;
  const viewH = ctx.canvas.height;
  for (const effect of effects) {
    if (timeMs > effect.untilMs) continue;
    if (restsOnFloor(effect, timeMs) !== onFloor) continue;
    // A delayed float (e.g. the XP popup trailing its damage number) stays
    // hidden until its start tick, then animates from t=0 as usual.
    if (effect.startMs != null && timeMs < effect.startMs) continue;
    // THE WHOLE LAYER IS BILLBOARDED, and projecting the anchor is all it takes:
    // this pass runs in screen space (the run's loop calls it after `drawFrame`
    // has closed the world projection), and every effect below is drawn relative
    // to this one anchor. So projecting the anchor — and nothing else — pins each
    // effect to its place on the tilted floor while leaving its own geometry at
    // full size, which is what an explosion, a rising damage number, a launched
    // corpse and a muzzle flash all want: they happen in the air above a point,
    // not on the ground at it (render/tilt.ts).
    //
    // Through `bodyAnchor*` rather than a rounded `project(pos - camera)`, which
    // is the SAME whole-pixel seat every standing body takes — so a corpse, the
    // blood under it and the mob still fighting over it all step together when
    // the camera pans, instead of each crossing its own rounding boundary at its
    // own moment.
    const x = bodyAnchorX(effect.pos.x, effect.pos.y, camera.x, camera.y);
    const groundY = bodyAnchorY(effect.pos.x, effect.pos.y, camera.x, camera.y);
    // Off-screen cull: a corpse felled two screens back (epic bodies persist
    // for the whole level) or a fight's leftovers beyond the rim must not
    // keep paying draw calls every frame. The margin covers each effect's
    // furthest reach — its radius, a launched corpse's throw, a lightning
    // bolt's sky anchor. The nuke is a whole-screen flash and never culls.
    if (effect.kind !== "nuke") {
      const reach =
        96 +
        (effect.radius ?? 0) +
        (effect.launch ? effect.launch.dist : 0) +
        // A deep-rampage hellgate tear reaches well past the default margin.
        (effect.kind === "hellgate" ? hellgateReach(effect.stage ?? 0) * 2 : 0);
      if (
        x < -reach ||
        x > viewW + reach ||
        groundY < -reach ||
        groundY > viewH + reach
      ) {
        continue;
      }
    }

    // The POWERUPS' bursts live in their own module (a moon rock landing, an
    // unmaking wave, a shield shattering, a ward holding) — it claims the
    // effect and this pass moves on.
    if (drawPowerupBurst(ctx, effect, x, groundY, timeMs)) continue;

    // The dust a jump kicks up at either end of it, in the colour of the floor
    // it came off — its own module too (./dust.ts).
    if (drawDust(ctx, effect, x, groundY, timeMs, assets.sprites)) continue;

    // The gout a FLAMETHROWER throws down the cone its blow struck — its own
    // module too (./flame.ts), because a jet is built differently from a burst:
    // every particle runs its own looping clock so the stream is full from the
    // first frame instead of blooming into existence.
    if (drawFlameGout(ctx, effect, x, groundY, timeMs, assets.sprites))
      continue;

    // The blood a landed blow throws — the wound, the drops and the haze, all
    // sized by how hard the hit was (./blood.ts). The MARK it leaves on the
    // floor is not here: that was baked into the decal layer the moment the
    // blow landed and costs this pass nothing.
    if (drawBlood(ctx, effect, x, groundY, timeMs, assets.sprites)) continue;

    // A body coming APART — the two halves of a cleaved one, or every piece of
    // a burst one arcing out and bouncing to a stop (./gibs.ts). The blood the
    // pieces land in was soaked into the floor the moment the blow landed, off
    // the very same scatter, and costs this pass nothing.
    if (drawGore(ctx, effect, x, groundY, timeMs, assets.sprites)) continue;

    // The bloom a magic-or-better find throws as it lands — the visual half of
    // the rarity chime, in the tier's own colour (./loot-aura.ts, which also
    // owns the standing aura the find then wears for the rest of the level).
    if (drawLootShine(ctx, effect, x, groundY, timeMs)) continue;

    // THE ELITE TIER's one-shot bursts (./elite-fx.ts) — the pulse, the blink,
    // a fissure's light, a shout, and the cast bloom every other primitive
    // gets. The long-lived halves (the ring, the shell, the tether) are drawn
    // from state by `drawEliteAuras`, not from here.
    if (drawEliteBurst(ctx, effect, x, groundY, timeMs, camera)) continue;

    if (effect.kind === "splash") {
      // Two-frame gore burst pinned to where the hit landed.
      const duration = effect.durationMs ?? 240;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const frame = t < 0.5 ? 0 : 1;
      const sprite = spriteByName(
        assets.sprites,
        `${effect.sprite ?? "blood"}_${frame}`,
      );
      if (sprite) {
        ctx.drawImage(
          sprite,
          x - Math.round(sprite.width / 2),
          groundY - Math.round(sprite.height / 2),
        );
      }
      continue;
    }

    if (effect.kind === "burst") {
      // The themed gore a signature melee blow throws — colored specks flung off
      // the wound over the splash (slash-fx.ts). Lifted to the hit, not the feet.
      if (effect.gore) {
        const duration = effect.durationMs ?? 300;
        const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
        if (t >= 0 && t <= 1) {
          drawBurst(ctx, x, groundY - 4, t, effect.gore, effect.seed ?? 0);
        }
      }
      continue;
    }

    if (effect.kind === "sparks") {
      // A bare axle grinding the road: hot metal streaks thrown back along
      // the travel (`angle` — cos gives the throw sign), each on its own
      // seeded ballistic arc, white-hot at the contact and cooling to
      // orange as it flies. LIGHT, so the shower draws additively.
      const duration = effect.durationMs ?? 340;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      if (t < 0 || t > 1) continue;
      const seed = effect.seed ?? 0;
      const heat = effect.intensity ?? 1;
      const sign = Math.cos(effect.angle ?? Math.PI) >= 0 ? 1 : -1;
      const fract = (v: number) => v - Math.floor(v);
      ctx.globalCompositeOperation = "lighter";
      // The contact flare: a small hot pool right where steel meets road,
      // brightest at the first instant.
      const flare = (1 - t) * (0.25 + 0.35 * heat);
      if (flare > 0.02) {
        ctx.globalAlpha = flare;
        ctx.fillStyle = "#ffe9a8";
        ctx.beginPath();
        ctx.arc(x, groundY, 2 + 2 * heat, 0, Math.PI * 2);
        ctx.fill();
      }
      const count = 6 + Math.round(4 * heat);
      for (let i = 0; i < count; i++) {
        const u1 = fract(seed * 0.731 + i * 0.377);
        const u2 = fract(seed * 0.517 + i * 0.911);
        const u3 = fract(seed * 0.293 + i * 0.641);
        // Each spark lives a little shorter than the effect, staggered.
        const life = 0.55 + 0.4 * u3;
        const st = t / life;
        if (st > 1) continue;
        const throwPx = (18 + 34 * u1) * (0.5 + 0.5 * heat);
        const lift = 8 + 14 * u2; // initial upward flick, px
        const arc = (tt: number) => ({
          px: x + sign * throwPx * tt,
          py: groundY - lift * tt + (lift + 4) * tt * tt,
        });
        const now = arc(st);
        const was = arc(Math.max(0, st - 0.12));
        const cool = st; // white → gold → orange along its own life
        ctx.strokeStyle =
          cool < 0.35 ? "#fff8d8" : cool < 0.7 ? "#ffcf5e" : "#ff7a2d";
        ctx.globalAlpha = (1 - st) * 0.9;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(was.px), Math.round(was.py));
        ctx.lineTo(Math.round(now.px), Math.round(now.py));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      continue;
    }

    if (effect.kind === "corpse") {
      // A slain mob's send-off: it keels over flat to the ground with a little
      // hop, lies there a beat, then blinks out and is gone. Purely cosmetic —
      // the engine already removed the live enemy the tick it died, so this
      // plays on top at the spot it fell. Timeline over `duration` (2s):
      // keel-over (`CORPSE_KEEL_MS`) → lie still → blink for the final second.
      const duration = effect.durationMs ?? 2000;
      const age = duration - (effect.untilMs - timeMs); // ms since death
      // A single fixed frame (dying, frame 0) — a corpse never walks or bobs,
      // it just keels over once and lies still. The dead don't animate.
      const sprite = enemySprites(assets.sprites, effect.sprite ?? "ghost")
        .dying[0];
      // Blink out over the final second: skip alternate ~90ms windows so it
      // flickers before it disappears. Epic bodies (persist) never blink —
      // they just keel over and stay down.
      const blinkAt = duration - 1000;
      if (
        !effect.persist &&
        age >= blinkAt &&
        Math.floor(timeMs / 90) % 2 === 0
      )
        continue;
      // KILL LAUNCH: the killing blow punts the body flying away from the hero
      // (kung-fu style) — it sails along `launch`, arcs up off the ground, and
      // tumbles end over end, decelerating into the spot it lands. The harder
      // the blow hit for the health it went through the further it sails, up
      // to clear off the screen for a legendary one-shot; a chip finish on an
      // already-wounded mob has no launch and just topples in place.
      // GameScreen sized `dist` from the kill's `damage / maxHp`.
      const launch = effect.launch;
      const launched = launch != null && launch.dist > 2;
      const flightMs = launched ? corpseFlightMs(launch) : 0;
      const flight = launched ? Math.min(1, age / flightMs) : 0;
      const flightEase = flight * (2 - flight); // ease-out into the landing
      // `launch.dx/dy` is the bearing AWAY FROM THE HERO, in the world, so the
      // flight is a distance across the floor and goes through the projection
      // (`projectOffset`). Used raw it punted the body along the SCREEN's axes
      // instead — and a corpse lies where it landed for the rest of the level, so
      // a body thrown in the wrong direction is a mistake that stays on the field.
      const throwTo = launched
        ? projectOffset(
            launch.dx * launch.dist * flightEase,
            launch.dy * launch.dist * flightEase,
          )
        : { x: 0, y: 0 };
      const tx = Math.round(throwTo.x);
      const ty = Math.round(throwTo.y);
      // Airborne arc: rise then fall over the flight, its height growing with
      // how far the body is thrown.
      const lift = launched
        ? Math.round(Math.sin(flight * Math.PI) * launch.dist * 0.16)
        : 0;
      // Tumble whole spins (so it lands flat on its keel), forward along the
      // throw, bleeding off as it decelerates. The count comes straight from
      // the kill's OVERKILL (GameScreen sized it: one spin per full extra
      // starting-HP bar past the first) — NOT from the distance — so it turns
      // exactly as many times as the hit earned instead of a distance-derived
      // guess, and a one-shot that merely clears the bar slides without
      // rolling.
      const spins = launched ? launch.spins : 0;
      const tumble = launched
        ? (Math.sign(launch.dx) || 1) * spins * Math.PI * 2 * flightEase
        : 0;
      // Keel-over: rotate 0 → the rolled ±90° over `CORPSE_KEEL_MS` (ease-out),
      // with a brief hop as it topples.
      const fall = Math.min(1, age / CORPSE_KEEL_MS);
      const eased = fall * (2 - fall);
      const tip = (effect.angle ?? Math.PI / 2) * eased;
      const hop = Math.round(Math.sin(fall * Math.PI) * 4);
      const w = sprite.width;
      const h = sprite.height;
      ctx.save();
      // Pivot about the sprite's feet (bottom-centre) so it falls flat with its
      // base planted, then draw the body rising from that pivot.
      ctx.translate(x + tx, groundY + ty + Math.round(h / 2) - hop - lift);
      ctx.rotate(tip + tumble);
      ctx.drawImage(sprite, -Math.round(w / 2), -h);
      ctx.restore();
      continue;
    }

    if (effect.kind === "incinerate") {
      // A screen-nuke kill's send-off: the body BURNS UP — engulfed in flame as
      // it fades — and leaves a smoking, charred skeleton where it stood, which
      // smoulders a beat and then fades out. World-anchored (it rides the field
      // as the camera pans), seeded so a whole incinerated horde flickers and
      // smokes out of step. Timeline over `duration` (~1600ms): burn (flames up,
      // body fades) → the skeleton emerges as the fire dies to embers → smoke
      // rises and the bones fade.
      const duration = effect.durationMs ?? 1600;
      const t = clamp01(1 - (effect.untilMs - timeMs) / duration); // 0 → 1
      const seed = effect.seed ?? 0;
      const body = enemySprites(assets.sprites, effect.sprite ?? "ghost")
        .dying[0];
      const w = body.width;
      const h = body.height;
      ctx.save();
      // The burning body: the mob's own sprite, fading out over the burn as the
      // flames consume it (0.05 → 0.4).
      const bodyFade = 1 - clamp01((t - 0.05) / 0.35);
      if (bodyFade > 0) {
        ctx.globalAlpha = bodyFade;
        ctx.drawImage(body, x - Math.round(w / 2), groundY - Math.round(h / 2));
      }
      // The charred skeleton left behind: emerges as the fire dies (0.3 → 0.48),
      // holds, then fades out over the last stretch (0.82 → 1). Scaled up whole
      // for a bigger mob so a giant leaves a bigger skeleton.
      const skel = spriteByName(assets.sprites, "charred_skeleton");
      if (skel) {
        const appear =
          clamp01((t - 0.3) / 0.18) * (1 - clamp01((t - 0.82) / 0.18));
        if (appear > 0) {
          const scale = Math.max(1, Math.round(h / skel.height));
          const dw = skel.width * scale;
          const dh = skel.height * scale;
          ctx.globalAlpha = appear;
          ctx.drawImage(
            skel,
            x - Math.round(dw / 2),
            groundY - Math.round(dh / 2),
            dw,
            dh,
          );
        }
      }
      // FIRE: warm tongues licking up from the body, flickering off the clock,
      // full through the burn then receding to nothing as the bones show
      // (drawn additively so they read as pure flame, not paint).
      const fireT = t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.28);
      if (fireT > 0) {
        ctx.globalCompositeOperation = "lighter";
        const baseY = groundY + Math.round(h / 2);
        const flames = 5;
        const span = Math.max(10, w * 0.8);
        for (let i = 0; i < flames; i++) {
          const fx = x + Math.round((i / (flames - 1) - 0.5) * span);
          const flick =
            0.55 + 0.45 * Math.abs(Math.sin(timeMs / 90 + seed + i * 1.7));
          const fh = (12 + h) * fireT * flick;
          const fw = Math.max(3, w * 0.24);
          const tongue = (width: number, height: number) => {
            ctx.beginPath();
            ctx.moveTo(fx - width / 2, baseY);
            ctx.quadraticCurveTo(
              fx - width / 2,
              baseY - height * 0.6,
              fx,
              baseY - height,
            );
            ctx.quadraticCurveTo(
              fx + width / 2,
              baseY - height * 0.6,
              fx + width / 2,
              baseY,
            );
            ctx.closePath();
            ctx.fill();
          };
          ctx.globalAlpha = 0.5 * fireT;
          ctx.fillStyle = "#ff5a1e";
          tongue(fw, fh);
          ctx.globalAlpha = 0.55 * fireT;
          ctx.fillStyle = "#ffc132";
          tongue(fw * 0.55, fh * 0.68);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      // Ember glow smouldering under the bones after the flames die.
      const emberT =
        clamp01((t - 0.35) / 0.15) * (1 - clamp01((t - 0.75) / 0.25));
      if (emberT > 0) {
        ctx.globalCompositeOperation = "lighter";
        const pulse = 0.6 + 0.4 * Math.sin(timeMs / 140 + seed);
        ctx.globalAlpha = 0.4 * emberT * pulse;
        ctx.fillStyle = "#ff6a1e";
        ctx.beginPath();
        ctx.ellipse(x, groundY + h * 0.2, w * 0.4, w * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      // SMOKE: grey wisps that rise off the wreck and thin out, staggered so the
      // column churns rather than puffing as one.
      if (t > 0.28) {
        const puffs = 4;
        for (let i = 0; i < puffs; i++) {
          const st = clamp01((t - 0.28 - i * 0.06) / 0.62);
          if (st <= 0) continue;
          const rise = st * (h + 20);
          const drift = Math.sin(seed + i * 2.1 + st * 2.4) * 6;
          const px = x + Math.round(drift);
          const py = Math.round(groundY - h * 0.3 - rise);
          const pr = 3 + i + st * 8;
          ctx.globalAlpha = 0.32 * (1 - st) * (1 - st);
          ctx.fillStyle = i % 2 === 0 ? "#5c5c64" : "#48484f";
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      continue;
    }

    if (effect.kind === "crateBreak") {
      // A smashed crate's send-off: the box keels over (like a slain mob) and
      // bursts, then the broken-plank debris fades out, leaving just the loot
      // the engine already spilled. Timeline over `duration` (~700ms): tip the
      // intact crate onto its side (first ~200ms), swap to the `crate_broken`
      // debris pile, then fade the wreck out — a spray of splinters flying the
      // whole time. Purely cosmetic; the engine removed the obstacle the tick
      // it broke, so this plays on top at the spot it stood.
      const duration = effect.durationMs ?? 700;
      const age = duration - (effect.untilMs - timeMs); // ms since the break
      const tipMs = 200;
      const box = spriteByName(assets.sprites, effect.sprite ?? "crate");
      // Debris matches the container that broke: a `<sprite>_broken` twin if the
      // family ships one (a locker leaves buckled chrome, not cardboard planks),
      // falling back to the generic crate wreck.
      const debris =
        (effect.sprite &&
          spriteByName(assets.sprites, `${effect.sprite}_broken`)) ||
        spriteByName(assets.sprites, "crate_broken");
      // Splinters: a handful of wood chips thrown out from the box, arcing up
      // then down and fading over the first ~360ms. Seeded off the effect so a
      // burst is stable frame to frame (each chip a fixed bearing/speed).
      const splinterMs = 360;
      if (age < splinterMs) {
        const st = age / splinterMs; // 0 → 1
        const seed = effect.seed ?? 0;
        const chips = 7;
        ctx.save();
        for (let i = 0; i < chips; i++) {
          const ang = (i / chips) * Math.PI * 2 + (seed % 7) * 0.4;
          const speed = 10 + ((seed * (i + 3)) % 11);
          const reach = speed * st;
          const cx = x + Math.round(Math.cos(ang) * reach);
          const arc = Math.sin(st * Math.PI) * (6 + (i % 3) * 3);
          const cy =
            groundY - 5 + Math.round(Math.sin(ang) * reach * 0.5 - arc);
          ctx.globalAlpha = Math.max(0, 1 - st);
          ctx.fillStyle = i % 2 === 0 ? "#caa24d" : "#8a6a2c";
          const s = i % 3 === 0 ? 2 : 1;
          ctx.fillRect(cx, cy, s + 1, s);
        }
        ctx.restore();
      }
      if (age < tipMs && box) {
        // Keel the intact box over onto its side, pivoting about its feet, with
        // a little hop as it goes — the same read as a toppling mob.
        const t = age / tipMs;
        const eased = t * (2 - t);
        const tip = (effect.angle ?? Math.PI / 2) * 0.75 * eased;
        const hop = Math.round(Math.sin(t * Math.PI) * 3);
        const w = box.width;
        const h = box.height;
        ctx.save();
        ctx.translate(x, groundY + Math.round(h / 2) - hop);
        ctx.rotate(tip);
        ctx.drawImage(box, -Math.round(w / 2), -h);
        ctx.restore();
      } else if (debris) {
        // The wreck lies where it fell and fades out over the rest of its life.
        const fade = Math.min(1, (age - tipMs) / (duration - tipMs));
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - fade);
        ctx.drawImage(
          debris,
          x - Math.round(debris.width / 2),
          groundY - Math.round(debris.height / 2),
        );
        ctx.restore();
      }
      continue;
    }

    if (effect.kind === "garageDoor") {
      // THE ROLL-UP, ONE BLOCK AT A TIME. The engine dropped the door's whole
      // obstacle chain the tick it opened, so this redraws those slats
      // cosmetically — but a garage door does not evaporate all at once, which
      // is exactly how a chain animated in lockstep reads. The BOTTOM-MOST
      // block goes first, then the one above it, on up the doorway: the door
      // opens the way the player's own would, and the wall behind it comes
      // back into view progressively rather than in one blink.
      //
      // A block's own departure is its bottom edge rising into the block above
      // (the visible slab is the sprite's TOP fraction drawn at a fixed top
      // edge), eased to start slow like a chain drive taking up and faded over
      // the last pixels so nothing pops.
      //
      // Each block is drawn on the obstacle pass's own anchor — CENTRED on its
      // world point (render/plane.ts), not standing its feet on it, which is
      // what an effect does. Getting that wrong slides the whole door half a
      // block up the doorway the instant it starts moving.
      const duration = effect.durationMs ?? GARAGE_DOOR_MS;
      const age = duration - (effect.untilMs - timeMs);
      const slab = spriteByName(assets.sprites, effect.sprite ?? "garage_door");
      const far = effect.to;
      if (slab && far) {
        const count = Math.max(1, effect.slats ?? 1);
        // Each block's own beat, taken in order — a block is fully up before
        // the next one starts moving.
        const beat = duration / count;
        // Bottom of the screen first: the block furthest DOWN the doorway is
        // the one the opener lifts away first, whichever end of the chain that
        // happens to be. (A doorway lying east–west has every block on one
        // line — it opens right to left, which is the same rule.)
        const flip =
          far.y !== effect.pos.y ? far.y > effect.pos.y : far.x > effect.pos.x;
        ctx.save();
        for (let i = 0; i < count; i++) {
          const f = count > 1 ? i / (count - 1) : 0;
          const wx = effect.pos.x + (far.x - effect.pos.x) * f;
          const wy = effect.pos.y + (far.y - effect.pos.y) * f;
          const order = flip ? count - 1 - i : i;
          const t = Math.min(1, Math.max(0, (age - order * beat) / beat));
          if (t >= 1) continue;
          const eased = t * t * (3 - 2 * t);
          const keep = 1 - eased;
          const h = Math.max(1, Math.round(slab.height * keep));
          const ax = bodyAnchorX(wx, wy, camera.x, camera.y);
          const ay = bodyAnchorY(wx, wy, camera.x, camera.y);
          ctx.globalAlpha = Math.min(1, keep * 3);
          ctx.drawImage(
            slab,
            0,
            0,
            slab.width,
            h,
            ax - Math.round(slab.width / 2),
            ay - Math.round(slab.height / 2),
            slab.width,
            h,
          );
        }
        ctx.restore();
      }
      continue;
    }

    if (effect.kind === "damage") {
      // The hit's number pops on the victim's head and stays pinned there —
      // only XP floats now. A crit is a fat gold figure that jolts once —
      // a beat left, a beat right, then dead center for the rest of its
      // life — not a continuous buzz. A normal hit is a plain static number.
      // A crit's size tracks how hard it rolled: a glancing crit grows a
      // modest 1.5×, a top-of-band slam a fat 3× (quantized to half-steps so
      // the pixel glyphs stay crisp). It jolts harder the bigger it is.
      const duration = effect.durationMs ?? 650;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const crit = effect.crit ?? false;
      const scale = damageTextScale(crit, effect.critPower);
      const elapsedMs = t * duration;
      const shake = !crit
        ? 0
        : elapsedMs < 70
          ? -Math.round(scale)
          : elapsedMs < 140
            ? Math.round(scale)
            : 0;
      const text = formatCompact(effect.value ?? 0);
      const width = font.measure(text) * scale;
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      // `lift` is the lane this number was given so it clears whatever was
      // already on the body (game-screen/float-lane.ts) — in a busy fight the
      // hits ladder up off it instead of overprinting each other.
      font.draw(
        ctx,
        text,
        x - Math.round(width / 2) + shake,
        groundY - (effect.lift ?? 0) - font.height * scale,
        { scale, color: crit ? "#ffd75e" : "#f4f4f4" },
      );
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "text") {
      // A short word (e.g. "DODGE") rises and fades off the spot, like a
      // damage number but spelled out.
      const duration = effect.durationMs ?? 650;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const scale = effect.scale ?? 1;
      const elapsedMs = t * duration;
      // A crit-style float jolts in place before it lifts off: it snaps
      // left–right for a run of beats, settles to centre, THEN rises over the
      // remainder. The bigger the gain (the higher `scale`), the more beats it
      // throws and the wider it throws them — a 2× pop goes left–right–centre,
      // a 3× goes left–right–left–centre, and so on up. Plain floats
      // (DODGE/MISS) leave `shake` off and rise from the first frame.
      const stepMs = 55;
      // One alternating beat per unit of scale (min two so the smallest jolt
      // still reads as a shake), then a trailing centre beat, then the rise.
      const shakeBeats = effect.shake ? Math.max(2, Math.round(scale)) : 0;
      const settleMs = shakeBeats * stepMs; // alternation ends → centre
      const shakeMs = settleMs + stepMs; // centre beat held, then lift off
      // A touch more throw for bigger gains — past 2× the swing widens faster
      // than the glyph so a huge pull visibly rattles harder.
      const amp = Math.round(scale + Math.max(0, scale - 2) * 0.5);
      const jolt =
        shakeBeats === 0 || elapsedMs >= settleMs
          ? 0
          : (Math.floor(elapsedMs / stepMs) % 2 === 0 ? -1 : 1) * amp;
      const riseT = effect.shake
        ? Math.max(0, (elapsedMs - shakeMs) / (duration - shakeMs))
        : t;
      const rise = Math.round((effect.rise ?? 16) * riseT);
      const text = effect.text ?? "";
      const width = font.measure(text) * scale;
      const tx = x - Math.round(width / 2) + jolt;
      // `lift` is the lane this float was given at spawn so it clears whatever
      // was already on this spot (game-screen/float-lane.ts) — it rides ABOVE
      // the rise, so a stacked float still climbs its own full arc.
      const ty = groundY - rise - (effect.lift ?? 0) - font.height * scale;
      ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      // A hard 1px drop-shadow first so the word keeps contrast on both the
      // bright floor and the dark sky — the colored glyphs ride on top.
      font.draw(ctx, text, tx + 1, ty + 1, { scale, color: "#0b0d10" });
      font.draw(ctx, text, tx, ty, {
        scale,
        color: effect.color ?? "#7ecbff",
      });
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "swing") {
      // The EXACT region the swing strikes — a sector centred on the player, out
      // to the weapon's reach, spanning the weapon's full cone (`radius` = true
      // reach, `arc` = the full cone; the visual and the hit test share one
      // geometry) — but drawn as the blade CARVES it: the cone tracks the held
      // weapon's swing on the shared timeline (`MELEE_SWING_MS`,
      // SWING_WINDUP_END/STRIKE_END). It stays dark through the windup, then the
      // bright edge wipes from one rim to the other across the STRIKE window,
      // filling the arc behind it as the blade passes, and clears over the
      // recover. Companion swings (no held-weapon sprite) read the same — an
      // anticipated slash that sweeps and lands.
      const duration = effect.durationMs ?? MELEE_SWING_MS;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1 over the swing
      if (t < 0 || t > 1) continue;
      // Strike progress (0→1) across the same window the blade whips through,
      // eased to match `weaponPose`; nothing shows until the strike begins.
      const p = clamp01(
        (t - SWING_WINDUP_END) / (SWING_STRIKE_END - SWING_WINDUP_END),
      );
      if (p <= 0) continue;
      const swept = 1 - (1 - p) * (1 - p); // ease-out, in step with the blade
      // Presence fades the whole slash out over the recover so it clears as the
      // blade folds home.
      const presence =
        1 - clamp01((t - SWING_STRIKE_END) / (1 - SWING_STRIKE_END));
      const aim = effect.angle ?? 0;
      const reach = Math.max(6, effect.radius ?? 40);
      // The true half-cone — no minimum, so a thrust draws exactly the thin
      // wedge it hits and a saturated (π) cone fills the whole disc.
      const half = Math.min(Math.PI, (effect.arc ?? 1.9) / 2);
      const start = aim - half;
      const lead = start + 2 * half * swept; // the blade's current edge
      ctx.save();
      ctx.translate(x, groundY);
      // The footprint is GROUND the swing covers, and `aim`/`reach` are both in
      // world terms, so the wedge is drawn through the projection: it comes out
      // foreshortened and turned with the floor, instead of as a screen-space
      // pie slice pointing somewhere the blade never went.
      applyWorldProjection(ctx);
      // Just a FAINT AoE footprint now — the ground the swing covers, so the hit
      // area still reads. The bright slash itself is drawn ON the blade in
      // drawPlayer (`drawBladeSlash`), riding the weapon rather than fanning out
      // of the hero's feet; this is only the quiet floor tint behind it.
      // Companion swings (no held-weapon sprite) still read off this footprint.
      ctx.globalAlpha = Math.max(0, 0.13 * presence);
      ctx.fillStyle = "#9fc4ff";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, start, lead);
      ctx.closePath();
      ctx.fill();
      // A thin rim edge along the swept front so the footprint's shape reads.
      ctx.globalAlpha = Math.max(0, 0.28 * presence);
      ctx.strokeStyle = "#c7ddff";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }

    if (effect.kind === "muzzle") {
      // A short flash at the muzzle / wand tip, a few px ahead along the aim,
      // in the firing weapon's signature (weapon-fx.ts) — the hero's own shots
      // carry their weapon's `fx`; companion/enemy shots fall to the plain
      // class look. Ranged bursts rays, magic blooms a ring.
      const duration = effect.durationMs ?? 110;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      if (t < 0 || t > 1) continue;
      // The weapon points where the hero FACES, not where the shot goes — so his
      // own flash fires out the barrel's side even when the target is behind
      // him. Force the horizontal to the facing side, keeping the aim's up/down
      // tilt. Companion/enemy shots (no `faceLeft`) flash straight along the aim.
      let aim = effect.angle ?? 0;
      if (effect.faceLeft !== undefined) {
        const c = Math.abs(Math.cos(aim)) * (effect.faceLeft ? -1 : 1);
        aim = Math.atan2(Math.sin(aim), c);
      }
      const mx = x + Math.round(Math.cos(aim) * 9);
      // Lift to the weapon's height (the hero holds it mid-body).
      const my = groundY + Math.round(Math.sin(aim) * 9) - 5;
      const style =
        effect.fx ??
        shotStyleFor(
          undefined,
          effect.weaponClass === "magic" ? "magic" : "ranged",
        );
      drawMuzzle(ctx, mx, my, aim, t, style);
      continue;
    }

    if (effect.kind === "nuke") {
      // The WORLD-anchored core of the screen-clearer: a scorch burned into the
      // floor at ground zero, staggered shockwave rings bursting out of it, and
      // a spray of embers flung across the field. The blinding flash, the light
      // bloom, the licking flames and the billowing smoke are a screen-space CSS
      // overlay on top (createNukeFx / .nuke-fx-layer) — this is only what must
      // stick to the blast point in the world as the camera pans.
      const duration = effect.durationMs ?? 900;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const seed = effect.seed ?? 0;
      ctx.save();
      // Scorch: burnt ground revealed UNDER the settling smoke — it fades in
      // over the back half and clears at the very end, so it never punches a
      // dark hole through the bright fireball at the front of the blast.
      const scorch =
        clamp01((t - 0.35) / 0.3) * (1 - clamp01((t - 0.82) / 0.18));
      ctx.globalAlpha = 0.42 * scorch;
      ctx.fillStyle = "#1a1310";
      ctx.beginPath();
      ctx.ellipse(x, groundY, 34, 34 * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      // Three shockwave rings, staggered, each a hot white-gold edge bursting
      // out to a wide radius and thinning as it goes.
      for (let r = 0; r < 3; r++) {
        const rt = clamp01((t - r * 0.12) / (1 - r * 0.12));
        if (rt <= 0) continue;
        const reach = 14 + rt * (150 + r * 46);
        const fade = (1 - rt) * (1 - rt);
        ctx.globalAlpha = 0.85 * fade;
        ctx.strokeStyle = r === 0 ? "#fff3cf" : "#ffb84a";
        ctx.lineWidth = Math.max(1, 4 * (1 - rt));
        ctx.beginPath();
        ctx.arc(x, groundY, reach, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Embers: sparks flung radially, arcing out and decelerating, cooling from
      // gold to ember-red as they fade. Seeded so they scatter identically each
      // frame (no per-frame Math.random in a render pass).
      const embers = 22;
      const et = clamp01(t / 0.85);
      const ease = 1 - (1 - et) * (1 - et); // ease-out throw
      for (let i = 0; i < embers; i++) {
        const a = fract(seed + i * 1.7) * Math.PI * 2;
        const speed = 60 + fract(seed + i * 3.1) * 150;
        const reach = speed * ease;
        const ex = x + Math.cos(a) * reach;
        const ey =
          groundY + Math.sin(a) * reach * 0.7 - Math.sin(et * Math.PI) * 18;
        ctx.globalAlpha = Math.max(0, 1 - et) * 0.95;
        ctx.fillStyle = et < 0.4 ? "#ffe9a6" : et < 0.7 ? "#ff9a3c" : "#e0451c";
        const s = fract(seed + i * 5.9) < 0.3 ? 2 : 1;
        ctx.fillRect(Math.round(ex), Math.round(ey), s + 1, s + 1);
      }
      ctx.restore();
      continue;
    }

    if (effect.kind === "levelup") {
      // The WORLD-anchored core of the level-up light explosion: a blinding
      // white-gold flash disc, radiant starburst spokes, staggered shockwave
      // rings bursting out (the same wave that HURLS the horde back, engine
      // side), and a spray of golden sparkle-stars flung outward and up. The
      // full-screen blinding flash + light bloom + god-rays are a screen-space
      // CSS overlay on top (createLevelUpFx); the sustained golden pillar the
      // modal rises from is the hero burn (render/player.ts drawLevelUpBurn) —
      // this is only the outward blast, pinned to the hero as the camera pans.
      const duration = effect.durationMs ?? 900;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      if (t < 0 || t > 1) continue;
      const seed = effect.seed ?? 0;
      const gy = groundY - 18; // lift the blast to mid-body, not the feet
      // How big this ding plays (levelup-intensity.ts). Brightness follows it
      // straight (an early ding is a fifth as bright); the blast's REACH is
      // pulled in more gently so a small ding still reads as a burst around the
      // hero rather than a pinprick at his feet.
      const power = effect.intensity ?? 1;
      const spread = 0.45 + 0.55 * power;
      ctx.save();
      ctx.globalCompositeOperation = "lighter"; // pure light: add, never occlude

      // Flash core: a hot white disc that swells and is gone fast — the
      // detonation's heart, cooling white → gold as it dies.
      if (t < 0.42) {
        const f = (1 - t / 0.42) * power;
        const rad = (12 + t * 74) * spread;
        const grd = ctx.createRadialGradient(x, gy, 0, x, gy, rad);
        grd.addColorStop(0, `rgba(255,255,255,${0.95 * f})`);
        grd.addColorStop(0.45, `rgba(255,240,190,${0.7 * f})`);
        grd.addColorStop(1, "rgba(255,200,90,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, gy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Radiant starburst spokes: a fan of light beams shooting from the core,
      // rotating a touch as they swell and fade — canvas god-rays.
      const spokeFade = (1 - t) * (1 - t) * power;
      if (spokeFade > 0.02) {
        const spokes = 12;
        const reach = (24 + t * 120) * spread;
        ctx.globalAlpha = 0.5 * spokeFade;
        ctx.strokeStyle = "#fff2c0";
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2 + t * 0.5 + seed;
          const inner = (8 + t * 20) * spread;
          ctx.lineWidth = Math.max(1, 3 * spokeFade);
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * inner, gy + Math.sin(a) * inner * 0.7);
          ctx.lineTo(x + Math.cos(a) * reach, gy + Math.sin(a) * reach * 0.7);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Shockwave rings: three white-gold edges bursting out to a wide radius
      // and thinning — the visible edge of the wave that flung the horde.
      for (let r = 0; r < 3; r++) {
        const rt = clamp01((t - r * 0.14) / (1 - r * 0.14));
        if (rt <= 0) continue;
        const reach = (12 + rt * (120 + r * 40)) * spread;
        const fade = (1 - rt) * (1 - rt) * power;
        ctx.globalAlpha = 0.9 * fade;
        ctx.strokeStyle = r === 0 ? "#fffdf4" : "#ffd75e";
        ctx.lineWidth = Math.max(1, 5 * (1 - rt));
        ctx.beginPath();
        ctx.ellipse(x, gy, reach, reach * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Sparkle-stars: golden four-point twinkles flung radially outward and
      // lofted up, decelerating (ease-out) and twinkling as they cool from
      // white to gold. Seeded so they scatter identically every frame. A dim
      // ding throws a thinner spray (the count follows the intensity too), so
      // the shower grows with the hero instead of only dimming.
      const stars = Math.max(6, Math.round(26 * (0.3 + 0.7 * power)));
      const st = clamp01(t / 0.9);
      const ease = 1 - (1 - st) * (1 - st); // ease-out throw
      for (let i = 0; i < stars; i++) {
        const a = fract(seed + i * 1.7) * Math.PI * 2;
        const speed = (50 + fract(seed + i * 3.1) * 130) * spread;
        const reach = speed * ease;
        const sx = x + Math.cos(a) * reach;
        const sy =
          gy + Math.sin(a) * reach * 0.68 - Math.sin(st * Math.PI) * 26;
        // Each star twinkles on its own phase so the spray shimmers.
        const tw = 0.55 + 0.45 * Math.sin(timeMs / 70 + i * 1.3);
        ctx.globalAlpha = Math.max(0, 1 - st) * tw * power;
        ctx.fillStyle =
          st < 0.35 ? "#fffef6" : st < 0.7 ? "#ffe9a6" : "#ffb454";
        const rx = Math.round(sx);
        const ry = Math.round(sy);
        const arm = fract(seed + i * 5.9) < 0.3 ? 3 : 2;
        // A crisp 4-point sparkle: a vertical + horizontal bar with a bright
        // centre pip, all integer-sized so the pixels stay sharp.
        ctx.fillRect(rx, ry - arm, 1, arm * 2 + 1);
        ctx.fillRect(rx - arm, ry, arm * 2 + 1, 1);
        ctx.fillRect(rx, ry, 1, 1);
      }
      ctx.restore();
      continue;
    }

    if (effect.kind === "asteroidImpact") {
      // A METEOR DETONATION at the impact point: a white-hot flash core, a
      // shockwave ring bursting out to the blast radius, and a spinning dust
      // cloud that expands and thins as it rolls out — the "settling dust" the
      // crater is left under.
      const duration = effect.durationMs ?? 620;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const radius = effect.radius ?? 55;
      ctx.save();

      // Flash core: a hot flare in the opening beats, gone fast.
      if (t < 0.32) {
        const f = 1 - t / 0.32;
        ctx.globalAlpha = 0.85 * f;
        ctx.fillStyle = "#fff2cf";
        ctx.beginPath();
        ctx.arc(x, groundY, radius * (0.3 + 0.7 * t), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.7 * f;
        ctx.fillStyle = "#ffb24a";
        ctx.beginPath();
        ctx.arc(x, groundY, radius * (0.18 + 0.5 * t), 0, Math.PI * 2);
        ctx.fill();
      }

      // Shockwave ring: bursts out to the full blast radius and fades.
      const reach = radius * (0.25 + 0.9 * t);
      ctx.globalAlpha = 0.7 * (1 - t);
      ctx.strokeStyle = "#e8d2a6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, groundY, reach, reach * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Dust cloud: a ring of soft grey puffs that spin outward, expanding and
      // thinning — the spinning cloud with rising transparency, in pixels.
      const puffs = 9;
      const spin = t * 2.4;
      const cloudR = radius * (0.2 + 0.85 * t);
      ctx.globalAlpha = 0.5 * (1 - t) * (1 - t);
      ctx.fillStyle = "#b9bcc6";
      for (let i = 0; i < puffs; i++) {
        const a = spin + (i / puffs) * Math.PI * 2;
        const px = x + Math.cos(a) * cloudR;
        const py = groundY + Math.sin(a) * cloudR * 0.72;
        const pr = radius * (0.34 - 0.2 * t);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, pr), 0, Math.PI * 2);
        ctx.fill();
      }
      // A darker settling puff at ground zero.
      ctx.globalAlpha = 0.4 * (1 - t);
      ctx.fillStyle = "#7c7f88";
      ctx.beginPath();
      ctx.arc(x, groundY, radius * (0.5 - 0.3 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    if (effect.kind === "nova") {
      // A NOVA burst: a ring bursting out to its damage radius — a local
      // shockwave (no screen flash; novas fire often). A FROST nova (a
      // companion's chilling pulse) rings icy blue; the arcane proc/crit
      // burst rings violet.
      const duration = effect.durationMs ?? 320;
      const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
      const reach = (effect.radius ?? 56) * (0.25 + 0.75 * t);
      const fade = 1 - t;
      const outer = effect.frost ? "120, 200, 245" : "184, 138, 232";
      const inner = effect.frost ? "214, 240, 255" : "230, 214, 255";
      ctx.strokeStyle = `rgba(${outer}, ${0.85 * fade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, groundY, reach, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${inner}, ${0.5 * fade})`;
      ctx.beginPath();
      ctx.arc(x, groundY, reach * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (effect.kind === "singularity") {
      // An ARCANE SINGULARITY collapse: two violet rings rush INWARD to a dark
      // core (the opposite of a nova's outward burst) — the vortex drawing the
      // swarm in — brightening as they close, and a shadow well drops at the
      // centre. The in-rush is the read; the horde slides in beneath it.
      const duration = effect.durationMs ?? 420;
      const t = clamp01(1 - (effect.untilMs - timeMs) / duration); // 0 → 1
      const reach = effect.radius ?? 68;
      // Rings contract from the rim toward the core as t runs.
      const rise = t < 0.85 ? t / 0.85 : 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(180, 132, 236, ${0.85 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(x, groundY, reach * (1 - 0.85 * rise), 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(226, 208, 255, ${0.6 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(x, groundY, reach * (1 - 0.55 * rise) * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      // The dark core swells as the rings arrive, then fades.
      const core = reach * 0.22 * Math.sin(t * Math.PI);
      ctx.fillStyle = `rgba(28, 14, 48, ${0.7 * Math.sin(t * Math.PI)})`;
      ctx.beginPath();
      ctx.arc(x, groundY, core, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (effect.kind === "hellgate") {
      // A HELLGATE TEARING OPEN (config HELLGATES): the rampage-only spawn point
      // rips reality and starts letting hellborn through. Its four layers live in
      // render/hellgate.ts; `stage` (the rampage stage that opened it) scales the
      // tear so a deeper meter tears a bigger hole.
      const duration = effect.durationMs ?? 1100;
      const t = clamp01(1 - (effect.untilMs - timeMs) / duration);
      drawHellgateTear(ctx, x, groundY, t, effect.stage ?? 0, effect.seed ?? 0);
      continue;
    }
    if (effect.kind === "lightning") {
      // A real lightning STRIKE: a jagged fractal bolt cracks down from the sky
      // to the point, briefly LIGHTING the ground around it (a radial bloom, so
      // the strike lights nearby mobs and the floor), and where it earths it
      // SPARKS FIRE — a fan of hot embers thrown up off the impact that arc out
      // and cool. The bolt itself only strobes in the opening flicker; the
      // ground glow and embers play out over the tail so the strike lingers.
      drawLightning(ctx, x, groundY, timeMs, effect);
      continue;
    }
  }
}

type Pt = { x: number; y: number };

/**
 * A jagged, deterministic lightning path from `(x0, y0)` (the sky anchor) down
 * to `(x1, y1)` (the strike point), built by recursive midpoint displacement so
 * it forks and kinks like a real bolt. Seeded off the effect so it holds still
 * across the frames of its short life instead of jittering every frame.
 */
function boltPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
): Pt[] {
  let pts: Pt[] = [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ];
  // Four subdivision passes, halving the sideways jag each pass — a coarse
  // zig-zag near the top settling into fine kinks by the strike. Each pass
  // inserts a displaced midpoint between every adjacent pair of nodes.
  let spread = 14;
  for (let pass = 0; pass < 4; pass++) {
    const next: Pt[] = [];
    let prev: Pt | null = null;
    for (const p of pts) {
      if (prev !== null) {
        const mx = (prev.x + p.x) / 2;
        const my = (prev.y + p.y) / 2;
        const jitter =
          (fract(seed + next.length * 3.3 + pass * 17.7) - 0.5) * 2 * spread;
        next.push({ x: mx + jitter, y: my });
      }
      next.push(p);
      prev = p;
    }
    pts = next;
    spread *= 0.5;
  }
  return pts;
}

/** Stroke a polyline through `pts` on the current ctx style. */
function strokePolyline(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length === 0) return;
  ctx.beginPath();
  let started = false;
  for (const p of pts) {
    if (started) ctx.lineTo(p.x, p.y);
    else {
      ctx.moveTo(p.x, p.y);
      started = true;
    }
  }
  ctx.stroke();
}

/** Draw one lightning strike effect at screen `(x, groundY)` — see the caller. */
function drawLightning(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  timeMs: number,
  effect: Effect,
): void {
  const duration = effect.durationMs ?? 340;
  const t = 1 - (effect.untilMs - timeMs) / duration; // 0 → 1
  if (t < 0 || t > 1) return;
  const seed = effect.seed ?? 0;
  const skyY = Math.max(0, groundY - 96);
  ctx.save();

  // GROUND FLASH — light up the area. A radial bloom that flares white-hot on
  // impact and fades over the first ~70% of the life, so the strike briefly
  // lights the floor and any mobs standing in it. Additive so it reads as light.
  const flash = Math.max(0, 1 - t / 0.7);
  if (flash > 0) {
    const glowR = 44 + 26 * (1 - flash);
    const grad = ctx.createRadialGradient(x, groundY, 0, x, groundY, glowR);
    grad.addColorStop(0, `rgba(226, 240, 255, ${0.6 * flash})`);
    grad.addColorStop(0.45, `rgba(150, 200, 255, ${0.3 * flash})`);
    grad.addColorStop(1, "rgba(120, 170, 255, 0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, groundY, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  // THE BOLT — only in the opening flicker (first ~45% of life), strobing as it
  // discharges. Stroked in three passes: a wide blue outer glow, a cyan mid,
  // and a hot white core, plus a couple of forked branches off its mid nodes.
  if (t < 0.45) {
    const strobe = 0.55 + 0.45 * ((Math.floor(timeMs / 26) + seed) % 2);
    const pts = boltPath(x, skyY, x, groundY, seed);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(120, 175, 255, ${0.45 * strobe})`;
    ctx.lineWidth = 5;
    strokePolyline(ctx, pts);
    ctx.strokeStyle = `rgba(175, 220, 255, ${0.85 * strobe})`;
    ctx.lineWidth = 2.5;
    strokePolyline(ctx, pts);
    ctx.strokeStyle = `rgba(255, 255, 255, ${strobe})`;
    ctx.lineWidth = 1.2;
    strokePolyline(ctx, pts);
    // Forked branches: split off two of the upper-mid nodes and jag away a
    // short distance, so the bolt isn't a lone streak.
    ctx.strokeStyle = `rgba(200, 230, 255, ${0.7 * strobe})`;
    ctx.lineWidth = 1;
    for (let f = 0; f < 2; f++) {
      const node = pts[3 + f * 4] ?? pts[Math.floor(pts.length / 2)];
      if (node === undefined) continue;
      const dir = fract(seed + f * 5.1) < 0.5 ? -1 : 1;
      const len = 10 + fract(seed + f * 2.7) * 12;
      strokePolyline(ctx, [
        node,
        { x: node.x + dir * len * 0.6, y: node.y + len * 0.5 },
        { x: node.x + dir * len, y: node.y + len * 1.1 },
      ]);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // IMPACT FIRE FLARE — a hot orange bloom that pops the instant the bolt
  // earths, where it "sparks fire", fading fast under the flying embers.
  const flare = Math.max(0, 1 - t / 0.4);
  if (flare > 0) {
    ctx.globalCompositeOperation = "lighter";
    const fr = 10 + 8 * (1 - flare);
    const fg = ctx.createRadialGradient(x, groundY, 0, x, groundY, fr);
    fg.addColorStop(0, `rgba(255, 236, 170, ${0.75 * flare})`);
    fg.addColorStop(0.5, `rgba(255, 150, 60, ${0.45 * flare})`);
    fg.addColorStop(1, "rgba(255, 90, 30, 0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(x, groundY, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  // FIRE SPARKS — hot embers thrown up off the strike point where the bolt
  // earths, fanning up-and-out and cooling from white to orange to ember-red as
  // they fall back, fading over the tail. Each ember trails a short streak in
  // its travel direction so it reads as a flying spark, not a dot. Deterministic
  // from the seed.
  const sparks = 15;
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < sparks; i++) {
    // Fan across the upper hemisphere (screen-up is −y), biased to the sides.
    const a = -Math.PI * (0.08 + 0.84 * fract(i * 12.9 + seed * 0.13));
    const speed = 24 + fract(i * 7.3 + seed) * 34;
    const life = 0.5 + 0.5 * fract(i * 3.7 + seed * 0.5);
    const st = t / life; // this ember's own 0 → 1
    if (st > 1) continue;
    const reach = speed * st;
    const grav = 40 * st * st; // gravity pulls each ember back down as it flies
    const sx = x + Math.cos(a) * reach;
    const sy = groundY + Math.sin(a) * reach + grav;
    // The point it was a beat ago, for the trailing streak.
    const pt = Math.max(0, st - 0.12);
    const pr = speed * pt;
    const px = x + Math.cos(a) * pr;
    const py = groundY + Math.sin(a) * pr + 40 * pt * pt;
    const fade = 1 - st;
    const color = st < 0.28 ? "#fff2c4" : st < 0.6 ? "#ff9a3c" : "#ff4a1e";
    ctx.globalAlpha = fade;
    ctx.strokeStyle = color;
    ctx.lineWidth = st < 0.5 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    // A brighter hot head on the spark.
    ctx.fillStyle = color;
    const s = st < 0.45 ? 2 : 1;
    ctx.fillRect(Math.round(sx) - (s >> 1), Math.round(sy) - (s >> 1), s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // A hot white glare pinned at the strike in the opening beats — the contact
  // point itself, over the flash and under the embers.
  if (t < 0.5) {
    ctx.globalAlpha = 1 - t / 0.5;
    ctx.fillStyle = "rgba(255, 255, 240, 0.95)";
    ctx.fillRect(x - 2, groundY - 3, 4, 5);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
