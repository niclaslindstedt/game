// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The BOT VIEW thought resolver: a raw per-tick decision label folded into the
// stable, overarching thought the overlay draws. Pure (memory + a clock), so
// these drive it directly with label sequences and a synthetic 16 ms tick.
import { describe, expect, it } from "vitest";

import {
  createThoughtMemory,
  resolveThought,
} from "../../src/game/bot-thoughts.ts";
import type { ThoughtMemory } from "../../src/game/bot-thoughts.ts";

const DT = 16;

/** Feed a label sequence through one memory at a fixed tick, returning the
 * displayed thought after each step. */
function drive(
  mem: ThoughtMemory,
  labels: string[],
  startMs = 0,
): { shown: string[]; nextMs: number } {
  let t = startMs;
  const shown: string[] = [];
  for (const label of labels) {
    shown.push(resolveThought(mem, label, t));
    t += DT;
  }
  return { shown, nextMs: t };
}

const repeat = (label: string, n: number): string[] =>
  Array.from({ length: n }, () => label);

describe("bot thought resolver", () => {
  it("shows a single decision verbatim on the first tick (identity)", () => {
    // Backward-compat guarantee: a fresh bot's very first tick displays exactly
    // the raw label — the reflex tests in bot_test.ts assert on this.
    for (const label of ["HAY", "STORM", "EXPLORE FOG", "GET REPAIR", "IDLE"]) {
      const mem = createThoughtMemory();
      expect(resolveThought(mem, label, 0)).toBe(label);
    }
  });

  it("merges an alternating KITE / GIVE GROUND strafe into SKIRMISH", () => {
    const mem = createThoughtMemory();
    const seq: string[] = [];
    for (let i = 0; i < 12; i++) seq.push(i % 2 === 0 ? "KITE" : "GIVE GROUND");
    const { shown } = drive(mem, seq);
    // Once both faces are genuinely present in the window it reads as one thought
    // and stays there instead of flickering between the two.
    expect(shown.at(-1)).toBe("SKIRMISH");
    expect(shown.slice(-4)).toEqual([
      "SKIRMISH",
      "SKIRMISH",
      "SKIRMISH",
      "SKIRMISH",
    ]);
  });

  it("keeps a one-sided skirmish as its own label (no spurious merge)", () => {
    expect(drive(createThoughtMemory(), repeat("KITE", 10)).shown.at(-1)).toBe(
      "KITE",
    );
    expect(
      drive(createThoughtMemory(), repeat("GIVE GROUND", 10)).shown.at(-1),
    ).toBe("GIVE GROUND");
    expect(
      drive(createThoughtMemory(), repeat("ADVANCE", 10)).shown.at(-1),
    ).toBe("ADVANCE");
  });

  it("preempts the combat read with a reflex, then reverts after the latch", () => {
    const mem = createThoughtMemory();
    const warmup = drive(mem, repeat("KITE", 10));
    expect(warmup.shown.at(-1)).toBe("KITE");
    // A meteor dodge fires — shown at once even though it's a single tick.
    const meteor = resolveThought(mem, "METEOR", warmup.nextMs);
    expect(meteor).toBe("METEOR");
    // It latches over the next few kite ticks so the reflex stays legible…
    const held = resolveThought(mem, "KITE", warmup.nextMs + DT);
    expect(held).toBe("METEOR");
    // …then, once the fight has resumed for long enough, the display comes back.
    const after = drive(mem, repeat("KITE", 40), warmup.nextMs + 2 * DT);
    expect(after.shown.at(-1)).toBe("KITE");
  });

  it("a higher-ranked reflex overrides one already latched", () => {
    const mem = createThoughtMemory();
    // UNSTICK (rank 95) is latched, then a DODGE (rank 100) fires the next tick.
    resolveThought(mem, "UNSTICK", 0);
    expect(resolveThought(mem, "DODGE", DT)).toBe("DODGE");
  });

  it("holds a sustained emergency for the whole bail", () => {
    // FALL BACK re-fires each tick it persists, so the latch keeps it shown
    // rather than letting the crowded field's skirmish flicker back in.
    const mem = createThoughtMemory();
    const { shown } = drive(mem, repeat("FALL BACK", 20));
    expect(new Set(shown)).toEqual(new Set(["FALL BACK"]));
  });

  it("ignores a brief minority thought (dominance holds the display)", () => {
    const mem = createThoughtMemory();
    drive(mem, repeat("EXPLORE FOG", 10));
    // A single stray SEEK CHEST tick can't unseat the dominant travel thought.
    const stray = resolveThought(mem, "SEEK CHEST", 10 * DT);
    expect(stray).toBe("EXPLORE FOG");
  });

  it("switches once a new state thought genuinely takes over", () => {
    const mem = createThoughtMemory();
    drive(mem, repeat("EXPLORE FOG", 6));
    // Sustained SEEK CHEST eventually dominates the window and, past the dwell,
    // takes the display.
    const { shown } = drive(mem, repeat("SEEK CHEST", 30), 6 * DT);
    expect(shown.at(-1)).toBe("SEEK CHEST");
  });

  it("renders each macro-travel goal as its own label (no cross-merge)", () => {
    for (const label of [
      "CLEAR SPAWNER",
      "SEEK CHEST",
      "EXPLORE FOG",
      "TO BOSS",
    ]) {
      expect(drive(createThoughtMemory(), repeat(label, 8)).shown.at(-1)).toBe(
        label,
      );
    }
  });

  it("is deterministic: same sequence, same evolution", () => {
    const seq: string[] = [];
    for (let i = 0; i < 30; i++) {
      seq.push(i % 3 === 0 ? "GIVE GROUND" : i % 3 === 1 ? "KITE" : "ADVANCE");
    }
    const a = drive(createThoughtMemory(), seq);
    const b = drive(createThoughtMemory(), seq);
    expect(a.shown).toEqual(b.shown);
  });

  it("passes an unknown label through so a new branch still renders", () => {
    // A label with no taxonomy entry falls back to a lone state family — shown
    // plainly, just without preempt/merge.
    expect(
      drive(createThoughtMemory(), repeat("NEW BRANCH", 5)).shown.at(-1),
    ).toBe("NEW BRANCH");
  });
});
