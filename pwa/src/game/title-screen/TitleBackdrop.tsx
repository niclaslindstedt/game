// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The title sky: the starfield, the drifting asteroids and twinkles, the
// solar-system Easter egg (planets wheeling around a static sun, driven each
// frame by title-sky.ts), and the SUN's detonation — the payoff of the hidden
// developer gesture (sixteen quick taps ARM the sun, the first ten of them in
// total silence, then a five-second CLICK RACE at tempo swells it until it lets
// go; the counting, the beat and the frame loop all live in use-sun-charge.ts /
// sun-race.ts, which also drop the whole gesture from a build with no developer
// tooling). Every layer is aria-hidden and nothing here is a pointer target:
// the gesture hit-tests the sun's rect instead, so a press on the menu above it
// is never swallowed.

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
import { playUiSound } from "../sfx/ui.ts";
import { startTitleSky } from "../title-sky.ts";
import { sunChargeIntensity, useSunCharge } from "./use-sun-charge.ts";

/** How long the sun's detonation plays before the developer unlock lands. Must
 * match the `.sun-boom` keyframe durations in styles.css. A short cut is used
 * instead under prefers-reduced-motion. */
const SUN_BOOM_MS = 1600;
const SUN_BOOM_MS_REDUCED = 250;

/** Fire tongues licking off the sun's limb while the gesture charges, and the
 * embers thrown off above them — enough to read as a star going wrong, few
 * enough to stay cheap on a phone. */
const SUN_FLAMES = 10;
const SUN_EMBERS = 8;

/** Debris flung out of the detonation. Twelve read as a ring; the supernova
 * wants a sky full of it. */
const SUN_SHARDS = 18;

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
  armed,
  onCharged,
  detonate,
  onDetonated,
}: {
  /** Watch for the hidden gesture at all: false once the DEVELOPER menu is
   * unlocked, so the secret is spent rather than replayable. A build without
   * the developer tooling ignores it and never watches. */
  armed: boolean;
  /** The click race was held to the top — TitleScreen flips `detonate`. */
  onCharged: () => void;
  /** Blow the sun up. Flipped by TitleScreen, which latches the unlock when the
   * blast reports back. */
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

  // The hidden developer gesture: sixteen quick taps ARM the sun — the first
  // ten of them buying nothing at all — then the click race swells it. The
  // charge drives the build-up below; the race writes its own two ramps
  // (`--sun-race`, `--sun-tempo`) straight onto the sun and the glare each
  // frame, which is why neither is a prop here — they move sixty
  // times a second and must not re-render the ten flames and eight embers to do
  // it. Holding the race to the top reports up to TitleScreen, which flips
  // `detonate`.
  const { charge, lit, racing } = useSunCharge({
    sunRef,
    glareRef,
    armed: armed && !detonate,
    onCharged,
  });
  const chargeStyle = {
    "--sun-charge": sunChargeIntensity(charge),
  } as CSSProperties;

  // The developer gesture landed (`detonate`): the blast is drawn straight off
  // the prop — this effect only fires its bang and reports back when the
  // animation has played out, so TitleScreen can latch the unlock and drop the
  // prop again. Nothing navigates: the DEVELOPER row simply appears in SETTINGS
  // for the player to discover. The timer is dropped if the menu unmounts
  // mid-blast.
  useEffect(() => {
    if (!detonate) return;
    playUiSound(synth, "boom");
    // The star tears itself apart: a long, rolling rumble under the flash —
    // every pulse past the native bridge's Heavy-impact threshold.
    haptics.vibrate([40, 50, 120, 60, 220]);
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      onDetonated,
      reduce ? SUN_BOOM_MS_REDUCED : SUN_BOOM_MS,
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
      {/* The moon, riding its orbit around Earth (title-sky.ts). */}
      <div
        ref={moonRef}
        className="title-planet title-moon"
        aria-hidden="true"
      />
      {/* Easter egg sun: it sits still at the centre of the sky while the
          planets wheel around it. Driven by title-sky.ts; the CSS is just the
          look. It is also the hidden developer gesture's target — `--sun-charge`
          (0..1) winds its glare, its fire and its shaking up tap by tap from the
          eleventh on, and the sixteenth tap arms the CLICK RACE, whose
          `--sun-race` swells the disc
          while the beat is kept (and shrinks it half again as fast when it is
          dropped) until the star lets go. */}
      <div
        ref={sunRef}
        className={`title-sun${lit ? " charging" : ""}${racing ? " racing" : ""}${detonate ? " exploding" : ""}`}
        style={chargeStyle}
        aria-hidden="true"
      >
        {/* The build-up, mounted only once a tap has actually woken the star
            (and through its ebb) — the silent ten mount nothing at all. Every
            layer's opacity ramps off --sun-charge with its own threshold, so
            the eleventh tap is a breath of extra glare and the fire only starts
            licking from the twelfth. */}
        {lit && (
          <>
            <span className="title-sun-flares" />
            <span className="title-sun-fire">
              {Array.from({ length: SUN_FLAMES }, (_, n) => (
                <span
                  key={n}
                  className="title-sun-flame"
                  style={{ "--flame": n } as CSSProperties}
                />
              ))}
            </span>
            <span className="title-sun-embers">
              {Array.from({ length: SUN_EMBERS }, (_, n) => (
                <span
                  key={n}
                  className="title-sun-ember"
                  style={{ "--ember": n } as CSSProperties}
                />
              ))}
            </span>
          </>
        )}
      </div>
      {/* The detonation, drawn as a sibling of the sun (which the flare layers
          ride inside) so the flash, shockwave and debris can spill across the
          whole sky. Anchored on the sun's seat and mounted only for the blast. */}
      {detonate && (
        <div className="sun-boom" aria-hidden="true">
          <span className="sun-boom-flash" />
          <span className="sun-boom-ring" />
          <span className="sun-boom-ring sun-boom-ring-2" />
          <span className="sun-boom-ring sun-boom-ring-3" />
          <span className="sun-boom-core" />
          <span className="sun-boom-spikes" />
          {Array.from({ length: SUN_SHARDS }, (_, n) => (
            <span
              key={n}
              className="sun-boom-shard"
              style={{ "--shard": n } as CSSProperties}
            />
          ))}
        </div>
      )}
      {/* The white-out: the blast floods the whole screen for a beat, so the
          menu itself is swallowed by the light rather than sitting over it. */}
      {detonate && <div className="sun-boom-whiteout" aria-hidden="true" />}
      <div
        ref={glareRef}
        className={`title-sun-glare${lit ? " charging" : ""}${racing ? " racing" : ""}${detonate ? " exploding" : ""}`}
        style={chargeStyle}
        aria-hidden="true"
      />
    </>
  );
}
