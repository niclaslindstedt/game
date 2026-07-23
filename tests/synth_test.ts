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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSynth } from "@ui/lib/synth.ts";

type FakeState = "suspended" | "running" | "closed";

class FakeAudioContext {
  static created = 0;
  static last: FakeAudioContext | null = null;
  state: FakeState = "suspended";
  currentTime = 0;
  constructor() {
    FakeAudioContext.created++;
    FakeAudioContext.last = this;
  }
  resume(): Promise<void> {
    this.state = "running";
    this.currentTime = 1.5;
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    return Promise.resolve();
  }
  // The synth wires up a couple of listeners on construction; accept them.
  addEventListener(): void {}
}

// An iOS-shaped zombie: reports "running" while its clock sits frozen —
// exactly the state resume() can't touch. The clock never moves on its own;
// tests hand-crank `currentTime` to play a context that healed.
class ZombieAudioContext {
  static created = 0;
  static last: ZombieAudioContext | null = null;
  state: FakeState = "suspended";
  currentTime = 0;
  suspends = 0;
  resumes = 0;
  closed = false;
  constructor() {
    ZombieAudioContext.created++;
    ZombieAudioContext.last = this;
  }
  resume(): Promise<void> {
    this.state = "running";
    this.resumes++;
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    this.suspends++;
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = "closed";
    this.closed = true;
    return Promise.resolve();
  }
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

// Captured listeners the synth wires onto document/window in ensure(), keyed
// by event type, so tests can fire a foreground/gesture event by hand.
let docListeners: Record<string, Array<() => void>> = {};
let winListeners: Record<string, Array<() => void>> = {};
const recordOn =
  (store: Record<string, Array<() => void>>) =>
  (type: string, fn: () => void): void => {
    (store[type] ??= []).push(fn);
  };
const fire = (store: Record<string, Array<() => void>>, type: string): void => {
  for (const fn of store[type] ?? []) fn();
};

beforeEach(() => {
  FakeAudioContext.created = 0;
  FakeAudioContext.last = null;
  GraphAudioContext.last = null;
  g.AudioContext = FakeAudioContext;
  docListeners = {};
  winListeners = {};
  // ensure()'s foreground-resume wiring touches document/window.
  if (!hadDocument) {
    g.document = {
      visibilityState: "visible",
      addEventListener: recordOn(docListeners),
    };
  }
  if (!hadWindow) g.window = { addEventListener: recordOn(winListeners) };
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

  it("re-resumes an interrupted context on the next global gesture, off the pause menu", () => {
    const synth = createSynth();
    synth.unlock();
    const ctx = FakeAudioContext.last;
    if (!ctx) throw new Error("no context created");
    expect(ctx.state).toBe("running");

    // iOS app-switch: the context falls out of "running" and no user gesture
    // is guaranteed. A non-running context stops the clock and drops voices.
    ctx.state = "suspended";
    expect(synth.now()).toBeNull();

    // A tap ANYWHERE — not the canvas, not the pause overlay — must revive it,
    // so audio recovers even when the app-switch happened in a phase that shows
    // no tap-to-resume prompt. Both touch gestures are wired.
    fire(docListeners, "pointerdown");
    expect(ctx.state).toBe("running");

    ctx.state = "suspended";
    fire(docListeners, "touchend");
    expect(ctx.state).toBe("running");

    // No extra context was constructed — recovery only ever resumes the one.
    expect(FakeAudioContext.created).toBe(1);
  });
});

describe("zombie context recovery", () => {
  // The iOS PWA failure the state-based recovery can't reach: after an app
  // switch the context claims "running" but its clock (and output) are dead,
  // so every resume() no-ops and the sound stays gone until a second
  // app-switch happens to force a real interruption cycle. The synth must
  // detect the frozen clock itself and escalate: suspend→resume first, a
  // full context rebuild on the next touch if that fails.
  beforeEach(() => {
    vi.useFakeTimers();
    ZombieAudioContext.created = 0;
    ZombieAudioContext.last = null;
    g.AudioContext = ZombieAudioContext;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Unlock into a context that claims "running" with a frozen clock. */
  const unlockZombie = () => {
    const synth = createSynth();
    synth.unlock();
    const ctx = ZombieAudioContext.last;
    if (!ctx) throw new Error("no context created");
    expect(ctx.state).toBe("running");
    return { synth, ctx };
  };

  it("leaves a context alone while its clock is advancing", async () => {
    const { ctx } = unlockZombie();
    fire(docListeners, "visibilitychange");
    ctx.currentTime += 0.35; // a live clock moves during the probe window
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.suspends).toBe(0);
    expect(ZombieAudioContext.created).toBe(1);
  });

  it("heals a running-but-frozen context with a suspend→resume cycle, no gesture needed", async () => {
    const { ctx } = unlockZombie();
    const resumesBefore = ctx.resumes;

    // Foreground return: state says running, clock says dead.
    fire(docListeners, "visibilitychange");
    await vi.advanceTimersByTimeAsync(400);

    // The probe caught the frozen clock and cycled the audio session.
    expect(ctx.suspends).toBe(1);
    expect(ctx.resumes).toBeGreaterThan(resumesBefore);
    expect(ctx.state).toBe("running");

    // The cycle worked: the clock ticks again, so the follow-up probe stands
    // down without flagging a rebuild.
    ctx.currentTime += 0.35;
    await vi.advanceTimersByTimeAsync(400);
    fire(docListeners, "pointerdown");
    expect(ZombieAudioContext.created).toBe(1); // never rebuilt
  });

  it("rebuilds the context on the next touch when the heal cycle doesn't take", async () => {
    const { ctx } = unlockZombie();

    fire(docListeners, "visibilitychange");
    await vi.advanceTimersByTimeAsync(400); // probe → heal cycle
    expect(ctx.suspends).toBe(1);
    await vi.advanceTimersByTimeAsync(400); // re-probe: clock STILL frozen

    // No rebuild happens off-gesture — iOS only reliably activates a fresh
    // context from a real touch.
    expect(ZombieAudioContext.created).toBe(1);

    // The player's next tap swaps in a fresh, resumed context and closes the
    // dead one.
    fire(docListeners, "pointerdown");
    expect(ZombieAudioContext.created).toBe(2);
    expect(ctx.closed).toBe(true);
    const fresh = ZombieAudioContext.last;
    expect(fresh).not.toBe(ctx);
    expect(fresh?.state).toBe("running");
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
