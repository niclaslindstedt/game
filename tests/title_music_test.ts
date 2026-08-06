// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TITLE THEME'S START (`pwa/src/game/music/index.ts` → armTitleMusic).
// The menu's music used to wait for a menu ROW to be pressed, because that is
// where the audio unlock hung — open the game, look at the front door, hear
// nothing until you touched a button. What the front door owes instead:
//
// 1. Where the platform allows sound with no gesture (the desktop shell runs
//    Chromium with `no-user-gesture-required`), the theme starts ON OPEN.
// 2. Where it doesn't, the FIRST touch or key anywhere unlocks it — not the
//    first menu row.
// 3. A gesture the browser refuses to honour is not the last one we listen to:
//    the arming stays up until the clock actually moves.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChiptuneTrack } from "@ui/lib/chiptune.ts";

/** A silent one-bar arrangement, installed as a "mod" score under the title
 * id so the module plays it synchronously — the shipped score arrives through
 * a dynamic import, and its notes would want a whole fake node graph. */
const SILENT_TRACK: ChiptuneTrack = {
  bpm: 120,
  stepsPerBeat: 4,
  instruments: { lead: { wave: "square", volume: 0.05 } },
  patterns: { rest: { lead: [".", ".", ".", "."] } },
  order: ["rest"],
};

type FakeState = "suspended" | "running" | "closed";

/** The context the synth builds. `resumable` off models the browser that
 * refuses to start audio for this gesture — the state never reaches running. */
class FakeAudioContext {
  static created = 0;
  static last: FakeAudioContext | null = null;
  static resumable = true;
  state: FakeState = "suspended";
  currentTime = 0;
  constructor() {
    FakeAudioContext.created++;
    FakeAudioContext.last = this;
    // Chromium hands back an already-running context when the autoplay policy
    // allows one; elsewhere it is born suspended and waits for a gesture.
    if (FakeAudioContext.resumable && autoplayPolicy === "allowed") {
      this.state = "running";
      this.currentTime = 1.5;
    }
  }
  resume(): Promise<void> {
    if (!FakeAudioContext.resumable) return Promise.resolve();
    this.state = "running";
    this.currentTime = 1.5;
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = "suspended";
    return Promise.resolve();
  }
  addEventListener(): void {}
}

/** What `navigator.getAutoplayPolicy("audiocontext")` answers this test —
 * `null` stands for the engines that do not implement it at all (Safari). */
let autoplayPolicy: string | null = null;

const g = globalThis as Record<string, unknown>;
const hadDocument = "document" in g;
const hadWindow = "window" in g;

let docListeners: Record<string, Array<() => void>> = {};
const record = (type: string, fn: () => void): void => {
  (docListeners[type] ??= []).push(fn);
};
const unrecord = (type: string, fn: () => void): void => {
  docListeners[type] = (docListeners[type] ?? []).filter((f) => f !== fn);
};
const fire = (type: string): void => {
  for (const fn of [...(docListeners[type] ?? [])]) fn();
};
const listening = (type: string): number => (docListeners[type] ?? []).length;

/** Arm the title theme against a freshly-imported module singleton (the synth
 * and the player are module state, so every case needs its own). */
async function openTitleScreen(): Promise<() => void> {
  vi.resetModules();
  const music = await import("../pwa/src/game/music/index.ts");
  music.setModTracks({ title: SILENT_TRACK });
  return music.armTitleMusic();
}

/** Is the theme actually sounding — i.e. did the context reach a live clock? */
async function audible(): Promise<boolean> {
  const { musicSynth } = await import("../pwa/src/game/audio.ts");
  return musicSynth.now() !== null;
}

beforeEach(() => {
  FakeAudioContext.created = 0;
  FakeAudioContext.last = null;
  FakeAudioContext.resumable = true;
  autoplayPolicy = null;
  g.AudioContext = FakeAudioContext;
  docListeners = {};
  if (!hadDocument) {
    g.document = {
      visibilityState: "visible",
      addEventListener: record,
      removeEventListener: unrecord,
    };
  }
  if (!hadWindow) g.window = { addEventListener: () => {} };
  vi.stubGlobal("navigator", {
    getAutoplayPolicy:
      autoplayPolicy === null
        ? undefined
        : (): string => autoplayPolicy as string,
  });
});

afterEach(async () => {
  const music = await import("../pwa/src/game/music/index.ts");
  music.stopMusic();
  vi.unstubAllGlobals();
  delete g.AudioContext;
  if (!hadDocument) delete g.document;
  if (!hadWindow) delete g.window;
});

/** Re-point `navigator` at the policy this case wants. */
const setAutoplayPolicy = (policy: string | null): void => {
  autoplayPolicy = policy;
  vi.stubGlobal("navigator", {
    getAutoplayPolicy:
      policy === null ? undefined : (): string => policy as string,
  });
};

describe("the title theme starts with the menu, not with a button", () => {
  it("plays on open where the browser allows audio without a gesture", async () => {
    setAutoplayPolicy("allowed");
    await openTitleScreen();
    expect(FakeAudioContext.created).toBe(1);
    expect(await audible()).toBe(true);
    // Nothing left waiting on the player: the arrival arming is never raised.
    expect(listening("keydown")).toBe(0);
  });

  it("waits for a gesture where it doesn't — then takes the first one, anywhere", async () => {
    setAutoplayPolicy("disallowed");
    await openTitleScreen();
    // A context built outside a gesture under this policy is one no later
    // gesture can revive, so nothing may be constructed yet.
    expect(FakeAudioContext.created).toBe(0);
    expect(await audible()).toBe(false);

    // A KEY — not a menu row, not even a pointer — is enough.
    fire("keydown");
    expect(FakeAudioContext.created).toBe(1);
    expect(await audible()).toBe(true);
    expect(listening("keydown")).toBe(0);
  });

  it("treats an engine that cannot answer the policy question as a no", async () => {
    setAutoplayPolicy(null); // Safari / iOS: no getAutoplayPolicy at all
    await openTitleScreen();
    expect(FakeAudioContext.created).toBe(0);

    fire("pointerdown");
    expect(await audible()).toBe(true);
  });

  it("stays armed through a gesture the browser refused to honour", async () => {
    setAutoplayPolicy("disallowed");
    FakeAudioContext.resumable = false;
    await openTitleScreen();

    // (Counted on `keydown`, the one arrival event the synth's own recovery
    // wiring doesn't also listen for — so the count is purely this arming's.)
    fire("keydown");
    expect(await audible()).toBe(false);
    expect(listening("keydown")).toBe(1); // still listening — it didn't take

    FakeAudioContext.resumable = true;
    fire("keydown");
    expect(await audible()).toBe(true);
    expect(listening("keydown")).toBe(0);
  });

  it("takes its listeners with it when the menu closes", async () => {
    setAutoplayPolicy("disallowed");
    const disarm = await openTitleScreen();
    expect(listening("keydown")).toBe(1);
    disarm();
    expect(listening("keydown")).toBe(0);
    fire("keydown");
    expect(FakeAudioContext.created).toBe(0);
  });
});
