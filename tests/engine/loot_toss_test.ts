// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE D2 TOSS — a drop bursts out of the body it came from, arcs, and clatters
// down a pace away. The engine's half of that is three rules, and all three are
// pinned here because each one is invisible until it is wrong:
//
//   1. `pos` is the LANDING spot from birth, so every rule that reads a drop's
//      position needs no notion of flight.
//   2. Airborne loot cannot be picked up, and the magnet cannot reel it in.
//   3. The touchdown emits `itemLanded` carrying what the thing is MADE OF —
//      the vocabulary the landing sound is chosen by — plus a `lootShine` for
//      a magic-or-better find, and only for those.
//
// Plus the one determinism guarantee that lets the feature ship at all: the
// scatter is hash-derived off the item's id, never `state.rng()`, so a seeded
// run rolls exactly the same loot with the toss as it did without it.

import { describe, expect, it } from "vitest";

import {
  dropItem,
  itemVoice,
  LOOT,
  rollEquipment,
  step,
  tossDurationMs,
  type GameState,
  type Item,
} from "@game/core";

import { clearStage, idle, run, startGame } from "./helpers.ts";

/** A run with nothing on the field and the hero parked, so the only thing
 * moving is the drop under test. */
function stage(): GameState {
  const state = startGame();
  clearStage(state);
  state.items = [];
  state.events = [];
  return state;
}

function tossAt(state: GameState, item: Item, from = { x: 200, y: 200 }): Item {
  return dropItem(state, item, from);
}

function medkit(state: GameState, pos: { x: number; y: number }): Item {
  return { id: state.nextId++, kind: "medkit", pos, tier: 0 };
}

describe("the drop's flight", () => {
  it("parks the item at its landing spot and flies it in from the body", () => {
    const state = stage();
    const item = tossAt(state, medkit(state, { x: 260, y: 200 }));
    // `pos` is where it is GOING, not where it started — that is what lets the
    // magnet, the pickup reach and the minimap stay ignorant of the flight.
    expect(item.pos).toEqual({ x: 260, y: 200 });
    expect(item.toss?.from).toEqual({ x: 200, y: 200 });
    expect(item.toss?.ms).toBe(tossDurationMs(60));
    expect(item.toss?.ms).toBe(item.toss?.totalMs);
  });

  it("hops a drop asked to land on the body it came out of", () => {
    const state = stage();
    const from = { x: 200, y: 200 };
    const item = tossAt(state, medkit(state, { ...from }), from);
    const reach = Math.hypot(item.pos.x - from.x, item.pos.y - from.y);
    // It must visibly LEAVE the corpse, and it must not sail across the room.
    expect(reach).toBeGreaterThan(0.5);
    expect(reach).toBeLessThanOrEqual(LOOT.toss.hopPx + 0.001);
  });

  it("scatters two drops off the same body to different spots", () => {
    const state = stage();
    const from = { x: 200, y: 200 };
    const a = tossAt(state, medkit(state, { ...from }), from);
    const b = tossAt(state, medkit(state, { ...from }), from);
    expect(a.pos).not.toEqual(b.pos);
  });

  it("draws no rng, so a seeded run's rolls are untouched", () => {
    const state = stage();
    let draws = 0;
    const rng = state.rng;
    state.rng = () => {
      draws++;
      return rng();
    };
    const from = { x: 200, y: 200 };
    for (let i = 0; i < 8; i++) tossAt(state, medkit(state, { ...from }), from);
    expect(draws).toBe(0);
  });

  it("caps the flight so even a long scatter lands promptly", () => {
    expect(tossDurationMs(0)).toBe(LOOT.toss.minMs);
    expect(tossDurationMs(10_000)).toBe(LOOT.toss.maxMs);
  });
});

describe("what airborne loot may not do", () => {
  it("cannot be picked up until it lands", () => {
    const state = stage();
    // Dropped right on top of the hero: without the flight gate the very next
    // tick would collect it.
    const from = { ...state.player.pos };
    tossAt(state, medkit(state, { ...from }), from);
    step(state, idle, 16);
    expect(state.items).toHaveLength(1);
    expect(state.stats.itemsCollected).toBe(0);
    // Fly it out and the pickup lands the moment the arc does.
    run(state, idle, LOOT.toss.maxMs + 200, (s) => s.items.length === 0);
    expect(state.items).toHaveLength(0);
    expect(state.stats.itemsCollected).toBe(1);
  });

  it("keeps its landing spot while it flies — nothing drags it off course", () => {
    const state = stage();
    const item = tossAt(state, medkit(state, { x: 320, y: 200 }));
    const landing = { ...item.pos };
    step(state, idle, 16);
    expect(item.toss).toBeDefined();
    expect(item.pos).toEqual(landing);
  });
});

describe("the landing", () => {
  it("names what the thing is made of, so the floor sounds right", () => {
    const state = stage();
    const from = { x: 200, y: 200 };
    tossAt(
      state,
      {
        id: state.nextId++,
        kind: "equipment",
        pos: { x: 240, y: 200 },
        equipment: rollEquipment(state, { defId: "test_hammer" }),
      },
      from,
    );
    run(state, idle, LOOT.toss.maxMs + 200, (s) =>
      s.events.some((e) => e.type === "itemLanded"),
    );
    const landed = state.events.find((e) => e.type === "itemLanded");
    expect(landed).toBeDefined();
    // The fixture hammer is a melee weapon, so it rings like steel.
    expect(landed && "kind" in landed && landed.kind).toBe("blade");
  });

  it("rings a rarity over the thud for a magic-or-better find, and only then", () => {
    for (const [tier, expected] of [
      ["regular", false],
      ["magic", true],
      ["artifact", true],
    ] as const) {
      const state = stage();
      const from = { x: 200, y: 200 };
      tossAt(
        state,
        {
          id: state.nextId++,
          kind: "equipment",
          pos: { x: 240, y: 200 },
          equipment: rollEquipment(state, { defId: "test_hammer", tier }),
        },
        from,
      );
      run(state, idle, LOOT.toss.maxMs + 200, (s) =>
        s.events.some((e) => e.type === "itemLanded"),
      );
      expect(
        state.events.some((e) => e.type === "lootShine"),
        `${tier} shine`,
      ).toBe(expected);
    }
  });

  it("clears the flight once, so a landed drop never lands twice", () => {
    const state = stage();
    tossAt(state, medkit(state, { x: 400, y: 400 }));
    let landings = 0;
    for (let i = 0; i < 120; i++) {
      step(state, idle, 16);
      landings += state.events.filter((e) => e.type === "itemLanded").length;
    }
    expect(landings).toBe(1);
  });
});

describe("what a drop sounds like", () => {
  it("splits equipment by what it is made of, not by where it is worn", () => {
    const state = stage();
    const voice = (defId: string) =>
      itemVoice({
        id: 1,
        kind: "equipment",
        pos: { x: 0, y: 0 },
        equipment: rollEquipment(state, { defId }),
      });
    // A weapon rings by CLASS; the fixture ladder carries one of each.
    expect(voice("test_hammer")).toBe("blade");
    expect(voice("blaster")).toBe("gun");
  });

  it("gives the loose pickups their own voices", () => {
    const state = stage();
    const at = { x: 0, y: 0 };
    expect(itemVoice(medkit(state, at))).toBe("flask");
    expect(itemVoice({ id: 1, kind: "drink", pos: at })).toBe("flask");
    expect(itemVoice({ id: 2, kind: "repair", pos: at })).toBe("scrap");
    expect(itemVoice({ id: 3, kind: "xp", pos: at })).toBe("spark");
    expect(itemVoice({ id: 4, kind: "ability", pos: at, defId: "x" })).toBe(
      "spark",
    );
    expect(itemVoice({ id: 5, kind: "story", pos: at, defId: "x" })).toBe(
      "relic",
    );
  });
});
