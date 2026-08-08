// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hidden developer gesture, in TWO MOVEMENTS.
//
// FIRST, SIXTEEN QUICK TAPS on the title sky's sun — and the first TEN of them
// buy NOTHING. No glare, no sound, no buzz, no layer mounted: a player idly
// poking the sky gets exactly the same nothing they would get poking a planet,
// so the secret cannot be stumbled into. Only the ELEVENTH tap wakes the star,
// as a whisper you'd only catch if you knew to look; from there the glare
// hardens, fire licks off the limb and the whole disc starts to shake. The
// sixteenth does not detonate it: it ARMS the star, which is the point at which
// the secret stops being a secret and starts being a test.
//
// SECOND, THE CLICK RACE (sun-race.ts owns the rule). Hold the sun at tempo —
// a press every 250 ms — and the bank fills in real time; miss the beat and it
// drains half again as fast. Five banked seconds and the star lets go. The sun
// GROWS with the bank and shrinks as it drains, so the meter is the star
// itself: no bar, no counter, nothing on screen that says "you are doing a
// developer gesture".
//
// The gesture is a plain WINDOW LISTENER that hit-tests the press against the
// sun's live rect rather than a button over the sun, for two reasons: the sun
// is decoration the sky driver moves and sizes each frame (title-sky.ts), and a
// transparent target parked on top of it would swallow presses meant for the
// menu row that happens to sit under it. Nothing here consumes the event — a
// press on a real control is ignored outright and always does its own job.
// Note the rect is measured LIVE, so the swelling sun is its own growing target
// — the race gets kinder to the thumb exactly as it gets harder to sustain.
//
// AND THE WHOLE THING IS GATED ON `__DEV_TOOLS__` HERE, not only at the call
// site. A build that ships no developer tooling has no DEVELOPER menu and no
// way to grow one, so a sun that flares under the thumb there is a door that
// opens onto nothing — the worst kind of Easter egg. The flag is a build-time
// literal, so the guard folds the listener, the race loop and the frame paint
// out of the store bundle rather than merely leaving them unreachable.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { synth } from "../audio.ts";
import { haptics } from "../haptics.ts";
import { playSunCharge, playSunRace, playSunRaceArmed } from "../sfx/ui.ts";

import {
  onTempo,
  pressRace,
  raceLapsed,
  raceProgress,
  raceWon,
  startRace,
  tickRace,
  type SunRace,
} from "./sun-race.ts";

/** Taps that are banked in TOTAL SILENCE before the star reacts at all. The
 * gesture's whole first job is to be un-stumble-into-able: ten fast taps is
 * well past anything an idle thumb does to a decoration, so nothing at all —
 * not a layer, not a frame of extra glare, not a click, not a buzz — happens
 * until they are all in, and the ELEVENTH tap is the first the sky answers. */
export const SUN_SILENT_TAPS = 10;

/** Taps that ARM the click race. The sixteenth is the arming tap, so above the
 * silent ten there are five rungs of visible build-up before it. */
export const SUN_TAPS = SUN_SILENT_TAPS + 6;

/** How long a tap counts as part of the same burst. Miss it and the charge
 * lapses back to nothing — the first movement is "sixteen taps QUICKLY", and
 * idle poking at the sky must never add up to an unlock. */
const TAP_WINDOW_MS = 900;

/** How long the charge layers stay mounted after a burst lapses, so the glare
 * and the fire EBB away instead of snapping off. Matches the CSS transition on
 * `--sun-charge` (see `.title-sun` in styles.css). */
const COOLDOWN_MS = 700;

/** Touch slop around the disc: the sun is a ~46px circle on the reference
 * phone, so accept a press a little outside it rather than asking for a
 * surgical thumb. */
const TAP_SLOP_PX = 12;

/** How fast the on/off-tempo tell chases the truth, ms. Smoothed because the
 * beat is crossed constantly at the edge of the player's ability, and a filter
 * hue that flipped on every frame the gap crossed 250 ms would strobe. */
const TEMPO_EASE_MS = 130;

/** How wound-up the sun looks at `charge` taps, 0..1 — the ONE ramp the FX and
 * the charge sound both read. Every tap through the silent ten sits at 0
 * (nothing happens), the eleventh opens the build-up at its faintest rung, and
 * the last tap before the race sits at 1 (full fury). */
export function sunChargeIntensity(charge: number): number {
  if (charge <= SUN_SILENT_TAPS) return 0;
  return Math.min(
    1,
    (charge - SUN_SILENT_TAPS) / (SUN_TAPS - 1 - SUN_SILENT_TAPS),
  );
}

/** Did this press land on the sun? Measured against its live rect, so it holds
 * wherever the driver has placed it and at whatever size the viewport — or the
 * race's own swelling — gives it. A hidden sun (the coin store clears the sky)
 * has no box and so no hits. */
function pressedTheSun(sun: HTMLElement, x: number, y: number): boolean {
  const rect = sun.getBoundingClientRect();
  if (rect.width <= 0) return false;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.hypot(x - cx, y - cy) <= rect.width / 2 + TAP_SLOP_PX;
}

export function useSunCharge({
  sunRef,
  glareRef,
  armed,
  onCharged,
}: {
  /** The sun element the presses are measured against, and the one the race
   * writes its two live ramps onto. */
  sunRef: RefObject<HTMLElement>;
  /** The sky-wide warm wash, which takes the same two ramps so the race is felt
   * across the whole backdrop rather than only on the disc. */
  glareRef: RefObject<HTMLElement>;
  /** Listen at all? False once the developer menu is unlocked (the secret is
   * spent) and while the blast is playing. A build without the developer
   * tooling never listens whatever this says (see `__DEV_TOOLS__` below). */
  armed: boolean;
  /** The race was held to the top — blow the sun up. */
  onCharged: () => void;
}): {
  /** Taps banked so far, as far as the SKY is concerned: 0 through the silent
   * ten, then SUN_SILENT_TAPS+1..SUN_TAPS-1; held at full through the race, 0
   * between bursts. */
  charge: number;
  /** Keep the charge layers mounted — true through a burst AND its ebb, so the
   * fire fades out rather than vanishing mid-flicker. */
  lit: boolean;
  /** The click race is running: the star is armed and being fed. */
  racing: boolean;
} {
  // A build with no developer tooling has nothing for the gesture to unlock, so
  // it never plays at all. `__DEV_TOOLS__` is a build-time literal: folding the
  // guard in HERE (rather than trusting every caller to pass `armed: false`)
  // lets Rollup drop the listener and the race loop out of the store bundle.
  const live = __DEV_TOOLS__ && armed;

  const [charge, setCharge] = useState(0);
  const [lit, setLit] = useState(false);
  const [racing, setRacing] = useState(false);
  // The live charge and the last tap's timestamp, read inside the listener
  // (which must not re-subscribe on every tap) rather than off the state.
  const chargeRef = useRef(0);
  const lastTapRef = useRef(0);
  const lapseTimer = useRef<number | null>(null);
  const coolTimer = useRef<number | null>(null);
  // The race lives entirely in refs and is written straight to the DOM by the
  // frame loop below: its two ramps change every frame, and routing 60 Hz of
  // that through React state would re-render the whole backdrop — ten flame
  // spans, eight embers and the sky — once per frame to move one number.
  const raceRef = useRef<SunRace | null>(null);
  const tempoRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (lapseTimer.current !== null) window.clearTimeout(lapseTimer.current);
    if (coolTimer.current !== null) window.clearTimeout(coolTimer.current);
    lapseTimer.current = null;
    coolTimer.current = null;
  }, []);

  /** Write the race's two live ramps onto the sun and the sky wash. Both are
   * registered custom properties (see `@property --sun-race` in styles.css), so
   * an unwritten one reads as a clean 0 rather than as an invalid `calc`. */
  const paintRace = useCallback(
    (progress: number, tempo: number) => {
      for (const el of [sunRef.current, glareRef.current]) {
        if (!el) continue;
        el.style.setProperty("--sun-race", progress.toFixed(4));
        el.style.setProperty("--sun-tempo", tempo.toFixed(4));
      }
    },
    [glareRef, sunRef],
  );

  // Wind the whole gesture back down: the race is abandoned, the taps lapse,
  // then the FX ebb away.
  const lapse = useCallback(() => {
    raceRef.current = null;
    tempoRef.current = 0;
    paintRace(0, 0);
    chargeRef.current = 0;
    setCharge(0);
    setRacing(false);
    coolTimer.current = window.setTimeout(() => {
      coolTimer.current = null;
      setLit(false);
    }, COOLDOWN_MS);
  }, [paintRace]);

  useEffect(() => {
    if (!live) {
      // Disarmed (no developer tooling in this build, the blast is playing, or
      // the unlock has landed): stop listening and drop any pending timer. The
      // reported charge is gated on `live` below rather than reset here, so
      // nothing sets state from an effect body.
      clearTimers();
      chargeRef.current = 0;
      lastTapRef.current = 0;
      raceRef.current = null;
      tempoRef.current = 0;
      paintRace(0, 0);
      // The reported `racing` is gated on `live` below, and starving the loop
      // of `raceRef` stops it on its next frame — so nothing sets state from an
      // effect body here either. A latched `racing` that outlived a disarm is
      // cleared by the next tap (see the first movement below).
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

      // One clock for both movements. `performance.now()` rather than the
      // event's own stamp, because the race's frame loop is stamped by rAF and
      // the beat is measured BETWEEN the two.
      const now = performance.now();

      // ——— SECOND MOVEMENT: the race is running, so this press is a beat.
      const race = raceRef.current;
      if (race) {
        const keeping = onTempo(race, now);
        raceRef.current = pressRace(race, now);
        playSunRace(synth, raceProgress(race), keeping);
        // A tick under the thumb on the beat, nothing worth feeling off it —
        // the hand should be able to find the tempo without watching.
        haptics.vibrate(keeping ? 6 : 3);
        return;
      }

      // ——— FIRST MOVEMENT: counting the sixteen taps. Reaching here means no
      // race is running, so clear any flag one left behind (a disarm mid-race
      // stops the loop without touching state — see above). React bails out
      // when it is already false, so this costs nothing on the common path.
      setRacing(false);
      const inBurst = now - lastTapRef.current <= TAP_WINDOW_MS;
      lastTapRef.current = now;
      const next = inBurst ? chargeRef.current + 1 : 1;
      clearTimers();

      if (next >= SUN_TAPS) {
        // The arming tap. The star holds at full fury (charge pinned at the
        // last rung, so `sunChargeIntensity` reads 1 for the whole race) and
        // this very press becomes the race's first beat — pausing to admire the
        // sun would otherwise cost the player their opening 250 ms.
        chargeRef.current = SUN_TAPS - 1;
        setCharge(SUN_TAPS - 1);
        setLit(true);
        raceRef.current = startRace(now);
        tempoRef.current = 1;
        paintRace(0, 1);
        setRacing(true);
        playSunRaceArmed(synth);
        haptics.vibrate([30, 40, 60]);
        return;
      }

      chargeRef.current = next;
      lapseTimer.current = window.setTimeout(lapse, TAP_WINDOW_MS);

      // THE SILENT TEN. Banked in the ref and NOWHERE else — no state touched,
      // so not one charge layer mounts, no `.charging` class lands on the disc,
      // and neither the synth nor the motor is asked for anything. A thumb that
      // wanders across the sky has to come away with literally no evidence
      // there is anything under it.
      if (next <= SUN_SILENT_TAPS) return;

      setCharge(next);
      setLit(true);
      const intensity = sunChargeIntensity(next);
      playSunCharge(synth, intensity);
      // The build-up is felt as well as seen, from the same tap the fire
      // starts showing — a flick that grows into a real jolt.
      if (intensity >= 0.3) {
        haptics.vibrate(Math.round(6 + intensity * 24));
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [clearTimers, lapse, live, onCharged, paintRace, sunRef]);

  // THE RACE'S FRAME LOOP. It bills real time into the bank (sun-race.ts) and
  // paints the result straight onto the sun, so the disc swells while the beat
  // is kept and shrinks the moment it is dropped. Ends exactly two ways: the
  // bank tops out and the star lets go, or it sits empty long enough to give up
  // and the gesture falls back to the sixteen taps.
  useEffect(() => {
    if (!racing) return;
    let frame = 0;
    let prev = performance.now();
    const step = (t: number) => {
      const dt = t - prev;
      prev = t;
      const race = raceRef.current;
      if (!race) return;
      const next = tickRace(race, t, dt);
      raceRef.current = next;
      // Ease the tempo TELL rather than the tempo itself: the bank is billed on
      // the hard truth, only the colour of the star is smoothed.
      const target = onTempo(next, t) ? 1 : 0;
      tempoRef.current +=
        (target - tempoRef.current) * Math.min(1, dt / TEMPO_EASE_MS);
      paintRace(raceProgress(next), tempoRef.current);

      if (raceWon(next)) {
        raceRef.current = null;
        // The blast's own keyframes own the disc's transform from here, so
        // clearing the ramps costs nothing visually and leaves no stale
        // swelling on the element after the star is gone.
        paintRace(0, 0);
        setRacing(false);
        onCharged();
        return;
      }
      if (raceLapsed(next)) {
        lapse();
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [lapse, onCharged, paintRace, racing]);

  // Drop any pending timer if the title screen unmounts mid-burst.
  useEffect(() => clearTimers, [clearTimers]);

  // Disarming reads as "no charge" without touching state — the sky must go
  // quiet the instant the star lets go, or the fire would still be licking
  // inside the explosion.
  return {
    charge: live ? charge : 0,
    lit: live && lit,
    racing: live && racing,
  };
}
