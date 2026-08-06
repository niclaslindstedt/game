// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCRIPT SEAM as a MOD meets it: registering rules, overriding one hook out
// of a file, what a broken script does to a run, and what a script may and may
// not see of the game.
//
// The failure modes are the point. A scripting hook's mistakes are all silent
// by nature — a typo'd hook name, a nil return, a loop that never ends — and
// each of those has to become either a build refusal or a named log line with
// the shipped rule standing in. A run must never stop because somebody
// subscribed to a mod.

import { afterEach, describe, expect, it, vi } from "vitest";

import { registerDefs } from "@game/core";
import {
  hookIsScripted,
  numberHook,
  resetScriptHost,
} from "../../src/game/script/host.ts";
import { HOOKS } from "../../src/game/script/hooks.ts";
import { GENERATED_SCRIPTS } from "../../src/generated/scripts.ts";
import { validateScript } from "../../scripts/asset-tools/script-schema.mjs";
import * as output from "../../src/output.ts";

/** Register a mod's rules — the same call `applyMods` makes. */
function installScripts(sources: Record<string, string>): void {
  registerDefs({
    scripts: Object.fromEntries(
      Object.entries(sources).map(([id, source]) => [id, { id, source }]),
    ),
  });
}

/** …and put the shipped game back, as `restoreBaseDefs()` does at run end. */
function restoreShippedScripts(): void {
  registerDefs({ scripts: {} });
}

afterEach(() => {
  restoreShippedScripts();
  resetScriptHost();
  vi.restoreAllMocks();
});

describe("a mod's rules replace the shipped ones", () => {
  it("takes over a hook, and hands it back when the run ends", () => {
    const shipped = numberHook("overkill_efficiency", [1000, 100], () => -1);
    expect(shipped).toBeCloseTo(0.1, 10);

    installScripts({
      menace: "return { overkill_efficiency = function() return 1 end }",
    });
    // A mod that decides farming should pay full value, forever.
    expect(numberHook("overkill_efficiency", [1000, 100], () => -1)).toBe(1);

    restoreShippedScripts();
    expect(
      numberHook("overkill_efficiency", [1000, 100], () => -1),
    ).toBeCloseTo(0.1, 10);
  });

  it("keeps the shipped rule for a hook the override does not implement", () => {
    // An override is a PATCH, not a replacement: `menace.lua` also owns
    // `mob_level` and `mob_hp_level_factor`, and a mod that only cares about
    // overkill must not silently lose the other two.
    installScripts({
      menace: "return { overkill_efficiency = function() return 0.5 end }",
    });
    expect(numberHook("overkill_efficiency", [1000, 100], () => -1)).toBe(0.5);
    expect(
      numberHook("mob_level", [10, 2, undefined, undefined], () => -1),
    ).toBe(12);
    expect(numberHook("mob_hp_level_factor", [1], () => -1)).toBeGreaterThan(0);
  });

  it("leaves the OTHER script files alone", () => {
    installScripts({
      menace: "return { overkill_efficiency = function() return 1 end }",
    });
    // progression.lua is untouched, so the XP curve is still the game's.
    expect(numberHook("xp_to_level_up", [1, 100, 0], () => -1)).toBe(100);
  });

  it("can read the run's config and the developer knobs", () => {
    installScripts({
      menace: `return {
        overkill_efficiency = function()
          return game.config.menace.mobHpBase * game.balance.mobHp
        end,
      }`,
    });
    expect(numberHook("overkill_efficiency", [1, 1], () => -1)).toBeGreaterThan(
      0,
    );
  });
});

describe("a broken script never stops the run", () => {
  it("falls back to the shipped rule when a hook throws, and says so once", () => {
    const reported = vi.spyOn(output, "error").mockImplementation(() => {});
    installScripts({
      menace: `return {
        overkill_efficiency = function() error("this mod is broken") end,
      }`,
    });
    // The shipped answer, three times over — and one report, not three.
    for (let i = 0; i < 3; i++) {
      expect(
        numberHook("overkill_efficiency", [1000, 100], () => -1),
      ).toBeCloseTo(0.1, 10);
    }
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported.mock.calls[0]?.[0]).toMatch(/overkill_efficiency/);
  });

  it("falls back when a hook returns nil rather than putting NaN in the economy", () => {
    const reported = vi.spyOn(output, "error").mockImplementation(() => {});
    installScripts({
      menace: "return { overkill_efficiency = function() end }",
    });
    const answer = numberHook("overkill_efficiency", [1000, 100], () => -1);
    expect(Number.isFinite(answer)).toBe(true);
    expect(answer).toBeCloseTo(0.1, 10);
    expect(reported.mock.calls[0]?.[0]).toMatch(/nil/);
  });

  it("falls back when a hook returns a non-number", () => {
    vi.spyOn(output, "error").mockImplementation(() => {});
    installScripts({
      menace: `return { overkill_efficiency = function() return "loads" end }`,
    });
    expect(
      numberHook("overkill_efficiency", [1000, 100], () => -1),
    ).toBeCloseTo(0.1, 10);
  });

  it("kills a runaway hook on its budget and falls back", () => {
    const reported = vi.spyOn(output, "error").mockImplementation(() => {});
    installScripts({
      menace: `return {
        overkill_efficiency = function() while true do end end,
      }`,
    });
    expect(
      numberHook("overkill_efficiency", [1000, 100], () => -1),
    ).toBeCloseTo(0.1, 10);
    expect(reported.mock.calls[0]?.[0]).toMatch(/budget/);
  });

  it("falls back for the whole FILE when it will not compile", () => {
    const reported = vi.spyOn(output, "error").mockImplementation(() => {});
    installScripts({ menace: "return { this is not lua" });
    expect(
      numberHook("overkill_efficiency", [1000, 100], () => -1),
    ).toBeCloseTo(0.1, 10);
    expect(
      numberHook("mob_level", [10, 2, undefined, undefined], () => -1),
    ).toBe(12);
    expect(reported.mock.calls[0]?.[0]).toMatch(/menace\.lua/);
  });

  it("takes the engine's own arithmetic when there is no script at all", () => {
    // The shipped catalog is what makes `hookIsScripted` true; a build with an
    // empty content tree (a fresh clone, a fixture-only engine suite) has to
    // keep running, which is what the bindings' fallbacks are for.
    expect(hookIsScripted("overkill_efficiency")).toBe(true);
    expect(numberHook("no_such_hook", [], () => 42)).toBe(42);
  });
});

describe("what a script cannot do", () => {
  const escapes: [string, string][] = [
    [
      "reach the filesystem",
      "return { overkill_efficiency = function() return io.open('/etc/passwd') and 1 or 2 end }",
    ],
    [
      "read the clock",
      "return { overkill_efficiency = function() return os.time() end }",
    ],
    [
      "load more code",
      "return { overkill_efficiency = function() return load('return 1')() end }",
    ],
    [
      "require a module",
      "return { overkill_efficiency = function() return require('os') and 1 or 2 end }",
    ],
    [
      "reach its own globals",
      "return { overkill_efficiency = function() return _G.game and 1 or 2 end }",
    ],
  ];

  it.each(escapes)("cannot %s", (_what, source) => {
    vi.spyOn(output, "error").mockImplementation(() => {});
    installScripts({ menace: source });
    // Every one of these is a nil call or a nil index — the hook throws, and
    // the shipped rule stands. None of them reaches anything.
    expect(
      numberHook("overkill_efficiency", [1000, 100], () => -1),
    ).toBeCloseTo(0.1, 10);
  });

  it("cannot write to the run, the config or the knobs", () => {
    vi.spyOn(output, "error").mockImplementation(() => {});
    for (const target of [
      "game.config.menace.mobHpBase = 999",
      "game.balance.mobHp = 999",
      "game.run.kills = 999",
    ]) {
      installScripts({
        menace: `return { overkill_efficiency = function() ${target} return 1 end }`,
      });
      resetScriptHost();
      expect(
        numberHook("overkill_efficiency", [1000, 100], () => -1),
        target,
      ).toBeCloseTo(0.1, 10);
    }
    // …and the real config is untouched by every one of those attempts.
    restoreShippedScripts();
    resetScriptHost();
    expect(
      numberHook("overkill_efficiency", [1000, 100], () => -1),
    ).toBeCloseTo(0.1, 10);
  });
});

describe("the compiler catches what play time cannot", () => {
  it("refuses a file that does not parse, naming the line", () => {
    const { errors } = validateScript("menace", "local x =\n= 3", {});
    expect(errors.join("\n")).toMatch(/menace\.lua:2/);
  });

  it("refuses a file that forgot its `return M`", () => {
    const { errors } = validateScript("menace", "local M = {}", {});
    expect(errors.join("\n")).toMatch(/return M/);
  });

  it("warns about a hook name that is not one — the silent typo", () => {
    // Without this, a mod's `overkil_efficiency` is a file that appears to do
    // nothing, forever, with the shipped rule quietly standing in.
    const { warnings, hooks } = validateScript(
      "menace",
      "return { overkil_efficiency = function() return 1 end }",
      {},
    );
    expect(hooks).toEqual([]);
    expect(warnings.join("\n")).toMatch(/overkil_efficiency/);
    expect(warnings.join("\n")).toMatch(/overkill_efficiency/);
  });

  it("refuses a hook that is not a function", () => {
    const { errors } = validateScript(
      "menace",
      "return { overkill_efficiency = 3 }",
      {},
    );
    expect(errors.join("\n")).toMatch(/not a function/);
  });

  it("refuses a script id the engine never reads", () => {
    const { errors } = validateScript("wizardry", "return {}", {});
    expect(errors.join("\n")).toMatch(/no such script/);
  });

  it("accepts every shipped script, and each implements its own hooks", () => {
    for (const [id, { source }] of Object.entries(GENERATED_SCRIPTS)) {
      const { errors, warnings, hooks } = validateScript(id, source, {
        shipped: true,
      });
      expect(errors, id).toEqual([]);
      expect(warnings, id).toEqual([]);
      expect(hooks.sort(), id).toEqual(
        HOOKS.filter((h) => h.script === id)
          .map((h) => h.hook)
          .sort(),
      );
    }
  });
});
