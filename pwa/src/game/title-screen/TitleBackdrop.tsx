// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The title sky: the starfield, the drifting asteroids and twinkles, the
// solar-system Easter egg (planets wheeling around a static sun, driven each
// frame by title-sky.ts), and the moon's detonation — the payoff of the hidden
// developer gesture (a long hold on the main menu's ACHIEVEMENTS row; the hold
// itself lives in MenuList / menus-main.ts). Purely decorative: every layer is
// aria-hidden and nothing here is a pointer target.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
} from "react";

import { synth } from "../audio.ts";
import { haptics } from "../haptics.ts";
import { playUiSound } from "../sfx/index.ts";
import { startTitleSky } from "../title-sky.ts";

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
  detonate,
  onDetonated,
}: {
  /** The hidden developer gesture completed: blow the moon up. Flipped by
   * TitleScreen, which latches the unlock when the blast reports back. */
  detonate: boolean;
  /** The detonation has played out — TitleScreen latches `developerUnlocked`
   * and rebuilds the menu, so SETTINGS picks up the DEVELOPER row even if it
   * happens to be open already. */
  onDetonated: () => void;
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

  // The developer gesture landed (`detonate`): the blast is drawn straight off
  // the prop — this effect only fires its bang and reports back when the
  // animation has played out, so TitleScreen can latch the unlock and drop the
  // prop again. Nothing navigates: the DEVELOPER row simply appears in SETTINGS
  // for the player to discover. The timer is dropped if the menu unmounts
  // mid-blast.
  useEffect(() => {
    if (!detonate) return;
    playUiSound(synth, "boom");
    haptics.vibrate([30, 40, 90]);
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      onDetonated,
      reduce ? MOON_BOOM_MS_REDUCED : MOON_BOOM_MS,
    );
    return () => window.clearTimeout(timer);
  }, [detonate, onDetonated]);

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
          startTitleSky (title-sky.ts) — the CSS only supplies each surface. */}
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
      {/* The moon, riding its orbit around Earth (title-sky.ts). It detonates as
          the payoff of the hidden developer gesture — the long hold lives on the
          main menu's ACHIEVEMENTS row, so the moon itself is not a target. */}
      <div
        ref={moonRef}
        className={`title-planet title-moon${detonate ? " exploding" : ""}`}
        aria-hidden="true"
      />
      {/* The detonation, drawn as a sibling of the moon (which clips to its own
          disc) so the flash, shockwave and debris can spill across the sky.
          Anchored over the moon and mounted only for the blast. */}
      {detonate && (
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
          planets wheel around it. Driven by title-sky.ts; the CSS is just the
          look. */}
      <div ref={sunRef} className="title-sun" aria-hidden="true" />
      <div ref={glareRef} className="title-sun-glare" aria-hidden="true" />
    </>
  );
}
