// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The controller→keyboard translation that makes every menu in the game
// navigable with a pad.
//
// The mapping is deliberately pure (`keysForFrame`) so what a frame of pad
// state PRODUCES can be checked without a browser, a controller, or a mounted
// menu. What the bridge does with those keys — dispatch them on `window` — is a
// one-liner over `dispatchEvent` and needs no test of its own.

import { describe, expect, it } from "vitest";

import {
  BUTTON,
  createStepRepeat,
  type GamepadSnapshot,
} from "../pwa/src/lib/gamepad.ts";
import { keysForFrame } from "../pwa/src/lib/gamepad-keys.ts";

function pad(
  options: { axes?: number[]; down?: number[] } = {},
): GamepadSnapshot {
  const buttons = new Array(17).fill(false);
  for (const index of options.down ?? []) buttons[index] = true;
  return {
    index: 0,
    id: "test pad",
    standard: true,
    buttons,
    axes: options.axes ?? [0, 0, 0, 0],
  };
}

describe("keysForFrame", () => {
  it("turns the d-pad into arrow keys", () => {
    const repeat = createStepRepeat();
    expect(
      keysForFrame(pad(), pad({ down: [BUTTON.dpadDown] }), repeat, 0),
    ).toEqual(["ArrowDown"]);
  });

  it("turns a pushed stick into arrow keys", () => {
    const repeat = createStepRepeat();
    // Forward is negative Y in screen coordinates.
    expect(
      keysForFrame(pad(), pad({ axes: [0, -1, 0, 0] }), repeat, 0),
    ).toEqual(["ArrowUp"]);
  });

  it("maps A to Enter and B to Escape", () => {
    // The console convention every player already has in their hands, and
    // exactly what this UI implements.
    const repeat = createStepRepeat();
    expect(keysForFrame(pad(), pad({ down: [BUTTON.a] }), repeat, 0)).toEqual([
      "Enter",
    ]);
    expect(
      keysForFrame(pad(), pad({ down: [BUTTON.b] }), createStepRepeat(), 0),
    ).toEqual(["Escape"]);
  });

  it("maps START to Escape as well", () => {
    // A player who opened a menu with START expects it to close the same way.
    const repeat = createStepRepeat();
    expect(
      keysForFrame(pad(), pad({ down: [BUTTON.start] }), repeat, 0),
    ).toEqual(["Escape"]);
  });

  it("leaves every other button alone", () => {
    // A button that did something surprising in a menu is worse than one that
    // does nothing.
    const repeat = createStepRepeat();
    for (const button of [
      BUTTON.x,
      BUTTON.y,
      BUTTON.leftBumper,
      BUTTON.select,
    ]) {
      expect(keysForFrame(pad(), pad({ down: [button] }), repeat, 0)).toEqual(
        [],
      );
    }
  });

  it("does not repeat a held button", () => {
    // A held A must choose one row, not confirm sixty times a second.
    const repeat = createStepRepeat();
    const down = pad({ down: [BUTTON.a] });
    expect(keysForFrame(pad(), down, repeat, 0)).toEqual(["Enter"]);
    expect(keysForFrame(down, down, repeat, 16)).toEqual([]);
    expect(keysForFrame(down, down, repeat, 500)).toEqual([]);
  });

  it("DOES repeat a held direction, after a delay", () => {
    // The opposite rule to a button: holding down should walk a long list.
    const repeat = createStepRepeat();
    const held = pad({ down: [BUTTON.dpadDown] });
    expect(keysForFrame(pad(), held, repeat, 0)).toEqual(["ArrowDown"]);
    expect(keysForFrame(held, held, repeat, 100)).toEqual([]);
    expect(keysForFrame(held, held, repeat, 400)).toEqual(["ArrowDown"]);
  });

  it("emits a direction and a button pressed on the same frame", () => {
    const repeat = createStepRepeat();
    const keys = keysForFrame(
      pad(),
      pad({ down: [BUTTON.dpadUp, BUTTON.a] }),
      repeat,
      0,
    );
    expect(keys).toContain("ArrowUp");
    expect(keys).toContain("Enter");
  });

  it("emits nothing when the pad goes away", () => {
    const repeat = createStepRepeat();
    expect(keysForFrame(pad({ down: [BUTTON.a] }), null, repeat, 0)).toEqual(
      [],
    );
  });

  it("emits nothing on the very first frame", () => {
    // Launching with a button held must not confirm whatever row the menu
    // happened to open on.
    const repeat = createStepRepeat();
    expect(keysForFrame(null, pad({ down: [BUTTON.a] }), repeat, 0)).toEqual(
      [],
    );
  });
});
