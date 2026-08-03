// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KEY THAT OPENED A SCREEN IS NOT A PRESS ON IT (@ui/lib/key-handoff.ts).
//
// The bug this pins: pressing Enter to name a new hero committed the hero and
// brought the title up on the DIFFICULTY LADDER, and the very same Enter — still
// climbing from the name field towards `window` — confirmed the row the cursor
// opened on. The run started on MEDIUM and the ladder was never seen. Every
// keyboard player hit it (a phone taps CREATE and never does), which is why it
// arrived as "Windows users do not get to select difficulty".
//
// A listener installed mid-flight IS called when the event reaches `window` —
// that is the DOM working as specified — so the arriving screen has to know the
// press was not for it.

import { describe, expect, it, vi } from "vitest";

import { isHandoffKey, onFreshKeyDown } from "../pwa/src/lib/key-handoff.ts";

/** A stand-in `window` recording listeners, so the guard can be driven without
 * a DOM (the suite runs in plain Node — see vitest.config.ts). */
function fakeWindow() {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  return {
    listeners,
    addEventListener(type: string, fn: (event: KeyboardEvent) => void) {
      if (type === "keydown") listeners.add(fn);
    },
    removeEventListener(type: string, fn: (event: KeyboardEvent) => void) {
      if (type === "keydown") listeners.delete(fn);
    },
    /** Deliver an event stamped at `timeStamp` to everyone listening. */
    dispatch(timeStamp: number) {
      for (const fn of [...listeners]) {
        fn({ key: "Enter", timeStamp } as KeyboardEvent);
      }
    },
  };
}

/** Install the guard against a fake window/clock, and hand back both. */
function withFakeHost<T>(
  now: number,
  body: (host: ReturnType<typeof fakeWindow>) => T,
): T {
  const host = fakeWindow();
  const globals = globalThis as unknown as {
    window: unknown;
    performance: { now(): number };
  };
  const realWindow = globals.window;
  const realPerformance = globals.performance;
  globals.window = host;
  globals.performance = { now: () => now };
  try {
    return body(host);
  } finally {
    globals.window = realWindow;
    globals.performance = realPerformance;
  }
}

describe("isHandoffKey", () => {
  it("rejects a key that was already travelling", () => {
    // The Enter left the name field at 10118; the ladder's listener went on at
    // 10126, part-way through that same dispatch.
    expect(isHandoffKey({ timeStamp: 10118 }, 10126)).toBe(true);
  });

  it("accepts a key pressed after the screen arrived", () => {
    expect(isHandoffKey({ timeStamp: 10200 }, 10126)).toBe(false);
    // The tie goes to the new screen: a listener installed at the same
    // microsecond an event was stamped was not installed BY it.
    expect(isHandoffKey({ timeStamp: 10126 }, 10126)).toBe(false);
  });

  it("does nothing when the host stamps events off another clock", () => {
    // Fail open: a host whose timeStamps are not the page's high-res clock
    // reads every key as fresh — exactly the behaviour before the guard.
    expect(isHandoffKey({ timeStamp: Date.now() }, 10126)).toBe(false);
  });
});

describe("onFreshKeyDown", () => {
  it("ignores the keystroke that installed it", () => {
    const handler = vi.fn();
    withFakeHost(500, (host) => {
      onFreshKeyDown(handler);
      host.dispatch(480); // pressed before this listener existed
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs for every key pressed afterwards", () => {
    const handler = vi.fn();
    withFakeHost(500, (host) => {
      onFreshKeyDown(handler);
      host.dispatch(510);
      host.dispatch(900);
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("detaches", () => {
    const handler = vi.fn();
    withFakeHost(500, (host) => {
      const detach = onFreshKeyDown(handler);
      detach();
      expect(host.listeners.size).toBe(0);
      host.dispatch(900);
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
