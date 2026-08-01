// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hero: the paper-doll draw with facing, jump shadow, hurt blink, and
// knockout pose; the held weapon's swing/recoil/cast animation and the slash
// streak riding the blade; and the level-up burn wreathing him on a ding.

import { localHero } from "../local-seat.ts";
import {
  DEATH_SCENE,
  isWeaponDef,
  LEVELING,
  weaponDef,
  type GameState,
  type Player,
  type WeaponClass,
  type WeaponMotion,
} from "@game/core";

import { spriteByName, type GameAssets, type Sprites } from "../assets.ts";
import { heroSoak } from "../game-screen/hero-soak.ts";
import { levelUpIntensity } from "../levelup-intensity.ts";
import {
  DOLL_SIZE,
  WEAPON_SHOULDER,
  type DollFrame,
  type DollLayer,
} from "../paper-doll.ts";
import { playerDollLayers } from "../paper-doll-live.ts";
import { drawSlash, slashStyleFor, type SlashGeom } from "../weapon-fx.ts";
import { walkFrame, walkGait, withStance } from "./gait.ts";
import { drawCoatedLayers, drawCoatedSprite } from "./hero-coat.ts";
import { bodyCoat, NO_SOAK, weaponCoat, type CoatLayer } from "./soak-ladder.ts";
import { clamp01, drawSpriteCentered, fract, TILE } from "./shared.ts";
import { beginBillboard, billboard, endBillboard } from "./tilt.ts";
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
  /** Melee only: the blow came off a TWO-HANDED weapon, which is swung
   * differently — around the body off a two-handed grip rather than off one
   * shoulder, wound further back and followed further through. See
   * `TWO_HAND_GRIP` and `weaponPose`. */
  twoHanded?: boolean;
  /** Melee only: HOW the weapon is worked (`WeaponDef.motion`, off the swing
   * event). Absent reads as a swing — wound back, carried through the cone,
   * throwing a streak off the edge. `"shake"` has no arc at all: the tool is
   * pressed into a body and juddering, so the blade sweep, the streak and the
   * ground wedge are all skipped and the weapon shivers in place instead. */
  motion?: WeaponMotion;
};

/**
 * The hero's most recent JUMP BEAT — the shove-off or the touchdown — captured
 * off the engine's own `jump`/`land` events (event-fx.ts) so the pose and the
 * dust it throws are one motion. `startMs` is on the simulation clock, the same
 * clock the effects run on; `power` is the landing's impact as a fraction of a
 * standing hop's (1 for a plain jump), and 1 for every takeoff.
 */
export type HeroImpact = {
  kind: "takeoff" | "landing";
  startMs: number;
  power: number;
};

/**
 * SQUASH AND STRETCH — the oldest trick in animation, and the whole reason a
 * jump reads as WEIGHT rather than as a sprite being moved up and down.
 *
 * He STRETCHES as he leaves the ground (tall and narrow, the body still going
 * up while the feet have already let go) and SQUASHES into the landing (short
 * and wide, the knees taking the drop), each easing back to his true shape.
 * Both are quick: past these windows he is drawn exactly as he always was, so
 * nothing about the pose can persist into a frame that isn't a jump.
 */
const TAKEOFF_POSE_MS = 170;
const LANDING_POSE_MS = 230;
/** How far each beat deforms him at its peak (a fraction of his own height). A
 * landing bites harder than a takeoff — he pushes off, but the floor hits him. */
const TAKEOFF_STRETCH = 0.16;
const LANDING_SQUASH = 0.22;

/**
 * The hero's vertical scale for the jump beat live at `nowMs` — above 1 he is
 * stretching off the floor, below 1 he is folding into a landing, exactly 1
 * when neither is running. The horizontal scale is its inverse, so he keeps his
 * volume: a body that stretches without narrowing just gets bigger.
 */
function impactScaleY(impact: HeroImpact | undefined, nowMs: number): number {
  if (!impact) return 1;
  const takeoff = impact.kind === "takeoff";
  const duration = takeoff ? TAKEOFF_POSE_MS : LANDING_POSE_MS;
  const t = (nowMs - impact.startMs) / duration;
  if (t < 0 || t > 1) return 1;
  // Hardest at the very start and easing out — the deformation is the impulse,
  // and an impulse is over before the body has finished reacting to it.
  const ease = (1 - t) * (1 - t);
  if (takeoff) return 1 + TAKEOFF_STRETCH * ease;
  // A heavier landing folds him further, capped so a talent-launched drop still
  // lands as a hero and not as a puddle.
  const bite = Math.min(1.6, Math.max(0.5, impact.power));
  return 1 - LANDING_SQUASH * bite * ease;
}

/** A held-weapon animation pose: a rotation about the shoulder (WEAPON_SHOULDER)
 * plus a small translation, in doll-local coords (mirrored with the doll for
 * facing). Pivoting at the shoulder rather than the grip sweeps the whole
 * implied arm — the weapon rides the end of a stretched-out arm, not just a
 * flick of the wrist. Positive `rot` swings the blade/barrel down and forward
 * in the facing dir. */
type WeaponPose = {
  rot: number;
  offX: number;
  offY: number;
  /** What the rotation turns ABOUT, in doll-local coords. A one-handed weapon
   * turns about the leading SHOULDER, so the whole implied arm sweeps. A
   * TWO-HANDER turns about the grip both hands are on, low and central, so the
   * weapon travels AROUND the body instead of off the end of one arm — which is
   * the difference a player actually sees between the two. */
  pivot: { x: number; y: number };
};

const REST_POSE: WeaponPose = {
  rot: 0,
  offX: 0,
  offY: 0,
  pivot: WEAPON_SHOULDER,
};

/**
 * THE TWO-HANDER'S REST POSE. A greatsword is not carried the way a gladius is:
 * both hands are on it, so it rides low and across the body with the blade
 * canted back over the shoulder rather than hanging off one arm. It is drawn
 * from the same icon as any other blade — the difference is entirely in how the
 * hero holds it, which is what keeps a new two-handed weapon free of art.
 */
const TWO_HAND_REST: WeaponPose = {
  rot: 0.34,
  offX: -3,
  offY: 1,
  pivot: WEAPON_SHOULDER,
};

/** Where BOTH hands sit on a two-hander, doll-local — low and toward the body's
 * centre line, between the leading hand and the far one. The swing turns about
 * this, so the weapon comes round the hero rather than out from his shoulder. */
const TWO_HAND_GRIP = { x: 6, y: 10 };

/** How far past the cone's own edges a two-handed swing winds up and follows
 * through, as a fraction of the cone's half-angle. A heavy weapon has to be
 * TAKEN somewhere before it can be swung and cannot be stopped where the damage
 * stops — that overhang is what makes it read as weight rather than as a faster
 * blade with bigger numbers. It is pure presentation: the engine's cone, and
 * everything it hits, is unchanged. */
const TWO_HAND_OVERSWING = 0.45;

/** How much longer a two-hander's swing animation runs than a one-hander's. The
 * engine's cadence is the weapon's own `cooldownMs` — this only stretches the
 * DRAWN motion, and the shipped two-handers are all slow enough to hold it. */
const TWO_HAND_SWING_SCALE = 1.35;

/** How far (doll px) the two-handed grip travels through the blow — back on the
 * wind-up, forward on the strike. Small on purpose: it is a shift of weight, not
 * a step, and the hero's own position is the engine's business. */
const TWO_HAND_LUNGE_PX = 2;

/** Is the weapon in the hero's hands a two-hander? Read off the live catalog by
 * def id (the frozen def a re-homed save carries answers first), so the pose
 * follows the weapon rather than needing a flag threaded through every caller
 * that draws a hero standing still. */
export function heldTwoHanded(defId: string): boolean {
  if (!isWeaponDef(defId)) return false;
  return weaponDef(defId).twoHanded === true;
}

/** HOW the weapon in the hero's hands is worked (`WeaponDef.motion`) — read off
 * the live catalog for the same reason `heldTwoHanded` is. In play the word
 * rides in on the swing event; this is for the paths that pose a weapon with no
 * event to read (the `?debug` `window.__swing` pin, and the weapon-swing preview
 * strips built on it), so a preview of a juddering tool judders. */
export function heldMotion(defId: string): WeaponMotion | undefined {
  if (!isWeaponDef(defId)) return undefined;
  return weaponDef(defId).motion;
}

/** How long the drawn melee swing runs for this weapon (ms) — the one value
 * GameScreen times the `PlayerAction` and its slash-cone effect to, so the two
 * stay locked whichever hands the weapon takes. */
export function meleeSwingMs(twoHanded?: boolean): number {
  return twoHanded ? MELEE_SWING_MS * TWO_HAND_SWING_SCALE : MELEE_SWING_MS;
}

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
  // A SHAKEN weapon travels no arc, so there is no swept streak to fill: the
  // streak is the picture of a blade going somewhere, and this one is standing
  // still and biting. See `WeaponMotion`.
  if (action.motion === "shake") return null;
  const t = (nowMs - action.startMs) / action.durationMs;
  if (t < SWING_WINDUP_END || t > 1) return null; // dark until the strike
  const half = Math.min(MAX_SWING_HALF, (action.arc ?? DEFAULT_SWING_ARC) / 2);
  const p = clamp01(
    (t - SWING_WINDUP_END) / (SWING_STRIKE_END - SWING_WINDUP_END),
  );
  const swept = 1 - (1 - p) * (1 - p); // ease-out, in step with weaponPose
  // Same pivot, same overhang, same rest orientation as `weaponPose` — the
  // streak has to hug the blade, so every term it shares has to come from the
  // same two constants rather than a second copy of them.
  const heavy = action.twoHanded === true;
  const over = heavy ? half * TWO_HAND_OVERSWING : 0;
  const rest = heavy ? TWO_HAND_REST : REST_POSE;
  const rotFor = (a: number) => a - BLADE_REST_ANGLE + rest.rot;
  const presence = 1 - clamp01((t - SWING_STRIKE_END) / (1 - SWING_STRIKE_END));
  return {
    pivot: heavy ? TWO_HAND_GRIP : WEAPON_SHOULDER,
    tip: SLASH_REST_TIP,
    base: SLASH_REST_BASE,
    rotFrom: rotFor(-half - over),
    rotTo: rotFor(-half + (2 * half + over) * swept),
    alpha: presence,
    phase: clamp01(t),
  };
}

// THE JUDDER — how a weapon that is not swung reads (`WeaponMotion.shake`).
//
// Three rules make a shiver read as a running tool rather than as a glitch:
//
//  1. IT IS FAST AND SMALL. The whole point is that the weapon does not GO
//     anywhere — a wide wobble reads as a swing performed badly. A couple of
//     pixels and a couple of degrees, at a frequency well above the walk's.
//  2. THE AXES ARE INCOMMENSURATE. Three sines whose periods share no common
//     multiple, so the shiver never settles into a visible loop the eye can
//     start predicting — the same trick the fauna's wander and the loot aura
//     use, and for the same reason: it is a closed-form function of the clock,
//     so it costs nothing and cannot desync.
//  3. IT LEANS IN AND COMES BACK. Under the buzz, one soft push along the aim
//     across the middle of the beat and back out — the weight of somebody
//     leaning on a tool that is cutting, which is what stops it reading as a
//     weapon vibrating in mid-air beside a body.
const SHAKE_ROT = (2.6 * Math.PI) / 180;
const SHAKE_PX = 0.9;
const SHAKE_LEAN_PX = 2.2;
/** Radians per ms for the three buzz axes — deliberately not multiples. */
const SHAKE_HZ = { rot: 0.085, x: 0.113, y: 0.147 };

/** The held weapon's juddering pose at `t` (0→1 through the bite). */
function shakePose(rest: WeaponPose, nowMs: number, t: number): WeaponPose {
  // A single soft hump: nothing at either end, so the judder starts from rest
  // and returns to it exactly as a swing does, with no snap when it lapses.
  const bite = Math.sin(Math.PI * clamp01(t));
  return {
    rot: rest.rot + Math.sin(nowMs * SHAKE_HZ.rot) * SHAKE_ROT * bite,
    offX:
      rest.offX +
      Math.sin(nowMs * SHAKE_HZ.x) * SHAKE_PX * bite +
      SHAKE_LEAN_PX * bite,
    offY: rest.offY + Math.sin(nowMs * SHAKE_HZ.y) * SHAKE_PX * bite,
    pivot: rest.pivot,
  };
}

/**
 * The held weapon's pose for the active attack at `nowMs`. Each weapon class
 * gets its own motion, shaped to start AND end at rest so it folds cleanly back
 * to the static pose when the animation lapses (no snap): a blade winds back and
 * whips through its slash arc, a gun recoils with the muzzle rising, a wand
 * thrusts up on the cast. Returns `REST_POSE` when no attack is live.
 *
 * A `shake` weapon (`WeaponMotion`) is the one that does not travel: it JUDDERS
 * where it is held, which is what a tool pressed into a body does.
 */
function weaponPose(
  action: PlayerAction | undefined,
  nowMs: number,
  twoHanded: boolean,
): WeaponPose {
  const rest = twoHanded ? TWO_HAND_REST : REST_POSE;
  if (!action) return rest;
  const t = (nowMs - action.startMs) / action.durationMs;
  if (t < 0 || t > 1) return rest;
  if (action.weaponClass === "melee" && action.motion === "shake") {
    return shakePose(rest, nowMs, t);
  }
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
    const heavy = action.twoHanded === true;
    // A TWO-HANDER is wound back past the cone's start edge and carried past its
    // end edge — the cone (and the damage) is unchanged, but the motion outruns
    // it at both ends, which is what reads as a weapon too heavy to stop where
    // the hitbox does. It also turns about the two-handed GRIP rather than a
    // shoulder, so the blade comes round the body.
    const over = heavy ? half * TWO_HAND_OVERSWING : 0;
    const pivot = heavy ? TWO_HAND_GRIP : WEAPON_SHOULDER;
    const rest = heavy ? TWO_HAND_REST : REST_POSE;
    // Blade shaft angle (aim-local) → rotation about the pivot, measured from
    // whichever rest orientation this weapon idles in.
    const rotFor = (angle: number) => angle - BLADE_REST_ANGLE + rest.rot;
    const rotStart = rotFor(-half - over); // cocked past the cone's start edge
    let rot: number;
    let lunge: number;
    if (t < SWING_WINDUP_END) {
      const p = t / SWING_WINDUP_END;
      rot = rest.rot + (rotStart - rest.rot) * p;
      // The wind-up drags a heavy weapon BACK off the target before it comes
      // through, so the whole figure loads rather than just rotating.
      lunge = -p;
    } else if (t < SWING_STRIKE_END) {
      const p = (t - SWING_WINDUP_END) / (SWING_STRIKE_END - SWING_WINDUP_END);
      const swept = 1 - (1 - p) * (1 - p); // ease-out, in step with the cone
      rot = rotFor(-half + (2 * half + over) * swept); // ride the leading edge
      lunge = -1 + 2 * swept;
    } else {
      const p = (t - SWING_STRIKE_END) / (1 - SWING_STRIKE_END);
      const settle = 1 - p * p * (3 - 2 * p);
      rot = rest.rot + (rotFor(half + over) - rest.rot) * settle;
      lunge = settle;
    }
    if (!heavy) return { rot, offX: 0, offY: 0, pivot };
    // …and the body goes with it: a two-hander is swung with the hips, so the
    // grip travels a couple of px through the blow instead of the blade merely
    // rotating on a fixed point.
    return {
      rot,
      offX: rest.offX + TWO_HAND_LUNGE_PX * lunge,
      offY: rest.offY,
      pivot,
    };
  }
  if (action.weaponClass === "ranged") {
    // A quick recoil impulse: kick back toward the shoulder, muzzle rising,
    // then settle forward. Triangle peaking early so the punch is felt.
    const kick = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    // A two-handed long gun is braced against the shoulder, so it eats the
    // recoil: the same impulse, visibly damped.
    const brace = action.twoHanded ? 0.55 : 1;
    return {
      rot: -0.4 * kick * brace,
      offX: -3 * kick * brace,
      offY: -1 * kick * brace,
      pivot: WEAPON_SHOULDER,
    };
  }
  // Magic: a smooth bloom (sin) that thrusts the wand up and forward on the
  // cast and eases it back — the staff "presents" the spell.
  const bloom = Math.sin(Math.PI * t);
  // A STAFF is planted and raised with both hands: it rises higher and turns
  // less than a one-handed wand's flick.
  const staff = action.twoHanded === true;
  return {
    rot: (staff ? 0.12 : 0.35) * bloom,
    offX: bloom,
    offY: (staff ? -5 : -3) * bloom,
    pivot: WEAPON_SHOULDER,
  };
}

/**
 * The hero, standing up out of the tilted floor (render/tilt.ts).
 *
 * Everything below this wrapper is written in plain screen px, exactly as it
 * was when the camera looked straight down — which matters more here than
 * anywhere else in the renderer, because his `z` (the jump), the stride's rise,
 * the rift hover and the landing squash are all HEIGHTS. Foreshortening those
 * along with the ground would flatten every jump in the game by a quarter.
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
  action: PlayerAction | undefined,
  impact: HeroImpact | undefined,
): void {
  const local = localHero(state);
  // THE WHOLE PARTY STANDS ON THE FIELD, not only the seat this client steers
  // (§4.5 — a party you cannot see is not a party). Teammates draw first and
  // the local hero LAST, on top: in a scrum the hero the player is steering is
  // the one that must stay readable. A teammate's doll is dressed from their
  // own (public) worn kit; what a teammate does NOT get is the app-side pieces
  // that only exist for the local seat — the input-driven attack pose, the
  // landing squash, and the blood coat `hero-soak.ts` keeps for one hero.
  for (const [seat, hero] of state.players.entries()) {
    if (hero === local) continue;
    // A DEPARTED seat's body is nobody's (`heroInPlay`) — but a DOWNED hero is
    // very much somebody's and must stay visible where they fell, so the sweep
    // is explicit about which half of the predicate it means.
    if (hero.departed === true) continue;
    if (state.vehicles.some((v) => v.kind === "car" && v.driver === seat)) {
      continue;
    }
    billboard(ctx, hero.pos.x, hero.pos.y, camera.x, camera.y, () =>
      drawHero(
        ctx,
        state,
        assets,
        camera,
        timeMs,
        undefined,
        undefined,
        hero,
        seat,
      ),
    );
  }
  // A hero AT THE WHEEL is inside the car — the car assembly is his body
  // this frame (render/vehicles.ts), so the walking doll stays undrawn.
  const seat = state.players.indexOf(local);
  if (state.vehicles.some((v) => v.kind === "car" && v.driver === seat)) {
    return;
  }
  billboard(ctx, local.pos.x, local.pos.y, camera.x, camera.y, () =>
    drawHero(ctx, state, assets, camera, timeMs, action, impact, local, seat),
  );
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets,
  camera: Camera,
  timeMs: number,
  action: PlayerAction | undefined,
  impact: HeroImpact | undefined,
  player: Player,
  seat: number,
): void {
  const isLocal = player === localHero(state);
  const airborne = player.z > 0;
  // The paper-doll owns the costume: body sprite (from `playerAppearance`),
  // worn-armor overlays, and the held weapon, as one ordered layer stack
  // shared with the DOM avatars (paper-doll.ts).
  const { sprites } = assets;
  // THE WALK. The stride is measured off the ground he actually covers
  // (gait.ts), so the legs and the body's tip both keep pace with him: a nudged
  // stick creeps, a full push runs, and a hero shoved up against a wall stops
  // walking on the spot. Sampled every frame — including the frames he is dead
  // or airborne on — so his stride is never reconstructed from a stale position.
  // The gait memo is keyed PER SEAT — one key would blend every hero's stride
  // into one averaged walk. The local hero keeps the bare "hero" key the
  // footprint pass already shares.
  const gait = walkGait(isLocal ? "hero" : `hero:${seat}`, player.pos, timeMs);
  const frame: DollFrame = airborne
    ? "jump"
    : player.moving && walkFrame(gait) === 1
      ? "1"
      : "0";
  const layers = playerDollLayers(state, frame, { weapon: true, hero: player });
  // THE BLOOD HE IS WEARING. The five numbers `hero-soak.ts` keeps become the
  // coat art the doll is soaked in, resolved once per frame and shared by all
  // three poses — the hero standing, the hero knocked flat and the hero dead all
  // wear what he did. The BODY's coat and the WEAPON's are separate because they
  // are drawn in different spaces: the weapon's rides its own swing pivot.
  // `hero-soak.ts` keeps ONE record, the local hero's, so a teammate draws
  // clean — a known simplification, recorded in the module's own header.
  const soak = isLocal ? heroSoak(state) : NO_SOAK;
  const coat = bodyCoat(soak);
  const held = weaponCoat(soak);
  // In the rift the ground isn't there — bob the grounded hero so he reads as
  // floating. The jump height (`player.z`) already lifts him in the air, so the
  // hover only applies while grounded to avoid fighting the arc.
  const hover =
    !airborne && state.level.biome === RIFT_HOVER_BIOME
      ? Math.sin((timeMs / RIFT_HOVER_PERIOD_MS) * Math.PI * 2) *
        RIFT_HOVER_AMPLITUDE
      : 0;
  // The step's own rise and the standstill breath ride on top of all that — a
  // hero in the air is on his jump arc and gets neither.
  const stride = airborne ? 0 : gait.lift;
  const x = Math.round(player.pos.x - TILE / 2 - camera.x);
  const y = Math.round(
    player.pos.y - TILE / 2 - camera.y - player.z - hover + stride,
  );

  // DEAD: the hero has fallen (the `dying` death scene, and on through the
  // `defeat` splash behind the modal). Lay him sprawled on his back in a
  // spreading pool of blood — no facing, no weapon swing, no walk cycle. Drawn
  // here so the corpse stays put and dressed (worn armor + weapon glued) while
  // the horde rings him. A hero DOWN in a party still fighting (§4.2) wears
  // the same sprawl mid-`playing`, behind the YOU FELL overlay, until the
  // respawn stands them back up.
  if (
    state.phase === "dying" ||
    state.phase === "defeat" ||
    player.downed === true
  ) {
    drawDeadHero(
      ctx,
      sprites,
      layers,
      coat,
      held,
      state,
      player,
      camera,
      x,
      y,
      timeMs,
    );
    return;
  }

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
    drawKnockedOut(ctx, sprites, layers, coat, held, x, y);
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
  const pose = weaponPose(
    action,
    state.stats.timeMs,
    heldTwoHanded(player.equipment.weapon.defId),
  );
  // The whole figure — costume, armor, weapon and the slash it throws — is posed
  // as one about his FEET, outside the facing flip, so both beats read the same
  // way whichever way he is pointed: the walk's soft tip (airborne he is on an
  // arc, not a stride), and the JUMP's stretch off the floor / squash into the
  // landing, which is what gives the hop its weight.
  withStance(
    ctx,
    { x: x + TILE / 2, y: y + TILE },
    {
      tilt: airborne ? 0 : gait.tilt,
      scaleY: impactScaleY(impact, state.stats.timeMs),
    },
    () =>
      drawDressedHero(
        ctx,
        sprites,
        layers,
        coat,
        held,
        state,
        player,
        x,
        y,
        pose,
        action,
      ),
  );
}

/** The doll minus the held weapon — the BODY, which is what the blood coats.
 * The weapon is drawn separately in every pose: it pivots on its own for the
 * swing, and it is the one piece of the costume that carries no soak. */
function bodyLayers(layers: readonly DollLayer[]): DollLayer[] {
  return layers.filter((layer) => !layer.weapon);
}

/** The held weapon at rest, in whatever doll-local frame the caller has set up —
 * the two poses that don't swing (knocked out, dead). */
function drawHeldWeapon(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  layers: readonly DollLayer[],
  held: CoatLayer[],
): void {
  for (const layer of layers) {
    if (!layer.weapon) continue;
    const image = spriteByName(sprites, layer.sprite);
    if (!image) continue;
    drawCoatedSprite(
      ctx,
      sprites,
      image,
      layer.dx,
      layer.dy,
      layer.flip ?? false,
      held,
    );
  }
}

/**
 * The standing hero: every paper-doll layer inside one facing flip (so the
 * costume stays glued to the body), the held weapon swinging about its shoulder
 * on top of it, and the blade's slash streak drawn last, on the blade.
 */
function drawDressedHero(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  layers: ReturnType<typeof playerDollLayers>,
  coat: CoatLayer[],
  held: CoatLayer[],
  state: GameState,
  player: Player,
  x: number,
  y: number,
  pose: WeaponPose,
  action: PlayerAction | undefined,
): void {
  ctx.save();
  if (player.faceLeft) {
    ctx.translate(x + TILE, y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y);
  }
  // The BODY — costume and worn armor as one stack, with the blood he is
  // wearing soaked into it (render/hero-coat.ts).
  drawCoatedLayers(ctx, sprites, bodyLayers(layers), coat, DOLL_SIZE);
  // …then the HELD WEAPON over it. Left out of the coat on purpose: it swings on
  // its own pivot, so blood masked into the composed doll would sit still while
  // the blade swept out from under it — and it swaps on its own terms anyway.
  for (const layer of layers) {
    if (!layer.weapon) continue;
    const image = spriteByName(sprites, layer.sprite);
    if (!image) continue; // unknown def or stale save: skip, never crash
    const swung = pose.rot !== 0 || pose.offX !== 0 || pose.offY !== 0;
    if (swung) {
      // Pivot the weapon about the pose's own point (translate to it, rotate,
      // translate back), on top of whatever facing transform already holds. A
      // one-hander turns about the SHOULDER — not the grip — so the grip end
      // arcs too and the weapon reads as riding a swinging arm rather than
      // twisting in place; a TWO-HANDER turns about the low central grip both
      // hands are on, so it comes round the body instead.
      ctx.save();
      ctx.translate(pose.pivot.x + pose.offX, pose.pivot.y + pose.offY);
      ctx.rotate(pose.rot);
      ctx.translate(-pose.pivot.x, -pose.pivot.y);
    }
    drawCoatedSprite(
      ctx,
      sprites,
      image,
      layer.dx,
      layer.dy,
      layer.flip ?? false,
      held,
    );
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
  coat: CoatLayer[],
  held: CoatLayer[],
  x: number,
  y: number,
): void {
  ctx.save();
  // Pivot about the sprite centre, tip it flat, and settle it a few px down so
  // the toppled body lies along the ground rather than floating at head height.
  ctx.translate(x + TILE / 2, y + TILE / 2 + 3);
  ctx.rotate(Math.PI / 2 - 0.12);
  ctx.translate(-(TILE / 2), -(TILE / 2));
  drawCoatedLayers(ctx, sprites, bodyLayers(layers), coat, DOLL_SIZE);
  drawHeldWeapon(ctx, sprites, layers, held);
  ctx.restore();
}

/**
 * The DEATH POSE: the fallen hero sprawled on his back in a wide, still-flowing
 * pool of blood (the `dying` death scene, held through the `defeat` splash). The
 * whole dressed paper-doll is laid flat — costume, armor, and weapon glued —
 * like the knockout pose but tipped a touch further and settled limp, and the
 * blood keeps welling out beneath him — pooling, sending rivulets creeping
 * outward across the floor, and flinging spatter — over the scene. Drawn under
 * the clouds the death scene rolls across the field (see render/death.ts).
 */
function drawDeadHero(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  layers: ReturnType<typeof playerDollLayers>,
  coat: CoatLayer[],
  held: CoatLayer[],
  state: GameState,
  player: Player,
  camera: Camera,
  x: number,
  y: number,
  timeMs: number,
): void {
  const scene = state.deathScene;
  // Scene progress 0→1 (full and held once the modal is up, when there is no
  // live scene). The blood keeps spreading for most of the scene.
  const prog = scene ? Math.min(1, scene.ms / DEATH_SCENE.durationMs) : 1;
  // The scene's own clock in ms — the pool and spray ride THIS, not the sim
  // clock, which is frozen while `dying`. Held past the end behind the modal.
  const sceneMs = scene ? scene.ms : DEATH_SCENE.durationMs;
  const cx = Math.round(player.pos.x - camera.x);
  const cy = Math.round(player.pos.y - camera.y + 5); // the ground line

  // The blood, under the body (the body lies IN the pool): the growing puddle,
  // the rivulets creeping outward, and the welling droplets.
  drawDeathBlood(ctx, cx, cy, prog, sceneMs, timeMs);

  // The body, laid flat on its back: pivot about the sprite centre, tip it past
  // horizontal, and settle it to the ground line so it lies sprawled rather than
  // floating at head height.
  ctx.save();
  ctx.translate(x + TILE / 2, y + TILE / 2 + 4);
  ctx.rotate(Math.PI / 2 + 0.18);
  ctx.translate(-(TILE / 2), -(TILE / 2));
  drawCoatedLayers(ctx, sprites, bodyLayers(layers), coat, DOLL_SIZE);
  drawHeldWeapon(ctx, sprites, layers, held);
  ctx.restore();

  // A last few dark specks flung OVER the body — blood on the corpse itself, so
  // the spatter isn't only on the floor behind it.
  drawBloodSpecks(ctx, cx, cy - 2, prog, 10, 6, 0.75);
}

// The blood palette, dark → wet → glossy, kept together so the pool, rivulets,
// and specks all read as one fluid.
const BLOOD_DEEP = "#3e0a0e";
const BLOOD_MID = "#7a1418";
const BLOOD_WET = "#a81c22";
const BLOOD_GLOSS = "#c62f2f";
// The floor plane is seen at a shallow angle, so blood spreads wide but shallow
// — squash the vertical so the pool and streams lie ON the ground.
const BLOOD_FLATTEN = 0.55;

/**
 * The spreading blood: a growing central pool, a fan of rivulets creeping
 * outward from under the body, and a bright glossy sheen — all timed off the
 * scene progress `prog` so the fluid is still visibly flowing while the horde
 * gathers, then holds full behind the modal.
 */
function drawDeathBlood(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  prog: number,
  sceneMs: number,
  timeMs: number,
): void {
  if (prog <= 0) return;
  ctx.save();

  // RIVULETS first, so their inner ends tuck UNDER the central pool: fingers of
  // blood creeping out across the floor, each starting at its own moment and
  // lengthening over the scene (the "flow outward"). A gentle meander keeps them
  // organic, and a wet core runs down the middle of each.
  const RIVULETS = 16;
  for (let i = 0; i < RIVULETS; i++) {
    const ang = fract(i * 2.399963) * Math.PI * 2;
    const stagger = fract(i * 5.17) * 0.32;
    const reach = clamp01((prog - stagger) / 0.6);
    if (reach <= 0) continue;
    const eased = 1 - (1 - reach) * (1 - reach); // fast then settle
    const maxLen = 15 + fract(i * 3.71) * 24;
    const len = maxLen * eased;
    const width0 = 3 + fract(i * 8.13) * 2.5;
    const meanderAmp = 1.5 + fract(i * 6.37) * 3;
    const meanderFreq = 1.3 + fract(i * 4.41) * 1.8;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang) * BLOOD_FLATTEN;
    const px = -Math.sin(ang); // perpendicular, for the meander
    const py = Math.cos(ang) * BLOOD_FLATTEN;
    const STEPS = 16;
    for (let s = STEPS; s >= 0; s--) {
      const f = s / STEPS;
      const d = f * len;
      const wobble =
        Math.sin(f * meanderFreq * Math.PI * 2 + i * 1.7) * meanderAmp * f;
      const bx = cx + nx * d + px * wobble;
      const by = cy + ny * d + py * wobble;
      const r = Math.max(0.6, width0 * (1 - f * 0.85));
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = f < 0.35 ? BLOOD_MID : BLOOD_DEEP;
      ctx.beginPath();
      ctx.ellipse(bx, by, r, r * BLOOD_FLATTEN + 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The central POOL: a few offset lobes so the puddle is an irregular blob, not
  // a decal disc. Breathes faintly (timeMs) so the surface reads as wet, live
  // fluid rather than a frozen stain.
  const breathe = 1 + 0.03 * Math.sin(timeMs / 260);
  const spread = clamp01(prog / 0.4) * breathe;
  const lobes: [number, number, number][] = [
    [0, 0, 16],
    [-10, 1, 9],
    [11, 2, 8],
    [3, -6, 7],
    [-5, 6, 7],
  ];
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = BLOOD_MID;
  for (const [ox, oy, r] of lobes) {
    ctx.beginPath();
    ctx.ellipse(
      cx + ox,
      cy + oy * BLOOD_FLATTEN,
      r * spread,
      r * BLOOD_FLATTEN * spread,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  // A wetter, brighter heart and a bright gloss streak — the light catching the
  // fresh blood pooling under him.
  ctx.fillStyle = BLOOD_WET;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy,
    10 * spread,
    10 * BLOOD_FLATTEN * spread,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = BLOOD_GLOSS;
  ctx.globalAlpha = 0.4 * clamp01(prog / 0.4);
  ctx.beginPath();
  ctx.ellipse(cx - 3, cy - 1, 3.5, 1.6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;

  // The welling droplets flung out across the floor — a dense, ongoing scatter
  // (far more than a sparse spatter) that keeps appearing as the blood spreads.
  drawBloodSpecks(ctx, cx, cy, prog, 46, 34, 0.7);

  // The opening GOUT: a hard explosive spray of droplets flung out the instant
  // he falls, arcing up and raining down over the scene's first beat before the
  // pool takes over. Rides `sceneMs` (the sim clock is frozen while dying).
  drawBloodSpray(ctx, cx, cy, sceneMs);
}

/**
 * The explosive opening spray — the gout thrown the moment the hero falls. Each
 * of many droplets is flung outward on its own bearing, arcs up and rains back
 * down over its short flight, then fades as it lands into the spreading pool.
 * Timed off `sceneMs` so it actually animates while the run is `dying` (the sim
 * clock the effect system runs on is frozen there).
 */
function drawBloodSpray(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sceneMs: number,
): void {
  const SPRAY = 52;
  ctx.save();
  for (let i = 0; i < SPRAY; i++) {
    const flightMs = 240 + fract(i * 6.13) * 520;
    const p = sceneMs / flightMs;
    if (p >= 1) continue; // landed — the pool + specks carry it from here
    const ease = 1 - (1 - p) * (1 - p); // fast out, settling
    const ang = fract(i * 12.9898) * Math.PI * 2;
    const dist = (6 + fract(i * 7.7) * 40) * ease;
    const lift = Math.sin(p * Math.PI) * (5 + fract(i * 3.1) * 12); // up then down
    const px = Math.round(cx + Math.cos(ang) * dist);
    const py = Math.round(cy + Math.sin(ang) * dist * BLOOD_FLATTEN - lift);
    const fade = 1 - p * p;
    const big = fract(i * 5.53) < 0.4;
    const s = big ? 2 : 1;
    ctx.globalAlpha = 0.9 * fade;
    ctx.fillStyle = fract(i * 9.1) < 0.5 ? BLOOD_WET : BLOOD_MID;
    ctx.fillRect(px, py, s, s);
    // A thin trailing streak behind the fastest droplets — motion, not a dot.
    if (big) {
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillRect(
        Math.round(px - Math.cos(ang) * 2),
        Math.round(py - Math.sin(ang) * 2 * BLOOD_FLATTEN + lift * 0.2),
        1,
        1,
      );
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * A deterministic scatter of blood droplets around (`cx`,`cy`) that reveal over
 * the scene — `count` specks out to `reach` px, each popping in at its own time
 * so the spatter keeps growing rather than appearing all at once. Reused for the
 * floor scatter and the darker fleck over the corpse.
 */
function drawBloodSpecks(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  prog: number,
  count: number,
  reach: number,
  alpha: number,
): void {
  if (prog <= 0) return;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const a = fract(i * 12.9898) * Math.PI * 2;
    const dist = (4 + fract(i * 7.13) * reach) * clamp01(prog / 0.5 + 0.2);
    // Each speck appears at its own moment, so the field of droplets fills in.
    const shown = clamp01((prog - fract(i * 3.71) * 0.55) * 4);
    if (shown <= 0) continue;
    const sx = Math.round(cx + Math.cos(a) * dist);
    const sy = Math.round(cy + Math.sin(a) * dist * BLOOD_FLATTEN);
    const big = fract(i * 5.53) < 0.35;
    const s = big ? 2 : 1;
    ctx.globalAlpha = alpha * shown;
    ctx.fillStyle = fract(i * 9.7) < 0.5 ? BLOOD_MID : BLOOD_DEEP;
    ctx.fillRect(sx, sy, s, s);
    // A few droplets catch the light with a bright pip.
    if (big && fract(i * 4.2) < 0.4) {
      ctx.globalAlpha = alpha * shown * 0.8;
      ctx.fillStyle = BLOOD_WET;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
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
  const x = Math.round(localHero(state).pos.x - camera.x);
  const y = Math.round(localHero(state).pos.y - camera.y - localHero(state).z);
  // The burn is sized to the level just reached, like the rest of the ding
  // (levelup-intensity.ts): a modest early wreath, a towering pillar at the
  // cap. It folds into `fade`, so every layer below dims together.
  const power = levelUpIntensity(localHero(state).level);
  // Snap in fast, hold, fade over the last quarter — the modal takes the
  // stage the moment this dies down.
  const fade = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.25) * power;
  // Billboarded as one piece: the pillar and the embers climb, and a column of
  // light foreshortened with the ground would be a quarter shorter than the
  // hero it is supposed to tower over. The ground ring keeps its own explicit
  // 0.4 squash inside — it was authored as a ring lying flat and still reads as
  // one at this pitch.
  beginBillboard(
    ctx,
    localHero(state).pos.x,
    localHero(state).pos.y,
    camera.x,
    camera.y,
  );
  ctx.save();

  if (layer === "under") {
    // The ground shockwave: a squashed golden ring bursting outward in the
    // opening beats, the "something big just happened" footprint.
    if (t < 0.45) {
      const ring = t / 0.45; // 0 → 1
      const reach = (8 + ring * 30) * (0.45 + 0.55 * power);
      ctx.globalAlpha = 0.85 * (1 - ring) * power;
      ctx.strokeStyle = "#ffd75e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 6, reach, reach * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The pillar of light: a gold column rising off the hero, breathing
    // slightly so it reads as living flame rather than a static decal. It
    // narrows and shortens with the ding's intensity — an early level-up is a
    // waist-high glow, the cap's ding a column over his head.
    const flicker = 1 + 0.12 * Math.sin(timeMs / 55);
    const w = 15 * flicker * (0.5 + 0.5 * power);
    const top = y - 58 * (0.55 + 0.45 * power);
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
    // each on its own deterministic phase/speed so the column shimmers. The
    // count thins with the ding's intensity so a small level-up sheds a few
    // sparks where the cap's throws a full column.
    const EMBERS = Math.max(4, Math.round(12 * (0.35 + 0.65 * power)));
    const palette = ["#ffd75e", "#fff2c0", "#ff9d3b"];
    for (let i = 0; i < EMBERS; i++) {
      const lane = (fract(i * 17.31) - 0.5) * 26; // x offset in the column
      const phase = fract(i * 7.77);
      const speed = 0.9 + fract(i * 3.33) * 0.9; // climbs per celebration
      const climb = (t * speed + phase) % 1; // 0 (feet) → 1 (top)
      const ex = x + Math.round(lane + Math.sin(timeMs / 90 + i) * 2);
      const ey = Math.round(y + 8 - climb * 58 * (0.55 + 0.45 * power));
      const size = climb < 0.3 ? 2 : 1; // embers shrink as they rise
      ctx.globalAlpha = (1 - climb) * fade;
      ctx.fillStyle = palette[i % palette.length]!;
      ctx.fillRect(ex, ey, size, size);
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  endBillboard(ctx);
}
