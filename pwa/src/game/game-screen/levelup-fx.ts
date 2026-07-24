// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The LEVEL-UP light explosion's screen-space spectacle: the blinding white
// flash, the expanding holy-gold light bloom, the radiant god-rays, a pillar of
// light punching to the heavens off the hero, and a shower of rising gold
// sparkle motes — the "explosion of light the ding rises out of" that a flat
// canvas ring can't sell. Mirrors the screen-nuke (createNukeFx): the
// world-anchored blast (flash disc, shockwave rings, sparkle-stars) stays on the
// canvas (render/effects.ts "levelup") so both read as one detonation as the
// camera pans; this is the full-screen light on top. Driven imperatively from
// the sim loop's event pass (never through React), mirroring createNukeFx.

import type { RefObject } from "react";

export type LevelUpFx = {
  /** Detonate the full-screen light burst, centred on a client point (hero). */
  fire: (clientX: number, clientY: number) => void;
  /** Clear pending removal timers (run teardown). */
  dispose: () => void;
};

// The burst's total on-screen life — the pillar and the last motes are the
// slowest to clear, so the node is pulled once they've faded.
const LEVELUP_LIFE_MS = 1500;
// Rising gold sparkle motes lofted off ground zero.
const SPARKLES = 16;

/**
 * LEVEL-UP light-burst factory: appends a full-screen, multi-layer CSS burst to
 * the FX layer at the hero's screen point and self-removes when the light
 * clears. Holy-gold and white (the ding's triumph), where the nuke is fire —
 * brighter, cleaner, divine. Cosmetic-only, so a plain Math.random spread (like
 * the nuke's fire/smoke) gives the sparkles natural variety.
 */
export function createLevelUpFx(
  levelUpFxRef: RefObject<HTMLDivElement | null>,
): LevelUpFx {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const fire = (clientX: number, clientY: number) => {
    const layer = levelUpFxRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const burst = document.createElement("div");
    burst.className = "levelup-burst";
    // Ground zero, in the layer's own px — every layer's radial gradient and
    // transform-origin reads these so the whole burst pins to the hero.
    burst.style.setProperty("--lx", `${clientX - rect.left}px`);
    burst.style.setProperty("--ly", `${clientY - rect.top}px`);

    const el = (cls: string) => {
      const node = document.createElement("div");
      node.className = cls;
      return node;
    };
    // Paint order = back to front: the warm color grade, the expanding light
    // bloom, the rotating god-rays, then the rising pillar of light.
    burst.append(
      el("levelup-grade"),
      el("levelup-light"),
      el("levelup-rays"),
      el("levelup-pillar"),
    );
    // Rising gold sparkles: bright motes lofted off ground zero, spread across
    // the core and staggered so the shower shimmers instead of pulsing.
    for (let i = 0; i < SPARKLES; i++) {
      const mote = el("levelup-mote");
      const spread = (i / (SPARKLES - 1) - 0.5) * 220; // px across the core
      const size = 4 + Math.random() * 6;
      mote.style.setProperty(
        "--mx",
        `${spread + (Math.random() - 0.5) * 40}px`,
      );
      mote.style.setProperty("--mrise", `${120 + Math.random() * 150}px`);
      mote.style.setProperty("--msize", `${size}px`);
      mote.style.animationDelay = `${Math.random() * 260}ms`;
      burst.appendChild(mote);
    }
    // The blinding flash goes on top of everything so it whites the whole
    // detonation out for the opening beat.
    burst.append(el("levelup-flash"));
    layer.appendChild(burst);

    const done = setTimeout(() => {
      timers.delete(done);
      burst.remove();
    }, LEVELUP_LIFE_MS);
    timers.add(done);
  };
  return { fire, dispose: () => timers.forEach(clearTimeout) };
}
