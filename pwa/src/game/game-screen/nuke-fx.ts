// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The screen-clearing NUKE's screen-space spectacle: the blinding double-flash,
// the expanding light bloom + god-rays, the white-hot fireball cooling through
// orange to red, the licking flames, and the billowing smoke the crater settles
// under — the "lights, fire, smoke" a flat canvas ring can't sell. A rare
// panic-button detonation earns a full-screen, layered CSS burst; the
// world-anchored shockwave rings + embers + scorch stay on the canvas
// (render/effects.ts) so the two read as one blast. Driven imperatively from the
// sim loop's event pass (never through React), mirroring createTapFx.

import type { RefObject } from "react";

export type NukeFx = {
  /** Detonate the full-screen burst, centred on a client point (the hero). */
  fire: (clientX: number, clientY: number) => void;
  /** Clear pending removal timers (run teardown). */
  dispose: () => void;
};

// The burst's total on-screen life — the smoke is the last thing to clear, so
// the node is pulled once it has rolled away.
const NUKE_LIFE_MS = 1700;
// Licking flames off ground zero, and the billowing smoke puffs above them.
const FLAMES = 9;
const PUFFS = 10;

/**
 * NUKE detonation factory: appends a full-screen, multi-layer CSS burst to the
 * FX layer at the blast's screen point and self-removes when the smoke clears.
 * The atmosphere (flash / light / fire / smoke) is screen-space here; the
 * blast's world-anchored rings + embers ride the canvas so both track the same
 * ground zero as the camera pans. Cosmetic-only, so a plain Math.random spread
 * (like event-fx's gore seeds) gives the fire and smoke natural variety.
 */
export function createNukeFx(
  nukeFxRef: RefObject<HTMLDivElement | null>,
): NukeFx {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const fire = (clientX: number, clientY: number) => {
    const layer = nukeFxRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const burst = document.createElement("div");
    burst.className = "nuke-burst";
    // Ground zero, in the layer's own px — every layer's radial gradient and
    // transform-origin reads these so the whole blast pins to the hero.
    burst.style.setProperty("--nx", `${clientX - rect.left}px`);
    burst.style.setProperty("--ny", `${clientY - rect.top}px`);

    const el = (cls: string) => {
      const node = document.createElement("div");
      node.className = cls;
      return node;
    };
    // Paint order = back to front: the hot color grade, the expanding light
    // bloom, the rotating god-rays, then the cooling fireball.
    burst.append(
      el("nuke-grade"),
      el("nuke-light"),
      el("nuke-rays"),
      el("nuke-fireball"),
    );
    // Licking flames: teardrops that rise and flicker off ground zero, spread
    // across the blast and staggered so the fire dances instead of pulsing.
    for (let i = 0; i < FLAMES; i++) {
      const flame = el("nuke-flame");
      const spread = (i / (FLAMES - 1) - 0.5) * 120; // px across the core
      const size = 34 + Math.random() * 30;
      flame.style.setProperty("--fx", `${spread}px`);
      flame.style.setProperty("--fsize", `${size}px`);
      flame.style.animationDelay = `${Math.random() * 130}ms`;
      burst.appendChild(flame);
    }
    // Billowing smoke: grey puffs that roll up and out, expanding and thinning
    // — drawn over the flames so the fire disappears into its own smoke. They
    // start on a ring around ground zero (not plugged at the centre) and only
    // after the fireball has flared, so the bright core stays clean.
    for (let i = 0; i < PUFFS; i++) {
      const puff = el("nuke-puff");
      const ang = (i / PUFFS) * Math.PI * 2 + Math.random();
      const dist = 55 + Math.random() * 95;
      puff.style.setProperty("--pdx", `${Math.cos(ang) * dist}px`);
      puff.style.setProperty("--pdy", `${Math.sin(ang) * dist * 0.6 - 74}px`);
      puff.style.setProperty("--psize", `${70 + Math.random() * 70}px`);
      puff.style.animationDelay = `${220 + Math.random() * 420}ms`;
      burst.appendChild(puff);
    }
    // The blinding flash goes on top of everything so it whites the whole
    // detonation out for the opening beat.
    burst.append(el("nuke-flash"));
    layer.appendChild(burst);

    const done = setTimeout(() => {
      timers.delete(done);
      burst.remove();
    }, NUKE_LIFE_MS);
    timers.add(done);
  };
  return { fire, dispose: () => timers.forEach(clearTimeout) };
}
