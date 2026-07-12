// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The rebindable control scheme (website/src/game/keybindings.ts): the pure
// catalog + code/label helpers the KEY BINDINGS menu and the game loop share.
// What matters: a code resolves back to exactly the action bound to it,
// rebinding steals a key off whatever held it, sanitize/migrate are lenient,
// and every label stays inside the pixel font's glyph set.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEYBINDINGS,
  KEYBIND_ROWS,
  actionForCode,
  bindingLabel,
  codeForChar,
  mouseButtonCode,
  moveVectorForCode,
  sanitizeBindings,
  wheelCode,
  withBinding,
  type BindableAction,
} from "../website/src/game/keybindings.ts";

describe("keybindings catalog", () => {
  it("has a menu row for every bindable action, in order", () => {
    const rowActions = KEYBIND_ROWS.map((r) => r.action);
    const catalog = Object.keys(DEFAULT_KEYBINDINGS) as BindableAction[];
    expect([...rowActions].sort()).toEqual([...catalog].sort());
    // No duplicate rows.
    expect(new Set(rowActions).size).toBe(rowActions.length);
  });

  it("ships a distinct default code per action", () => {
    const codes = Object.values(DEFAULT_KEYBINDINGS);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => c.length > 0)).toBe(true);
  });
});

describe("code lookups", () => {
  it("resolves a discrete action from its bound code", () => {
    expect(actionForCode("KeyE", DEFAULT_KEYBINDINGS)).toBe("useAbility");
    expect(actionForCode("KeyI", DEFAULT_KEYBINDINGS)).toBe("inventory");
    expect(actionForCode("Space", DEFAULT_KEYBINDINGS)).toBe("jump");
  });

  it("returns null for unbound or steering codes", () => {
    expect(actionForCode("KeyZ", DEFAULT_KEYBINDINGS)).toBeNull();
    expect(actionForCode("", DEFAULT_KEYBINDINGS)).toBeNull();
    // Steering keys are handled by moveVectorForCode, not actionForCode.
    expect(actionForCode("KeyW", DEFAULT_KEYBINDINGS)).toBeNull();
  });

  it("maps the steering keys to unit vectors", () => {
    expect(moveVectorForCode("KeyW", DEFAULT_KEYBINDINGS)).toEqual({
      x: 0,
      y: -1,
    });
    expect(moveVectorForCode("KeyD", DEFAULT_KEYBINDINGS)).toEqual({
      x: 1,
      y: 0,
    });
    expect(moveVectorForCode("KeyE", DEFAULT_KEYBINDINGS)).toBeNull();
  });
});

describe("withBinding", () => {
  it("binds a fresh key without touching the rest", () => {
    const next = withBinding(DEFAULT_KEYBINDINGS, "jump", "KeyF");
    expect(next.jump).toBe("KeyF");
    expect(next.inventory).toBe(DEFAULT_KEYBINDINGS.inventory);
    // Pure — the original is untouched.
    expect(DEFAULT_KEYBINDINGS.jump).toBe("Space");
  });

  it("steals a key off whatever action already held it", () => {
    // Bind INVENTORY to the MAP key: MAP is left unbound, INVENTORY takes it.
    const next = withBinding(DEFAULT_KEYBINDINGS, "inventory", "KeyM");
    expect(next.inventory).toBe("KeyM");
    expect(next.map).toBe("");
    expect(actionForCode("KeyM", next)).toBe("inventory");
  });

  it("can bind a mouse or wheel code", () => {
    const next = withBinding(DEFAULT_KEYBINDINGS, "weaponMenu", "Mouse2");
    expect(actionForCode("Mouse2", next)).toBe("weaponMenu");
  });
});

describe("sanitize + migrate", () => {
  it("falls back to defaults for a missing or junk store", () => {
    expect(sanitizeBindings(null)).toEqual(DEFAULT_KEYBINDINGS);
    expect(sanitizeBindings("nope")).toEqual(DEFAULT_KEYBINDINGS);
  });

  it("keeps stored codes and defaults the rest, preserving unbound empties", () => {
    const binds = sanitizeBindings({ jump: "KeyF", map: "" });
    expect(binds.jump).toBe("KeyF");
    expect(binds.map).toBe("");
    expect(binds.inventory).toBe(DEFAULT_KEYBINDINGS.inventory);
  });

  it("turns a single char into a physical code for legacy migration", () => {
    expect(codeForChar("c")).toBe("KeyC");
    expect(codeForChar("X")).toBe("KeyX");
    expect(codeForChar("5")).toBe("Digit5");
    expect(codeForChar("!")).toBe("");
    expect(codeForChar(undefined)).toBe("");
  });
});

describe("labels stay glyph-safe", () => {
  it("names the common physical codes", () => {
    expect(bindingLabel("KeyW")).toBe("W");
    expect(bindingLabel("Digit3")).toBe("3");
    expect(bindingLabel("Space")).toBe("SPACE");
    expect(bindingLabel("ShiftLeft")).toBe("L SHIFT");
    expect(bindingLabel("ArrowUp")).toBe("UP");
    expect(bindingLabel("")).toBe("---");
  });

  it("names mouse and wheel binds Quake-style", () => {
    expect(bindingLabel(mouseButtonCode(0))).toBe("MOUSE 1");
    expect(bindingLabel(mouseButtonCode(2))).toBe("MOUSE 2");
    expect(bindingLabel(mouseButtonCode(1))).toBe("MOUSE 3");
    expect(bindingLabel(wheelCode(-1))).toBe("WHEEL UP");
    expect(bindingLabel(wheelCode(1))).toBe("WHEEL DOWN");
  });

  it("only uses characters the pixel font can draw", () => {
    // Letters, digits, space, and dash all have glyphs; nothing else may appear
    // in a default-scheme label (so PixelText never falls back to '?').
    const allowed = /^[A-Z0-9 -]+$/;
    for (const code of Object.values(DEFAULT_KEYBINDINGS)) {
      expect(bindingLabel(code)).toMatch(allowed);
    }
  });
});
