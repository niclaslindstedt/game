// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The embedded Lua VM (`engine/lib/lua/`) — a LIB test, so it stays at the tests/
// root beside chiptune/synth/rng and references no game content.
//
// Three things are being pinned here, and only the first is "does Lua work":
//
//   1. the language subset a hook author will actually write,
//   2. the SANDBOX — that the escapes a stranger's script would reach for are
//      absent, and that the host's read-only views cannot be written through,
//   3. DETERMINISM — no clock, no unseeded randomness, and a stable iteration
//      and sort order, because two machines simulate one multiplayer run.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_BUDGET,
  LuaBudgetError,
  LuaError,
  LuaSyntaxError,
  LuaTable,
  callFunction,
  compile,
  freezeTable,
  load,
  moduleFunction,
  native,
  toLuaTable,
  type LuaValue,
} from "@game/lib/lua/index.ts";

/** Run a chunk and return what its `return` yielded, as one value. */
function evalLua(src: string, env: Record<string, LuaValue> = {}): LuaValue {
  const mod = load(
    compile(`return { main = function() ${src} end }`, "test"),
    env,
  );
  const fn = moduleFunction(mod, "main");
  if (!fn) throw new Error("no main");
  return callFunction(mod, fn, [])[0];
}

describe("the language subset", () => {
  it("evaluates arithmetic with Lua's precedence and associativity", () => {
    expect(evalLua("return 2 + 3 * 4")).toBe(14);
    expect(evalLua("return 2 ^ 3 ^ 2")).toBe(512); // right-associative
    expect(evalLua("return -2 ^ 2")).toBe(-4); // ^ binds tighter than unary -
    expect(evalLua("return 7 // 2")).toBe(3);
    expect(evalLua("return 2 .. 3")).toBe("23");
  });

  it("follows Lua's modulo sign, not JavaScript's", () => {
    // `-1 % 5` is 4 in Lua and -1 in JS. A ported formula that wraps an index
    // would be off by the divisor if this were taken from the host language.
    expect(evalLua("return -1 % 5")).toBe(4);
    expect(evalLua("return 1 % -5")).toBe(-4);
  });

  it("runs the control-flow forms a hook is written in", () => {
    expect(evalLua("local t = 0 for i = 1, 5 do t = t + i end return t")).toBe(
      15,
    );
    expect(
      evalLua("local t = 0 for i = 10, 1, -2 do t = t + 1 end return t"),
    ).toBe(5);
    expect(evalLua("local i = 0 while i < 4 do i = i + 1 end return i")).toBe(
      4,
    );
    expect(evalLua("local i = 0 repeat i = i + 1 until i >= 3 return i")).toBe(
      3,
    );
    expect(
      evalLua("if false then return 1 elseif true then return 2 end"),
    ).toBe(2);
    expect(evalLua("for i = 1, 10 do if i == 4 then return i end end")).toBe(4);
  });

  it("closes over locals by reference, as upvalues", () => {
    expect(
      evalLua(`
        local n = 0
        local function bump() n = n + 1 end
        bump() bump() bump()
        return n`),
    ).toBe(3);
  });

  it("reads the OUTER variable in `local x = x`", () => {
    expect(evalLua("local x = 5 do local x = x + 1 return x end")).toBe(6);
  });

  it("handles varargs, select and multiple returns", () => {
    expect(
      evalLua(`
        local function pair() return 1, 2 end
        local function count(...) return select("#", ...) end
        return count(pair())`),
    ).toBe(2);
    // Parentheses truncate a multi-value expression to exactly one.
    expect(
      evalLua(`
        local function pair() return 1, 2 end
        local function count(...) return select("#", ...) end
        return count((pair()))`),
    ).toBe(1);
  });

  it("supports tables, methods and metatable __index", () => {
    expect(
      evalLua(`
        local base = { greet = function(self) return self.n * 2 end }
        local t = setmetatable({ n = 21 }, { __index = base })
        return t:greet()`),
    ).toBe(42);
  });

  it("counts # as the array border and grows through table.insert", () => {
    expect(evalLua("local t = {1,2,3} table.insert(t, 4) return #t")).toBe(4);
    expect(
      evalLua("local t = {1,2,3} table.remove(t, 1) return t[1] + #t"),
    ).toBe(4);
    expect(evalLua("local t = {} t[1]=1 t[3]=3 t[2]=2 return #t")).toBe(3);
  });

  it("recurses, up to a bounded depth", () => {
    expect(
      evalLua(`
        local function fib(n) if n < 2 then return n end return fib(n-1) + fib(n-2) end
        return fib(12)`),
    ).toBe(144);
    expect(() =>
      evalLua("local function f(n) return f(n+1) end return f(1)"),
    ).toThrow(/stack overflow|instruction budget/);
  });

  it("reports a syntax error with the chunk name and the line", () => {
    expect(() => compile("local x =\n= 3", "my_hook.lua")).toThrow(
      LuaSyntaxError,
    );
    expect(() => compile("local x =\n= 3", "my_hook.lua")).toThrow(
      /my_hook\.lua:2/,
    );
  });

  it("refuses goto rather than mis-parsing it", () => {
    expect(() => compile("goto done", "t")).toThrow(/goto/);
  });
});

describe("the sandbox", () => {
  const missing = [
    "io",
    "os",
    "require",
    "load",
    "loadstring",
    "dofile",
    "loadfile",
    "package",
    "debug",
    "coroutine",
    "_G",
    "collectgarbage",
    "rawset",
  ];

  it.each(missing)("does not expose %s", (name) => {
    expect(evalLua(`return type(${name})`)).toBe("nil");
  });

  it("has no clock and no unseeded randomness", () => {
    // The two sources of nondeterminism. A hook that needs a die is handed the
    // RUN's own seeded stream by the host instead.
    expect(evalLua("return type(math.random)")).toBe("nil");
    expect(evalLua("return type(math.randomseed)")).toBe("nil");
  });

  it("refuses every write to a frozen table", () => {
    const view = freezeTable(
      toLuaTable({ level: 7, nested: toLuaTable({ hp: 3 }) }),
    );
    expect(() => evalLua("state.level = 9", { state: view })).toThrow(
      /read-only table \(field 'level'\)/,
    );
    // Deep: the freeze walks the whole tree, so a nested view is safe too.
    expect(() => evalLua("state.nested.hp = 9", { state: view })).toThrow(
      /read-only table/,
    );
    expect(view.get("level")).toBe(7);
  });

  it("cannot lift a freeze with setmetatable or table.insert", () => {
    const view = freezeTable(toLuaTable([1, 2, 3]));
    expect(() => evalLua("setmetatable(list, {})", { list: view })).toThrow(
      /protected metatable/,
    );
    expect(() => evalLua("table.insert(list, 4)", { list: view })).toThrow(
      /read-only table/,
    );
    expect(() => evalLua("table.sort(list)", { list: view })).toThrow(
      /read-only/,
    );
  });

  it("kills a runaway loop on the instruction budget", () => {
    expect(() => evalLua("while true do end")).toThrow(LuaBudgetError);
  });

  it("does not let a script pcall away its own kill signal", () => {
    // A catchable budget error would let a runaway loop restart itself inside
    // its own handler, forever.
    expect(() =>
      evalLua("local ok = pcall(function() while true do end end) return ok"),
    ).toThrow(LuaBudgetError);
  });

  it("gives each call its own budget", () => {
    const mod = load(
      compile(
        "return { burn = function(n) local t = 0 for i = 1, n do t = t + i end return t end }",
        "t",
      ),
    );
    const fn = moduleFunction(mod, "burn");
    expect(fn).toBeDefined();
    // Two calls that each fit the budget both succeed — the counter is not
    // shared across calls, so a busy hook never starves the next one.
    expect(callFunction(mod, fn!, [1000], 20_000)[0]).toBe(500500);
    expect(callFunction(mod, fn!, [1000], 20_000)[0]).toBe(500500);
    expect(() => callFunction(mod, fn!, [10_000], 5_000)).toThrow(
      LuaBudgetError,
    );
  });

  it("still lets a script pcall its own errors", () => {
    expect(
      evalLua(`
        local ok, msg = pcall(function() error("nope") end)
        return tostring(ok) .. ":" .. tostring(msg)`),
    ).toBe("false:nope");
  });

  it("reports a runtime error against the script's own line", () => {
    const mod = load(
      compile(
        "return {\n  f = function()\n    return nil + 1\n  end,\n}",
        "hook.lua",
      ),
    );
    expect(() => callFunction(mod, moduleFunction(mod, "f")!, [])).toThrow(
      LuaError,
    );
    expect(() => callFunction(mod, moduleFunction(mod, "f")!, [])).toThrow(
      /hook\.lua:3/,
    );
  });
});

describe("determinism", () => {
  it("walks pairs in insertion order, array part first", () => {
    expect(
      evalLua(`
        local t = {}
        t.zebra = 1 t.apple = 2 t[1] = 3
        local order = {}
        for k in pairs(t) do order[#order + 1] = tostring(k) end
        return table.concat(order, ",")`),
    ).toBe("1,zebra,apple");
  });

  it("sorts stably, so equal keys keep their order", () => {
    expect(
      evalLua(`
        local t = { {k=1,n="a"}, {k=1,n="b"}, {k=0,n="c"} }
        table.sort(t, function(x, y) return x.k < y.k end)
        local out = {}
        for _, v in ipairs(t) do out[#out + 1] = v.n end
        return table.concat(out, "")`),
    ).toBe("cab");
  });

  it("formats numbers the same way everywhere", () => {
    expect(evalLua("return tostring(1)")).toBe("1");
    expect(evalLua("return tostring(1.5)")).toBe("1.5");
    expect(evalLua("return tostring(1/0)")).toBe("inf");
    expect(evalLua("return string.format('%.2f', 1/3)")).toBe("0.33");
    expect(evalLua("return string.format('%d apples', 4)")).toBe("4 apples");
  });
});

describe("the host boundary", () => {
  it("calls native functions and passes values both ways", () => {
    const seen: LuaValue[][] = [];
    const env = {
      probe: native("probe", (args) => {
        seen.push(args);
        return [args.length, "ok"];
      }),
    };
    expect(evalLua("local n, s = probe(1, 'two') return s .. n", env)).toBe(
      "ok2",
    );
    expect(seen).toEqual([[1, "two"]]);
  });

  it("hands the host a table it can read back", () => {
    const out = evalLua("return { a = 1, 'x', 'y' }");
    expect(out).toBeInstanceOf(LuaTable);
    const t = out as LuaTable;
    expect(t.get("a")).toBe(1);
    expect(t.get(1)).toBe("x");
    expect(t.length).toBe(2);
  });

  it("reports a module that declares no hooks as empty rather than throwing", () => {
    const mod = load(compile("local x = 1", "empty"));
    expect(mod.exports.length).toBe(0);
    expect(moduleFunction(mod, "anything")).toBeUndefined();
  });

  it("reuses one compiled chunk across independent loads", () => {
    // Compilation is a BUILD-time cost; a run pays for the call alone. Two
    // loads of one chunk must not share state.
    const script = compile(
      "local n = 0 return { bump = function() n = n + 1 return n end }",
      "t",
    );
    const a = load(script);
    const b = load(script);
    expect(callFunction(a, moduleFunction(a, "bump")!, [])[0]).toBe(1);
    expect(callFunction(a, moduleFunction(a, "bump")!, [])[0]).toBe(2);
    expect(callFunction(b, moduleFunction(b, "bump")!, [])[0]).toBe(1);
  });

  it("defaults the budget generously enough for a real formula", () => {
    expect(DEFAULT_BUDGET).toBeGreaterThanOrEqual(100_000);
  });
});

describe("the VM stays shippable", () => {
  // Two invariants make `scripts/build-lua.mjs` (the shipped mod compiler's
  // copy) and the repo's own `node`-imported copy both work. Neither is
  // enforced by the type-checker, and breaking either fails at PACKAGING time
  // or, worse, on a player's machine.
  const dir = fileURLToPath(new URL("../engine/lib/lua", import.meta.url));
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, readFileSync(`${dir}/${f}`, "utf8")] as const);

  it("has files to check", () => {
    expect(sources.length).toBeGreaterThan(4);
  });

  it.each(sources.map(([name]) => name))(
    "%s uses no aliased import",
    (name) => {
      // `tsc` refuses to EMIT a file whose import is both aliased and carries a
      // `.ts` extension (TS2877), which is why the server's ship target needs a
      // whole staging step. Keeping this tree alias-free is what lets the VM's
      // target be twenty lines instead.
      const source = sources.find(([f]) => f === name)![1];
      expect(source).not.toMatch(/from\s+"@(game|ui)\//);
    },
  );

  it.each(sources.map(([name]) => name))(
    "%s uses no non-erasable TypeScript",
    (name) => {
      // Node's strip-only type erasure refuses a constructor parameter
      // property, an `enum` and a `namespace` — and the content pipeline's
      // generator imports this tree DIRECTLY under plain `node` to compile and
      // check every authored script. Validating with a second, friendlier
      // parser is exactly the drift the one-schema rule exists to prevent.
      const source = sources.find(([f]) => f === name)![1];
      expect(source, "parameter property").not.toMatch(
        /constructor\s*\([^)]*\b(private|public|protected|readonly)\s/s,
      );
      expect(source, "enum").not.toMatch(/^\s*(export\s+)?enum\s/m);
      expect(source, "namespace").not.toMatch(/^\s*(export\s+)?namespace\s/m);
    },
  );
});
