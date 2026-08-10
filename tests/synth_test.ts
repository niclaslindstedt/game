// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WebAudio synth (@ui/lib/synth.ts). It reaches for `AudioContext`, so
// these tests stub fakes on the global and assert two behaviors:
//
// 1. The context is created ONLY from a user gesture (unlock) — or from an
//    autostart the browser has explicitly permitted (see autoplayAllowed) —
//    and never as a side effect of reading the clock (now). A context built
//    outside a gesture on an engine that grants no such permission lands in a
//    state iOS Safari won't resume, which is exactly how the title tune goes
//    silent at app start.
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
// voices are routed and what envelope each one was given. connect() tracks
// edges by pushing the source onto the target's `inputs`, and every AudioParam
// keeps the automation it was handed.

/** An automation point a test can read back: what was asked for, to what
 * value, at what time on the context clock. */
type ParamEvent = { kind: "set" | "exp" | "lin"; value: number; at: number };

const fakeParam = (): Record<string, unknown> => {
  const events: ParamEvent[] = [];
  return {
    value: 0,
    events,
    setValueAtTime(value: number, at: number) {
      events.push({ kind: "set", value, at });
    },
    exponentialRampToValueAtTime(value: number, at: number) {
      events.push({ kind: "exp", value, at });
    },
    linearRampToValueAtTime(value: number, at: number) {
      events.push({ kind: "lin", value, at });
    },
  };
};

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
  gains: FakeNode[] = [];

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
    const gain = this.node("gain", { gain: fakeParam() });
    this.gains.push(gain);
    return gain;
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

/** Run `body` with `navigator.getAutoplayPolicy` answering `policy` — or, for
 * `null`, with an engine that doesn't implement the question at all. */
const withAutoplayPolicy = (policy: string | null, body: () => void): void => {
  const had = "navigator" in g;
  const previous = g.navigator;
  Object.defineProperty(g, "navigator", {
    value: policy === null ? {} : { getAutoplayPolicy: (): string => policy },
    configurable: true,
    writable: true,
  });
  try {
    body();
  } finally {
    if (had)
      Object.defineProperty(g, "navigator", {
        value: previous,
        configurable: true,
        writable: true,
      });
    else delete g.navigator;
  }
};

/** Background/foreground the page the way an app switch does. */
const setVisibility = (state: "visible" | "hidden"): void => {
  (g.document as { visibilityState: string }).visibilityState = state;
  fire(docListeners, "visibilitychange");
};

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

  it("autostarts only where the browser says a gesture isn't needed", () => {
    // The desktop shell launches Chromium with `no-user-gesture-required`, and
    // a browser grants the policy to an origin the player already engages
    // with; there the title theme may sound the moment the menu opens.
    withAutoplayPolicy("allowed", () => {
      const synth = createSynth();
      synth.autostart();
      expect(FakeAudioContext.created).toBe(1);
      expect(synth.now()).not.toBeNull();
    });
  });

  it("never builds a context off-gesture when the policy withholds it", () => {
    withAutoplayPolicy("disallowed", () => {
      const synth = createSynth();
      synth.autostart();
      expect(FakeAudioContext.created).toBe(0);
    });
  });

  it("treats an engine with no autoplay policy at all as a refusal", () => {
    // Safari/iOS answers nothing, and a context built outside a gesture there
    // is one no later gesture can revive (see now()) — so autostart guesses
    // nothing and the caller keeps waiting for a real gesture.
    withAutoplayPolicy(null, () => {
      const synth = createSynth();
      synth.autostart();
      expect(FakeAudioContext.created).toBe(0);
      synth.unlock();
      expect(FakeAudioContext.created).toBe(1);
    });
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

describe("backgrounding silences the app", () => {
  // The iOS PWA bug this exists to stop: switching to another home-screen PWA
  // interrupts nothing (that app claims no audio session the way Safari or
  // YouTube do), so the context stays "running" and the game keeps playing out
  // of the background — at about a quarter speed, because a hidden page's
  // timers are throttled to ~1 Hz and the music scheduler books only its
  // lookahead per tick. Only an explicit suspend stops it.

  it("suspends the context when the page goes to the background", () => {
    const synth = createSynth();
    synth.unlock();
    const ctx = FakeAudioContext.last;
    if (!ctx) throw new Error("no context created");
    expect(ctx.state).toBe("running");

    setVisibility("hidden");
    expect(ctx.state).toBe("suspended");
    expect(synth.now()).toBeNull(); // and the sequencer stops booking notes
  });

  it("refuses to revive a backgrounded context — the scheduler's self-heal cannot undo the suspend", () => {
    const synth = createSynth();
    synth.unlock();
    const ctx = FakeAudioContext.last;
    if (!ctx) throw new Error("no context created");
    setVisibility("hidden");

    // The chiptune tick sees a null clock every throttled beat and nudges the
    // context back. That nudge is exactly what would resurrect the quarter-
    // speed theme, so it must not land while the page is hidden.
    synth.resume();
    expect(ctx.state).toBe("suspended");

    // Nor may a queued sound (or a stray focus event) reopen the route.
    synth.tone({ from: 440, durationMs: 50 });
    synth.noise({ durationMs: 30 });
    fire(winListeners, "focus");
    expect(ctx.state).toBe("suspended");
  });

  it("picks the sound back up when the player returns", () => {
    const synth = createSynth();
    synth.unlock();
    const ctx = FakeAudioContext.last;
    if (!ctx) throw new Error("no context created");

    setVisibility("hidden");
    expect(ctx.state).toBe("suspended");
    setVisibility("visible");
    expect(ctx.state).toBe("running");
    expect(synth.now()).not.toBeNull();
    expect(FakeAudioContext.created).toBe(1); // resumed, never rebuilt
  });

  it("suspends on pagehide too, for a freeze that skips visibilitychange", () => {
    const synth = createSynth();
    synth.unlock();
    const ctx = FakeAudioContext.last;
    if (!ctx) throw new Error("no context created");

    fire(winListeners, "pagehide");
    expect(ctx.state).toBe("suspended");
  });

  it("never builds its one context for a backgrounded page", () => {
    const synth = createSynth();
    (g.document as { visibilityState: string }).visibilityState = "hidden";
    // A sound fired while hidden must not be what creates the context: born
    // outside a gesture it lands in a state iOS won't resume.
    synth.tone({ from: 440, durationMs: 50 });
    expect(FakeAudioContext.created).toBe(0);
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

describe("the tone envelope", () => {
  /** The automation written onto a voice's own gain — the one gain node that
   * was told to fall to silence, which is what an envelope is. */
  const voiceEnvelope = (ctx: GraphAudioContext): ParamEvent[] => {
    for (const gain of ctx.gains) {
      const events = (gain.gain as { events: ParamEvent[] }).events;
      if (events.some((e) => e.kind === "exp" && e.value < 0.001))
        return events;
    }
    throw new Error("no voice envelope was written");
  };

  it("falls from the first moment when nothing holds it", () => {
    g.AudioContext = GraphAudioContext;
    const synth = createSynth();
    synth.unlock();
    const t0 = getGraphContext().currentTime;
    synth.tone({ from: 440, durationMs: 400, volume: 0.05 });
    const events = voiceEnvelope(getGraphContext());
    // Peak at the start, and the decay is the whole rest of the note: that is
    // what makes every chip voice a blip, and why a bed needs the hold below.
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "set", value: 0.05, at: t0 });
    expect(events[1]?.kind).toBe("exp");
    expect(events[1]?.at).toBeCloseTo(t0 + 0.4, 6);
  });

  it("holds the peak before the decay when asked to", () => {
    // THE SUSTAIN A BED IS MADE OF. Without the explicit point at the end of
    // the hold, the decay ramp would start from the top of the attack — a
    // WebAudio ramp runs from the previous automation event — and the note
    // would slide through the sustain it was supposed to sit on.
    g.AudioContext = GraphAudioContext;
    const synth = createSynth();
    synth.unlock();
    const t0 = getGraphContext().currentTime;
    synth.tone({
      from: 110,
      durationMs: 320,
      volume: 0.04,
      attackMs: 60,
      holdMs: 200,
    });
    const events = voiceEnvelope(getGraphContext());
    expect(events.map((e) => e.kind)).toEqual(["set", "exp", "set", "exp"]);
    expect(events[1]).toMatchObject({ value: 0.04 }); // up at 60 ms…
    expect(events[1]?.at).toBeCloseTo(t0 + 0.06, 6);
    expect(events[2]).toMatchObject({ value: 0.04 }); // …still up at 260…
    expect(events[2]?.at).toBeCloseTo(t0 + 0.26, 6);
    expect(events[3]?.value).toBeLessThan(0.001); // …and gone by 320.
    expect(events[3]?.at).toBeCloseTo(t0 + 0.32, 6);
  });

  it("never eats the decay, however long the hold asks for", () => {
    g.AudioContext = GraphAudioContext;
    const synth = createSynth();
    synth.unlock();
    const t0 = getGraphContext().currentTime;
    synth.tone({ from: 110, durationMs: 100, volume: 0.04, holdMs: 9000 });
    const events = voiceEnvelope(getGraphContext());
    const decayFrom = events[events.length - 2];
    expect(decayFrom?.at).toBeLessThan(t0 + 0.1);
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
