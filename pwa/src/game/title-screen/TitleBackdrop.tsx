// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The title sky: the starfield, the drifting asteroids and twinkles, the
// solar-system Easter egg (planets wheeling around a static sun, driven each
// frame by titleSky.ts), and the moon's hidden long-press that detonates it
// and unlocks the DEVELOPER menu. Purely decorative apart from the moon —
// every layer is aria-hidden.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { synth } from "../audio.ts";
import { haptics } from "../haptics.ts";
import { updateSettings } from "../settings.ts";
import { playUiSound } from "../sfx/index.ts";
import { startTitleSky } from "../titleSky.ts";
import { unlockAudio } from "./menu-model.ts";

/** How long the title moon must be held to reveal the hidden DEVELOPER menu —
 * a deliberately long, secret gesture so it never fires by accident. */
export const MOON_HOLD_MS = 7000;

/** How long the moon's detonation plays before the developer unlock lands. Must
 * match the `.moon-boom` keyframe durations in styles.css. A short cut is used
 * instead under prefers-reduced-motion. */
const MOON_BOOM_MS = 900;
const MOON_BOOM_MS_REDUCED = 200;

/** Base cycle length of each backdrop asteroid's drift keyframe (seconds),
 * matching the `.title-asteroid-N` animations in styles.css. The visible
 * crossing is a fixed slice of this cycle, so a shorter cycle reads as a
 * faster fly-by. */
const ASTEROID_BASE_SECONDS = [21, 17, 27];

/** Speed spread for a fly-by, relative to the base cadence: from a lazy drift
 * (0.5×) up to a gentle streak (1.5×). Each crossing rolls a fresh multiplier
 * so no two feel alike and the belt reads as natural rather than a metronome.
 * Kept modest so even the quickest asteroid stays easy to follow by eye. */
const ASTEROID_MIN_SPEED = 0.5;
const ASTEROID_MAX_SPEED = 1.5;

/** A random `animation-duration` for one asteroid's next crossing. Faster
 * speed ⇒ shorter cycle. `Math.random` is fine here — this is cosmetic, not
 * gameplay RNG. */
function randomAsteroidDuration(baseSeconds: number): string {
  const speed =
    ASTEROID_MIN_SPEED +
    Math.random() * (ASTEROID_MAX_SPEED - ASTEROID_MIN_SPEED);
  return `${(baseSeconds / speed).toFixed(2)}s`;
}

export function TitleBackdrop({
  onDeveloperUnlocked,
}: {
  /** The moon's detonation has finished and `developerUnlocked` is latched in
   * the settings — the menu should rebuild so SETTINGS picks up the new row
   * even if it happens to be open already. */
  onDeveloperUnlocked: () => void;
}) {
  // Each backdrop asteroid gets its own random speed for its first fly-by, and
  // rerolls a fresh one at every iteration boundary (rerollAsteroid), so the
  // belt never falls into a fixed rhythm. Computed once per mount.
  const asteroidDurations = useMemo(
    () => ASTEROID_BASE_SECONDS.map(randomAsteroidDuration),
    [],
  );
  const rerollAsteroid = useCallback(
    (e: ReactAnimationEvent<HTMLSpanElement>, baseSeconds: number) => {
      // Fires while the asteroid is parked off-screen, so swapping the
      // duration never shows as a mid-flight jump.
      e.currentTarget.style.animationDuration =
        randomAsteroidDuration(baseSeconds);
    },
    [],
  );

  // The moon is mid-charge (held but not yet at MOON_HOLD_MS) — drives the
  // "charging up" glow so the long-press has visible feedback.
  const [moonCharging, setMoonCharging] = useState(false);
  // The moon has reached full charge and is detonating: a one-shot blast that
  // plays before the developer menu is unlocked (see startMoonHold /
  // MOON_BOOM_MS).
  const [moonExploding, setMoonExploding] = useState(false);

  // The backdrop's solar-system Easter egg — a rAF loop that spins Earth and
  // Mars around a static sun (and the Moon around Earth), each lit from the
  // sun's real position. Starts once the menu (and its elements) has mounted
  // after the assets load.
  const moonRef = useRef<HTMLDivElement>(null);
  const mercuryRef = useRef<HTMLDivElement>(null);
  const venusRef = useRef<HTMLDivElement>(null);
  const earthRef = useRef<HTMLDivElement>(null);
  const marsRef = useRef<HTMLDivElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  // The backdrop asteroids, driven on a 3D fly-through in orbit mode (they keep
  // their CSS drift with the flag off). Collected so startTitleSky can take them
  // over.
  const asteroidRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const moon = moonRef.current;
    const sun = sunRef.current;
    const glare = glareRef.current;
    if (!moon || !sun || !glare) return;
    const mercury = mercuryRef.current;
    const venus = venusRef.current;
    const earth = earthRef.current;
    const mars = marsRef.current;
    if (!mercury || !venus || !earth || !mars) return;
    const asteroids = asteroidRefs.current.filter(
      (a): a is HTMLSpanElement => !!a,
    );
    return startTitleSky({
      moon,
      mercury,
      venus,
      earth,
      mars,
      sun,
      glare,
      asteroids,
    });
  }, []);

  // The moon's hidden long-press: hold it for MOON_HOLD_MS to reveal the
  // DEVELOPER menu — a settings entry with level select and a debug toggle.
  // Nothing else happens; the player finds the new row in SETTINGS on their
  // own. A running glow (moonCharging) shows the hold is building; releasing
  // early cancels it.
  const moonHold = useRef<number | null>(null);
  // The pending "blast finished → unlock developer menu" timer, so we can drop
  // it if the menu unmounts mid-detonation.
  const moonBoom = useRef<number | null>(null);
  const cancelMoonHold = useCallback(() => {
    if (moonHold.current !== null) {
      window.clearTimeout(moonHold.current);
      moonHold.current = null;
    }
    // A release once the moon is already detonating no longer cancels: the
    // blast is committed and runs to the warp picker on its own.
    setMoonCharging(false);
  }, []);
  const startMoonHold = useCallback(
    (event: ReactPointerEvent) => {
      unlockAudio();
      // Only a primary press charges; a mouse right/middle button is ignored.
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (moonHold.current !== null || moonBoom.current !== null) return;
      setMoonCharging(true);
      moonHold.current = window.setTimeout(() => {
        moonHold.current = null;
        setMoonCharging(false);
        // Blow the moon up first, then latch the developer unlock once the
        // blast has played out. Nothing navigates: the DEVELOPER row simply
        // appears in SETTINGS for the player to discover.
        setMoonExploding(true);
        playUiSound(synth, "boom");
        haptics.vibrate([30, 40, 90]);
        const reduce =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        moonBoom.current = window.setTimeout(
          () => {
            moonBoom.current = null;
            setMoonExploding(false);
            updateSettings({ developerUnlocked: true });
            onDeveloperUnlocked();
          },
          reduce ? MOON_BOOM_MS_REDUCED : MOON_BOOM_MS,
        );
      }, MOON_HOLD_MS);
    },
    [onDeveloperUnlocked],
  );
  // Drop any pending timers if the menu unmounts mid-charge or mid-blast.
  useEffect(
    () => () => {
      cancelMoonHold();
      if (moonBoom.current !== null) {
        window.clearTimeout(moonBoom.current);
        moonBoom.current = null;
      }
    },
    [cancelMoonHold],
  );

  return (
    <>
      <div className="title-stars" aria-hidden="true" />
      {/* Asteroids drift across the backdrop now and then, so the menu feels
          alive rather than a static painting. */}
      <div className="title-asteroids" aria-hidden="true">
        {ASTEROID_BASE_SECONDS.map((baseSeconds, i) => (
          <span
            key={i}
            ref={(el) => {
              asteroidRefs.current[i] = el;
            }}
            className={`title-asteroid title-asteroid-${i + 1}`}
            style={{ animationDuration: asteroidDurations[i] }}
            onAnimationIteration={(e) => rerollAsteroid(e, baseSeconds)}
          />
        ))}
      </div>
      {/* A handful of stars twinkle on their own long cycles, out of sync, so
          the sky flickers with life rather than sitting as a flat backdrop. */}
      <div className="title-twinkles" aria-hidden="true">
        <span className="title-twinkle title-twinkle-1" />
        <span className="title-twinkle title-twinkle-2" />
        <span className="title-twinkle title-twinkle-3" />
        <span className="title-twinkle title-twinkle-4" />
        <span className="title-twinkle title-twinkle-5" />
        <span className="title-twinkle title-twinkle-6" />
        <span className="title-twinkle title-twinkle-7" />
      </div>
      {/* Mercury, Venus, Earth and Mars, wheeling around the sun; the Moon
          (below) orbits Earth. Positions and lighting are driven each frame by
          startTitleSky (titleSky.ts) — the CSS only supplies each surface. */}
      <div
        ref={mercuryRef}
        className="title-planet title-mercury"
        aria-hidden="true"
      />
      <div
        ref={venusRef}
        className="title-planet title-venus"
        aria-hidden="true"
      />
      <div
        ref={earthRef}
        className="title-planet title-earth"
        aria-hidden="true"
      />
      <div
        ref={marsRef}
        className="title-planet title-mars"
        aria-hidden="true"
      />
      {/* Hidden developer gesture: hold the moon for MOON_HOLD_MS to reveal the
          DEVELOPER row in SETTINGS (see startMoonHold). aria-hidden stays — it
          is a secret, pointer-only Easter egg, not an announced control. The
          moon rides its orbit around Earth (titleSky.ts) but stays the trigger. */}
      <div
        ref={moonRef}
        className={`title-planet title-moon${moonCharging ? " charging" : ""}${
          moonExploding ? " exploding" : ""
        }`}
        aria-hidden="true"
        onPointerDown={startMoonHold}
        onPointerUp={cancelMoonHold}
        onPointerLeave={cancelMoonHold}
        onPointerCancel={cancelMoonHold}
        onContextMenu={(event) => event.preventDefault()}
      />
      {/* The detonation, drawn as a sibling of the moon (which clips to its own
          disc) so the flash, shockwave and debris can spill across the sky.
          Anchored over the moon and mounted only for the blast. */}
      {moonExploding && (
        <div className="moon-boom" aria-hidden="true">
          <span className="moon-boom-flash" />
          <span className="moon-boom-ring" />
          <span className="moon-boom-ring moon-boom-ring-2" />
          <span className="moon-boom-core" />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => (
            <span
              key={n}
              className="moon-boom-shard"
              style={{ "--shard": n } as CSSProperties}
            />
          ))}
        </div>
      )}
      {/* Easter egg sun: it sits still at the centre of the sky while the
          planets wheel around it. Driven by titleSky.ts; the CSS is just the
          look. */}
      <div ref={sunRef} className="title-sun" aria-hidden="true" />
      <div ref={glareRef} className="title-sun-glare" aria-hidden="true" />
    </>
  );
}
