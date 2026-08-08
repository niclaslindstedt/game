// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PREDICTOR — the net client's answer to publish-rate lag, in two halves.
//
// **THE LOCAL HERO IS PREDICTED.** The client sends input frames, never
// positions; the server remains the only authority over where anybody IS. But
// a hero who only moves when a snapshot lands moves at 20 Hz with a round trip
// on top, and that is the one latency a player feels in their hands. So after
// every input frame the client runs the engine's OWN movement pass over its
// own hero (`predictHeroMovement` — combat and shared-state side effects
// neutralized, no rng draws), and on every snapshot it RECONCILES: the
// header's `ack` says which inputs the server has applied, the hero is rebased
// onto the authoritative state, the still-unacknowledged inputs are replayed,
// and the presentation is corrected — smoothly under a threshold, with a snap
// past it. Every rebase starts from server truth, so a mispredict lives for
// exactly one publish interval and blending can never compound.
//
// **EVERY OTHER HERO IS INTERPOLATED.** Their inputs are not here to replay,
// so a remote hero rendered off raw snapshots stutters at the publish rate.
// Instead each is drawn between its last two snapshot positions, advanced by
// local ticks — one publish interval behind the server, which is the standard
// trade: perfectly smooth, slightly late, and the lateness is invisible on a
// body nobody is steering from this chair.
//
// **THE PREDICTION SCRIBBLES, AND THE SCRIBBLES MUST NOT BE MISTAKEN FOR
// TRUTH.** A delta that carries the party replaces it wholesale, but a delta
// coded over an interval where the party did not change carries nothing — and
// the state would keep whatever this module wrote. So before every patch is
// applied, the hero's motion fields are RESTORED to the last authoritative
// values (`shadow` for the local hero, the newest sample for remote ones);
// the patch then lands on clean ground, and what it does not correct was
// already correct.
//
// Lives beside `client.ts` (which stays the one client) rather than inside it,
// to keep that file within the repo's size budget; it may import `@game/core`
// for the same reason the client may — this module is never on the app's
// startup path.

import {
  heroInPlay,
  partyBlocked,
  predictHeroMovement,
  PLAYER,
  type GameInput,
  type GameState,
  type Player,
} from "@game/core";

import { TICK_MS } from "./wire/frames.ts";

/**
 * How many unacknowledged input frames are kept for replay. At 60 inputs/s
 * this is over a second of round trip — far past playable — and a hard bound:
 * a stalled server must not grow this client's memory. Past it the oldest are
 * dropped, which self-heals on the next snapshot exactly like a lost frame.
 */
const PENDING_CAP = 64;

/**
 * The reconcile SNAP threshold, in world units: twice the hero's collision
 * radius (2 × `PLAYER.radius` = one body length). Under it the mispredict is
 * a nudge — a clipped corner, a one-frame input loss — and blending toward
 * the replayed position hides it; past it something structural disagreed (a
 * knockback, a teleport, a hazard shove the client cannot predict) and easing
 * a whole body-length would read as ice-skating, so the hero snaps.
 */
const SNAP_DISTANCE = PLAYER.radius * 2;

/** How far the presentation moves toward the replayed truth per snapshot when
 * under the snap threshold. The residue cannot compound: the next snapshot
 * rebases from authoritative state before blending again. */
const BLEND = 0.35;

/** One input frame kept for replay: its wire seq and a deep copy of the input
 * (the app reuses one mutable object per frame; `view` is dropped — it gates
 * weapon targeting, which prediction never runs). */
type Pending = { seq: number; input: GameInput };

/** The local hero's motion fields as the last snapshot left them — everything
 * `stepPlayer` writes. Plain numbers, never references: the patch may replace
 * the hero object out from under us. */
type MotionShadow = {
  x: number;
  y: number;
  z: number;
  vz: number;
  velX: number;
  velY: number;
  facingX: number;
  facingY: number;
  faceLeft: boolean;
  moving: boolean;
  stamina: number;
  hurtFlashMs: number;
  knockoutMs: number;
};

/** One remote hero's snapshot position. */
type Sample = { x: number; y: number; z: number; tick: number };

/** The last two snapshot positions of one remote seat. */
type SeatSamples = { prev: Sample | null; next: Sample };

export type Predictor = {
  /** Called once per sent input frame, AFTER the send: advances the remote
   * heroes' interpolation by one local tick and — when the local hero may act
   * — records the input and predicts one movement step for it. */
  onInput(
    state: GameState,
    seat: number | null,
    seq: number,
    input: GameInput,
  ): void;
  /** Called with the state as displayed, BEFORE a snapshot/delta patch is
   * applied: captures the presented position and un-scribbles every predicted
   * or interpolated write so the patch lands on authoritative ground. */
  beforeApply(state: GameState, seat: number | null): void;
  /** Called AFTER the patch landed, with the header's `ack` (highest input seq
   * the server applied) and `tick`: drops acknowledged inputs, snapshots the
   * authoritative hero, replays the rest, reconciles the presentation, and
   * banks the remote heroes' interpolation samples. */
  afterApply(
    state: GameState,
    seat: number | null,
    ack: number,
    tick: number,
  ): void;
  /** Forget everything — the world moved (an in-session travel) or the session
   * ended. Buffers from the old level would replay a walk across geometry that
   * no longer exists. */
  reset(): void;
};

export function createPredictor(): Predictor {
  /** Input frames sent but not yet covered by a snapshot, oldest first. */
  let pending: Pending[] = [];
  /** The local hero as the last snapshot left him, or null before the first. */
  let shadow: MotionShadow | null = null;
  /** Where the local hero was DRAWN when the latest patch arrived. */
  let displayed: { x: number; y: number } | null = null;
  /** Remote heroes' last two snapshot positions, by seat. */
  let samples = new Map<number, SeatSamples>();
  /** Local ticks since the last applied snapshot — the interpolation clock. */
  let ticksSinceSnapshot = 0;

  /** The hero this client may predict for RIGHT NOW, or null. Mirrors the
   * step loop's own gate (`engine/game/step/index.ts`): the world must be live
   * (`playing`, party not blocked), the hero in play with no screen up, and
   * not riding — a driver's pointer steers the CAR, which only the server
   * simulates. */
  function steerableHero(state: GameState, seat: number | null): Player | null {
    if (seat === null) return null;
    if (state.phase !== "playing") return null;
    const hero = state.players[seat];
    if (!hero || !heroInPlay(hero)) return null;
    if (hero.screen !== undefined) return null;
    if (partyBlocked(state)) return null;
    for (const vehicle of state.vehicles) {
      if (vehicle.kind === "car" && vehicle.driver === seat) return null;
    }
    return hero;
  }

  function saveShadow(hero: Player): MotionShadow {
    return {
      x: hero.pos.x,
      y: hero.pos.y,
      z: hero.z,
      vz: hero.vz,
      velX: hero.vel.x,
      velY: hero.vel.y,
      facingX: hero.facing.x,
      facingY: hero.facing.y,
      faceLeft: hero.faceLeft,
      moving: hero.moving,
      stamina: hero.stamina,
      hurtFlashMs: hero.hurtFlashMs,
      knockoutMs: hero.knockoutMs,
    };
  }

  function restoreShadow(hero: Player, from: MotionShadow): void {
    hero.pos.x = from.x;
    hero.pos.y = from.y;
    hero.z = from.z;
    hero.vz = from.vz;
    hero.vel.x = from.velX;
    hero.vel.y = from.velY;
    hero.facing.x = from.facingX;
    hero.facing.y = from.facingY;
    hero.faceLeft = from.faceLeft;
    hero.moving = from.moving;
    hero.stamina = from.stamina;
    hero.hurtFlashMs = from.hurtFlashMs;
    hero.knockoutMs = from.knockoutMs;
  }

  /** Write the interpolated position onto every remote hero still in play.
   * Facing, faceLeft and moving deliberately keep the newest snapshot's values
   * — a pose is a discrete fact, and easing one produces bodies that moonwalk. */
  function interpolate(state: GameState, seat: number | null): void {
    if (state.phase !== "playing") return;
    for (const [remoteSeat, entry] of samples) {
      if (remoteSeat === seat) continue;
      const hero = state.players[remoteSeat];
      // A downed or departed hero keeps their corpse-sprawl position; a seat
      // beyond the party (post-travel churn) has nothing to write to.
      if (!hero || !heroInPlay(hero)) continue;
      const { prev, next } = entry;
      if (!prev) continue;
      const span = Math.max(1, next.tick - prev.tick);
      const alpha = Math.min(1, ticksSinceSnapshot / span);
      hero.pos.x = prev.x + (next.x - prev.x) * alpha;
      hero.pos.y = prev.y + (next.y - prev.y) * alpha;
      hero.z = prev.z + (next.z - prev.z) * alpha;
    }
  }

  return {
    onInput(state, seat, seq, input) {
      // The interpolation clock is LOCAL ticks — one per sent input frame,
      // which the drivers send at the loop's fixed 60 Hz.
      ticksSinceSnapshot++;
      interpolate(state, seat);
      const hero = steerableHero(state, seat);
      if (!hero) return;
      pending.push({ seq, input: copyInput(input) });
      if (pending.length > PENDING_CAP) pending.shift();
      predictHeroMovement(
        state,
        hero,
        pending[pending.length - 1]!.input,
        TICK_MS / 1000,
        TICK_MS,
      );
    },

    beforeApply(state, seat) {
      displayed = null;
      if (seat !== null) {
        const hero = state.players[seat];
        if (hero) {
          displayed = { x: hero.pos.x, y: hero.pos.y };
          // Un-scribble: a delta over an interval where the party did not
          // change carries no players patch, and the predicted values would
          // otherwise be left standing as if the server had confirmed them.
          if (shadow) restoreShadow(hero, shadow);
        }
      }
      for (const [remoteSeat, entry] of samples) {
        if (remoteSeat === seat) continue;
        const hero = state.players[remoteSeat];
        if (!hero || !heroInPlay(hero)) continue;
        hero.pos.x = entry.next.x;
        hero.pos.y = entry.next.y;
        hero.z = entry.next.z;
      }
    },

    afterApply(state, seat, ack, tick) {
      ticksSinceSnapshot = 0;
      // Inputs the snapshot already covers are the server's business now.
      while (pending.length && pending[0]!.seq <= ack) pending.shift();
      // Bank the remote heroes' authoritative positions for interpolation.
      const kept = new Map<number, SeatSamples>();
      for (
        let remoteSeat = 0;
        remoteSeat < state.players.length;
        remoteSeat++
      ) {
        if (remoteSeat === seat) continue;
        const hero = state.players[remoteSeat];
        if (!hero || !heroInPlay(hero)) continue;
        const next: Sample = {
          x: hero.pos.x,
          y: hero.pos.y,
          z: hero.z,
          tick,
        };
        kept.set(remoteSeat, {
          prev: samples.get(remoteSeat)?.next ?? null,
          next,
        });
      }
      samples = kept;
      // The local hero: rebase, replay, reconcile.
      if (seat === null) return;
      const hero = state.players[seat];
      if (!hero) {
        shadow = null;
        return;
      }
      shadow = saveShadow(hero);
      if (!steerableHero(state, seat)) {
        // The server will feed this seat IDLE while a screen is up (or the
        // hero is down/riding), so replaying the pending walk would move a
        // hero the server is holding still.
        displayed = null;
        return;
      }
      for (const entry of pending) {
        predictHeroMovement(state, hero, entry.input, TICK_MS / 1000, TICK_MS);
      }
      // Reconcile the PRESENTATION: `displayed` is where the player last saw
      // their hero, `hero.pos` is now the replayed truth. A small error is
      // eased; a large one is snapped (see SNAP_DISTANCE).
      if (displayed) {
        const dx = hero.pos.x - displayed.x;
        const dy = hero.pos.y - displayed.y;
        const error = Math.hypot(dx, dy);
        if (error > 0 && error < SNAP_DISTANCE) {
          hero.pos.x = displayed.x + dx * BLEND;
          hero.pos.y = displayed.y + dy * BLEND;
        }
        displayed = null;
      }
    },

    reset() {
      pending = [];
      shadow = null;
      displayed = null;
      samples = new Map();
      ticksSinceSnapshot = 0;
    },
  };
}

/**
 * A frame's own copy of the app's ONE mutable input object. Flat fields plus
 * the two vectors; `view` (the camera rect) is deliberately dropped — it gates
 * the weapon pass, which a predicted step never runs, and it is the biggest
 * member of the shape.
 */
function copyInput(input: GameInput): GameInput {
  const copy: GameInput = {
    steering: input.steering,
    target: { x: input.target.x, y: input.target.y },
    jump: input.jump,
    useItem: input.useItem,
  };
  if (input.throttle !== undefined) copy.throttle = input.throttle;
  if (input.handbrake !== undefined) copy.handbrake = input.handbrake;
  if (input.aim) copy.aim = { x: input.aim.x, y: input.aim.y };
  if (input.useItemIndex !== undefined) copy.useItemIndex = input.useItemIndex;
  if (input.moveItem) copy.moveItem = { ...input.moveItem };
  if (input.dropItemIndex !== undefined) {
    copy.dropItemIndex = input.dropItemIndex;
  }
  if (input.useMedkit !== undefined) copy.useMedkit = input.useMedkit;
  if (input.useStaminaPotion !== undefined) {
    copy.useStaminaPotion = input.useStaminaPotion;
  }
  if (input.useRepairKit !== undefined) copy.useRepairKit = input.useRepairKit;
  return copy;
}
