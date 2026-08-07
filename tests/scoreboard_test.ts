// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARTY SCOREBOARD's rules — the whole of what `scoreRows` judges, held to
// the three things that would make the board lie.
//
// It is a JOIN of two sources that can each be missing the other's half (the
// session roster and this client's own world), and every one of these asserts
// the same discipline: what the run cannot answer for reads as a DASH rather
// than as a flattering zero — because zero is a real score, and the board sorts
// on it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { GameState } from "@game/core";
import type { RosterEntry } from "@game/wire/protocol.ts";

import {
  formatSessionTime,
  scoreRows,
} from "../pwa/src/game/game-screen/scoreboard.ts";

/** A hero, as much of one as the board reads. */
function hero(over: Partial<{ level: number; kills: number }> = {}) {
  return {
    level: 1,
    kills: 0,
    downed: false,
    departed: false,
    ...over,
  };
}

/** A run holding `players` on level `levelId`. Structural on purpose: the row
 * builder reads four fields off a hero and one off the level, and staging a
 * whole carve to assert a sort order would be a slower test of nothing. */
function run(players: unknown[], levelId = "hq"): GameState {
  return { players, level: { id: levelId } } as unknown as GameState;
}

function entry(over: Partial<RosterEntry> & { slot: number }): RosterEntry {
  return {
    name: `PLAYER ${over.slot + 1}`,
    playing: true,
    seat: over.slot,
    ping: 30,
    rate: 0,
    ...over,
  };
}

describe("the scoreboard's rows", () => {
  it("pairs each roster entry with its own hero's numbers", () => {
    const rows = scoreRows({
      roster: [
        entry({ slot: 0, name: "ADA", joinedMs: 90_000 }),
        entry({ slot: 1, name: "BREN", joinedMs: 30_000 }),
      ],
      state: run([hero({ level: 9, kills: 4 }), hero({ level: 3, kills: 11 })]),
      mySeat: 0,
      levelId: "hq",
    });
    // The RANKING is the readout: frags first, so seat 1 leads on 11 despite
    // being half seat 0's level and a third of their time in the session.
    expect(rows.map((row) => row.name)).toEqual(["BREN", "ADA"]);
    expect(rows[0]).toMatchObject({
      seat: 1,
      level: 3,
      kills: 11,
      self: false,
    });
    expect(rows[1]).toMatchObject({ seat: 0, level: 9, kills: 4, self: true });
  });

  it("dashes the numbers for a seat standing on another level", () => {
    // The town-portal case (`server/worlds.ts`): seat 1 is simulating in the
    // garage, and all this client holds in their chair is the departed
    // placeholder its own `ensureSeats` built — fresh, and so all zeroes.
    const rows = scoreRows({
      roster: [
        entry({ slot: 0, level: "hq" }),
        entry({ slot: 1, level: "garage" }),
      ],
      state: run([hero({ kills: 2 }), { ...hero(), departed: true }]),
      mySeat: 0,
      levelId: "hq",
    });
    const away = rows.find((row) => row.seat === 1);
    expect(away).toMatchObject({ away: true, level: null, kills: null });
    // …and a dash is not a zero when the board sorts: the seat nobody can see
    // ranks below the one that scored, rather than tying every other newcomer.
    expect(rows[0]?.seat).toBe(0);
  });

  it("sinks a spectator below every player, whatever the run says", () => {
    const rows = scoreRows({
      roster: [
        entry({ slot: 0, name: "WATCHER", playing: false, seat: null }),
        entry({ slot: 1, name: "PLAYING", seat: 1 }),
      ],
      state: run([hero(), hero({ kills: 0 })]),
      mySeat: 1,
      levelId: "hq",
    });
    expect(rows.map((row) => row.name)).toEqual(["PLAYING", "WATCHER"]);
    expect(rows[1]).toMatchObject({
      spectating: true,
      seat: null,
      kills: null,
    });
  });

  it("marks a session bot, and never marks a spectator as anybody's seat", () => {
    const rows = scoreRows({
      roster: [
        entry({ slot: 0, name: "ADA" }),
        entry({ slot: 1, name: "BOT 2", bot: true }),
      ],
      // A spectator reads `mySeat: null` — `localSeat()` answers 0 for a client
      // that steers nothing, and taking that at face value would paint somebody
      // else's row as the watcher's own.
      state: run([hero({ kills: 5 }), hero({ kills: 1 })]),
      mySeat: null,
      levelId: "hq",
    });
    expect(rows.every((row) => !row.self)).toBe(true);
    expect(rows.find((row) => row.name === "BOT 2")?.bot).toBe(true);
  });

  it("ticks the TIME column between roster broadcasts", () => {
    // A roster is sent when it CHANGES, so the elapsed since it landed is what
    // makes the clock move (see `SessionLink.rosterAt`).
    const roster = [entry({ slot: 0, joinedMs: 60_000 })];
    const state = run([hero()]);
    const at = (sinceRoster: number) =>
      scoreRows({ roster, state, mySeat: 0, levelId: "hq", sinceRoster })[0]
        ?.timeMs;
    expect(at(0)).toBe(60_000);
    expect(at(5_000)).toBe(65_000);
    // A server too old to say gets a dash rather than a clock stuck at zero.
    expect(
      scoreRows({
        roster: [entry({ slot: 0 })],
        state,
        mySeat: 0,
        levelId: "hq",
      })[0]?.timeMs,
    ).toBeNull();
  });

  it("orders ties totally, so a redraw never shuffles the board", () => {
    const roster = [0, 1, 2].map((slot) => entry({ slot }));
    const state = run([hero(), hero(), hero()]);
    const once = scoreRows({ roster, state, mySeat: 0, levelId: "hq" });
    const twice = scoreRows({
      roster: [...roster].reverse(),
      state,
      mySeat: 0,
      levelId: "hq",
    });
    expect(once.map((row) => row.slot)).toEqual([0, 1, 2]);
    expect(twice.map((row) => row.slot)).toEqual([0, 1, 2]);
  });
});

describe("the session clock", () => {
  it("reads M:SS inside the hour and H:MM:SS past it", () => {
    expect(formatSessionTime(0)).toBe("0:00");
    expect(formatSessionTime(9_000)).toBe("0:09");
    expect(formatSessionTime(605_000)).toBe("10:05");
    // The reason it is not the HUD's `formatTime`: an evening in one session
    // reads as hours, not as `184:07`.
    expect(formatSessionTime(11_045_000)).toBe("3:04:05");
  });

  it("never reads backwards on a clock that jumped", () => {
    expect(formatSessionTime(-5_000)).toBe("0:00");
  });
});

// ---------------------------------------------------------------------------
// THE BOARD'S GEOMETRY
//
// The table is a CSS grid whose rows are `display: contents`, so the COLUMN
// COUNT lives in the stylesheet and the CELL COUNT lives in the component —
// two files that have to agree and that nothing else makes agree. A mismatch
// does not throw: the browser silently invents an implicit column and every
// row after the first wraps, which is a board nobody can read and a diff
// nobody can spot. Read the way `drive_dial_test.ts` reads the dials.

const CSS = readFileSync(
  fileURLToPath(new URL("../pwa/src/styles.css", import.meta.url)),
  "utf8",
);

const BOARD = readFileSync(
  fileURLToPath(
    new URL("../pwa/src/game/hud/widgets/Scoreboard.tsx", import.meta.url),
  ),
  "utf8",
);

/** The declaration block of the top-level rule for exactly `selector`. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  expect(rule, `no rule for ${selector}`).not.toBeNull();
  return rule?.[2] ?? "";
}

describe("the board's geometry", () => {
  it("gives the grid a column for every cell the header draws", () => {
    // Portrait, name, and the four numbers — the readout's own six.
    expect(ruleFor(".scoreboard")).toContain(
      "grid-template-columns: auto minmax(0, 1fr) repeat(4, auto)",
    );
    // …and one more where the pause screen's copy grows an ASK button.
    expect(ruleFor(".scoreboard.asks")).toContain("repeat(5, auto)");
    const header = /className="scoreboard-row head">([\s\S]*?)<\/div>/.exec(
      BOARD,
    )?.[1];
    expect(header, "no header row in the widget").toBeDefined();
    const cells = (header ?? "").match(/<(Cell|span)\b/g) ?? [];
    expect(cells).toHaveLength(7);
  });

  it("leaves the steering thumb alone under a board held up mid-fight", () => {
    // The region covers the whole screen so the table can sit in the middle of
    // it. A full-screen box over the steering pad that ATE presses would make
    // holding the board up cost the fight.
    const region = ruleFor(".hud-scores");
    expect(region).toContain("pointer-events: none");
    expect(region).toContain("inset: 0");
    expect(ruleFor(".scoreboard")).toContain("pointer-events: auto");
  });

  it("draws over the docks and under the full-screen overlays", () => {
    const z = /z-index:\s*(\d+)/.exec(ruleFor(".hud-scores"))?.[1];
    expect(Number(z)).toBeGreaterThan(41);
    expect(Number(z)).toBeLessThan(100);
  });
});
