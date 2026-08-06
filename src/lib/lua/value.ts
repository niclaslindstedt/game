// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VALUE MODEL of the embedded Lua. Generic engine code — it knows nothing
// about this game, only about Lua semantics.
//
// Two decisions here shape everything above:
//
//  1. **One number type.** Lua 5.4 splits integers and floats; this VM keeps a
//     single IEEE-754 double, like Lua 5.1/5.2 and like JavaScript. The point
//     is DETERMINISM across the four places a script runs (browser, Node
//     session server, Electron, the WebView shells): a script that produced a
//     float on one and an integer on another would desync a seeded run. `//`
//     and `%` still floor, `math.type` is deliberately absent, and integer
//     division by zero yields ±inf rather than raising.
//  2. **A table has an array part.** `#t`, `ipairs` and `table.insert` are the
//     shapes scripts actually use, and a pure `Map` makes each of them a scan.
//     Keys 1..n live in `arr`, everything else in `hash`, and the two are kept
//     from ever holding the same key by `normalizeKey`.

/** Every value the VM can hold. `undefined` IS Lua's `nil`. */
export type LuaValue =
  undefined | boolean | number | string | LuaTable | LuaFunction;

/** A function implemented in TypeScript, called with (and returning) a list of
 * Lua values — Lua's multiple returns are the natural shape here. */
export type LuaNative = (args: LuaValue[]) => LuaValue[] | void;

/** Either a compiled Lua closure (opaque to this module — `interp.ts` owns its
 * shape) or a host function. `LuaFunction` is what `type()` calls "function". */
export type LuaFunction = {
  /** Host implementation, when this is a native. */
  readonly native?: LuaNative;
  /** Closure payload, when this came from Lua source. */
  readonly closure?: unknown;
  /** Name used in error messages and stack traces. */
  readonly name: string;
};

/** A thrown Lua error, carrying the raised VALUE (usually a string) plus the
 * chunk position the host prefixes onto it. */
export class LuaError extends Error {
  readonly value: LuaValue;
  constructor(value: LuaValue, where?: string) {
    super(`${where ? `${where}: ` : ""}${luaToDisplay(value)}`);
    this.name = "LuaError";
    this.value = value;
  }
}

/** Raised when a script exceeds its instruction budget — never catchable by the
 * script's own `pcall`, so a runaway loop cannot swallow its own kill signal. */
export class LuaBudgetError extends Error {
  constructor(steps: number) {
    super(`script exceeded its instruction budget (${steps} steps)`);
    this.name = "LuaBudgetError";
  }
}

/** A key as the table stores it: `-0` folded to `0` so `t[-0]` and `t[0]` are
 * one slot, and NaN rejected (Lua refuses it as a key). */
function normalizeKey(key: LuaValue): LuaValue {
  if (typeof key === "number") {
    if (Number.isNaN(key)) throw new LuaError("table index is NaN");
    return key === 0 ? 0 : key;
  }
  if (key === undefined) throw new LuaError("table index is nil");
  return key;
}

/** True for a key that belongs in the array part at all (a positive integer). */
function arrayIndex(key: LuaValue): number | null {
  if (typeof key !== "number") return null;
  if (!Number.isInteger(key) || key < 1) return null;
  return key;
}

/** A Lua table: the array part (`arr[i]` holds key `i + 1`), the hash part, and
 * an optional metatable. */
export class LuaTable {
  /** Keys 1..arr.length. A hole is `undefined`, exactly as in Lua. */
  readonly arr: LuaValue[] = [];
  readonly hash = new Map<LuaValue, LuaValue>();
  metatable: LuaTable | undefined;
  /** Set by `freezeTable` — the host's read-only views ride this rather than a
   * metatable, so a script cannot lift it with `setmetatable`. */
  frozen = false;

  get(key: LuaValue): LuaValue {
    if (typeof key === "number") {
      const i = arrayIndex(key);
      if (i !== null && i <= this.arr.length) return this.arr[i - 1];
      if (key === 0) return this.hash.get(0);
    }
    if (key === undefined) return undefined;
    return this.hash.get(key);
  }

  /** Raw assignment — no metamethods, no frozen check (the interpreter does
   * both before calling this). */
  set(key: LuaValue, value: LuaValue): void {
    const k = normalizeKey(key);
    const i = arrayIndex(k);
    if (i !== null) {
      if (i <= this.arr.length) {
        this.arr[i - 1] = value;
        // Dropping the last element shortens the array part, so `#t` stays a
        // border instead of pointing at a hole the caller just made.
        if (value === undefined && i === this.arr.length) {
          while (
            this.arr.length > 0 &&
            this.arr[this.arr.length - 1] === undefined
          ) {
            this.arr.pop();
          }
        }
        return;
      }
      if (i === this.arr.length + 1) {
        if (value === undefined) {
          this.hash.delete(k);
          return;
        }
        this.arr.push(value);
        // The push may have bridged to keys parked in the hash part — migrate
        // them back so `#t` sees the whole run.
        let next = this.arr.length + 1;
        while (this.hash.has(next)) {
          this.arr.push(this.hash.get(next));
          this.hash.delete(next);
          next++;
        }
        return;
      }
    }
    if (value === undefined) this.hash.delete(k);
    else this.hash.set(k, value);
  }

  /** The `#` border: the array part's length, which `set` keeps hole-free at
   * its tail. */
  get length(): number {
    return this.arr.length;
  }

  /** Iterate every live key/value pair, array part first — the order `pairs`
   * walks and the order `next` resumes in. */
  *entries(): IterableIterator<[LuaValue, LuaValue]> {
    for (let i = 0; i < this.arr.length; i++) {
      const v = this.arr[i];
      if (v !== undefined) yield [i + 1, v];
    }
    for (const [k, v] of this.hash) {
      if (v !== undefined) yield [k, v];
    }
  }
}

/** Build a table from a plain JS record — the host's usual way in. */
export function toLuaTable(
  obj: Record<string, LuaValue> | readonly LuaValue[],
): LuaTable {
  const t = new LuaTable();
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) t.set(i + 1, obj[i]);
  } else {
    for (const [k, v] of Object.entries(obj as Record<string, LuaValue>)) {
      t.set(k, v);
    }
  }
  return t;
}

/** Mark a table (and, deeply, every table it holds) read-only. The interpreter
 * refuses every write to a frozen table with a named error, which is how the
 * host exposes the run's state to a script without letting the script edit it.
 * A cycle is fine — visited tables are skipped. */
export function freezeTable(t: LuaTable, seen = new Set<LuaTable>()): LuaTable {
  if (seen.has(t)) return t;
  seen.add(t);
  t.frozen = true;
  for (const [, v] of t.entries()) {
    if (v instanceof LuaTable) freezeTable(v, seen);
  }
  return t;
}

/** Lua truthiness: everything but `nil` and `false`. */
export function truthy(v: LuaValue): boolean {
  return v !== undefined && v !== false;
}

/** The name `type()` answers with. */
export function luaType(v: LuaValue): string {
  if (v === undefined) return "nil";
  switch (typeof v) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    default:
      return v instanceof LuaTable ? "table" : "function";
  }
}

/** Lua's number → string rule: an integral value prints without a decimal
 * point, everything else through `%.14g`. Fixed here rather than left to JS's
 * `String(n)` so a script's `tostring(1)` reads "1" on every platform. */
export function numberToString(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const g = n.toPrecision(14);
  // Trim the trailing zeros %g drops, and normalise the exponent form.
  return g.includes("e")
    ? g.replace(/\.?0+e/, "e")
    : g.includes(".")
      ? g.replace(/\.?0+$/, "")
      : g;
}

/** `tostring(v)` for the VM's own messages — tables print as an opaque handle
 * rather than an address, so a script's output is reproducible. */
export function luaToDisplay(v: LuaValue): string {
  if (v === undefined) return "nil";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return numberToString(v);
  if (typeof v === "string") return v;
  if (v instanceof LuaTable) return "table";
  return `function: ${v.name}`;
}

/** Lua's string → number coercion (used by arithmetic and `tonumber`).
 * Accepts decimal and hex integer literals with surrounding space; anything
 * else is `undefined`. */
export function stringToNumber(s: string): number | undefined {
  const t = s.trim();
  if (t === "") return undefined;
  if (/^[-+]?0[xX][0-9a-fA-F]+$/.test(t)) {
    const neg = t.startsWith("-");
    const n = Number.parseInt(t.replace(/^[-+]/, ""), 16);
    return neg ? -n : n;
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
}

/** The number an arithmetic operand coerces to, or `undefined` when it is not
 * one (the interpreter turns that into the "attempt to perform arithmetic"
 * error, with the operand's type named). */
export function toNumber(v: LuaValue): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") return stringToNumber(v);
  return undefined;
}

/** Raw equality — `==` without metamethods. Numbers and strings compare by
 * value, tables and functions by identity, exactly as Lua does. */
export function rawEqual(a: LuaValue, b: LuaValue): boolean {
  return a === b;
}
