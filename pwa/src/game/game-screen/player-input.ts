// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUMAN's per-tick input assembly: the touch virtual dpad, desktop
// keyboard steering, cursor-follow and AIM & SHOOT mouse modes, the queued
// jump/item/consumable/spell edges the DOM handlers banked since last tick,
// and the field taps that open the merchant's shop or re-open the victory
// menu on the fallen boss. The BOT's input lives in bot-driver.ts.

import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

import {
  MERCHANT,
  openShop,
  reopenVictoryChoice,
  STAMINA,
  type Bot,
  type GameInput,
  type GameState,
} from "@game/core";
import { clamp01, distance, normalize } from "@game/lib/vec.ts";

import type { PointerTracker } from "@ui/lib/pointer.ts";

import { synth } from "../audio.ts";
import { stopMusic } from "../music/index.ts";
import { getSettings } from "../settings.ts";
import { playUiSound } from "../sfx/index.ts";
import { moveVectorForCode } from "../keybindings.ts";

// The touch virtual dpad: dragging past the deadzone walks in that direction;
// the steer target is projected this far ahead (world units, must stay well
// beyond PLAYER.arriveRadius so the walk never "arrives").
export const DPAD_DEADZONE_PX = 10;
export const DPAD_STEER_DISTANCE = 200;
// The on-screen dpad hint: arrow ring radius and nub travel (CSS px).
export const DPAD_RING_PX = 36;
// The gentlest push past the deadzone still creeps at this fraction of full
// speed, so a barely-off-center thumb walks instead of standing still.
const MIN_WALK_THROTTLE = 0.35;
// Cursor-follow reaches full speed once the target leads the character by this
// many world px; nearer than that the character eases down to a walk. This is
// the phone baseline: desktop renders the world at 2× zoom (uiScaleFor), which
// would otherwise double the physical cursor travel needed to sprint, so the
// live throttle divides that extra zoom back out (see the render loop) — the
// on-screen distance to full speed stays constant across viewports.
const CURSOR_FULL_SPEED_PX = 90;

// Desktop steering (settings.keyboardMove === "on"): each held direction key
// contributes a cardinal vector; the sum is the heading, projected
// DPAD_STEER_DISTANCE ahead like the touch dpad. Movement is binary — run by
// default, hold WALK to walk, stand still with no key down. The keys are the
// player's rebindable FORWARD/BACK/LEFT/RIGHT binds (keybindings.ts), read by
// `event.code` so they stay layout-independent (AZERTY etc.).
// The reduced pace while WALK is held; the default (no modifier) runs at full
// speed. Pinned to the engine's walk anchor so a Shift-walk stays a *walk* for
// the stamina system: moving always spends the pool in proportion to pace, so a
// walk drains only `walkThrottle` of a full run's rate — a slower, cheaper pace
// (the pool refills only while standing still). A bare 0.6 would spend more.
const KEYBOARD_WALK_THROTTLE = STAMINA.walkThrottle;

/** Map a dpad thumb distance (CSS px) to a walk throttle in [MIN_WALK, 1]. */
export function dpadThrottle(len: number): number {
  const span = DPAD_RING_PX - DPAD_DEADZONE_PX;
  const t = span > 0 ? (len - DPAD_DEADZONE_PX) / span : 1;
  return MIN_WALK_THROTTLE + (1 - MIN_WALK_THROTTLE) * clamp01(t);
}

/** Map a cursor-to-character distance (world px) to a walk throttle in [0, 1].
 * `fullSpeedPx` is the distance at which the throttle saturates; callers shrink
 * it by the viewport's UI scale so the character sprints after the same CSS
 * cursor travel whether or not the desktop 2× zoom is active. */
function cursorThrottle(dist: number, fullSpeedPx: number): number {
  return clamp01(dist / fullSpeedPx);
}

/** The queued one-shot edges the DOM handlers bank between sim ticks: taps,
 * key presses, and dock/spell-slot presses, consumed by the next tick. */
export type InputQueues = {
  jumpQueuedRef: MutableRefObject<boolean>;
  useItemQueuedRef: MutableRefObject<boolean>;
  useItemIndexRef: MutableRefObject<number | null>;
  useMedkitQueuedRef: MutableRefObject<boolean>;
  useStaminaQueuedRef: MutableRefObject<boolean>;
  useRepairQueuedRef: MutableRefObject<boolean>;
  /** Where the last tap/click landed (CSS px on the canvas): checked against
   * the discovered merchant / the fallen boss before it acts as a jump. */
  shopTapRef: MutableRefObject<{ x: number; y: number } | null>;
  /** Desktop keyboard steering: which movement-bound key codes are held right
   * now, and whether the walk modifier is down. */
  heldMoveKeysRef: MutableRefObject<Set<string>>;
  walkingRef: MutableRefObject<boolean>;
};

/** The queues plus the imperative enqueue helpers the DOM handlers call —
 * banking an edge is a ref write, so it lives here (never in a component,
 * where mutating a hook's return is off-limits). */
export type InputQueuesApi = InputQueues & {
  /** Queue one use of a tapped consumable-dock slot for the next sim tick. */
  queueConsumable: (kind: "medkit" | "stamina" | "repair") => void;
  /** Queue a spend of exactly this powerup-dock slot. */
  queueDockSpend: (index: number) => void;
};

/** The queue refs' React housing — component-lifetime, so a banked edge
 * survives the run effect's re-runs the way the individual refs used to.
 * The returned bundle is memoized (stable) so the run effect can list it as
 * a dependency without re-running. */
export function useInputQueues(): InputQueuesApi {
  const jumpQueuedRef = useRef(false);
  const useItemQueuedRef = useRef(false);
  // Which powerup dock slot the player tapped this frame (index into
  // heldAbilities). null = spend the oldest (click / E / auto-use).
  const useItemIndexRef = useRef<number | null>(null);
  // The consumable dock: a medkit / stamina-potion / repair-kit use queued this
  // frame (a slot tap or its bindable key), spent on the next sim tick.
  const useMedkitQueuedRef = useRef(false);
  const useStaminaQueuedRef = useRef(false);
  const useRepairQueuedRef = useRef(false);
  // Where the last tap/click landed (CSS px on the canvas): the sim loop
  // checks it against the discovered merchant — a tap on him at the counter
  // opens the shop instead of jumping.
  const shopTapRef = useRef<{ x: number; y: number } | null>(null);
  // Desktop keyboard steering: which movement-bound key codes are held right
  // now, and whether the walk modifier is down. Read every sim tick (the loop
  // resolves each held code to a direction via the player's key bindings).
  const heldMoveKeysRef = useRef<Set<string>>(new Set());
  const walkingRef = useRef(false);
  return useMemo(
    () => ({
      jumpQueuedRef,
      useItemQueuedRef,
      useItemIndexRef,
      useMedkitQueuedRef,
      useStaminaQueuedRef,
      useRepairQueuedRef,
      shopTapRef,
      heldMoveKeysRef,
      walkingRef,
      queueConsumable: (kind) => {
        if (kind === "medkit") useMedkitQueuedRef.current = true;
        else if (kind === "stamina") useStaminaQueuedRef.current = true;
        else useRepairQueuedRef.current = true;
      },
      queueDockSpend: (index) => {
        useItemQueuedRef.current = true;
        useItemIndexRef.current = index;
      },
    }),
    [],
  );
}

/** The live viewport mapping (the resize observer rewrites it in place). */
export type Viewport = {
  /** CSS px → world units. */
  cssToWorld: { x: number; y: number };
  /** Extra desktop zoom (1 on phones, 2 on large screens); cursor-follow
   * divides it out so a sprint takes the same CSS mouse travel everywhere. */
  uiScale: number;
};

/**
 * Fill `input` from the human's controls for this tick (see settings.ts): a
 * touch anchors a virtual dpad where it lands — dragging away from the anchor
 * walks in that direction, releasing stops. Desktop WASD/arrows steer while
 * held; otherwise the mouse steers per the player's scheme (cursor-follow, or
 * AIM & SHOOT where the mouse only aims and the held button is the trigger).
 */
export function readHumanInput(
  input: GameInput,
  deps: {
    state: GameState;
    pointer: PointerTracker;
    camera: { x: number; y: number };
    viewport: Viewport;
    queues: InputQueues;
  },
): void {
  const { state, pointer, camera, viewport, queues } = deps;
  const settings = getSettings();
  // Desktop mouse aim: the pointer adds a second steering dimension —
  // the hero prefers the foe the cursor points at. Live in every mouse
  // mode (freed WASD steering, cursor-follow, aim & shoot); touch/pen
  // never aim, so it stays the plain nearest foe there.
  input.aim =
    pointer.state.pointerType === "mouse" &&
    (pointer.state.hovering || pointer.state.held)
      ? {
          x: camera.x + pointer.state.x * viewport.cssToWorld.x,
          y: camera.y + pointer.state.y * viewport.cssToWorld.y,
        }
      : undefined;
  const touchSteering =
    pointer.state.held && pointer.state.pointerType !== "mouse";
  if (touchSteering) {
    // Touch virtual dpad: the drag offset from the anchor is a
    // direction, not a destination — steer relative to the player.
    const n = normalize(
      pointer.state.x - pointer.state.originX,
      pointer.state.y - pointer.state.originY,
    );
    input.steering = n.len >= DPAD_DEADZONE_PX;
    if (input.steering) {
      input.target.x = state.player.pos.x + n.x * DPAD_STEER_DISTANCE;
      input.target.y = state.player.pos.y + n.y * DPAD_STEER_DISTANCE;
      // How far the thumb sits from the dpad center sets the pace: a
      // nudge past the deadzone creeps, a full push to the ring runs.
      input.throttle = dpadThrottle(n.len);
    }
  } else {
    // Desktop WASD/arrows and the mouse coexist. While any movement
    // key is held (keyboardMove === "on"), the summed keys are the
    // heading (run, or walk with Shift). The instant no key is down,
    // steering falls back to the mouse so "just hold the cursor where
    // you want to go" keeps working alongside the keyboard — the
    // keyboard only takes over for as long as a key is actually held.
    let dx = 0;
    let dy = 0;
    // AIM & SHOOT always walks by keyboard regardless of the KEYS
    // setting — the mouse only aims there, so WASD is the one way
    // to move and must never be switched off underneath the mode.
    if (settings.keyboardMove === "on" || settings.steering === "aim") {
      const binds = settings.keybindings;
      for (const code of queues.heldMoveKeysRef.current) {
        const v = moveVectorForCode(code, binds);
        if (v) {
          dx += v.x;
          dy += v.y;
        }
      }
    }
    const key = normalize(dx, dy);
    if (key.len > 0) {
      input.steering = true;
      input.target.x = state.player.pos.x + key.x * DPAD_STEER_DISTANCE;
      input.target.y = state.player.pos.y + key.y * DPAD_STEER_DISTANCE;
      input.throttle = queues.walkingRef.current ? KEYBOARD_WALK_THROTTLE : 1;
    } else if (settings.steering === "aim") {
      // AIM & SHOOT: the mouse never steers — with no movement key
      // down the hero stands his ground while the pointer keeps
      // aiming (and the held button keeps firing, below).
      input.steering = false;
    } else {
      // Cursor-follow steering: a hovering mouse steers with no
      // button; a held button steers too.
      const hoverSteer =
        settings.steering === "hover" && pointer.state.hovering;
      input.steering = pointer.state.held || hoverSteer;
      input.target.x = camera.x + pointer.state.x * viewport.cssToWorld.x;
      input.target.y = camera.y + pointer.state.y * viewport.cssToWorld.y;
      // On desktop the pace scales with how far the cursor leads the
      // character — hold it close to stroll, throw it wide to sprint.
      // Divide the desktop 2× zoom out of the full-speed distance so the
      // sprint threshold stays fixed in CSS px, not doubled by the zoom.
      input.throttle = cursorThrottle(
        distance(input.target, state.player.pos),
        CURSOR_FULL_SPEED_PX / viewport.uiScale,
      );
    }
  }
  // AIM & SHOOT's manual trigger: with AUTO-FIRE off, the weapon only
  // fires while the left mouse button is held. Every other scheme —
  // and any touch input — leaves the gate absent, so the character
  // fights autonomously as always.
  input.fire =
    settings.steering === "aim" &&
    settings.autoFire === "off" &&
    pointer.state.pointerType === "mouse"
      ? pointer.state.held
      : undefined;
  input.jump = queues.jumpQueuedRef.current;
  queues.jumpQueuedRef.current = false;
  // Instant item use (opt-in) pops pickups the moment they are
  // carried; manual waits for the player's edge — a dock slot tap
  // (which names its index), a click, or E. A tapped slot spends
  // exactly that powerup; everything else spends the oldest.
  input.useItem =
    queues.useItemQueuedRef.current ||
    (settings.itemUse === "auto" && state.player.heldAbilities.length > 0);
  input.useItemIndex = queues.useItemIndexRef.current ?? undefined;
  queues.useItemQueuedRef.current = false;
  queues.useItemIndexRef.current = null;
  // Stacked consumables: a queued medkit / stamina-potion / repair-kit
  // use fires this tick (the engine no-ops when there's nothing to
  // spend or mend, so a stray edge is harmless).
  input.useMedkit = queues.useMedkitQueuedRef.current;
  input.useStaminaPotion = queues.useStaminaQueuedRef.current;
  input.useRepairKit = queues.useRepairQueuedRef.current;
  queues.useMedkitQueuedRef.current = false;
  queues.useStaminaQueuedRef.current = false;
  queues.useRepairQueuedRef.current = false;
}

/**
 * Resolve the tick's banked field tap (if any): a tap that lands on the
 * DISCOVERED merchant (and the hero close enough to trade — openShop checks
 * the counter distance) opens the shop instead of acting as a jump or an
 * item use; a tap on the fallen boss while STAYing (see stayOnField)
 * re-opens the victory menu — the player has declared they're done farming.
 * Both share one banked tap, so a merchant tap and a corpse tap can't both
 * fire off one press.
 */
export function handleFieldTaps(
  input: GameInput,
  deps: {
    state: GameState;
    bot: Bot | null;
    camera: { x: number; y: number };
    viewport: Viewport;
    queues: InputQueues;
    bumpUi: () => void;
  },
): void {
  const { state, bot, camera, viewport, queues, bumpUi } = deps;
  const shopTap = queues.shopTapRef.current;
  queues.shopTapRef.current = null;
  if (
    shopTap &&
    !bot &&
    state.phase === "playing" &&
    state.merchant.discovered
  ) {
    const wx = camera.x + shopTap.x * viewport.cssToWorld.x;
    const wy = camera.y + shopTap.y * viewport.cssToWorld.y;
    const m = state.merchant.pos;
    if (
      Math.hypot(wx - m.x, wy - m.y) <= MERCHANT.radius * 2.5 &&
      openShop(state)
    ) {
      input.jump = false;
      input.useItem = false;
      playUiSound(synth, "confirm");
      bumpUi();
    }
  }
  // Same screen→world hit-test as the merchant; the tap must not double as a
  // jump. Reuses the tap captured above (nulled already).
  if (
    shopTap &&
    !bot &&
    state.phase === "playing" &&
    state.staying &&
    state.bossCorpse
  ) {
    const wx = camera.x + shopTap.x * viewport.cssToWorld.x;
    const wy = camera.y + shopTap.y * viewport.cssToWorld.y;
    const c = state.bossCorpse.pos;
    if (Math.hypot(wx - c.x, wy - c.y) <= 22 && reopenVictoryChoice(state)) {
      input.jump = false;
      input.useItem = false;
      stopMusic();
      playUiSound(synth, "confirm");
      bumpUi();
    }
  }
}
