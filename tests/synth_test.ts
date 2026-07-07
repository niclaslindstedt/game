// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WebAudio synth (@ui/lib/synth.ts). It reaches for `AudioContext`, so
// these tests stub a minimal fake on the global and assert the one behavior
// that decides whether the intro theme starts reliably: the context is
// created ONLY from a user gesture (unlock), never as a side effect of
// reading the clock (now). A context built outside a gesture lands in a
// state iOS Safari won't resume, which is exactly how the title tune goes
// silent at app start.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSynth } from "@ui/lib/synth.ts";

type FakeState = "suspended" | "running" | "closed";

class FakeAudioContext {
  static created = 0;
  state: FakeState = "suspended";
  currentTime = 0;
  constructor() {
    FakeAudioContext.created++;
  }
  resume(): Promise<void> {
    this.state = "running";
    this.currentTime = 1.5;
    return Promise.resolve();
  }
  // The synth wires up a couple of listeners on construction; accept them.
  addEventListener(): void {}
}

const g = globalThis as Record<string, unknown>;
const hadDocument = "document" in g;
const hadWindow = "window" in g;

beforeEach(() => {
  FakeAudioContext.created = 0;
  g.AudioContext = FakeAudioContext;
  // ensure()'s foreground-resume wiring touches document/window.
  if (!hadDocument) {
    g.document = { visibilityState: "visible", addEventListener() {} };
  }
  if (!hadWindow) g.window = { addEventListener() {} };
});

afterEach(() => {
  delete g.AudioContext;
  if (!hadDocument) delete g.document;
  if (!hadWindow) delete g.window;
});

describe("audio context lifecycle", () => {
  it("does not construct the context just to read the clock", () => {
    const synth = createSynth();
    expect(synth.now()).toBeNull();
    expect(FakeAudioContext.created).toBe(0);
  });

  it("constructs and resumes the context on unlock (the user gesture)", () => {
    const synth = createSynth();
    synth.unlock();
    expect(FakeAudioContext.created).toBe(1);
    // Resumed to running, so the clock now reports a time the sequencer can
    // schedule against.
    expect(synth.now()).toBeCloseTo(1.5, 6);
  });

  it("reuses the one context across unlock and now", () => {
    const synth = createSynth();
    synth.unlock();
    synth.now();
    synth.unlock();
    expect(FakeAudioContext.created).toBe(1);
  });
});
