// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ELITE TIER's screen-space half — one short coloured wash, in the caster's
// own colours, when a WARD SHIELD breaks.
//
// WHY THERE IS SO LITTLE HERE, since the obvious question about a set of
// effects meant to look magical is "why isn't more of this in CSS". Two
// answers, and the second is the one that decided it:
//
//   • MOST OF IT CANNOT BE. Every other elite effect is anchored to a WORLD
//     position — a ring around a walking body, a tether between two moving
//     things, a fissure on one square of floor. CSS is screen-space, so any of
//     those in a DOM node would have to be re-projected through render/tilt.ts
//     every frame and would still lose to the actors walking in front of it.
//     They live on the canvas (render/elite-fx.ts), where "magical" is earned
//     with baked light that the BLOOM pass then picks up for free.
//   • THE REST SHOULD NOT BE. The NUKE can afford a nine-layer full-screen
//     burst because a player detonates one perhaps twice in a run. There are
//     27 elites and each casts every few seconds, so a screen wash per cast is
//     not spectacle, it is a strobe — and on a phone it is a DOM node with an
//     animated gradient being built and torn down several times a second.
//
// So the budget is spent on the ONE moment that is worth a whole screen: the
// shell the player has been hammering finally going. That is the feedback the
// move rests on — they have to learn that hitting it harder was working — and
// it is rare enough that a flash still means something when it happens.
//
// Driven imperatively from the sim loop's event pass (never through React),
// mirroring `createNukeFx` and `createTapFx`.

import type { RefObject } from "react";

import type { AbilityLook } from "@game/core";

import { DEFAULT_ELITE_LOOK } from "../render/elite-fx.ts";

export type EliteFx = {
  /** Wash the screen in a caster's colours — a ward going. */
  flash: (look?: AbilityLook) => void;
  /** Clear pending removal timers (run teardown). */
  dispose: () => void;
};

/** How long the wash lives. Short on purpose: it is a punctuation mark on a
 * fight that is still going, not an event the player should wait out. */
const FLASH_MS = 420;

/**
 * WARD-BREAK factory: appends a single full-screen wash to the FX layer in the
 * breaking shell's own colours and self-removes when it clears.
 *
 * The colour travels from the ENGINE on the event rather than being looked up
 * here, for the reason the canvas half does the same: by the time a shell
 * breaks, the thing that raised it is frequently one blow from dead, and an
 * effect that lost its colours the moment its caster did is the bug that field
 * exists to prevent.
 */
export function createEliteFx(layerRef: RefObject<HTMLDivElement>): EliteFx {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const flash = (look?: AbilityLook) => {
    const layer = layerRef.current;
    if (!layer) return;
    const kit = look ?? DEFAULT_ELITE_LOOK;
    const wash = document.createElement("div");
    wash.className = "elite-ward-break";
    // The kit's two bright stops drive the whole wash through custom
    // properties, so the animation itself is authored once in styles.css and
    // every caster's break wears its own colour without a rule apiece.
    wash.style.setProperty("--elite-core", `rgba(${kit.core}, 1)`);
    wash.style.setProperty("--elite-hot", `rgba(${kit.hot}, 1)`);
    layer.appendChild(wash);
    const timer = setTimeout(() => {
      wash.remove();
      timers.delete(timer);
    }, FLASH_MS);
    timers.add(timer);
  };
  const dispose = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  return { flash, dispose };
}
