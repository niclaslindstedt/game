// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PRESSURE FRONTS — what an explosion does to everything near it, and the
// chain a satellite caught in one starts.
//
// NOT ONE DRAW OF THE SKY'S OWN STREAM IS SPENT HERE, and the reason is the
// drive's: the field is laid down off `state.rng`, so a blast that rolled its
// scatter there would grow a different sky above the explosion than the same
// seed grows without one. Everything a blast varies — which way a bag is
// shoved, how a fireball looks — is derived from ids through `blastHash`, so
// the fireworks are lavish and the ledger is untouched.

import { FLIGHT } from "./config.ts";
import type { FlightState } from "./types.ts";

/** A cheap integer mixer — the blast system's whole source of variety. */
export function blastHash(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** …and the same mixer read as 0–1. */
export function blastRoll(n: number): number {
  return blastHash(n) / 0xffffffff;
}

/**
 * BOOK AN EXPLOSION. A zero fuse detonates now (the event goes out this tick);
 * a positive one is the chain's rhythm — the front exists, counting up from
 * below zero, and nothing happens until it crosses.
 */
export function detonate(
  state: FlightState,
  x: number,
  alt: number,
  size: "big" | "small",
  delayMs = 0,
): void {
  const id = state.nextId++;
  const seed = blastHash(state.params.seed ^ Math.imul(id, 0x9e3779b1));
  state.blasts.push({ id, x, alt, ms: -delayMs, size, seed, pushed: [] });
  if (delayMs <= 0)
    state.events.push({ type: "explosion", x, alt, size, seed });
}

/** The front's reach at this age — fast out of the gate, spent by `maxMs`. */
function reachPx(size: "big" | "small", ms: number): number {
  const cfg = FLIGHT.blast[size];
  const frac = Math.min(1, ms / cfg.maxMs);
  return cfg.pushR * (1 - (1 - frac) * (1 - frac));
}

/**
 * ONE TICK OF EVERY FRONT STILL TRAVELLING. Runs through the terminal beats
 * too — the chain a dying ship lit keeps going over the wreck hold, which is
 * most of what the hold is for looking at.
 */
export function stepBlasts(state: FlightState, dtMs: number): void {
  const { craft } = state;
  for (let i = state.blasts.length - 1; i >= 0; i--) {
    const b = state.blasts[i]!;
    const wasFuse = b.ms < 0;
    b.ms += dtMs;
    if (b.ms < 0) continue;
    if (wasFuse) {
      state.events.push({
        type: "explosion",
        x: b.x,
        alt: b.alt,
        size: b.size,
        seed: b.seed,
      });
    }
    const cfg = FLIGHT.blast[b.size];
    const radius = reachPx(b.size, b.ms);

    // ── THE FIELD ─────────────────────────────────────────────────────────
    for (let j = state.field.length - 1; j >= 0; j--) {
      const o = state.field[j]!;
      if (b.pushed.includes(o.id)) continue;
      const dx = o.x - b.x;
      const dy = o.alt - b.alt;
      const d = Math.hypot(dx, dy) || 1;
      if (d > radius) continue;
      b.pushed.push(o.id);
      if (d < cfg.coreR) {
        // Inside the core nothing survives: the piece comes apart where it
        // floats, and a satellite's tanks make it the next explosion — the
        // fuse is its distance, so the chain reads outward.
        state.strikes.push({
          kind: o.kind,
          variant: o.variant,
          x: o.x,
          alt: o.alt,
        });
        // Anything with tanks or batteries joins the chain — the company's
        // hardware, the military's, an airliner's kerosene, a drone's lithium.
        if (
          o.kind === "satellite" ||
          o.kind === "milsat" ||
          o.kind === "plane" ||
          o.kind === "drone"
        ) {
          detonate(
            state,
            o.x,
            o.alt,
            "small",
            d * FLIGHT.blast.chainDelayMsPerPx,
          );
        }
        state.field.splice(j, 1);
        continue;
      }
      // Outside the core the front just SHOVES — away, hard by closeness,
      // with a fresh tumble whose direction is the piece's own hash.
      const f = cfg.powerPx * (1 - d / cfg.pushR);
      o.vx += (dx / d) * f;
      o.vy += (dy / d) * f;
      o.spin += (blastRoll(o.id ^ b.id) - 0.5) * 4;
    }

    // ── THE SHIP, IF IT IS STILL ANYBODY'S ────────────────────────────────
    if (
      state.outcome === "flying" &&
      b.size === "small" &&
      !b.pushed.includes(-1)
    ) {
      const dx = craft.x - b.x;
      const dy = craft.alt - b.alt;
      const d = Math.hypot(dx, dy) || 1;
      if (d <= radius) {
        b.pushed.push(-1);
        const scale = 1 - d / cfg.pushR;
        craft.vx += (dx / d) * FLIGHT.blast.craftPushPx * scale;
        craft.tiltVel +=
          (dx >= 0 ? 1 : -1) * FLIGHT.blast.craftKickPerS * scale;
      }
    }

    if (b.ms > cfg.maxMs) state.blasts.splice(i, 1);
  }
}
