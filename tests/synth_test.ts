// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WebAudio synth (@ui/lib/synth.ts). It reaches for `AudioContext`, so
// these tests stub fakes on the global and assert two behaviors:
//
// 1. The context is created ONLY from a user gesture (unlock), never as a
//    side effect of reading the clock (now). A context built outside a
//    gesture lands in a state iOS Safari won't resume, which is exactly how
//    the title tune goes silent at app start.
// 2. Every voice reaches the destination through the one master limiter.
//    Combat overlaps many voices at once; anything wired straight to the
//    destination sums past full scale and hard-clips.

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

// A fake AudioContext that records the node graph, so tests can assert how
// voices are routed. Params are plain value/ramp stubs; connect() tracks
// edges by pushing the source onto the target's `inputs`.
const fakeParam = (): Record<string, unknown> => ({
  value: 0,
  setValueAtTime() {},
  exponentialRampToValueAtTime() {},
  linearRampToValueAtTime() {},
});

type FakeNode = {
  kind: string;
  inputs: FakeNode[];
  connect: (target: FakeNode) => void;
  [key: string]: unknown;
};

class GraphAudioContext {
  static last: GraphAudioContext | null = null;
  state: FakeState = "suspended";
  currentTime = 0;
  sampleRate = 48000;
  destination = this.node("destination");
  compressors: FakeNode[] = [];

  constructor() {
    GraphAudioContext.last = this;
  }

  resume(): Promise<void> {
    this.state = "running";
    this.currentTime = 1;
    return Promise.resolve();
  }
  addEventListener(): void {}

  private node(kind: string, extra: Record<string, unknown> = {}): FakeNode {
    const created: FakeNode = {
      kind,
      inputs: [],
      connect(target: FakeNode) {
        target.inputs.push(created);
      },
      start() {},
      stop() {},
      ...extra,
    };
    return created;
  }

  createGain(): FakeNode {
    return this.node("gain", { gain: fakeParam() });
  }
  createOscillator(): FakeNode {
    return this.node("oscillator", {
      type: "sine",
      detune: fakeParam(),
      frequency: fakeParam(),
    });
  }
  createBiquadFilter(): FakeNode {
    return this.node("filter", {
      type: "lowpass",
      frequency: fakeParam(),
      Q: fakeParam(),
    });
  }
  createDynamicsCompressor(): FakeNode {
    const compressor = this.node("compressor", {
      threshold: fakeParam(),
      knee: fakeParam(),
      ratio: fakeParam(),
      attack: fakeParam(),
      release: fakeParam(),
    });
    this.compressors.push(compressor);
    return compressor;
  }
  createStereoPanner(): FakeNode {
    return this.node("panner", { pan: fakeParam() });
  }
  createDelay(): FakeNode {
    return this.node("delay", { delayTime: fakeParam() });
  }
  createBuffer(_channels: number, length: number): Record<string, unknown> {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource(): FakeNode {
    return this.node("bufferSource", { buffer: null });
  }
}

/** The context the synth under test actually constructed. */
const getGraphContext = (): GraphAudioContext => {
  const ctx = GraphAudioContext.last;
  if (!ctx) throw new Error("no GraphAudioContext was created");
  return ctx;
};

const g = globalThis as Record<string, unknown>;
const hadDocument = "document" in g;
const hadWindow = "window" in g;

beforeEach(() => {
  FakeAudioContext.created = 0;
  GraphAudioContext.last = null;
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

describe("master limiter", () => {
  it("routes every voice through one shared limiter, never straight to the destination", () => {
    g.AudioContext = GraphAudioContext;
    const synth = createSynth();
    synth.unlock();
    const ctx = getGraphContext();

    // Overlap the combat shapes: plain tones, a panned tone, an echoed tone,
    // and both flavors of noise — the mix that clips without a limiter.
    synth.tone({ from: 880, to: 220, durationMs: 55, volume: 0.03 });
    synth.tone({ from: 150, to: 55, durationMs: 200, detuneCents: 12 });
    synth.tone({ from: 620, durationMs: 80, pan: 0.4, echo: 0.25 });
    synth.noise({
      durationMs: 30,
      filter: { type: "highpass", frequency: 2500 },
    });
    synth.noise({ durationMs: 90, echo: 0.3 });

    // The destination hears exactly one node: the limiter.
    expect(ctx.compressors).toHaveLength(1);
    expect(new Set(ctx.destination.inputs)).toEqual(new Set(ctx.compressors));

    // And the limiter heard all five voices plus the echo bus's damp filter.
    const limiter = ctx.compressors[0];
    if (!limiter) throw new Error("no limiter created");
    expect(limiter.inputs.length).toBe(6);
  });

  it("caps the summed signal above any single voice's peak (limiter, not compressor-on-everything)", () => {
    g.AudioContext = GraphAudioContext;
    const synth = createSynth();
    synth.unlock();
    synth.tone({ from: 440, durationMs: 50 });
    const limiter = getGraphContext().compressors[0];
    if (!limiter) throw new Error("no limiter created");
    const threshold = (limiter.threshold as { value: number }).value;
    // Single sounds peak around 0.12 ≈ −18 dBFS; the threshold must sit above
    // that so isolated sounds pass untouched, and below 0 so stacks can't clip.
    expect(threshold).toBeGreaterThan(-18);
    expect(threshold).toBeLessThan(0);
  });
});
