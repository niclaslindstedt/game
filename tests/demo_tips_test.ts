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

// The tip box draws its line at TIP_SCALE (DemoTip.tsx), wrapped at 80% of the
// viewport width the way the settings help line is (`useHelpWrapRem`) — so a
// long line folds rather than clipping. On the narrowest phone this ships for
// (a 390 CSS px portrait viewport, root font 1x — the 2x regime is gated on
// BOTH axes past 700px) that cap works out to ~104 font pixels per line.
//
// The budget below is a bit over that, so every tip is at most TWO lines there
// and one line on anything wider. It is a READABILITY rule, not a clipping one:
// a callout is read at a glance over a moving field while the run is frozen for
// a beat, and a line that needs three rows has stopped being a callout.
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

  it("gives every ambient lesson a line and something to point at", () => {
    for (const lesson of DEMO_LESSONS) {
      expect(
        DEMO_TIPS[lesson.key as keyof typeof DEMO_TIPS],
        `lesson "${lesson.key}" has no copy`,
      ).toBeTruthy();
      // A selector for a lesson about a CONTROL; null for one about the field,
      // which anchors on the hero. An empty string is neither.
      if (lesson.anchor !== null) {
        expect(lesson.anchor.length, `lesson "${lesson.key}"`).toBeGreaterThan(
          0,
        );
      }
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
    levelUpFxMs: 0,
  } as unknown as Parameters<(typeof DEMO_LESSONS)[number]["ready"]>[0];
}

/** The default lesson context: nothing taught yet, hero on the move. */
const ctx = (over: { stillMs?: number; taught?: string[] } = {}) => ({
  stillMs: over.stillMs ?? 0,
  taught: (key: string) => (over.taught ?? []).includes(key),
});

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
    expect(stamina.ready(state, ctx({ stillMs: 5000 }))).toBe(false);
    state.player.stamina = 10;
    // Low pool but still moving — the line would describe nothing on screen.
    expect(stamina.ready(state, ctx())).toBe(false);
    expect(stamina.ready(state, ctx({ stillMs: 5000 }))).toBe(true);
  });

  it("teaches the pack once it is carrying finds, not on the first scoop", () => {
    const state = healthyRun();
    const bag = lesson("bag");
    expect(bag.ready(state, ctx())).toBe(false);
    state.player.inventory[0] = { defId: "crude_sword" } as never;
    expect(bag.ready(state, ctx())).toBe(false);
    state.player.inventory[1] = { defId: "crude_sword" } as never;
    expect(bag.ready(state, ctx())).toBe(true);
  });

  it("never teaches repair for the unbreakable sidearm", () => {
    const state = healthyRun();
    // The blaster carries no durability at all — the ring reads a full teal
    // and there is nothing to mend.
    expect(lesson("repair").ready(state, ctx())).toBe(false);
  });

  it("spaces the chrome lessons out across a watched run", () => {
    const state = healthyRun();
    const chrome = ["pause", "map", "autopilot"].map(lesson);
    const readyAt = chrome.map((l) => {
      for (let ms = 0; ms <= 10 * 60_000; ms += 1000) {
        state.stats.combatMs = ms;
        if (l.ready(state, ctx())) return ms;
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

describe("the level-up payoff lesson", () => {
  it("waits for the chooser lesson, then teaches late in the celebration", () => {
    const state = healthyRun();
    const ding = lesson("ding");
    // Mid-celebration but the chooser hasn't been explained yet: hold off, so
    // one ding doesn't stack two read-freezes.
    state.levelUpFxMs = 300;
    expect(ding.ready(state, ctx())).toBe(false);
    const after = ctx({ taught: ["levelstat"] });
    expect(ding.ready(state, after)).toBe(true);
    // Not at the ding itself — the full-screen flash would swallow the line.
    state.levelUpFxMs = 1200;
    expect(ding.ready(state, after)).toBe(false);
    // And never outside a celebration at all.
    state.levelUpFxMs = 0;
    expect(ding.ready(state, after)).toBe(false);
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
