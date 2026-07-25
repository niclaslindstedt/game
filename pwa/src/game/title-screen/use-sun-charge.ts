// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hidden developer gesture: SEVEN quick taps on the title sky's sun. Each
// tap winds the star up a notch — the first does nothing at all, the second is
// a whisper you'd only catch if you knew to look, and from there the glare
// hardens, fire licks off the limb and the whole disc starts to shake — and the
// seventh detonates it (TitleBackdrop plays the blast; TitleScreen latches
// `developerUnlocked` when it has played out).
//
// The gesture is a plain WINDOW LISTENER that hit-tests the press against the
// sun's live rect rather than a button over the sun, for two reasons: the sun
// is decoration the sky driver moves and sizes each frame (title-sky.ts), and a
// transparent target parked on top of it would swallow presses meant for the
// menu row that happens to sit under it. Nothing here consumes the event — a
// press on a real control is ignored outright and always does its own job.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { synth } from "../audio.ts";
import { haptics } from "../haptics.ts";
import { playSunCharge } from "../sfx/index.ts";

/** Taps that unlock the DEVELOPER menu. The seventh IS the detonation, so the
 * six before it are the whole build-up. */
export const SUN_TAPS = 7;

/** How long a tap counts as part of the same burst. Miss it and the charge
 * lapses back to nothing — the gesture is "seven taps QUICKLY", and idle
 * poking at the sky must never add up to an unlock. */
const TAP_WINDOW_MS = 900;

/** How long the charge layers stay mounted after a burst lapses, so the glare
 * and the fire EBB away instead of snapping off. Matches the CSS transition on
 * `--sun-charge` (see `.title-sun` in styles.css). */
const COOLDOWN_MS = 700;

/** Touch slop around the disc: the sun is a ~46px circle on the reference
 * phone, so accept a press a little outside it rather than asking for a
 * surgical thumb. */
const TAP_SLOP_PX = 12;

/** How wound-up the sun looks at `charge` taps, 0..1 — the ONE ramp the FX and
 * the charge sound both read. The first tap sits at 0 (nothing happens) and the
 * last tap before the blast at 1 (full fury). */
export function sunChargeIntensity(charge: number): number {
  if (charge <= 1) return 0;
  return Math.min(1, (charge - 1) / (SUN_TAPS - 2));
}

/** Did this press land on the sun? Measured against its live rect, so it holds
 * wherever the driver has placed it and at whatever size the viewport gives it.
 * A hidden sun (the coin store clears the sky) has no box and so no hits. */
function pressedTheSun(sun: HTMLElement, x: number, y: number): boolean {
  const rect = sun.getBoundingClientRect();
  if (rect.width <= 0) return false;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.hypot(x - cx, y - cy) <= rect.width / 2 + TAP_SLOP_PX;
}

export function useSunCharge({
  sunRef,
  armed,
  onCharged,
}: {
  /** The sun element the presses are measured against. */
  sunRef: RefObject<HTMLElement | null>;
  /** Listen at all? False once the developer menu is unlocked (the secret is
   * spent) and while the blast is playing. */
  armed: boolean;
  /** The seventh tap landed — blow the sun up. */
  onCharged: () => void;
}): {
  /** Taps banked so far (0..SUN_TAPS-1); 0 between bursts. */
  charge: number;
  /** Keep the charge layers mounted — true through a burst AND its ebb, so the
   * fire fades out rather than vanishing mid-flicker. */
  lit: boolean;
} {
  const [charge, setCharge] = useState(0);
  const [lit, setLit] = useState(false);
  // The live charge and the last tap's timestamp, read inside the listener
  // (which must not re-subscribe on every tap) rather than off the state.
  const chargeRef = useRef(0);
  const lastTapRef = useRef(0);
  const lapseTimer = useRef<number | null>(null);
  const coolTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (lapseTimer.current !== null) window.clearTimeout(lapseTimer.current);
    if (coolTimer.current !== null) window.clearTimeout(coolTimer.current);
    lapseTimer.current = null;
    coolTimer.current = null;
  }, []);

  // Wind the whole gesture back down: the taps lapse, then the FX ebb away.
  const lapse = useCallback(() => {
    chargeRef.current = 0;
    setCharge(0);
    coolTimer.current = window.setTimeout(() => {
      coolTimer.current = null;
      setLit(false);
    }, COOLDOWN_MS);
  }, []);

  useEffect(() => {
    if (!armed) {
      // Disarmed (the blast is playing, or the unlock has landed): stop
      // listening and drop any pending timer. The reported charge is gated on
      // `armed` below rather than reset here, so nothing sets state from an
      // effect body.
      clearTimers();
      chargeRef.current = 0;
      lastTapRef.current = 0;
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const sun = sunRef.current;
      if (!sun) return;
      // Primary presses only — a right/middle click or a second finger is not
      // a tap on the sun.
      if (event.button !== 0 || !event.isPrimary) return;
      // A real control under the pointer wins outright: a menu row can drift
      // over the sun on a tall screen, and it must still just open.
      if (
        event.target instanceof Element &&
        event.target.closest('button, a, input, [role="button"]')
      ) {
        return;
      }
      if (!pressedTheSun(sun, event.clientX, event.clientY)) return;

      const inBurst = event.timeStamp - lastTapRef.current <= TAP_WINDOW_MS;
      lastTapRef.current = event.timeStamp;
      const next = inBurst ? chargeRef.current + 1 : 1;
      clearTimers();

      if (next >= SUN_TAPS) {
        chargeRef.current = 0;
        setCharge(0);
        setLit(false);
        onCharged();
        return;
      }

      chargeRef.current = next;
      setCharge(next);
      setLit(true);
      const intensity = sunChargeIntensity(next);
      playSunCharge(synth, intensity);
      // The build-up is felt as well as seen, from the same tap the fire
      // starts showing — a flick that grows into a real jolt.
      if (intensity >= 0.3) {
        haptics.vibrate(Math.round(6 + intensity * 24));
      }
      lapseTimer.current = window.setTimeout(lapse, TAP_WINDOW_MS);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [armed, clearTimers, lapse, onCharged, sunRef]);

  // Drop any pending timer if the title screen unmounts mid-burst.
  useEffect(() => clearTimers, [clearTimers]);

  // Disarming reads as "no charge" without touching state — the sky must go
  // quiet the instant the star lets go, or the fire would still be licking
  // inside the explosion.
  return { charge: armed ? charge : 0, lit: armed && lit };
}
