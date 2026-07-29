// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOD LOAD ORDER — the rules that decide which mod wins a clash.
//
// This is the one part of the mod system the compiler cannot help with. Each
// mod is compiled ALONE, so two mods shipping the same sprite name are both
// perfectly valid; which one the player sees is decided here, at load, by an
// order they own. Every test below is a rule a player would notice being
// broken: a fresh subscription doing nothing, an order that reshuffled itself
// after an unsubscribe, or a press of the arrow key that moved nothing.

import { describe, expect, it } from "vitest";

import {
  moveMod,
  resolveOrder,
  setModEnabled,
} from "../pwa/src/game/mod-order.ts";
import type { ModOrderEntry } from "../pwa/src/game/settings.ts";

/** The installed set, as `resolveOrder` takes it. The value is a stand-in for
 * the compiled mod — the ordering never looks inside it. */
const installed = (...ids: string[]): [string, string][] =>
  ids.map((id) => [id, `bundle:${id}`]);

const on = (...ids: string[]): ModOrderEntry[] =>
  ids.map((id) => ({ id, on: true }));

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("resolveOrder", () => {
  it("keeps the player's order, not the order the disk happened to list", () => {
    // The installed set arrives in a different order from the ranked one —
    // Steam's subscription list has no notion of the player's ranking.
    const { rows } = resolveOrder(on("b", "a"), installed("a", "b"));
    expect(ids(rows)).toEqual(["b", "a"]);
  });

  it("appends a newly-seen mod LAST, so a fresh subscription wins", () => {
    const { rows, order } = resolveOrder(on("a"), installed("a", "new"));
    expect(ids(rows)).toEqual(["a", "new"]);
    expect(order[order.length - 1]).toEqual({ id: "new", on: true });
  });

  it("keeps a rank for a mod that is not installed right now", () => {
    // The player unsubscribed from "b". Its rank must survive, or resubscribing
    // would silently drop it to the bottom and change who wins.
    const { rows, order } = resolveOrder(
      on("a", "b", "c"),
      installed("a", "c"),
    );
    expect(ids(rows)).toEqual(["a", "c"]); // not shown
    expect(order.map((e) => e.id)).toEqual(["a", "b", "c"]); // still ranked
  });

  it("restores a resubscribed mod to the rank it had", () => {
    const { order } = resolveOrder(on("a", "b", "c"), installed("a", "c"));
    const { rows } = resolveOrder(order, installed("a", "b", "c"));
    expect(ids(rows)).toEqual(["a", "b", "c"]);
  });

  it("carries each mod's on/off through", () => {
    const stored: ModOrderEntry[] = [
      { id: "a", on: false },
      { id: "b", on: true },
    ];
    const { rows } = resolveOrder(stored, installed("a", "b"));
    expect(rows.map((row) => row.on)).toEqual([false, true]);
  });
});

describe("setModEnabled", () => {
  it("flips one mod without disturbing the ranking", () => {
    const next = setModEnabled(on("a", "b", "c"), "b", false);
    expect(next.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(next.find((e) => e.id === "b")?.on).toBe(false);
  });
});

describe("moveMod", () => {
  const present = (list: string[]) => (id: string) => list.includes(id);

  it("moves a mod later — which is how it wins a clash", () => {
    const next = moveMod(on("a", "b", "c"), "a", 1, present(["a", "b", "c"]));
    expect(next.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });

  it("moves a mod earlier", () => {
    const next = moveMod(on("a", "b", "c"), "c", -1, present(["a", "b", "c"]));
    expect(next.map((e) => e.id)).toEqual(["a", "c", "b"]);
  });

  it("does nothing at either end rather than wrapping", () => {
    const order = on("a", "b");
    expect(moveMod(order, "a", -1, present(["a", "b"]))).toEqual(order);
    expect(moveMod(order, "b", 1, present(["a", "b"]))).toEqual(order);
  });

  it("steps OVER mods that are not installed, so one press moves one row", () => {
    // "gone" is ranked but not installed, so it is invisible on the screen.
    // Moving "a" later must land it past "gone" and below "b" — the row the
    // player can actually see — rather than eating the press on a ghost.
    const next = moveMod(on("a", "gone", "b"), "a", 1, present(["a", "b"]));
    expect(next.map((e) => e.id)).toEqual(["gone", "b", "a"]);
  });

  it("leaves an unknown id alone", () => {
    const order = on("a", "b");
    expect(moveMod(order, "nope", 1, present(["a", "b"]))).toEqual(order);
  });
});
