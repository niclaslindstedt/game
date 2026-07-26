// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HOW TO PLAY demo's teaching copy + its AMBIENT lesson catalog
// (pwa/src/game/copy.ts, pwa/src/game/game-screen/demo-lessons.ts). A tip is a
// single nowrap line of pixel font laid over the field at scale 2, so the two
// ways it can break are silent: a character the font has no glyph for (it draws
// a '?') and a line too long for the narrowest phone (it clips off the screen).
// Both are checked here against the REAL font metrics. The lessons themselves
// are pure predicates, so their conditions are checked directly — a lesson that
// silently never becomes true is a tooltip nobody is ever taught.

import { describe, expect, it } from "vitest";

import { measureText } from "../scripts/asset-tools/font.mjs";
import { DEMO_TIPS } from "../pwa/src/game/copy.ts";
import {
  createStandstillMemory,
  DEMO_LESSONS,
  trackStandstill,
} from "../pwa/src/game/game-screen/demo-lessons.ts";

// The tip box draws its line at scale 2 (DemoTip.tsx), so its CSS width is
// twice the font-pixel measure below plus ~1.1rem of padding and a 6px edge
// margin either side. On the narrowest reference viewport — the iPhone SE floor
// in landscape, 568 CSS px (see the `ui-review` skill) — that leaves room for
// roughly 270 font pixels before the box clips.
//
// The cap here is deliberately half that. A tip is read at a glance while the
// field is frozen for a beat, and every shipped line lands under 125 font
// pixels (~30 characters); a line that needs the full width of a phone has
// stopped being a callout and become a paragraph. So this fails long before
// anything visibly clips — which is the point.
const MAX_TIP_FONT_PX = 135;

// Letters, digits, space, and the punctuation the copy leans on — every one of
// these has a glyph in scripts/asset-tools/font.mjs, so PixelText never falls
// back to '?'. (A '?' the copy MEANT to write is fine; it has its own glyph.)
const GLYPH_SAFE = /^[A-Z0-9 &?-]+$/;

describe("HOW TO PLAY teaching copy (DEMO_TIPS)", () => {
  it("only uses characters the pixel font can draw", () => {
    for (const [key, text] of Object.entries(DEMO_TIPS)) {
      expect(text, `tip "${key}"`).toMatch(GLYPH_SAFE);
    }
  });

  it("keeps every line inside the one-glance budget", () => {
    for (const [key, text] of Object.entries(DEMO_TIPS)) {
      expect(measureText(text), `tip "${key}" (${text})`).toBeLessThanOrEqual(
        MAX_TIP_FONT_PX,
      );
    }
  });

  it("gives every ambient lesson a line and a control to point at", () => {
    for (const lesson of DEMO_LESSONS) {
      expect(
        DEMO_TIPS[lesson.key as keyof typeof DEMO_TIPS],
        `lesson "${lesson.key}" has no copy`,
      ).toBeTruthy();
      expect(lesson.anchor.length, `lesson "${lesson.key}"`).toBeGreaterThan(0);
    }
    // Each lesson is latched by its key, so a duplicate would mute one of them.
    const keys = DEMO_LESSONS.map((lesson) => lesson.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/** The slice of run state the ambient lessons read, filled with a healthy
 * hero nothing is true of — each test dirties exactly the field it's about. */
function healthyRun(): Parameters<(typeof DEMO_LESSONS)[number]["ready"]>[0] {
  return {
    phase: "playing",
    player: {
      stamina: 100,
      maxStamina: 100,
      inventory: [null, null, null, null],
      equipment: { weapon: { defId: "blaster" } },
    },
    companions: [],
    stats: { combatMs: 0 },
    menace: 0,
    menaceFloor: 0,
  } as unknown as Parameters<(typeof DEMO_LESSONS)[number]["ready"]>[0];
}

const lesson = (key: string) => {
  const found = DEMO_LESSONS.find((l) => l.key === key);
  if (!found) throw new Error(`no ambient lesson "${key}"`);
  return found;
};

describe("ambient lessons (DEMO_LESSONS)", () => {
  it("teaches the breather only once the pool is low AND the hero has stopped", () => {
    const state = healthyRun();
    const stamina = lesson("stamina");
    // Full pool, standing still: nothing to teach.
    expect(stamina.ready(state, { stillMs: 5000 })).toBe(false);
    state.player.stamina = 10;
    // Low pool but still moving — the line would describe nothing on screen.
    expect(stamina.ready(state, { stillMs: 0 })).toBe(false);
    expect(stamina.ready(state, { stillMs: 5000 })).toBe(true);
  });

  it("teaches the pack once it is carrying finds, not on the first scoop", () => {
    const state = healthyRun();
    const bag = lesson("bag");
    expect(bag.ready(state, { stillMs: 0 })).toBe(false);
    state.player.inventory[0] = { defId: "crude_sword" } as never;
    expect(bag.ready(state, { stillMs: 0 })).toBe(false);
    state.player.inventory[1] = { defId: "crude_sword" } as never;
    expect(bag.ready(state, { stillMs: 0 })).toBe(true);
  });

  it("never teaches repair for the unbreakable sidearm", () => {
    const state = healthyRun();
    // The blaster carries no durability at all — the ring reads a full teal
    // and there is nothing to mend.
    expect(lesson("repair").ready(state, { stillMs: 0 })).toBe(false);
  });

  it("spaces the chrome lessons out across a watched run", () => {
    const state = healthyRun();
    const chrome = ["pause", "map", "autopilot"].map(lesson);
    const readyAt = chrome.map((l) => {
      for (let ms = 0; ms <= 10 * 60_000; ms += 1000) {
        state.stats.combatMs = ms;
        if (l.ready(state, { stillMs: 0 })) return ms;
      }
      return Infinity;
    });
    // All three become true inside a plausible run, in catalog order, and each
    // well clear of the last so they don't clump.
    for (const ms of readyAt) expect(ms).toBeLessThan(10 * 60_000);
    expect(readyAt[0]).toBeLessThan(readyAt[1]!);
    expect(readyAt[1]).toBeLessThan(readyAt[2]!);
  });
});

describe("standstill tracking (trackStandstill)", () => {
  it("banks time while the hero holds position and resets the moment he moves", () => {
    const memory = createStandstillMemory();
    // The first sample only seeds the position — it can't know he was still.
    trackStandstill(memory, { x: 10, y: 10 }, 16);
    expect(memory.stillMs).toBe(0);
    trackStandstill(memory, { x: 10, y: 10 }, 16);
    trackStandstill(memory, { x: 10, y: 10 }, 16);
    expect(memory.stillMs).toBe(32);
    // Sub-unit jitter (settling inside the arrive radius) is still "still".
    trackStandstill(memory, { x: 10.1, y: 9.9 }, 16);
    expect(memory.stillMs).toBe(48);
    // A real step resets the clock.
    trackStandstill(memory, { x: 24, y: 10 }, 16);
    expect(memory.stillMs).toBe(0);
  });
});
