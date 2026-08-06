// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SANDBOX'S STANDARD LIBRARY — deliberately a SUBSET, and the subset is the
// security model. What is absent is the point:
//
//   io, os, package, require, dofile, loadfile, load, loadstring
//       — no filesystem, no clock, no way to bring in a second chunk. A script
//         is exactly the text the compiler validated.
//   debug, getfenv/setfenv, rawget/rawset on the host's frozen views
//       — no reaching around the read-only wrappers into the run's real state.
//   coroutine
//       — a suspended hook would carry a live scope across the step boundary,
//         which is a determinism hazard and buys a hook nothing.
//   math.random, math.randomseed, os.time, os.clock
//       — the two sources of nondeterminism. A hook that needs a die rolls the
//         RUN's own seeded stream, which the host installs under `rng()` only
//         for the hooks whose draws are part of the seeded sequence.
//
// Everything here is otherwise the reference behaviour, so a formula copied out
// of `content/scripts/` into a standalone `lua` on the author's machine gives
// the same answer.

import type { Interpreter } from "./interp.ts";
import {
  LuaError,
  LuaTable,
  luaToDisplay,
  luaType,
  numberToString,
  stringToNumber,
  toLuaTable,
  truthy,
  type LuaFunction,
  type LuaNative,
  type LuaValue,
} from "./value.ts";

/** Wrap a host implementation as a Lua-visible function. */
export function native(name: string, fn: LuaNative): LuaFunction {
  return { native: fn, name };
}

// Explicitly annotated on the VARIABLE, not just the arrow: TypeScript only
// treats a call as unreachable-after (narrowing the caller's types) when the
// const itself carries a `never` return type.
const err: (msg: string) => never = (msg: string) => {
  throw new LuaError(msg);
};

/** The argument at `i` (0-based), erroring with the function's name and the
 * position when it is the wrong type — the message Lua itself would give. */
function checkNumber(args: LuaValue[], i: number, fname: string): number {
  const v = args[i];
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? stringToNumber(v)
        : undefined;
  if (n === undefined) {
    err(
      `bad argument #${i + 1} to '${fname}' (number expected, got ${luaType(v)})`,
    );
  }
  return n;
}

function checkTable(args: LuaValue[], i: number, fname: string): LuaTable {
  const v = args[i];
  if (!(v instanceof LuaTable)) {
    err(
      `bad argument #${i + 1} to '${fname}' (table expected, got ${luaType(v)})`,
    );
  }
  return v;
}

function checkString(args: LuaValue[], i: number, fname: string): string {
  const v = args[i];
  if (typeof v === "string") return v;
  if (typeof v === "number") return numberToString(v);
  return err(
    `bad argument #${i + 1} to '${fname}' (string expected, got ${luaType(v)})`,
  );
}

/** `math`, minus the two nondeterministic entries. */
function mathLib(): LuaTable {
  const unary = (name: string, f: (x: number) => number) =>
    native(name, (a) => [f(checkNumber(a, 0, name))]);
  const t = toLuaTable({
    pi: Math.PI,
    huge: Infinity,
    // Lua 5.4's integer bounds, kept as the values a ported formula compares
    // against even though this VM has one number type (see value.ts).
    maxinteger: Number.MAX_SAFE_INTEGER,
    mininteger: -Number.MAX_SAFE_INTEGER,
    abs: unary("abs", Math.abs),
    ceil: unary("ceil", Math.ceil),
    floor: unary("floor", Math.floor),
    sqrt: unary("sqrt", Math.sqrt),
    exp: unary("exp", Math.exp),
    sin: unary("sin", Math.sin),
    cos: unary("cos", Math.cos),
    tan: unary("tan", Math.tan),
    asin: unary("asin", Math.asin),
    acos: unary("acos", Math.acos),
    atan: native("atan", (a) => [
      Math.atan2(
        checkNumber(a, 0, "atan"),
        a.length > 1 ? checkNumber(a, 1, "atan") : 1,
      ),
    ]),
    log: native("log", (a) => {
      const x = checkNumber(a, 0, "log");
      if (a.length < 2) return [Math.log(x)];
      const base = checkNumber(a, 1, "log");
      return [
        base === 2
          ? Math.log2(x)
          : base === 10
            ? Math.log10(x)
            : Math.log(x) / Math.log(base),
      ];
    }),
    pow: native("pow", (a) => [
      Math.pow(checkNumber(a, 0, "pow"), checkNumber(a, 1, "pow")),
    ]),
    fmod: native("fmod", (a) => [
      checkNumber(a, 0, "fmod") % checkNumber(a, 1, "fmod"),
    ]),
    modf: native("modf", (a) => {
      const x = checkNumber(a, 0, "modf");
      const i = x >= 0 ? Math.floor(x) : Math.ceil(x);
      return [i, x - i];
    }),
    tointeger: native("tointeger", (a) => {
      const v = a[0];
      return [typeof v === "number" && Number.isInteger(v) ? v : undefined];
    }),
    max: native("max", (a) => {
      if (a.length === 0) err("bad argument #1 to 'max' (value expected)");
      let best = checkNumber(a, 0, "max");
      for (let i = 1; i < a.length; i++)
        best = Math.max(best, checkNumber(a, i, "max"));
      return [best];
    }),
    min: native("min", (a) => {
      if (a.length === 0) err("bad argument #1 to 'min' (value expected)");
      let best = checkNumber(a, 0, "min");
      for (let i = 1; i < a.length; i++)
        best = Math.min(best, checkNumber(a, i, "min"));
      return [best];
    }),
  });
  return t;
}

/** `table`. `sort` uses a comparison the script supplies, so it needs the
 * interpreter to call back into. */
function tableLib(interp: () => Interpreter): LuaTable {
  return toLuaTable({
    insert: native("insert", (a) => {
      const t = checkTable(a, 0, "insert");
      if (t.frozen) err("attempt to modify a read-only table");
      if (a.length >= 3) {
        const pos = checkNumber(a, 1, "insert");
        for (let i = t.length; i >= pos; i--) t.set(i + 1, t.get(i));
        t.set(pos, a[2]);
      } else {
        t.set(t.length + 1, a[1]);
      }
    }),
    remove: native("remove", (a) => {
      const t = checkTable(a, 0, "remove");
      if (t.frozen) err("attempt to modify a read-only table");
      const n = t.length;
      const pos = a.length >= 2 ? checkNumber(a, 1, "remove") : n;
      const removed = t.get(pos);
      for (let i = pos; i < n; i++) t.set(i, t.get(i + 1));
      if (n > 0) t.set(n, undefined);
      return [removed];
    }),
    concat: native("concat", (a) => {
      const t = checkTable(a, 0, "concat");
      const sep =
        a.length >= 2 && a[1] !== undefined ? checkString(a, 1, "concat") : "";
      const from = a.length >= 3 ? checkNumber(a, 2, "concat") : 1;
      const to = a.length >= 4 ? checkNumber(a, 3, "concat") : t.length;
      const parts: string[] = [];
      for (let i = from; i <= to; i++) {
        const v = t.get(i);
        if (typeof v !== "string" && typeof v !== "number") {
          err(`invalid value (at index ${i}) in table for 'concat'`);
        }
        parts.push(typeof v === "number" ? numberToString(v) : v);
      }
      return [parts.join(sep)];
    }),
    unpack: native("unpack", (a) => {
      const t = checkTable(a, 0, "unpack");
      const from = a.length >= 2 ? checkNumber(a, 1, "unpack") : 1;
      const to = a.length >= 3 ? checkNumber(a, 2, "unpack") : t.length;
      const out: LuaValue[] = [];
      for (let i = from; i <= to; i++) out.push(t.get(i));
      return out;
    }),
    sort: native("sort", (a) => {
      const t = checkTable(a, 0, "sort");
      if (t.frozen) err("attempt to modify a read-only table");
      const cmp = a[1];
      const items: LuaValue[] = [];
      for (let i = 1; i <= t.length; i++) items.push(t.get(i));
      const vm = interp();
      // A STABLE sort (Array.prototype.sort is specified stable since ES2019),
      // unlike the reference implementation's quicksort — deliberately: a hook
      // that sorts equal-keyed rows must land on the same order everywhere, or
      // two machines simulating one run would disagree.
      items.sort((x, y) => {
        if (cmp !== undefined) {
          if (truthy(vm.call(cmp, [x, y], 0)[0])) return -1;
          if (truthy(vm.call(cmp, [y, x], 0)[0])) return 1;
          return 0;
        }
        if (typeof x === "number" && typeof y === "number") return x - y;
        if (typeof x === "string" && typeof y === "string") {
          return x < y ? -1 : x > y ? 1 : 0;
        }
        return err(`attempt to compare ${luaType(x)} with ${luaType(y)}`);
      });
      for (let i = 0; i < items.length; i++) t.set(i + 1, items[i]);
    }),
  });
}

/** `string`, minus patterns. `find`/`match`/`gsub` are PLAIN-TEXT here: Lua
 * patterns are a second grammar to implement and to keep bug-compatible, and no
 * gameplay hook needs one. `format` covers the numeric verbs a hook uses in an
 * error message. */
function stringLib(): LuaTable {
  return toLuaTable({
    len: native("len", (a) => [checkString(a, 0, "len").length]),
    sub: native("sub", (a) => {
      const s = checkString(a, 0, "sub");
      let i = a.length >= 2 ? checkNumber(a, 1, "sub") : 1;
      let j =
        a.length >= 3 && a[2] !== undefined ? checkNumber(a, 2, "sub") : -1;
      if (i < 0) i = Math.max(s.length + i + 1, 1);
      else if (i === 0) i = 1;
      if (j < 0) j = s.length + j + 1;
      else if (j > s.length) j = s.length;
      return [i > j ? "" : s.slice(i - 1, j)];
    }),
    upper: native("upper", (a) => [checkString(a, 0, "upper").toUpperCase()]),
    lower: native("lower", (a) => [checkString(a, 0, "lower").toLowerCase()]),
    rep: native("rep", (a) => {
      const n = Math.floor(checkNumber(a, 1, "rep"));
      if (n > 4096) err("string.rep count too large");
      const sep = a.length >= 3 ? checkString(a, 2, "rep") : "";
      const s = checkString(a, 0, "rep");
      return [n <= 0 ? "" : Array.from({ length: n }, () => s).join(sep)];
    }),
    reverse: native("reverse", (a) => [
      checkString(a, 0, "reverse").split("").reverse().join(""),
    ]),
    byte: native("byte", (a) => {
      const s = checkString(a, 0, "byte");
      const i = a.length >= 2 ? checkNumber(a, 1, "byte") : 1;
      const c = s.charCodeAt(i - 1);
      return [Number.isNaN(c) ? undefined : c];
    }),
    char: native("char", (a) => [
      a.map((_, i) => String.fromCharCode(checkNumber(a, i, "char"))).join(""),
    ]),
    find: native("find", (a) => {
      const s = checkString(a, 0, "find");
      const needle = checkString(a, 1, "find");
      const from = a.length >= 3 ? Math.max(1, checkNumber(a, 2, "find")) : 1;
      const at = s.indexOf(needle, from - 1);
      return at < 0 ? [undefined] : [at + 1, at + needle.length];
    }),
    format: native("format", (a) => {
      const fmt = checkString(a, 0, "format");
      let arg = 1;
      return [
        fmt.replace(
          /%([-+ #0]*)(\d*)(?:\.(\d+))?([diouxXeEfgGqs%])/g,
          (_m, flags, width, prec, verb) => {
            if (verb === "%") return "%";
            const v = a[arg++];
            let out: string;
            if (verb === "d" || verb === "i" || verb === "u") {
              out = String(
                Math.trunc(
                  Number(
                    typeof v === "string" ? (stringToNumber(v) ?? 0) : (v ?? 0),
                  ),
                ),
              );
            } else if (verb === "x" || verb === "X" || verb === "o") {
              const n = Math.trunc(Number(v ?? 0));
              out = n.toString(verb === "o" ? 8 : 16);
              if (verb === "X") out = out.toUpperCase();
            } else if (verb === "f") {
              out = Number(v ?? 0).toFixed(
                prec === undefined ? 6 : Number(prec),
              );
            } else if (verb === "e" || verb === "E") {
              out = Number(v ?? 0).toExponential(
                prec === undefined ? 6 : Number(prec),
              );
              if (verb === "E") out = out.toUpperCase();
            } else if (verb === "g" || verb === "G") {
              out = numberToString(Number(v ?? 0));
            } else if (verb === "q") {
              out = JSON.stringify(luaToDisplay(v));
            } else {
              out = luaToDisplay(v);
              if (prec !== undefined) out = out.slice(0, Number(prec));
            }
            const w = Number(width || 0);
            if (out.length >= w) return out;
            const pad = flags.includes("0") && !flags.includes("-") ? "0" : " ";
            return flags.includes("-")
              ? out + " ".repeat(w - out.length)
              : pad.repeat(w - out.length) + out;
          },
        ),
      ];
    }),
  });
}

/** The base functions, installed straight into the chunk's globals. */
function baseLib(globals: LuaTable, interp: () => Interpreter): void {
  const put = (name: string, fn: LuaNative) =>
    globals.set(name, native(name, fn));

  put("type", (a) => [luaType(a[0])]);
  put("tostring", (a) => [luaToDisplay(a[0])]);
  put("tonumber", (a) => {
    const v = a[0];
    if (a.length >= 2 && a[1] !== undefined) {
      const base = checkNumber(a, 1, "tonumber");
      const n = Number.parseInt(checkString(a, 0, "tonumber").trim(), base);
      return [Number.isNaN(n) ? undefined : n];
    }
    if (typeof v === "number") return [v];
    if (typeof v === "string") return [stringToNumber(v)];
    return [undefined];
  });
  put("rawget", (a) => [checkTable(a, 0, "rawget").get(a[1])]);
  put("rawequal", (a) => [a[0] === a[1]]);
  put("rawlen", (a) => {
    const v = a[0];
    return [
      typeof v === "string" ? v.length : checkTable(a, 0, "rawlen").length,
    ];
  });
  put("error", (a) => {
    // `error(v)` raises the VALUE, so `pcall` can hand a table back to the
    // script. The host prefixes the chunk and line when it reaches the top.
    throw new LuaError(a[0]);
  });
  put("assert", (a) => {
    if (!truthy(a[0])) {
      throw new LuaError(a.length >= 2 ? a[1] : "assertion failed!");
    }
    return a;
  });
  put("select", (a) => {
    if (a[0] === "#") return [a.length - 1];
    const n = checkNumber(a, 0, "select");
    return n < 0 ? a.slice(a.length + n) : a.slice(n);
  });
  put("ipairs", (a) => {
    const t = checkTable(a, 0, "ipairs");
    let i = 0;
    return [
      native("ipairs_iter", () => {
        i++;
        const v = t.get(i);
        return v === undefined ? [undefined] : [i, v];
      }),
      t,
      0,
    ];
  });
  put("pairs", (a) => {
    const t = checkTable(a, 0, "pairs");
    // The snapshot is taken up front, so a script mutating the table it is
    // walking gets a defined (if stale) traversal rather than an
    // implementation-dependent one. Insertion order — see LuaTable.entries.
    const items = [...t.entries()];
    let i = 0;
    return [
      native("pairs_iter", () => (i < items.length ? items[i++] : [undefined])),
      t,
      undefined,
    ];
  });
  put("next", (a) => {
    const t = checkTable(a, 0, "next");
    const items = [...t.entries()];
    if (a[1] === undefined) return items.length ? items[0] : [undefined];
    const at = items.findIndex(([k]) => k === a[1]);
    if (at < 0 || at + 1 >= items.length) return [undefined];
    return items[at + 1];
  });
  put("setmetatable", (a) => {
    const t = checkTable(a, 0, "setmetatable");
    if (t.frozen) err("cannot change a protected metatable");
    const mt = a[1];
    t.metatable = mt instanceof LuaTable ? mt : undefined;
    return [t];
  });
  put("getmetatable", (a) => {
    const t = a[0];
    return [t instanceof LuaTable ? t.metatable : undefined];
  });
  put("unpack", (a) => {
    const lib = globals.get("table");
    const fn = lib instanceof LuaTable ? lib.get("unpack") : undefined;
    return fn && typeof fn === "object" && "native" in fn && fn.native
      ? (fn.native(a) ?? [])
      : [];
  });
  put("pcall", (a) => {
    const [fn, ...rest] = a;
    try {
      return [true, ...interp().call(fn, rest, 0)];
    } catch (e) {
      // A BUDGET overrun is NOT catchable: a script that could pcall its own
      // kill signal could loop forever inside the handler.
      if (e instanceof LuaError) return [false, e.value];
      throw e;
    }
  });
}

/**
 * Build a fresh globals table holding the whole sandbox library. `interp` is a
 * thunk because the interpreter needs the globals to exist first — the two
 * refer to each other, and the thunk is where that knot is tied.
 */
export function createGlobals(interp: () => Interpreter): LuaTable {
  const globals = new LuaTable();
  globals.set("math", mathLib());
  globals.set("table", tableLib(interp));
  globals.set("string", stringLib());
  baseLib(globals, interp);
  // `_G` is deliberately ABSENT: handing a script its own environment table is
  // the standard first step of every sandbox escape, and no hook needs it.
  return globals;
}
