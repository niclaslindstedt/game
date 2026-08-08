// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INTERPRETER — a tree walker over `ast.ts`, with three properties the
// embedding depends on and which a general-purpose Lua would not give:
//
//  1. **It is metered.** Every statement and every expression costs a step, and
//     the budget belongs to the CALL, not to the VM. A hook that loops forever
//     dies with `LuaBudgetError` after its allowance and cannot catch its own
//     kill signal — `pcall` re-throws it. This is what makes running a
//     stranger's script at 60 Hz a bounded risk rather than a hang.
//  2. **It is deterministic.** There is no clock, no `math.random`, no
//     iteration order that depends on anything but insertion. Two machines
//     stepping the same run through the same script get the same numbers, which
//     is the whole precondition for seeded runs and for multiplayer.
//  3. **It cannot reach out.** The only globals a chunk sees are the ones the
//     host puts in its environment table. There is no `_G` bridge to the host's
//     objects, no `require`, no `load`, no upvalue into TypeScript except the
//     natives the host chose to install.
//
// Scopes are `Map`-based rather than resolved to slots at parse time. A hook
// body is tens of operations; the map lookups cost less than the marshalling
// around the call, and the simplicity is worth more here than the constant
// factor.

import type { Block, Expr, FunctionBody, Stat } from "./ast.ts";
import {
  LuaBudgetError,
  LuaError,
  LuaTable,
  luaToDisplay,
  luaType,
  numberToString,
  toNumber,
  truthy,
  type LuaFunction,
  type LuaValue,
} from "./value.ts";

/** A variable cell. Locals are boxed so a closure capturing one sees later
 * writes to it, which is what Lua's upvalues do. */
type Cell = { v: LuaValue };

/**
 * A lexical scope. `parent` is the enclosing block or function.
 *
 * The map is LAZY, and that is a real optimisation rather than a stylistic one:
 * every block, and every iteration of every loop, pushes a scope, but most of
 * them declare nothing (an `if` arm that only reads, a `while` body that
 * assigns to an outer local). Allocating a `Map` for each was the single
 * largest cost in a hook call — the rarity roll pushes five of them per drop.
 */
class Scope {
  vars: Map<string, Cell> | undefined;
  readonly parent: Scope | undefined;

  constructor(parent: Scope | undefined) {
    this.parent = parent;
  }

  lookup(name: string): Cell | undefined {
    // Walked iteratively rather than recursively: a name lookup is the single
    // hottest thing the interpreter does, and a scope chain in a nested block
    // is a handful of links deep.
    let scope: Scope | undefined = this as Scope;
    while (scope) {
      const cell = scope.vars?.get(name);
      if (cell) return cell;
      scope = scope.parent;
    }
    return undefined;
  }

  declare(name: string, value: LuaValue): Cell {
    const cell = { v: value };
    (this.vars ??= new Map()).set(name, cell);
    return cell;
  }
}

/** The closure payload hung off a `LuaFunction` built from source. */
type Closure = {
  readonly body: FunctionBody;
  readonly scope: Scope;
};

/** What a block execution wants its caller to do next. `undefined` means "fell
 * off the end". Sentinels rather than exceptions: `break` and `return` are the
 * common path, and throwing on the common path is both slower and harder to
 * read in a stack trace. */
type Signal =
  undefined | { kind: "break" } | { kind: "return"; values: LuaValue[] };

/** One call's execution budget and its chunk name, shared down the whole call
 * tree so a hook's allowance covers everything it calls. */
export type RunState = {
  steps: number;
  /** Mutable so ONE interpreter can serve many calls: `callFunction` resets the
   * counter and the ceiling rather than building a fresh VM per hook call. */
  limit: number;
  readonly chunk: string;
  /** Guards against a script recursing until the HOST's stack overflows, which
   * would surface as a RangeError rather than a script error. */
  depth: number;
  readonly maxDepth: number;
};

export class Interpreter {
  /** The chunk's globals. Anything not in here is `nil` to the script. */
  readonly globals: LuaTable;
  private readonly run: RunState;

  constructor(globals: LuaTable, run: RunState) {
    this.globals = globals;
    this.run = run;
  }

  /** Charge one step and enforce the budget. Called from every statement and
   * every expression node — the count is an instruction count in spirit. */
  private step(): void {
    if (++this.run.steps > this.run.limit) {
      throw new LuaBudgetError(this.run.limit);
    }
  }

  private error(msg: string, line: number): never {
    throw new LuaError(`${this.run.chunk}:${line}: ${msg}`);
  }

  // ---- blocks and statements ----------------------------------------------

  execBlock(block: Block, scope: Scope): Signal {
    for (const stat of block.stats) {
      const signal = this.execStat(stat, scope);
      if (signal) return signal;
    }
    return undefined;
  }

  private execStat(stat: Stat, scope: Scope): Signal {
    this.step();
    switch (stat.kind) {
      case "local": {
        const values = this.evalList(stat.exprs, scope, stat.names.length);
        // Declared AFTER the initialisers are evaluated, so
        // `local x = x` reads the OUTER x — Lua's rule, and the one a
        // hand-copied hook most often relies on without noticing.
        stat.names.forEach((name, i) => scope.declare(name, values[i]));
        return undefined;
      }
      case "localfunc": {
        // Declared BEFORE the body is built, so the function can call itself.
        const cell = scope.declare(stat.name, undefined);
        cell.v = this.makeClosure(stat.body, scope);
        return undefined;
      }
      case "assign": {
        const values = this.evalList(stat.exprs, scope, stat.targets.length);
        stat.targets.forEach((target, i) =>
          this.assign(target, values[i], scope),
        );
        return undefined;
      }
      case "callstat":
        this.evalMulti(stat.call, scope);
        return undefined;
      case "do":
        return this.execBlock(stat.block, new Scope(scope));
      case "if": {
        for (const clause of stat.clauses) {
          if (truthy(this.eval(clause.cond, scope))) {
            return this.execBlock(clause.block, new Scope(scope));
          }
        }
        return stat.orelse
          ? this.execBlock(stat.orelse, new Scope(scope))
          : undefined;
      }
      case "while": {
        while (truthy(this.eval(stat.cond, scope))) {
          this.step();
          const signal = this.execBlock(stat.block, new Scope(scope));
          if (signal?.kind === "break") break;
          if (signal) return signal;
        }
        return undefined;
      }
      case "repeat": {
        for (;;) {
          this.step();
          // The condition sees the body's locals, so both share one scope.
          const inner = new Scope(scope);
          const signal = this.execBlock(stat.block, inner);
          if (signal?.kind === "break") break;
          if (signal) return signal;
          if (truthy(this.eval(stat.cond, inner))) break;
        }
        return undefined;
      }
      case "fornum":
        return this.execForNum(stat, scope);
      case "forin":
        return this.execForIn(stat, scope);
      case "return":
        return {
          kind: "return",
          values: this.evalMultiList(stat.exprs, scope),
        };
      case "break":
        return { kind: "break" };
    }
  }

  private execForNum(
    stat: Extract<Stat, { kind: "fornum" }>,
    scope: Scope,
  ): Signal {
    const from = this.forNumber(stat.from, scope, "initial");
    const to = this.forNumber(stat.to, scope, "limit");
    const step = stat.step ? this.forNumber(stat.step, scope, "step") : 1;
    if (step === 0) this.error("'for' step is zero", stat.line);
    for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
      this.step();
      const inner = new Scope(scope);
      inner.declare(stat.name, i);
      const signal = this.execBlock(stat.block, inner);
      if (signal?.kind === "break") break;
      if (signal) return signal;
    }
    return undefined;
  }

  private forNumber(expr: Expr, scope: Scope, what: string): number {
    const n = toNumber(this.eval(expr, scope));
    if (n === undefined) {
      this.error(`'for' ${what} value must be a number`, expr.line);
    }
    return n;
  }

  private execForIn(
    stat: Extract<Stat, { kind: "forin" }>,
    scope: Scope,
  ): Signal {
    const [iter, invariant, initial] = this.evalList(stat.exprs, scope, 3);
    let control = initial;
    for (;;) {
      this.step();
      const results = this.call(iter, [invariant, control], stat.line);
      if (results[0] === undefined) break;
      control = results[0];
      const inner = new Scope(scope);
      stat.names.forEach((name, i) => inner.declare(name, results[i]));
      const signal = this.execBlock(stat.block, inner);
      if (signal?.kind === "break") break;
      if (signal) return signal;
    }
    return undefined;
  }

  private assign(target: Expr, value: LuaValue, scope: Scope): void {
    if (target.kind === "name") {
      const cell = scope.lookup(target.name);
      if (cell) {
        cell.v = value;
        return;
      }
      this.setIndex(this.globals, target.name, value, target.line);
      return;
    }
    if (target.kind === "index") {
      const obj = this.eval(target.obj, scope);
      this.setIndex(obj, this.eval(target.key, scope), value, target.line);
      return;
    }
    this.error("cannot assign to this expression", target.line);
  }

  // ---- table access, with metamethods -------------------------------------

  /** `t[k]`, honouring `__index` (a table chains, a function is called). */
  getIndex(obj: LuaValue, key: LuaValue, line: number): LuaValue {
    for (let depth = 0; depth < 32; depth++) {
      if (obj instanceof LuaTable) {
        const raw = obj.get(key);
        if (raw !== undefined) return raw;
        const meta = obj.metatable?.get("__index");
        if (meta === undefined) return undefined;
        if (meta instanceof LuaTable) {
          obj = meta;
          continue;
        }
        return this.call(meta, [obj, key], line)[0];
      }
      if (typeof obj === "string") {
        // `("x"):upper()` and `s:sub(…)` — the string library doubles as the
        // string metatable's __index, installed by the host.
        const lib = this.globals.get("string");
        return lib instanceof LuaTable ? lib.get(key) : undefined;
      }
      this.error(
        `attempt to index a ${luaType(obj)} value${
          typeof key === "string" ? ` (field '${key}')` : ""
        }`,
        line,
      );
    }
    this.error("'__index' chain too long; possible loop", line);
  }

  /** `t[k] = v`, honouring `__newindex` and refusing every write to a table the
   * host froze. */
  setIndex(obj: LuaValue, key: LuaValue, value: LuaValue, line: number): void {
    if (!(obj instanceof LuaTable)) {
      this.error(`attempt to index a ${luaType(obj)} value`, line);
    }
    if (obj.frozen) {
      this.error(
        `attempt to modify a read-only table${
          typeof key === "string" ? ` (field '${key}')` : ""
        }`,
        line,
      );
    }
    if (obj.get(key) === undefined) {
      const meta = obj.metatable?.get("__newindex");
      if (meta instanceof LuaTable)
        return this.setIndex(meta, key, value, line);
      if (meta !== undefined) {
        this.call(meta, [obj, key, value], line);
        return;
      }
    }
    obj.set(key, value);
  }

  // ---- calls --------------------------------------------------------------

  /** Call a Lua value with `args`, returning its result list. */
  call(fn: LuaValue, args: LuaValue[], line: number): LuaValue[] {
    this.step();
    if (fn instanceof LuaTable || typeof fn !== "object" || fn === null) {
      const meta =
        fn instanceof LuaTable ? fn.metatable?.get("__call") : undefined;
      if (meta !== undefined) return this.call(meta, [fn, ...args], line);
      this.error(`attempt to call a ${luaType(fn)} value`, line);
    }
    const f = fn as LuaFunction;
    if (f.native) return f.native(args) ?? [];
    const closure = f.closure as Closure;
    if (++this.run.depth > this.run.maxDepth) {
      this.run.depth--;
      this.error("stack overflow (too much recursion)", line);
    }
    try {
      const scope = new Scope(closure.scope);
      const { params, vararg } = closure.body;
      params.forEach((param, i) => scope.declare(param, args[i]));
      // Varargs are parked BESIDE the scope rather than in it (no source can
      // spell the key), and every call scope gets an entry — an empty one for a
      // non-vararg function, so `...` inside it reads empty instead of leaking
      // the enclosing function's arguments.
      varargs.set(scope, vararg ? args.slice(params.length) : []);
      const signal = this.execBlock(closure.body.block, scope);
      return signal?.kind === "return" ? signal.values : [];
    } finally {
      this.run.depth--;
    }
  }

  private makeClosure(body: FunctionBody, scope: Scope): LuaFunction {
    return { closure: { body, scope } satisfies Closure, name: body.name };
  }

  // ---- expressions --------------------------------------------------------

  /** Evaluate to exactly one value (a multi-value expression is truncated). */
  eval(expr: Expr, scope: Scope): LuaValue {
    this.step();
    switch (expr.kind) {
      case "nil":
        return undefined;
      case "true":
        return true;
      case "false":
        return false;
      case "number":
        return expr.value;
      case "string":
        return expr.value;
      case "name": {
        const cell = scope.lookup(expr.name);
        return cell ? cell.v : this.globals.get(expr.name);
      }
      case "paren":
        return this.evalMulti(expr.inner, scope)[0];
      case "vararg":
        return this.lookupVarargs(scope)[0];
      case "index":
        return this.getIndex(
          this.eval(expr.obj, scope),
          this.eval(expr.key, scope),
          expr.line,
        );
      case "call":
      case "method":
        return this.evalMulti(expr, scope)[0];
      case "function":
        return this.makeClosure(expr.body, scope);
      case "table":
        return this.evalTable(expr, scope);
      case "binop":
        return this.evalBinop(expr, scope);
      case "unop":
        return this.evalUnop(expr, scope);
    }
  }

  /** Evaluate an expression that may yield several values. */
  private evalMulti(expr: Expr, scope: Scope): LuaValue[] {
    if (expr.kind === "call") {
      const fn = this.eval(expr.fn, scope);
      return this.call(fn, this.evalMultiList(expr.args, scope), expr.line);
    }
    if (expr.kind === "method") {
      const obj = this.eval(expr.obj, scope);
      const fn = this.getIndex(obj, expr.name, expr.line);
      return this.call(
        fn,
        [obj, ...this.evalMultiList(expr.args, scope)],
        expr.line,
      );
    }
    if (expr.kind === "vararg") return this.lookupVarargs(scope);
    return [this.eval(expr, scope)];
  }

  /** An expression list where only the LAST entry expands to multiple values —
   * Lua's rule for call arguments, return lists and table constructors. */
  private evalMultiList(exprs: Expr[], scope: Scope): LuaValue[] {
    const out: LuaValue[] = [];
    const last = exprs.length - 1;
    exprs.forEach((expr, i) => {
      if (i === last) out.push(...this.evalMulti(expr, scope));
      else out.push(this.eval(expr, scope));
    });
    return out;
  }

  /** …the same, then padded or truncated to `want` values. */
  private evalList(exprs: Expr[], scope: Scope, want: number): LuaValue[] {
    const values = this.evalMultiList(exprs, scope);
    values.length = want;
    return values;
  }

  private lookupVarargs(scope: Scope): LuaValue[] {
    for (let s: Scope | undefined = scope; s; s = s.parent) {
      const v = varargs.get(s);
      if (v) return v;
    }
    return [];
  }

  private evalTable(
    expr: Extract<Expr, { kind: "table" }>,
    scope: Scope,
  ): LuaTable {
    const t = new LuaTable();
    let next = 1;
    const last = expr.fields.length - 1;
    expr.fields.forEach((field, i) => {
      if (field.kind === "keyed") {
        t.set(this.eval(field.key, scope), this.eval(field.value, scope));
      } else if (field.kind === "named") {
        t.set(field.name, this.eval(field.value, scope));
      } else if (i === last) {
        // Only the LAST positional field expands a multi-value expression.
        for (const v of this.evalMulti(field.value, scope)) t.set(next++, v);
      } else {
        t.set(next++, this.eval(field.value, scope));
      }
    });
    return t;
  }

  private evalUnop(
    expr: Extract<Expr, { kind: "unop" }>,
    scope: Scope,
  ): LuaValue {
    const v = this.eval(expr.operand, scope);
    switch (expr.op) {
      case "not":
        return !truthy(v);
      case "-": {
        const n = toNumber(v);
        if (n === undefined) {
          this.error(
            `attempt to perform arithmetic on a ${luaType(v)} value`,
            expr.line,
          );
        }
        return -n;
      }
      case "#": {
        if (typeof v === "string") return v.length;
        if (v instanceof LuaTable) {
          const meta = v.metatable?.get("__len");
          if (meta !== undefined) return this.call(meta, [v], expr.line)[0];
          return v.length;
        }
        this.error(`attempt to get length of a ${luaType(v)} value`, expr.line);
      }
    }
  }

  private evalBinop(
    expr: Extract<Expr, { kind: "binop" }>,
    scope: Scope,
  ): LuaValue {
    // Short-circuit operators evaluate their right side conditionally, so they
    // cannot go through the shared operand evaluation below.
    if (expr.op === "and") {
      const left = this.eval(expr.left, scope);
      return truthy(left) ? this.eval(expr.right, scope) : left;
    }
    if (expr.op === "or") {
      const left = this.eval(expr.left, scope);
      return truthy(left) ? left : this.eval(expr.right, scope);
    }
    const a = this.eval(expr.left, scope);
    const b = this.eval(expr.right, scope);
    const line = expr.line;
    switch (expr.op) {
      case "==":
        return this.equals(a, b, line);
      case "~=":
        return !this.equals(a, b, line);
      case "<":
        return this.less(a, b, line);
      case "<=":
        return this.lessEq(a, b, line);
      case ">":
        return this.less(b, a, line);
      case ">=":
        return this.lessEq(b, a, line);
      case "..":
        return this.concat(a, b, line);
      default:
        return this.arith(expr.op, a, b, line);
    }
  }

  private arith(op: string, a: LuaValue, b: LuaValue, line: number): number {
    const x = toNumber(a);
    const y = toNumber(b);
    if (x === undefined || y === undefined) {
      const bad = x === undefined ? a : b;
      this.error(
        `attempt to perform arithmetic on a ${luaType(bad)} value`,
        line,
      );
    }
    switch (op) {
      case "+":
        return x + y;
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        return x / y;
      case "%":
        // Lua's modulo follows the DIVISOR's sign (`a - floor(a/b)*b`), unlike
        // JavaScript's `%`, which follows the dividend's. A ported formula that
        // wraps a negative index would be off by `b` without this.
        return y === 0 ? Number.NaN : x - Math.floor(x / y) * y;
      case "//":
        return Math.floor(x / y);
      case "^":
        return Math.pow(x, y);
      default:
        this.error(`unknown operator '${op}'`, line);
    }
  }

  private concat(a: LuaValue, b: LuaValue, line: number): string {
    const str = (v: LuaValue): string | undefined =>
      typeof v === "string"
        ? v
        : typeof v === "number"
          ? numberToString(v)
          : undefined;
    const x = str(a);
    const y = str(b);
    if (x === undefined || y === undefined) {
      const bad = x === undefined ? a : b;
      this.error(`attempt to concatenate a ${luaType(bad)} value`, line);
    }
    return x + y;
  }

  private equals(a: LuaValue, b: LuaValue, line: number): boolean {
    if (a === b) return true;
    if (a instanceof LuaTable && b instanceof LuaTable) {
      const meta = a.metatable?.get("__eq") ?? b.metatable?.get("__eq");
      if (meta !== undefined) return truthy(this.call(meta, [a, b], line)[0]);
    }
    return false;
  }

  private less(a: LuaValue, b: LuaValue, line: number): boolean {
    if (typeof a === "number" && typeof b === "number") return a < b;
    if (typeof a === "string" && typeof b === "string") return a < b;
    return this.compareMeta("__lt", a, b, line);
  }

  private lessEq(a: LuaValue, b: LuaValue, line: number): boolean {
    if (typeof a === "number" && typeof b === "number") return a <= b;
    if (typeof a === "string" && typeof b === "string") return a <= b;
    return this.compareMeta("__le", a, b, line);
  }

  private compareMeta(
    event: string,
    a: LuaValue,
    b: LuaValue,
    line: number,
  ): boolean {
    const meta =
      (a instanceof LuaTable ? a.metatable?.get(event) : undefined) ??
      (b instanceof LuaTable ? b.metatable?.get(event) : undefined);
    if (meta !== undefined) return truthy(this.call(meta, [a, b], line)[0]);
    this.error(`attempt to compare ${luaType(a)} with ${luaType(b)}`, line);
  }
}

/** Varargs, parked beside the scope rather than in it (see `call`). A
 * `WeakMap` so a finished call's argument list is collectable with its scope. */
const varargs = new WeakMap<Scope, LuaValue[]>();

/** Build the root scope a chunk's top-level block runs in. Exported for the
 * host, which needs a scope to seed a chunk's execution with. */
export function rootScope(): Scope {
  return new Scope(undefined);
}

export type { Scope };
export { luaToDisplay };
